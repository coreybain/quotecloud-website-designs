import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Scene clock ─────────
   Every scene runs an async timeline on its own clock. The clock only advances while the scene is on screen,
   and runs faster while its tile is hovered or focused, so loops pause off-screen and "speed up" on interaction. */

type Waiter = { at: number; resolve: () => void };

class Clock {
  t = 0;
  speed = 1;
  active = false;
  private waiters: Waiter[] = [];

  wait(ms: number) {
    return new Promise<void>((resolve) => this.waiters.push({ at: this.t + ms, resolve }));
  }

  tick(dt: number) {
    if (!this.active) return;
    this.t += dt * this.speed;
    if (!this.waiters.length) return;
    const due = this.waiters.filter((w) => w.at <= this.t);
    if (!due.length) return;
    this.waiters = this.waiters.filter((w) => w.at > this.t);
    due.forEach((w) => w.resolve());
  }
}

const clocks = new Set<Clock>();
let rafId = 0;
let last = 0;

function loop(now: number) {
  const dt = Math.min(64, now - last);
  last = now;
  let anyActive = false;
  clocks.forEach((c) => {
    c.tick(dt);
    if (c.active) anyActive = true;
  });
  rafId = anyActive ? requestAnimationFrame(loop) : 0;
}
function wake() {
  if (rafId) return;
  last = performance.now();
  rafId = requestAnimationFrame(loop);
}

/* ───────── Scene context helpers ───────── */

class Scene {
  clock = new Clock();
  constructor(public root: HTMLElement) {}

  wait = (ms: number) => this.clock.wait(ms);

  $<T extends HTMLElement = HTMLElement>(sel: string) {
    return this.root.querySelector<T>(sel);
  }
  /** An element by its [data-anim] / [data-fx] name. */
  el(name: string) {
    return this.root.querySelector<HTMLElement>(`[data-anim="${name}"],[data-fx="${name}"]`);
  }
  on(name: string | HTMLElement | null, state = true) {
    const node = typeof name === "string" ? this.el(name) : name;
    node?.classList.toggle("is-on", state);
  }
  cursor(name: string) {
    return this.root.querySelector<HTMLElement>(`[data-cursor="${name}"]`);
  }

  /** Glides a cursor so its tip lands at `target` (offset as a fraction of the target box, plus px nudges). */
  moveTo(cur: HTMLElement | null, target: Element | null, fx = 0.5, fy = 0.6, nx = 0, ny = 0) {
    if (!cur || !target) return;
    const host = (cur.offsetParent as HTMLElement | null) ?? this.root;
    const hr = host.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const x = Math.round(tr.left - hr.left + tr.width * fx + nx);
    const y = Math.round(tr.top - hr.top + tr.height * fy + ny);
    this.place(cur, x, y, hr.width);
  }

