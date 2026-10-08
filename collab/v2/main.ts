import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

type Pt = { x: number; y: number };
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const tr = (p: Pt) => `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Position of `el` inside `root` in root's own (unscaled) layout pixels. */
function rel(el: Element, root: HTMLElement, fx = 1, fy = 0, dx = 0, dy = 0): Pt | null {
  if (!el.getClientRects().length) return null;
  const r = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  const k = b.width / (root.offsetWidth || 1) || 1;
  const x = (r.left - b.left + r.width * fx) / k + dx;
  const y = (r.top - b.top + r.height * fy) / k + dy;
  return {
    x: Math.max(4, Math.min(x, root.offsetWidth - 84)),
    y: Math.max(4, Math.min(y, root.offsetHeight - 44)),
  };
}

function tweenText(el: HTMLElement, from: number, to: number, duration = 700) {
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ───────── Story stage controller ───────── */

type Phase = [cls: string, at: number];
const PHASES: Record<number, Phase[]> = {
  1: [["k1a", 250]],
  2: [
    ["k2a", 0],
    ["k2b", 250],
    ["k2c", 650],
    ["k2d", 3700],
  ],
  3: [
    ["k3a", 0],
    ["k3b", 550],
    ["k3c", 1300],
    ["k3d", 2300],
    ["k3e", 2500],
    ["k3f", 3900],
  ],
  4: [
    ["k4a", 800],
    ["k4b", 1400],
    ["k4c", 2000],
    ["k4d", 2600],
    ["k4e", 2950],
  ],
  5: [
    ["k5a", 700],
    ["k5b", 2000],
  ],
  6: [
    ["k6a", 100],
    ["k6b", 450],
    ["k6c", 800],
    ["k6d", 1500],
    ["k6e", 2300],
    ["k6f", 3300],
    ["k6g", 5000],
  ],
};

type Anchor = [sel: string, fx: number, fy: number, dx?: number, dy?: number];
/** Where each cursor rests at the end of a step. */
const REST: Record<number, Partial<Record<"sophie" | "alex" | "taylor", Anchor>>> = {
  2: { sophie: ['[data-a="sum2"]', 1, 0, 2, 2], alex: ['[data-a="app2"]', 1, 0, 2, 2] },
  3: { sophie: ['[data-a="tl"]', 0.6, 1, 0, 2], alex: ['[data-a="app2"]', 1, 0, 2, 2] },
  4: { sophie: ['[data-a="sum1"]', 1, 0, 2, 2], alex: ['[data-a="total"]', 0.62, 0.5] },
  5: { sophie: ['[data-a="sum1"]', 1, 0, 2, 2], alex: ['[data-a="total"]', 0.62, 0.5] },
  6: {
    sophie: ['[data-a="tl"]', 0.7, 0.4],
    alex: ['[data-a="total"]', 0.62, 0.5],
    taylor: ['[data-a="sign"]', 0.86, 0.15],
  },
};

class Stage {
  el: HTMLElement;
  doc: HTMLElement;
  cur: Record<string, HTMLElement> = {};
  step = 0;
  private timers: number[] = [];
  private anims: Animation[] = [];

  constructor(el: HTMLElement) {
    this.el = el;
    this.doc = el.querySelector<HTMLElement>(".doc")!;
    el.querySelectorAll<HTMLElement>("[data-cur]").forEach((c) => (this.cur[c.dataset.cur!] = c));
  }

  q(sel: string) {
    return this.el.querySelector<HTMLElement>(sel);
  }

  after(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
  }

  /** Apply changes without transitions. */
  instant(fn: () => void) {
    this.el.classList.add("no-anim");
    fn();
    void this.el.offsetWidth;
    this.el.classList.remove("no-anim");
  }

  /** Phase classes on for every step ≤ upTo, off above it. */
  phases(upTo: number) {
    for (const [s, list] of Object.entries(PHASES)) {
      for (const [cls] of list) this.el.classList.toggle(cls, Number(s) <= upTo);
    }
  }

  frame(n: number) {
    this.el.dataset.step = String(n);
    for (let s = 1; s <= 6; s++) this.el.classList.toggle(`s${s}`, s <= n);
  }

  anchor(a: Anchor): Pt | null {
    const t = this.q(a[0]);
    return t ? rel(t, this.doc, a[1], a[2], a[3] ?? 0, a[4] ?? 0) : null;
  }

  place(n: number) {
    const rest = REST[Math.min(Math.max(n, 2), 6)] ?? {};
    for (const [name, c] of Object.entries(this.cur)) {
      const a = rest[name as keyof typeof rest];
      const p = a ? this.anchor(a) : null;
      c.classList.toggle("is-off", !p);
      if (p) c.style.transform = tr(p);
    }
  }

  /** Static end-state of step n. */
  settle(n: number) {
    this.clear();
    this.step = n;
    this.instant(() => {
      this.frame(n);
      this.phases(n);
      this.place(n);
    });
  }

  /** Show step n's panel/blocks but in the previous step's end-state, ready to play. */
  prime(n: number) {
    this.clear();
    this.step = n;
    this.instant(() => {
      this.frame(n);
      this.phases(n - 1);
      this.place(n - 1);
    });
  }

  go(n: number, loop: boolean) {
    const prev = this.step;
    if (n === prev) return;
    if (n < prev) {
      // scrolling back: let transitions reverse naturally, no replay
      this.clear();
      this.step = n;
      this.frame(n);
      this.phases(n);
      this.place(n);
      if (n === 5 && loop) this.loop5();
      return;
    }
    this.clear();
    this.instant(() => {
      this.phases(n - 1);
      this.place(n - 1);
    });
    this.step = n;
    this.frame(n);
    this.play(n, loop);
  }

  play(n: number, loop: boolean) {
    this.clear();
    if (n === 5) {
      if (loop) this.loop5();
      else for (const [cls, at] of PHASES[5]) this.after(at, () => this.el.classList.add(cls));
      return;
    }
    for (const [cls, at] of PHASES[n] ?? []) this.after(at, () => this.el.classList.add(cls));
    if (n === 2) this.chore2();
    if (n === 3) this.chore3();
    if (n === 4) this.chore4();
    if (n === 6) this.chore6();
  }

  loop5() {
    const run = () => {
      this.after(700, () => this.el.classList.add("k5a"));
      this.after(2000, () => this.el.classList.add("k5b"));
      this.after(5600, () => this.el.classList.remove("k5a", "k5b"));
      this.after(7400, run);
    };
    run();
  }

  /** Animate a cursor through timed points; segments start with each point's easing. */
  path(name: string, pts: (Pt & { t: number; e?: string })[]) {
    const c = this.cur[name];
    if (!c || pts.length < 2) return;
    const total = pts[pts.length - 1].t || 1;
    const kf = pts.map((p) => ({ transform: tr(p), offset: p.t / total, easing: p.e ?? EASE }));
    c.classList.remove("is-off");
    c.style.transform = tr(pts[pts.length - 1]);
    this.anims.push(c.animate(kf, { duration: total, fill: "both" }));
  }

  glide(name: string, a: Anchor, delay = 0, dur = 900) {
    const c = this.cur[name];
    const to = this.anchor(a);
    if (!c || !to) return;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(c.style.transform);
    const from = m ? { x: +m[1], y: +m[2] } : to;
    this.path(name, [
      { ...from, t: 0 },
      { ...from, t: delay },
      { ...to, t: delay + dur },
    ]);
  }

  /** Reveal a line like typing, returning { start, end } points and duration. */
  typeLine(ln: HTMLElement, delay: number, cps: number) {
    const n = (ln.querySelector(".v-now") ?? ln).textContent!.trim().length;
    const d = Math.round((n / cps) * 1000);
    this.anims.push(
      ln.animate([{ clipPath: "inset(0 100% 0 -2px)" }, { clipPath: "inset(0 -2px 0 -2px)" }], {
        duration: d,
        delay,
        easing: `steps(${n}, end)`,
        fill: "backwards",
      }),
    );
    const s = rel(ln, this.doc, 0, 0, 0, 2)!;
    const e = rel(ln, this.doc, 1, 0, 2, 2)!;
    return { s, e, d, n };
  }

  chore2() {
    const h1 = this.anchor([".blk--sum .blk__h", 0.5, 0.2]);
    const h2 = this.anchor([".blk--app .blk__h", 0.6, 0.2]);
    const s1 = this.q('[data-a="sum1"]');
    const s2 = this.q('[data-a="sum2"]');
    const a1 = this.q('[data-a="app1"]');
    const a2 = this.q('[data-a="app2"]');
    if (!h1 || !h2 || !s1 || !s2 || !a1 || !a2) return;
    const start = 650;
    const L1 = this.typeLine(s1, start, 26);
    const L2 = this.typeLine(s2, start + L1.d + 260, 26);
    const M1 = this.typeLine(a1, start + 300, 22);
    const M2 = this.typeLine(a2, start + 300 + M1.d + 300, 22);
    const enter = (p: Pt) => ({ x: p.x + 60, y: p.y - 40 });
    this.path("sophie", [
      { ...enter(h1), t: 0 },
      { ...enter(h1), t: 250 },
      { ...L1.s, t: start, e: `steps(${L1.n}, end)` },
      { ...L1.e, t: start + L1.d },
      { ...L2.s, t: start + L1.d + 260, e: `steps(${L2.n}, end)` },
      { ...L2.e, t: start + L1.d + 260 + L2.d },
    ]);
    const t2 = start + 300 + M1.d + 300;
    this.path("alex", [
      { ...enter(h2), t: 0 },
      { ...enter(h2), t: 250 },
      { ...M1.s, t: start + 300, e: `steps(${M1.n}, end)` },
      { ...M1.e, t: start + 300 + M1.d },
      { ...M2.s, t: t2, e: `steps(${M2.n}, end)` },
      { ...M2.e, t: t2 + M2.d },
    ]);
  }

  chore3() {
    this.glide("alex", REST[3].alex!, 0, 700);
    const tl = this.q('[data-a="tl"]');
    if (!tl) return;
    const s = rel(tl, this.doc, 0, 0.2, 4)!;
    const e = this.anchor(REST[3].sophie!)!;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.cur.sophie?.style.transform ?? "");
    const from = m ? { x: +m[1], y: +m[2] } : s;
    this.path("sophie", [
      { ...from, t: 0 },
      { ...from, t: 1500 },
      { ...s, t: 2400 },
      { ...e, t: 3500 },
    ]);
  }

  chore4() {
    this.glide("alex", REST[4].alex!, 100, 900);
    this.glide("sophie", REST[4].sophie!, 400, 900);
  }

  chore6() {
    this.glide("alex", REST[6].alex!, 0, 800);
    this.glide("sophie", REST[6].sophie!, 200, 900);
    const sign = this.q('[data-a="sign"]');
    if (!sign) return;
    const a = rel(sign, this.doc, 0.04, 0.15)!;
    const b = this.anchor(REST[6].taylor!)!;
    const enter = { x: this.doc.offsetWidth - 120, y: a.y - 110 };
    this.path("taylor", [
      { ...enter, t: 0 },
      { ...enter, t: 1500 },
      { ...a, t: 2600 },
      { ...a, t: 3300, e: "cubic-bezier(0.55, 0.1, 0.4, 1)" },
      { ...b, t: 4900 },
    ]);
  }
}

/* ───────── Story: pinned vs stacked ───────── */

function initStory() {
  const story = document.querySelector<HTMLElement>("[data-story]");
  const stageEl = story?.querySelector<HTMLElement>("[data-stage]");
  if (!story || !stageEl) return;

  const main = new Stage(stageEl);
  const steps = [...story.querySelectorAll<HTMLElement>(".rail__step")];
  const fill = story.querySelector<HTMLElement>("[data-rail-fill]");
  const box = story.querySelector<HTMLElement>("[data-stagebox]")!;
  const col = story.querySelector<HTMLElement>("[data-stagecol]")!;
  const pin = story.querySelector<HTMLElement>(".story__pin")!;
  const track = story.querySelector<HTMLElement>("[data-track]")!;

  // ruler for the CSS scroll-driven rail fill
  const ruler = document.createElement("i");
  ruler.className = "story__ruler";
  ruler.setAttribute("aria-hidden", "true");
  track.append(ruler);

  const mq = window.matchMedia("(min-width: 901px) and (min-height: 560px)");
  let mode: "pinned" | "stacked" | null = null;
  let current = 1;
  let io: IntersectionObserver | null = null;
  let ro: ResizeObserver | null = null;
  const clones: Stage[] = [];

  const setRail = (n: number) => {
    steps.forEach((li, i) => {
      li.classList.toggle("is-active", i + 1 === n);
      li.classList.toggle("is-done", i + 1 < n);
    });
    fill?.style.setProperty("--fill", String((n - 1) / 5));
  };

  const scale = () => {
    const w = col.clientWidth;
    const h = pin.clientHeight - 48;
    const k = Math.min(1, w / 820, h / 700);
    box.style.setProperty("--k", k.toFixed(4));
  };

  const enterPinned = () => {
    story.classList.add("is-pinned");
    scale();
    ro = new ResizeObserver(scale);
    ro.observe(col);
    ro.observe(pin);
    main.step = 0;
    main.settle(current);
    setRail(current);
    const hits = new Set<number>();
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.trigger);
          if (e.isIntersecting) hits.add(n);
          else hits.delete(n);
        }
        if (!hits.size) return;
        const n = Math.max(...hits);
        if (n !== current) {
          current = n;
          setRail(n);
          main.go(n, true);
        }
      },
      { rootMargin: "-49% 0px -50% 0px" },
    );
    story.querySelectorAll("[data-trigger]").forEach((t) => io!.observe(t));
  };

  const leavePinned = () => {
    io?.disconnect();
    ro?.disconnect();
    main.clear();
    story.classList.remove("is-pinned");
  };

  const enterStacked = () => {
    if (!clones.length) {
      story.querySelectorAll<HTMLElement>("[data-shot]").forEach((slot, i) => {
        const n = i + 1;
        const el = stageEl.cloneNode(true) as HTMLElement;
        el.removeAttribute("data-stage");
        slot.append(el);
        const st = new Stage(el);
        clones.push(st);
        if (prefersReducedMotion) {
          st.settle(n);
        } else {
          st.prime(n);
          const vio = new IntersectionObserver(
            (entries) => {
              if (!entries.some((e) => e.isIntersecting)) return;
              vio.disconnect();
              st.prime(n);
              st.play(n, false);
            },
            { threshold: 0.45 },
          );
          vio.observe(el);
        }
      });
    } else {
      clones.forEach((c) => c.instant(() => c.place(c.step)));
    }
  };

  const apply = () => {
    const want = mq.matches && !prefersReducedMotion ? "pinned" : "stacked";
    if (want === mode) return;
    if (mode === "pinned") leavePinned();
    mode = want;
    if (want === "pinned") enterPinned();
    else enterStacked();
  };

  apply();
  mq.addEventListener("change", apply);

  let rt = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (mode === "stacked") clones.forEach((c) => c.instant(() => c.place(c.step)));
    }, 200);
  });
}

/* ───────── Hero: a live document that loops while visible ───────── */

function initHero() {
  const root = document.querySelector<HTMLElement>("[data-hdoc]");
  if (!root) return;
  const sophie = root.querySelector<HTMLElement>('[data-h-cur="sophie"]')!;
  const alex = root.querySelector<HTMLElement>('[data-h-cur="alex"]')!;
  const typeLn = root.querySelector<HTMLElement>("[data-h-type]")!;
  const row = root.querySelector<HTMLElement>("[data-h-row]")!;
  const qty = root.querySelector<HTMLElement>("[data-h-qty]")!;
  const line = root.querySelector<HTMLElement>("[data-h-line]")!;
  const total = root.querySelector<HTMLElement>("[data-h-total]")!;
  const note = root.querySelector<HTMLElement>("[data-h-note]")!;
  const lines = root.querySelectorAll<HTMLElement>(".hdoc__para .ln");

  const at = (el: Element, fx: number, fy: number, dx = 0, dy = 0) => rel(el, root, fx, fy, dx, dy) ?? { x: 0, y: 0 };
  const put = (c: HTMLElement, p: Pt, instant = false) => {
    if (instant) c.style.transition = "opacity .4s";
    c.style.transform = tr(p);
    if (instant) {
      void c.offsetWidth;
      c.style.transition = "";
    }
  };

  if (prefersReducedMotion) {
    put(sophie, at(typeLn, 1, 0, 2, 2), true);
    put(alex, at(qty, 0.5, 0.6), true);
    sophie.classList.add("is-on");
    alex.classList.add("is-on");
    note.classList.add("is-in", "is-reply");
    return;
  }

  let timers: number[] = [];
  let visible = false;
  let running = false;
  const after = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  const setQty = (q: number, animate: boolean) => {
    const prevLine = q === 3 ? 1200 : 1800;
    const prevTotal = q === 3 ? 12200 : 12800;
    qty.textContent = String(q);
    if (animate) {
      qty.classList.remove("tick");
      void qty.offsetWidth;
      qty.classList.add("tick");
      tweenText(line, prevLine, q * 600);
      tweenText(total, prevTotal, q === 3 ? 12800 : 12200);
    } else {
      line.textContent = money(q * 600);
      total.textContent = money(q === 3 ? 12800 : 12200);
    }
  };

  // starting state
  typeLn.style.clipPath = "inset(0 100% 0 -2px)";
  setQty(2, false);

  const cycle = () => {
    running = true;
    timers = [];
    const n = typeLn.textContent!.trim().length;
    const d = n * 42;
    const ln2 = lines[1];
    put(sophie, at(ln2, 1, 0, 2, 2), !sophie.classList.contains("is-on"));
    put(alex, at(row, 0.35, 0.7), !alex.classList.contains("is-on"));
    after(300, () => {
      sophie.classList.add("is-on");
      alex.classList.add("is-on");
    });
    // Sophie types a new line
    after(900, () => {
      const s = at(typeLn, 0, 0, 0, 2);
      const e = at(typeLn, 1, 0, 2, 2);
      put(sophie, s);
      after(500, () => {
        typeLn.animate([{ clipPath: "inset(0 100% 0 -2px)" }, { clipPath: "inset(0 -2px 0 -2px)" }], {
          duration: d,
          easing: `steps(${n}, end)`,
        });
        typeLn.style.clipPath = "inset(0 -2px 0 -2px)";
        sophie.animate([{ transform: tr(s) }, { transform: tr(e) }], { duration: d, easing: `steps(${n}, end)` });
        sophie.style.transition = "opacity .4s";
        sophie.style.transform = tr(e);
        after(d + 50, () => (sophie.style.transition = ""));
      });
    });
    // Alex edits the quantity; totals update for everyone
    after(1300, () => put(alex, at(qty, 0.5, 0.7, 4)));
    after(2300, () => row.classList.add("is-edit"));
    after(2900, () => setQty(3, true));
    after(4000, () => row.classList.remove("is-edit"));
    // comment lands, Sophie replies
    after(4300, () => note.classList.add("is-in"));
    after(5600, () => put(sophie, at(note, 0.3, 0.92, 0, -6)));
    after(6600, () => note.classList.add("is-reply"));
    // reset and go again
    after(10400, () => {
      note.classList.remove("is-in", "is-reply");
      typeLn.animate([{ clipPath: "inset(0 -2px 0 -2px)" }, { clipPath: "inset(0 100% 0 -2px)" }], {
        duration: 500,
        easing: `steps(${n}, end)`,
      });
      typeLn.style.clipPath = "inset(0 100% 0 -2px)";
      put(sophie, at(ln2, 1, 0, 2, 2));
      put(alex, at(row, 0.35, 0.7));
    });
    after(11000, () => setQty(2, true));
    after(12200, () => {
      running = false;
      if (visible) cycle();
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !running) cycle();
    },
    { threshold: 0.25 },
  );
  // wait for the entrance animation to settle before measuring
  window.setTimeout(() => io.observe(root), 1300);
}

/* ───────── Closing cursors + benefit icons ───────── */

function initClose() {
  const close = document.querySelector<HTMLElement>("[data-close]");
  if (!close || prefersReducedMotion) return;
  new IntersectionObserver((entries) => {
    close.classList.toggle(
      "is-on",
      entries.some((e) => e.isIntersecting),
    );
  }).observe(close);
}

document.querySelectorAll(".ben__ico *").forEach((s) => s.setAttribute("pathLength", "1"));
initHero();
initStory();
initClose();
