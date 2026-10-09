import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ═════════════════════════ Helpers ═════════════════════════ */

type Pose = { x: number; y: number; r: number; s: number; o: number };
type Stop = { p: number; pose: Pose | "chaos" };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pose = (x: number, y: number, r = 0, s = 1, o = 1): Pose => ({ x, y, r, s, o });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");

/* ═════════════════════════ The film ═════════════════════════ */

function initFilm() {
  const film = document.querySelector<HTMLElement>("[data-film]");
  const pin = film?.querySelector<HTMLElement>("[data-pin]");
  const wrap = film?.querySelector<HTMLElement>("[data-stagewrap]");
  const stage = film?.querySelector<HTMLElement>("[data-stage]");
  if (!film || !pin || !wrap || !stage) return;

  const pinnedMq = window.matchMedia("(min-width: 901px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)");
  const q = <T extends Element = HTMLElement>(sel: string) => stage.querySelector<T>(sel)!;

  /* Fragments: chaos pose from the inline custom properties */
  type Frag = { el: HTMLElement; id: string; w: number; h: number; chaos: Pose; stops: Stop[]; ph: number };
  const frags = new Map<string, Frag>();
  stage.querySelectorAll<HTMLElement>("[data-frag]").forEach((el, i) => {
    const v = (k: string, d: number) => {
      const raw = el.style.getPropertyValue(k).trim();
      return raw ? Number(raw) : d;
    };
    const id = el.dataset.frag!;
    const kind = el.classList.contains("c2-frag--bit") ? 22 : el.classList.contains("c2-frag--rule") ? 30 : id === "root" ? 44 : 40;
    frags.set(id, {
      el,
      id,
      w: v("--w", 176),
      h: kind,
      chaos: pose(v("--x", 0), v("--y", 0), v("--r", 0), v("--s", 1), v("--o", 1)),
      stops: [],
      ph: i * 1.7,
    });
  });
  const F = (id: string) => frags.get(id)!;
  const add = (id: string, ...stops: Stop[]) => F(id).stops.push(...stops);
  const C = "chaos" as const;

  /* Act 1 · configuration tree */
  const tree: Record<string, Pose> = {
    root: pose(204, 24),
    sdwan: pose(16, 156),
    fibre: pose(16, 208),
    handset: pose(232, 156),
    voice: pose(232, 208),
    cloud: pose(448, 156),
    install: pose(448, 208),
    wifi: pose(448, 260),
    region: pose(16, 412),
    tier: pose(146, 412),
    term: pose(286, 412),
    contract: pose(406, 412),
    cell: pose(16, 452),
    approval: pose(178, 452),
  };
  /* Act 2 · price table rows, and the deck rules wait in before they stamp */
  const table: Record<string, Pose> = {
    root: pose(8, 18),
    fibre: pose(10, 120),
    sdwan: pose(10, 166),
    wifi: pose(10, 212),
    handset: pose(10, 258),
    voice: pose(10, 304),
    cloud: pose(10, 350),
    install: pose(10, 418),
  };
  const deck: Record<string, Pose> = {
    tier: pose(452, 22, -5),
    term: pose(470, 26, 4),
    contract: pose(458, 18, -2),
    cell: pose(440, 28, 3),
    approval: pose(474, 22, -6),
  };
  const land: Record<string, Pose> = {
    region: pose(264, 25),
    cell: pose(372, 125),
    term: pose(372, 263),
    tier: pose(372, 309),
    contract: pose(372, 355),
    approval: pose(24, 500),
  };
  const stampAt: Record<string, [number, number]> = {
    region: [0.53, 0.555],
    cell: [0.555, 0.58],
    term: [0.58, 0.605],
    tier: [0.605, 0.63],
    contract: [0.63, 0.655],
    approval: [0.64, 0.665],
  };
  const centreFor = (f: Frag): Pose => pose(320 - f.w / 2, 300 - f.h / 2, 0, 0.5, 0);

  // Items + root + rules: chaos → tree → table/deck → stamp → fold into the doc
  let n = 0;
  for (const id of Object.keys(tree)) {
    const f = F(id);
    const t0 = 0.1 + (n++ % 7) * 0.008;
    if (id === "fibre") {
      // Waits, dimmed, until a rule calls for it
      add(id, { p: 0.1, pose: C }, { p: 0.14, pose: { ...f.chaos, o: 0.28, s: f.chaos.s * 0.92 } }, { p: 0.27, pose: { ...f.chaos, o: 0.28, s: f.chaos.s * 0.92 } }, { p: 0.33, pose: tree.fibre });
    } else {
      add(id, { p: t0, pose: C }, { p: t0 + 0.09, pose: tree[id] });
    }
    if (table[id]) {
      const i = Object.keys(table).indexOf(id);
      add(id, { p: 0.42 + i * 0.006, pose: tree[id] }, { p: 0.48 + i * 0.006, pose: table[id] });
    } else {
      const [a, b] = stampAt[id];
      const l = land[id];
      const raised = pose(l.x + 6, l.y - 20, -6, 1.18);
      if (deck[id]) add(id, { p: 0.43, pose: tree[id] }, { p: 0.5, pose: deck[id] }, { p: a, pose: deck[id] });
      else add(id, { p: 0.43, pose: tree[id] });
      add(id, { p: a + (b - a) * 0.55, pose: raised }, { p: b, pose: l });
    }
    const last = f.stops[f.stops.length - 1].pose as Pose;
    add(id, { p: 0.7, pose: last }, { p: 0.735, pose: centreFor(f) });
  }

  // The incompatible option: tries to join, collides with SD-WAN, gets rejected
  add("nbn", { p: 0.13, pose: C }, { p: 0.21, pose: pose(16, 214) }, { p: 0.235, pose: pose(16, 199, -2) }, { p: 0.25, pose: pose(16, 216, 3) }, { p: 0.265, pose: pose(16, 216, 3) }, { p: 0.31, pose: pose(36, 330, 14, 0.9, 0) });

  // Loose bits merge into whatever they belong to
  frags.forEach((f) => {
    const parent = f.el.dataset.parent;
    if (!parent) return;
    const pf = F(parent);
    const target = parent === "fibre" ? pf.chaos : tree[parent];
    const t0 = 0.11 + (Number(f.id.slice(1)) % 6) * 0.01;
    add(f.id, { p: t0, pose: C }, { p: t0 + 0.07, pose: pose(target.x + pf.w / 2 - f.w / 2, target.y + pf.h / 2 - 11, 0, 0.5, 0) });
  });

  /* Layers */
  const layer = (k: string) => q(`[data-layer="${k}"]`);
  const grid = layer("grid");
  const treeL = layer("tree");
  const tableL = layer("table");
  const gatesL = layer("gates");
  const doc = q("[data-doc]");
  const log = q(".c2-log");
  const draws = {
    root: [...stage.querySelectorAll<SVGPathElement>('[data-draw="root"]')],
    chain: [...stage.querySelectorAll<SVGPathElement>('[data-draw="chain"]')],
    dep: [...stage.querySelectorAll<SVGPathElement>('[data-draw="dep"]')],
  };
  const gauge = q<SVGCircleElement>("[data-gauge]");
  const monthly = q("[data-monthly]");
  const copies = [...film.querySelectorAll<HTMLElement>("[data-copy]")];
  const rail = film.querySelector<HTMLElement>("[data-rail]")!;
  const railBtns = [...rail.querySelectorAll<HTMLButtonElement>("[data-goto]")];
  const fills = [...rail.querySelectorAll<HTMLElement>("[data-fill]")];

  const docPath: [number, number, number][] = [
    [0.7, 320, 0.86],
    [0.765, 90, 0.5],
    [0.785, 165, 0.5],
    [0.805, 165, 0.5],
    [0.825, 335, 0.5],
    [0.85, 335, 0.5],
    [0.87, 540, 0.5],
    [0.905, 320, 1],
  ];
  const flagDefs: [string, (p: number) => boolean][] = [
    ["f-shake", (p) => p >= 0.235 && p < 0.275],
    ["f-reject", (p) => p >= 0.245],
    ["f-dep", (p) => p >= 0.31],
    ["f-log1", (p) => p >= 0.25 && p < 0.4],
    ["f-log2", (p) => p >= 0.32 && p < 0.4],
    ["f-table", (p) => p >= 0.45],
    ["f-term", (p) => p >= 0.605],
    ["f-tier", (p) => p >= 0.63],
    ["f-contract", (p) => p >= 0.655],
    ["f-approve", (p) => p >= 0.665],
    ["f-gate1", (p) => p >= 0.795],
    ["f-away", (p) => p >= 0.825],
    ["f-backup", (p) => p >= 0.835],
    ["f-gate2", (p) => p >= 0.845],
    ["f-final", (p) => p >= 0.905],
    ["f-sign", (p) => p >= 0.93],
  ];
  const acts: [number, number][] = [
    [0.1, 0.38],
    [0.4, 0.68],
    [0.7, 0.95],
  ];
  const jumpTo = [0.14, 0.44, 0.74];

  /* State */
  let pinned = pinnedMq.matches;
  let target = 0;
  let p = 0;
  let raf = 0;
  let visible = true;
  let monthlyShown = 9900;

  const poseAt = (f: Frag, pp: number, drift: number, time: number): Pose => {
    const st = f.stops;
    const resolve = (s: Pose | "chaos") => (s === "chaos" ? f.chaos : s);
    let out: Pose;
    if (!st.length || pp <= st[0].p) out = resolve(st[0]?.pose ?? "chaos");
    else if (pp >= st[st.length - 1].p) out = resolve(st[st.length - 1].pose);
    else {
      let i = 0;
      while (i < st.length - 1 && pp > st[i + 1].p) i++;
      const a = st[i];
      const b = st[i + 1];
      const t = ease(b.p === a.p ? 1 : (pp - a.p) / (b.p - a.p));
      const A = resolve(a.pose);
      const B = resolve(b.pose);
      out = { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), r: lerp(A.r, B.r, t), s: lerp(A.s, B.s, t), o: lerp(A.o, B.o, t) };
    }
    if (drift > 0) {
      const w = time * 0.00055 + f.ph;
      out = { ...out, x: out.x + Math.sin(w) * 7 * drift, y: out.y + Math.cos(w * 0.8) * 6 * drift, r: out.r + Math.sin(w * 0.6) * 2.2 * drift };
    }
    return out;
  };

  const flagState = new Map<string, boolean>();
  const setFlag = (name: string, on: boolean) => {
    if (flagState.get(name) === on) return;
    flagState.set(name, on);
    stage.classList.toggle(name, on);
  };
  const show = (el: HTMLElement | SVGElement, o: number) => {
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o < 0.01 ? "hidden" : "visible";
  };

  const render = (time: number) => {
    const drift = prefersReducedMotion ? 0 : 1 - ramp(p, 0.04, 0.14);
    frags.forEach((f) => {
      const ps = poseAt(f, pinned ? p : 0, drift, time);
      f.el.style.transform = `translate(${ps.x.toFixed(2)}px,${ps.y.toFixed(2)}px) rotate(${ps.r.toFixed(2)}deg) scale(${ps.s.toFixed(3)})`;
      f.el.style.opacity = ps.o.toFixed(3);
    });
    if (!pinned) return;

    grid.style.opacity = (ramp(p, 0.08, 0.2) * 0.55 * (1 - ramp(p, 0.7, 0.76))).toFixed(3);
    show(treeL, ramp(p, 0.16, 0.22) * (1 - ramp(p, 0.4, 0.45)));
    draws.root.forEach((d) => (d.style.strokeDashoffset = String(1 - ease(ramp(p, 0.17, 0.25)))));
    draws.chain.forEach((d) => (d.style.strokeDashoffset = String(1 - ease(ramp(p, 0.2, 0.3)))));
    draws.dep.forEach((d) => (d.style.strokeDashoffset = String(1 - ease(ramp(p, 0.27, 0.31)))));
    show(log, 1 - ramp(p, 0.4, 0.43));

    const tIn = ease(ramp(p, 0.43, 0.5));
    const tOut = ease(ramp(p, 0.7, 0.735));
    show(tableL, tIn * (1 - tOut));
    tableL.style.transform = `translateY(${((1 - tIn) * 16).toFixed(1)}px) scale(${(1 - tOut * 0.14).toFixed(3)})`;
    gauge.style.strokeDashoffset = (100 - 34 * ease(ramp(p, 0.6, 0.68))).toFixed(2);

    const m = 9900 - 1560 * ease(ramp(p, 0.59, 0.605)) - 180 * ease(ramp(p, 0.615, 0.63)) - 180 * ease(ramp(p, 0.64, 0.655));
    const mr = Math.round(m / 10) * 10;
    if (mr !== monthlyShown) {
      monthlyShown = mr;
      monthly.textContent = money(mr);
    }

    show(gatesL, ramp(p, 0.755, 0.775) * (1 - ramp(p, 0.865, 0.885)));
    let i = 0;
    while (i < docPath.length - 1 && p > docPath[i + 1][0]) i++;
    const [pa, xa, sa] = docPath[i];
    const [pb, xb, sb] = docPath[Math.min(i + 1, docPath.length - 1)];
    const dt = pb === pa ? 1 : ease(ramp(p, pa, pb));
    const cx = lerp(xa, xb, dt);
    const sc = lerp(sa, sb, dt);
    show(doc, ramp(p, 0.7, 0.72));
    doc.style.transform = `translateX(${(cx - 320).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const reveal = ease(ramp(p, 0.7, 0.745));
    doc.style.clipPath = reveal >= 1 ? "none" : `inset(0 0 ${(100 * (1 - reveal)).toFixed(1)}% 0 round 14px)`;

    for (const [name, test] of flagDefs) setFlag(name, test(p));

    // Copy column
    const ops = [
      1 - ramp(p, 0.05, 0.1),
      ramp(p, 0.09, 0.13) * (1 - ramp(p, 0.37, 0.41)),
      ramp(p, 0.4, 0.44) * (1 - ramp(p, 0.67, 0.71)),
      ramp(p, 0.7, 0.74),
    ];
    copies.forEach((c, k) => {
      const o = ops[k];
      show(c, o);
      // Enter from below, leave upwards
      const shift = k === 0 ? -ramp(p, 0.05, 0.1) * 28 : (1 - o) * (p < (acts[k - 1][0] + acts[k - 1][1]) / 2 ? 24 : -24);
      c.style.transform = `translateY(${shift.toFixed(1)}px)`;
      c.style.pointerEvents = o > 0.5 ? "" : "none";
    });
    rail.style.opacity = (ramp(p, 0.07, 0.11)).toFixed(3);
    rail.style.visibility = p > 0.07 ? "visible" : "hidden";
    let active = -1;
    fills.forEach((fl, k) => {
      const [a, b] = acts[k];
      fl.style.transform = `scaleX(${ramp(p, a, b).toFixed(3)})`;
      if (p >= a - 0.02) active = k;
    });
    railBtns.forEach((b, k) => (k === active ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
  };

  const measure = () => {
    const r = wrap.getBoundingClientRect();
    const k = pinned ? Math.min(r.width / 640, r.height / 600, 1.12) : Math.min(r.width / 640, 1);
    stage.style.setProperty("--k", k.toFixed(4));
  };

  const readTarget = () => {
    if (!pinned) return 0;
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const rect = film.getBoundingClientRect();
    const span = rect.height - pin.offsetHeight;
    return span > 0 ? clamp01((top - rect.top) / span) : 0;
  };

  const tick = (time: number) => {
    raf = 0;
    target = readTarget();
    const diff = target - p;
    p = Math.abs(diff) < 0.0004 ? target : p + diff * 0.14;
    render(time);
    const drifting = !prefersReducedMotion && (pinned ? p < 0.14 : true);
    if (visible && (p !== target || drifting)) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  };

  const clearInline = () => {
    [grid, treeL, tableL, gatesL, doc, log, rail, ...copies].forEach((el) => el.removeAttribute("style"));
    [...draws.root, ...draws.chain, ...draws.dep, gauge].forEach((el) => el.style.removeProperty("stroke-dashoffset"));
    flagState.forEach((_, name) => stage.classList.remove(name));
    flagState.clear();
    monthly.textContent = money(9900);
    monthlyShown = 9900;
  };

  const setMode = () => {
    pinned = pinnedMq.matches;
    clearInline();
    measure();
    p = target = readTarget();
    render(performance.now());
    kick();
  };

  if (prefersReducedMotion) {
    // Static exploded view in the stacked layout; nothing moves.
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return;
  }

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    kick();
  }).observe(film);
  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      measure();
      kick();
    },
    { passive: true },
  );
  pinnedMq.addEventListener("change", setMode);

  railBtns.forEach((b, k) =>
    b.addEventListener("click", () => {
      const rect = film.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const span = rect.height - pin.offsetHeight;
      window.scrollTo({ top: window.scrollY + rect.top - top + jumpTo[k] * span, behavior: "smooth" });
    }),
  );

  setMode();
}

/* ═════════════════════════ Customer view: options, sign, pay ═════════════════════════ */

function initCustomerView() {
  const cx = document.querySelector<HTMLElement>("[data-cx]");
  if (!cx) return;
  const base = 7980;
  const opts = [...cx.querySelectorAll<HTMLInputElement>("[data-opt]")];
  const qtyOut = cx.querySelector<HTMLOutputElement>("[data-qty]")!;
  const minus = cx.querySelector<HTMLButtonElement>('[data-step="-1"]')!;
  const plus = cx.querySelector<HTMLButtonElement>('[data-step="1"]')!;
  const monthly = cx.querySelector<HTMLElement>("[data-cx-monthly]")!;
  const status = cx.querySelector<HTMLElement>("[data-cx-status]")!;
  const sign = cx.querySelector<HTMLButtonElement>("[data-cx-sign]")!;
  const pay = cx.querySelector<HTMLElement>("[data-cx-pay]")!;
  const done = cx.querySelector<HTMLElement>("[data-cx-done]")!;
  const reset = cx.querySelector<HTMLButtonElement>("[data-cx-reset]")!;
  let qty = 0;
  let shown = base;
  let anim = 0;

  const total = () => base + opts.reduce((s, o) => s + (o.checked ? Number(o.dataset.opt) : 0), 0) + qty * 42;
  const update = () => {
    qtyOut.value = String(qty);
    qtyOut.textContent = String(qty);
    minus.disabled = qty === 0;
    plus.disabled = qty === 6;
    const to = total();
    cancelAnimationFrame(anim);
    if (prefersReducedMotion) {
      shown = to;
      monthly.textContent = money(to);
      return;
    }
    const from = shown;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      monthly.textContent = money(shown);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const lock = (on: boolean) => {
    opts.forEach((o) => (o.disabled = on));
    if (on) {
      minus.disabled = plus.disabled = true;
    }
  };

  opts.forEach((o) => o.addEventListener("change", update));
  [minus, plus].forEach((b) =>
    b.addEventListener("click", () => {
      qty = Math.max(0, Math.min(6, qty + Number(b.dataset.step)));
      update();
    }),
  );
  sign.addEventListener("click", () => {
    cx.classList.add("is-signed");
    status.textContent = "Signed · awaiting payment";
    sign.hidden = true;
    pay.hidden = false;
    lock(true);
    pay.querySelector("button")?.focus();
  });
  pay.querySelectorAll("[data-cx-paybtn]").forEach((b) =>
    b.addEventListener("click", () => {
      cx.classList.add("is-paid");
      status.textContent = "Paid · deal won";
      pay.hidden = true;
      done.hidden = false;
      reset.focus();
    }),
  );
  reset.addEventListener("click", () => {
    cx.classList.remove("is-signed", "is-paid");
    status.textContent = "Awaiting acceptance";
    done.hidden = true;
    sign.hidden = false;
    opts.forEach((o) => (o.checked = false));
    qty = 0;
    lock(false);
    update();
    sign.focus();
  });
  update();
}

/* ═════════════════════════ Loops that only run on screen ═════════════════════════ */

function liveWhenVisible(el: Element | null, cls = "is-live") {
  if (!el || prefersReducedMotion) return;
  new IntersectionObserver((entries) => entries.forEach((e) => el.classList.toggle(cls, e.isIntersecting)), { threshold: 0.15 }).observe(el);
}

function initEnd() {
  const panel = document.querySelector<HTMLElement>("[data-end]");
  if (!panel) return;
  if (prefersReducedMotion) panel.classList.add("is-in");
  else onceVisible(panel, () => panel.classList.add("is-in"), 0.35);
}

initFilm();
initCustomerView();
liveWhenVisible(document.querySelector(".c2-gov__grid"));
liveWhenVisible(document.querySelector("[data-hub]"));
initEnd();