  place(cur: HTMLElement, x: number, y: number, hostWidth = this.root.clientWidth) {
    const flag = cur.querySelector<HTMLElement>(".cur__flag");
    const flagW = flag?.offsetWidth ?? 60;
    cur.classList.toggle("is-flip", x + flagW + 22 > hostWidth);
    cur.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Parks a cursor just outside a corner, invisible, ready to glide in. */
  park(cur: HTMLElement | null, corner: "br" | "bl" | "tr" | "r" | "b") {
    if (!cur) return;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const spots = { br: [w - 30, h - 20], bl: [20, h - 20], tr: [w - 30, 30], r: [w - 24, h * 0.45], b: [w * 0.55, h - 16] };
    const [x, y] = spots[corner];
    cur.classList.remove("is-on", "is-typing");
    const prev = cur.style.transition;
    cur.style.transition = "none";
    this.place(cur, x, y, w);
    void cur.offsetWidth;
    cur.style.transition = prev;
  }

  /** Types `text` into a .tl line, keeping the cursor glued to the caret. */
  async type(line: HTMLElement | null, cur: HTMLElement | null, perChar = 42) {
    if (!line) return;
    const ghost = line.querySelector<HTMLElement>(".tl__ghost");
    const out = line.querySelector<HTMLElement>(".tl__text");
    const caret = line.querySelector<HTMLElement>(".caret");
    if (!ghost || !out) return;
    const text = ghost.textContent ?? "";
    caret?.classList.add("is-on", "is-typing");
    cur?.classList.add("is-typing");
    for (let i = 1; i <= text.length; i++) {
      out.textContent = text.slice(0, i);
      if (i % 2 === 0 || i === text.length) this.moveTo(cur, caret, 0.5, 0.9, -2, 2);
      await this.wait(perChar + (text[i - 1] === " " ? 30 : 0) + ((i * 37) % 23));
    }
    caret?.classList.remove("is-typing");
    cur?.classList.remove("is-typing");
  }
}

/** Mounts a scene: runs `timeline` forever, but only while the scene is visible; hover/focus on `speedHost` speeds it up. */
function mount(root: HTMLElement | null, timeline: (s: Scene) => Promise<void>, speedHost?: HTMLElement | null) {
  if (!root || prefersReducedMotion || !("IntersectionObserver" in window)) return;
  const s = new Scene(root);
  clocks.add(s.clock);
  root.classList.add("is-live", "is-paused");

  const io = new IntersectionObserver(
    ([entry]) => {
      s.clock.active = entry.isIntersecting;
      root.classList.toggle("is-paused", !entry.isIntersecting);
      if (entry.isIntersecting) wake();
    },
    { threshold: 0.2 },
  );
  io.observe(root);

  if (speedHost) {
    const fast = (on: boolean) => {
      s.clock.speed = on ? 1.9 : 1;
      speedHost.style.setProperty("--spd", on ? "1.9" : "1");
    };
    let hover = false;
    let focus = false;
    speedHost.addEventListener("pointerenter", () => fast((hover = true)));
    speedHost.addEventListener("pointerleave", () => fast((hover = false) || focus));
    speedHost.addEventListener("focusin", () => fast((focus = true)));
    speedHost.addEventListener("focusout", () => fast((focus = false) || hover));
  }

  (async () => {
    // let fonts settle so cursor measurements are right
    await document.fonts?.ready;
    for (;;) await timeline(s);
  })();
}

/* ───────── Number helpers ───────── */

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function tween(el: HTMLElement | null, from: number, to: number, ms = 700, fmt = usd) {
  if (!el) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.classList.remove("is-bump");
  void el.offsetWidth;
  el.classList.add("is-bump");
}

/* ───────── Hero: two people typing into the Executive Summary ───────── */

mount(document.querySelector<HTMLElement>('[data-scene="hero"]'), async (s) => {
  const sophie = s.cursor("sophie");
  const alex = s.cursor("alex");
  const avatars = [...s.root.querySelectorAll<HTMLElement>("[data-pop]")];
  const count = s.$("[data-live-count]");
  const lines = {
    sophie: s.$('[data-type="sophie"]'),
    alex: s.$('[data-type="alex"]'),
  };
  const reply = s.el("reply");

  // reset
  s.root.classList.remove("is-fading");
  avatars.forEach((a) => a.classList.remove("is-on"));
  s.root.querySelectorAll<HTMLElement>(".tl__text").forEach((t) => (t.textContent = ""));
  s.root.querySelectorAll<HTMLElement>(".caret").forEach((c) => c.classList.remove("is-on", "is-typing"));
  ["comment", "mention", "reply"].forEach((n) => s.on(n, false));
  reply?.classList.remove("is-typing");
  if (count) count.textContent = "1";
  s.park(sophie, "bl");
  s.park(alex, "br");

  await s.wait(350);
  for (const [i, av] of avatars.entries()) {
    av.classList.add("is-on");
    if (count) count.textContent = String(i + 1);
    await s.wait(260);
  }

  // Sophie glides in and starts the summary
  sophie?.classList.add("is-on");
  s.moveTo(sophie, lines.sophie?.querySelector(".caret") ?? null, 0.5, 0.9, -2, 2);
  await s.wait(1100);
  const typingSophie = s.type(lines.sophie, sophie, 40);

  // …while Alex arrives and writes the next sentence at the same time
  await s.wait(900);
  alex?.classList.add("is-on");
  s.moveTo(alex, lines.alex?.querySelector(".caret") ?? null, 0.5, 0.9, -2, 2);
  await s.wait(1000);
  await Promise.all([typingSophie, s.type(lines.alex, alex, 46)]);
  await s.wait(500);

  // Alex leaves a comment for Sophie
  const comment = s.el("comment");
  // On a narrow doc the comment card is wide and short, so point at its empty header corner
  const narrow = (comment?.getBoundingClientRect().width ?? 0) > 260;
  s.moveTo(alex, comment, 0.9, narrow ? 0 : 0.16, 0, narrow ? -4 : 0);
  await s.wait(500);
  s.on("comment");
  await s.wait(700);
  s.on("mention");
  await s.wait(1300);

  // Sophie replies
  s.moveTo(sophie, reply, 0.7, 0.6);
  await s.wait(700);
  reply?.classList.add("is-typing");
  s.on("reply");
  await s.wait(1300);
  reply?.classList.remove("is-typing");
  await s.wait(3800);

  // fade and start again
  s.root.classList.add("is-fading");
  sophie?.classList.remove("is-on");
  alex?.classList.remove("is-on");
  await s.wait(800);
});

/* ───────── Bento: Real-time — two cursors on the same price line ───────── */

const rtTile = document.querySelector<HTMLElement>(".tile--rt");
mount(
  document.querySelector<HTMLElement>('[data-scene="rt"]'),
  async (s) => {
    const alex = s.cursor("alex");
    const sophie = s.cursor("sophie");
    const qty = s.$('[data-cell="qty"]');
    const disc = s.$('[data-cell="disc"]');
    const line = s.$("[data-line]");
    const total = s.$("[data-total]");
    const log = s.$("[data-log]");
    const logText = s.$("[data-log-text]");
    const logAv = log?.querySelector<HTMLElement>(".av");

    const setLog = async (who: "alex" | "sophie", text: string) => {
      log?.classList.add("is-swap");
      await s.wait(300);
      if (logText) logText.textContent = text;
      if (logAv) {
        logAv.textContent = who === "alex" ? "A" : "S";
        logAv.className = `av av--${who} av--xs`;
      }
      log?.classList.remove("is-swap");
    };

    // reset to the starting figures
    if (qty) qty.textContent = "4";
    if (disc) disc.textContent = "0%";
    if (line) line.textContent = usd(7200);
    if (total) total.textContent = usd(11700);
    qty?.classList.remove("is-alex");
    disc?.classList.remove("is-sophie");
    await setLog("sophie", "Sophie shared the draft with Alex");
    s.park(alex, "tr");
    s.park(sophie, "br");
    await s.wait(700);

    // Alex takes the quantity
    alex?.classList.add("is-on");
    s.moveTo(alex, qty, 0.62, 0.72);
    await s.wait(1100);
    qty?.classList.add("is-alex");
    await s.wait(450);
    if (qty) qty.textContent = "6";
    tween(line, 7200, 10800);
    tween(total, 11700, 15300);
    setLog("alex", "Alex changed Implementation from 4 to 6 weeks");
    await s.wait(900);

    // Sophie, on the same line, adds a discount
    sophie?.classList.add("is-on");
    s.moveTo(sophie, disc, 0.62, 0.72);
    await s.wait(1100);
    disc?.classList.add("is-sophie");
    await s.wait(450);
    if (disc) disc.textContent = "10%";
    tween(line, 10800, 9720);
    tween(total, 15300, 14220);
    setLog("sophie", "Sophie set a 10% discount on Implementation");
    await s.wait(1200);
    qty?.classList.remove("is-alex");
    s.moveTo(alex, total, 0.2, 0.8, 0, 6);
    await s.wait(2600);

    disc?.classList.remove("is-sophie");
    alex?.classList.remove("is-on");
    sophie?.classList.remove("is-on");
    await s.wait(900);
  },
  rtTile,
);

/* ───────── Bento: Comments — thread grows, mention lights up, resolve folds it ───────── */

mount(
  document.querySelector<HTMLElement>('[data-scene="cm"]'),
  async (s) => {
    const excerpt = s.$(".cm__excerpt");
    if (excerpt) s.root.style.setProperty("--excerpt-h", `${excerpt.offsetHeight}px`);
    const parts = ["hl", "golive", "pin", "note", "m1", "mention", "dots", "m2", "actions", "resolve", "thread", "resolved"];
    parts.forEach((p) => s.on(p, false));
    await s.wait(700);

    s.on("hl");
    await s.wait(700);
    s.on("pin");
    s.on("note");
    await s.wait(1100);
    s.on("m1");
    await s.wait(650);
    s.on("mention");
    await s.wait(1200);
    s.on("dots");
    await s.wait(1300);
    s.on("dots", false);
    s.on("m2");
    s.on("actions");
    await s.wait(500);
    s.on("golive");
    await s.wait(1700);
    s.on("resolve");
    await s.wait(450);
    s.on("thread"); // folds the thread away
    s.on("hl", false);
    s.on("pin", false);
    await s.wait(450);
    s.on("resolved");
    await s.wait(2600);
    s.on("resolved", false);
    await s.wait(500);
  },
  document.querySelector<HTMLElement>(".tile--cm"),
);

/* ───────── Bento: Version history — scrub back, morph, restore ───────── */

mount(
  document.querySelector<HTMLElement>('[data-scene="vh"]'),
  async (s) => {
    const label = s.$("[data-vh-label]");
    const restore = s.el("restore");
    const setPos = (p: number) => s.root.style.setProperty("--pos", String(p));
    s.root.classList.remove("is-old", "is-compare", "is-restored");
    s.on("restore", false);
    s.on("restored", false);
    s.on("audit", false);
    s.root.classList.remove("has-new");
    restore?.classList.remove("is-pulse", "is-press");
    setPos(1);
    if (label) label.textContent = "Current version";
    await s.wait(1400);

    s.root.classList.add("is-compare");
    await s.wait(700);
    setPos(1 / 3);
    if (label) label.textContent = "Viewing v2 · Tue 9:14 AM";
    await s.wait(900);
    s.root.classList.add("is-old");
    await s.wait(900);
    s.on("restore");
    await s.wait(700);
    restore?.classList.add("is-pulse");
    await s.wait(500);
    restore?.classList.add("is-press");
    await s.wait(220);
    restore?.classList.remove("is-press");
    s.root.classList.add("is-restored");
    s.root.classList.remove("is-compare");
    s.on("restored");
    s.on("audit");
    s.root.classList.add("has-new");
    if (label) label.textContent = "v2 restored by Sophie";
    setPos(1);
    await s.wait(2800);
    s.on("restore", false);
    s.root.classList.remove("is-old");
    await s.wait(600);
  },
  document.querySelector<HTMLElement>(".tile--vh"),
);

/* ───────── Bento: Permissions — Viewer → Editor unlocks pricing ───────── */

mount(
  document.querySelector<HTMLElement>('[data-scene="pm"]'),
  async (s) => {
    const role = s.$("[data-role]");
    const roleText = s.$("[data-role-text]");
    const menu = s.el("menu");
    const price = s.$("[data-price]");
    const priceLabel = s.$("[data-price-label]");
    const priceVal = s.$("[data-price-val]");
    const jordan = s.cursor("jordan");
    const setI = (i: number) => menu?.style.setProperty("--i", String(i));

    // locked start
    if (roleText) roleText.textContent = "Viewer";
    role?.classList.remove("is-editor");
    price?.classList.remove("is-open");
    priceVal?.classList.remove("is-jordan");
    if (priceLabel) priceLabel.innerHTML = "Pricing &amp; terms <b>locked for Viewers</b>";
    s.on(menu, false);
    setI(0);
    s.park(jordan, "br");
    await s.wait(1200);

    role?.classList.add("is-press");
    await s.wait(180);
    role?.classList.remove("is-press");
    s.on(menu);
    await s.wait(650);
    setI(1);
    await s.wait(380);
    setI(2);
    await s.wait(600);
    s.on(menu, false);
    if (roleText) roleText.textContent = "Editor";
    role?.classList.add("is-editor");
    await s.wait(500);

    price?.classList.add("is-open");
    if (priceLabel) priceLabel.innerHTML = "Pricing &amp; terms <b>editable by Jordan</b>";
    await s.wait(500);
    jordan?.classList.add("is-on");
    s.moveTo(jordan, priceVal, 0.6, 0.75);
    await s.wait(1000);
    priceVal?.classList.add("is-jordan");
    await s.wait(2600);
    jordan?.classList.remove("is-on");
    priceVal?.classList.remove("is-jordan");
    await s.wait(500);
  },
  document.querySelector<HTMLElement>(".tile--pm"),
);

/* ───────── Bento: Notifications — toasts stack and settle ───────── */

type Toast = { src: "qc" | "slack" | "teams"; title: string; rest: string; action?: string; time?: string };
const toastFeed: Toast[] = [
  { src: "qc", title: "Taylor viewed", rest: "Project Proposal", time: "now" },
  { src: "slack", title: "Sophie replied", rest: "on Project Approach", time: "now" },
  { src: "teams", title: "Approval needed", rest: "10% discount, Investment Summary", action: "Review" },
  { src: "qc", title: "Alex updated", rest: "Investment Summary", time: "now" },
  { src: "slack", title: "Jordan approved", rest: "pricing changes", time: "now" },
  { src: "qc", title: "Taylor commented", rest: "on the timeline", time: "now" },
];

function toastNode(t: Toast) {
  const li = document.createElement("li");
  li.className = "toast is-enter";
  const src =
    t.src === "teams"
      ? `<span class="src src--teams">T</span>`
      : t.src === "slack"
        ? `<span class="src src--slack"><img src="/assets/integrations/slack.jpg" alt="" width="792" height="790" decoding="async" /></span>`
        : `<span class="src src--qc"><img src="/assets/logos/qc-symbol-white.png" alt="" width="64" height="64" decoding="async" /></span>`;
  const end = t.action ? `<span class="toast__act">${t.action}</span>` : `<span class="toast__time">${t.time ?? ""}</span>`;
  li.innerHTML = `${src}<span class="toast__text"><b>${t.title}</b> ${t.rest}</span>${end}`;
  return li;
}

mount(
  document.querySelector<HTMLElement>('[data-scene="nt"]'),
  (() => {
    let n = 0;
    return async (s: Scene) => {
      const list = s.$("[data-toasts]");
      if (!list) return;
      const step = parseFloat(getComputedStyle(list).getPropertyValue("--step")) || 70;
      const fresh = toastNode(toastFeed[n++ % toastFeed.length]);
      list.prepend(fresh);
      void fresh.offsetWidth;
      const items = [...list.children] as HTMLElement[];
      items.forEach((el, i) => {
        el.classList.remove("is-enter");
        if (i >= 3) {
          el.classList.add("is-leave");
          el.style.zIndex = "-1";
          el.style.transform = `translateY(${(i - 1) * step + 8}px) scale(0.9)`;
          window.setTimeout(() => el.remove(), 700);
        } else {
          el.style.transform = `translateY(${i * step}px)`;
        }
      });
      await s.wait(n === 1 ? 1400 : 2000);
    };
  })(),
  document.querySelector<HTMLElement>(".tile--nt"),
);

/* ───────── Bento: Customer — comment, then a signature ───────── */

mount(
  document.querySelector<HTMLElement>('[data-scene="cu"]'),
  async (s) => {
    const taylor = s.cursor("taylor");
    const steps = [...s.root.querySelectorAll<HTMLElement>(".step")];
    const sig = s.$(".sig__path");
    const sigBox = s.$(".sig__svg");
    steps.forEach((st) => st.classList.remove("is-on"));
    s.on("tcomment", false);
    s.on("stamp", false);
    sig?.classList.remove("is-on");
    s.park(taylor, "br");
    await s.wait(700);

    steps[0]?.classList.add("is-on");
    await s.wait(800);
    steps[1]?.classList.add("is-on");
    await s.wait(500);
    taylor?.classList.add("is-on");
    s.moveTo(taylor, s.el("tcomment"), 0.75, 0.75);
    await s.wait(1000);
    s.on("tcomment");
    await s.wait(1700);

    s.moveTo(taylor, sigBox, 0.04, 0.7);
    await s.wait(1000);
    sig?.classList.add("is-on");
    // the pen follows the stroke
    taylor?.classList.add("is-typing");
    for (let i = 1; i <= 8; i++) {
      s.moveTo(taylor, sigBox, 0.04 + i * 0.115, i % 2 ? 0.45 : 0.75);
      await s.wait(190);
    }
    taylor?.classList.remove("is-typing");
    s.moveTo(taylor, sigBox, 0.35, 1.5);
    await s.wait(300);
    s.on("stamp");
    steps[2]?.classList.add("is-on");
    await s.wait(3000);
    taylor?.classList.remove("is-on");
    await s.wait(500);
  },
  document.querySelector<HTMLElement>(".tile--cu"),
);

/* ───────── Pause pure-CSS loops while off screen ───────── */

function pauseOffscreen(el: HTMLElement | null) {
  if (!el || !("IntersectionObserver" in window)) return;
  el.classList.add("is-paused");
  new IntersectionObserver(([e]) => el.classList.toggle("is-paused", !e.isIntersecting), { threshold: 0.05 }).observe(el);
}
pauseOffscreen(document.querySelector<HTMLElement>("[data-mini]"));
pauseOffscreen(document.querySelector<HTMLElement>(".close__panel"));
