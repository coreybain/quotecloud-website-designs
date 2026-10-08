import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Toggles `.is-live` while an element is on screen, so CSS loops only run when visible. */
function liveWhileVisible(el: Element, onChange?: (live: boolean) => void) {
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver(
    ([entry]) => {
      const live = entry.isIntersecting && !prefersReducedMotion;
      el.classList.toggle("is-live", live);
      onChange?.(live);
    },
    { threshold: 0.05 },
  ).observe(el);
}

/* ───────── Plane that flies along an SVG arc (works with stretched SVGs) ───────── */

function flyAlong(path: SVGPathElement, plane: HTMLElement, host: HTMLElement, to: number, duration: number, delay = 0) {
  const len = path.getTotalLength();
  let t = prefersReducedMotion ? to : 0;

  const place = () => {
    const ctm = path.getScreenCTM();
    if (!ctm) return;
    const hostBox = host.getBoundingClientRect();
    const at = (f: number) => {
      const p = path.getPointAtLength(Math.max(0, Math.min(1, f)) * len);
      return new DOMPoint(p.x, p.y).matrixTransform(ctm);
    };
    const a = at(t);
    const b = at(t + 0.01);
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    plane.style.transform = `translate(${a.x - hostBox.left}px, ${a.y - hostBox.top}px) rotate(${angle}deg)`;
  };

  place();
  window.addEventListener("resize", place, { passive: true });
  if (prefersReducedMotion) return;

  const start = performance.now() + delay;
  const tick = (now: number) => {
    const k = Math.min(1, Math.max(0, (now - start) / duration));
    t = easeOut(k) * to;
    place();
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ───────── Hero: countdown chip + plane ───────── */

function initHero() {
  const chip = $("[data-countdown]");
  const clock = $("[data-cd-clock]", chip ?? document);
  const days = $("[data-cd-days]", chip ?? document);
  if (chip && clock && days) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 25, 10, 20).getTime();
    const pad = (n: number) => String(n).padStart(2, "0");
    let timer = 0;
    const render = () => {
      const diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 864e5);
      const h = Math.floor((diff % 864e5) / 36e5);
      const m = Math.floor((diff % 36e5) / 6e4);
      const s = Math.floor((diff % 6e4) / 1e3);
      days.textContent = `${d} days`;
      clock.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    };
    render();
    if (!prefersReducedMotion) {
      liveWhileVisible(chip, (live) => {
        window.clearInterval(timer);
        if (live) timer = window.setInterval(render, 1000);
      });
    }
  }

  const route = $(".dd-trip__route");
  const path = $<SVGPathElement>(".dd-trip__arc-fill");
  const plane = $(".dd-trip__plane");
  if (route && path && plane) flyAlong(path, plane, route, 0.58, 2400, 500);
}

/* ───────── Timeline: unfold, dots, progress line, sticky day marker ───────── */

function initTimeline() {
  const tl = $("[data-tl]");
  if (!tl) return;
  const track = $(".dd-tl__track", tl)!;
  const line = $(".dd-tl__line", tl)!;
  const fill = $("[data-tl-fill]", tl)!;
  const days = $$<HTMLElement>(".dd-day", tl);
  const end = $(".dd-tl__end", tl);
  const rolls = $$<HTMLElement>("[data-roll]", tl);
  const ticks = $$<HTMLElement>(".dd-marker__ticks i", tl);

  // Unfold each segment when it enters (once), then hand over to its visual.
  const openers = new Map<Element, () => void>([
    [days[0], () => runImport(days[0])],
    [days[1], () => runMedia(days[1])],
    [days[2], () => runLibrary(days[2])],
    [days[3], () => runStyle(days[3])],
    [days[4], () => runCost(days[4])],
    [days[5], () => runSign(days[5])],
  ]);
  const open = (day: HTMLElement) => {
    if (day.classList.contains("is-open")) return;
    day.classList.add("is-open");
    window.setTimeout(() => openers.get(day)?.(), prefersReducedMotion ? 0 : 450);
  };
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    days.forEach(open);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          open(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.12 },
    );
    days.forEach((d) => io.observe(d));
  }
  days.forEach((d) => liveWhileVisible($(".dd-seg__body", d)!));

  // Scroll-linked state: progress line, filled dots, active day.
  let active = -1;
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    const lineY = vh * 0.55;
    const lineBox = line.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (lineY - lineBox.top) / lineBox.height));
    fill.style.transform = `scaleY(${p})`;

    let current = 0;
    days.forEach((day, i) => {
      const dotY = day.getBoundingClientRect().top + 46;
      const reached = dotY <= lineY;
      day.classList.toggle("is-reached", reached);
      if (reached) current = i;
    });
    end?.classList.toggle("is-reached", p >= 0.999);

    if (current !== active) {
      active = current;
      days.forEach((d, i) => d.classList.toggle("is-active", i === active));
      rolls.forEach((r) => r.style.setProperty("--i", String(active)));
      ticks.forEach((t, i) => t.classList.toggle("is-on", i <= active));
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  void track;
}

/* ── Day 1 · GDS import: PNR lines light up and become itinerary segments ── */

function runImport(day: HTMLElement) {
  const root = $("[data-import]", day);
  if (!root) return;
  const lines = $$("ol li", root);
  const rows = $$(".v-import__rows li", root);
  const toast = $(".v-import__toast", root)!;
  const label = $("[data-src-label]", root)!;
  const tabs = $$<HTMLButtonElement>(".v-import__tabs button", root);
  let run = 0;

  const play = async () => {
    const id = ++run;
    lines.forEach((l) => l.classList.remove("is-hot", "is-done"));
    rows.forEach((r) => r.classList.remove("is-in", "is-fresh"));
    toast.classList.remove("is-in");
    if (prefersReducedMotion) {
      lines.forEach((l) => l.classList.add("is-done"));
      rows.forEach((r) => r.classList.add("is-in"));
      toast.classList.add("is-in");
      return;
    }
    await wait(250);
    for (let i = 0; i < rows.length; i++) {
      if (id !== run) return;
      lines[i]?.classList.add("is-hot");
      await wait(320);
      if (id !== run) return;
      lines[i]?.classList.replace("is-hot", "is-done");
      rows[i].classList.add("is-in", "is-fresh");
      const row = rows[i];
      window.setTimeout(() => row.classList.remove("is-fresh"), 900);
      await wait(260);
    }
    if (id === run) toast.classList.add("is-in");
  };

  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-pressed", String(t === tab)));
      label.textContent = tab.dataset.src ?? "";
      void play();
    }),
  );
  void play();
}

/* ── Day 2 · Rich media: gallery auto-advances while visible, video clock ticks ── */

function runMedia(day: HTMLElement) {
  const root = $("[data-media]", day);
  if (!root) return;
  const frames = $$(".v-media__frame", root);
  const thumbs = $$<HTMLButtonElement>(".v-media__thumbs button", root);
  const count = $("[data-media-count]", root)!;
  const vtime = $("[data-vtime]", root)!;
  let index = 0;
  let timer = 0;
  let clock = 0;
  let userPicked = false;

  const show = (i: number) => {
    index = (i + frames.length) % frames.length;
    frames.forEach((f, k) => f.classList.toggle("is-active", k === index));
    thumbs.forEach((t, k) => t.setAttribute("aria-pressed", String(k === index)));
    count.textContent = `${index + 1} / ${frames.length}`;
  };
  thumbs.forEach((t, k) =>
    t.addEventListener("click", () => {
      userPicked = true;
      window.clearInterval(timer);
      show(k);
    }),
  );

  const DURATION = 165; // 02:45, mirrored by the 16s CSS progress loop
  const body = root.closest(".dd-seg__body")!;
  const sync = () => {
    const live = body.classList.contains("is-live");
    window.clearInterval(timer);
    window.clearInterval(clock);
    if (!live) return;
    if (!userPicked) timer = window.setInterval(() => show(index + 1), 3600);
    const started = performance.now();
    clock = window.setInterval(() => {
      const k = ((performance.now() - started) % 16000) / 16000;
      const secs = Math.round(k * DURATION);
      vtime.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }, 500);
  };
  new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ["class"] });
  sync();
}

/* ── Day 3 · Content library: a guide is dragged from the library into the itinerary ── */

async function runLibrary(day: HTMLElement) {
  const root = $("[data-lib]", day);
  if (!root) return;
  const source = $("[data-lib-source]", root)!;
  const target = $("[data-lib-target]", root)!;
  const ghost = $("[data-lib-ghost]", root)!;

  if (prefersReducedMotion || !ghost.animate) {
    target.classList.add("is-dropped");
    return;
  }
  await wait(500);
  const box = root.getBoundingClientRect();
  const s = source.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const from = { x: s.left - box.left, y: s.top - box.top };
  const to = {
    x: t.left - box.left + Math.min(40, t.width * 0.1),
    y: t.top - box.top + t.height / 2 - s.height / 2,
  };
  source.classList.add("is-lifted");
  const move = ghost.animate(
    [
      { opacity: 0, transform: `translate(${from.x}px, ${from.y}px) scale(1)` },
      { opacity: 1, transform: `translate(${from.x + 6}px, ${from.y - 6}px) rotate(-2deg) scale(1.04)`, offset: 0.15 },
      { opacity: 1, transform: `translate(${to.x}px, ${to.y}px) rotate(-1deg) scale(1.04)`, offset: 0.85 },
      { opacity: 0, transform: `translate(${to.x}px, ${to.y}px) scale(0.96)` },
    ],
    { duration: 1700, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" },
  );
  window.setTimeout(() => target.classList.add("is-hover"), 1000);
  await move.finished.catch(() => {});
  target.classList.remove("is-hover");
  target.classList.add("is-dropped");
  source.classList.remove("is-lifted");
}

/* ── Day 4 · Templates: covers fan out; picking one brings it forward with its palette ── */

function runStyle(day: HTMLElement) {
  const root = $("[data-style]", day);
  if (!root) return;
  const covers = $$(".v-style__cover", root);
  const picks = $$<HTMLButtonElement>(".v-style__picks button", root);
  const order = [0, 1, 2, 3];
  let current = 0;
  let timer = 0;
  let userPicked = false;

  const choose = (i: number) => {
    current = i;
    // Selected cover to the front; the rest keep their relative order behind it.
    const rest = order.filter((k) => k !== i);
    [i, ...rest].forEach((coverIndex, pos) => covers[coverIndex].setAttribute("data-pos", String(pos)));
    picks.forEach((p, k) => p.setAttribute("aria-pressed", String(k === i)));
    const pal = (picks[i].dataset.pal ?? "").split(",");
    pal.forEach((c, k) => root.style.setProperty(`--c${k + 1}`, c));
  };
  picks.forEach((p, k) =>
    p.addEventListener("click", () => {
      userPicked = true;
      window.clearInterval(timer);
      choose(k);
    }),
  );
  choose(0);
  if (prefersReducedMotion) return;
  const body = root.closest(".dd-seg__body")!;
  const sync = () => {
    window.clearInterval(timer);
    if (!userPicked && body.classList.contains("is-live")) {
      timer = window.setInterval(() => choose((current + 1) % covers.length), 3200);
    }
  };
  new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ["class"] });
  sync();
}

/* ── Day 5 · Trip cost: options recalculate the total ── */

function runCost(day: HTMLElement) {
  const root = $("[data-cost]", day);
  if (!root) return;
  const BASE = 1250 + 2400 + 350;
  const inputs = $$<HTMLInputElement>("[data-opt]", root);
  const totalEl = $("[data-total]", root)!;
  const ppEl = $("[data-pp]", root)!;
  const totalWrap = totalEl.parentElement!;
  const base = $(".v-cost__bar .is-base", root)!;
  const opt = $("[data-optbar]", root)!;
  let shown = BASE + 180;
  let raf = 0;
  let touched = false;

  const recalc = () => {
    const extras = inputs.filter((i) => i.checked).reduce((sum, i) => sum + Number(i.value), 0);
    const total = BASE + extras;
    base.style.transform = `scaleX(${BASE / total})`;
    opt.style.transform = `scaleX(${extras / total})`;
    cancelAnimationFrame(raf);
    const from = shown;
    if (prefersReducedMotion) {
      shown = total;
      totalEl.textContent = money(total);
      ppEl.textContent = `$${money(total / 2)}`;
      return;
    }
    totalWrap.classList.remove("is-bump");
    void totalWrap.offsetWidth;
    totalWrap.classList.add("is-bump");
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      shown = Math.round(from + (total - from) * easeOut(k));
      totalEl.textContent = money(shown);
      ppEl.textContent = `$${money(shown / 2)}`;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  inputs.forEach((i) =>
    i.addEventListener("change", () => {
      touched = true;
      recalc();
    }),
  );
  recalc();

  // A quiet demo: a traveller adds the sunrise trek.
  const auto = $("[data-auto]", root);
  const autoInput = auto ? $<HTMLInputElement>("input", auto) : null;
  if (!auto || !autoInput || prefersReducedMotion) return;
  window.setTimeout(() => {
    if (touched || autoInput.checked) return;
    auto.classList.add("is-tap");
    window.setTimeout(() => {
      if (touched) return auto.classList.remove("is-tap");
      autoInput.checked = true;
      recalc();
      window.setTimeout(() => auto.classList.remove("is-tap"), 700);
    }, 450);
  }, 1300);
}

/* ── Day 6 · Sign → pay → confirmed ── */

async function runSign(day: HTMLElement) {
  const root = $("[data-sign]", day);
  if (!root) return;
  const audit = $$(".v-audit li", root);
  if (prefersReducedMotion) {
    root.classList.add("is-signed", "is-paid", "is-confirmed");
    audit.forEach((a) => a.classList.add("is-in"));
    return;
  }
  audit[0]?.classList.add("is-in");
  await wait(300);
  root.classList.add("is-signed");
  await wait(2300);
  audit[1]?.classList.add("is-in");
  root.classList.add("is-paying");
  await wait(1100);
  root.classList.remove("is-paying");
  root.classList.add("is-paid");
  audit[2]?.classList.add("is-in");
  await wait(450);
  root.classList.add("is-confirmed");
}

/* ───────── Integrations route + departure plane ───────── */

function initIntegrations() {
  const route = $("[data-int]");
  if (route) onceVisible(route, () => route.classList.add("is-in"), 0.3);
}

function initDeparture() {
  const host = $(".dd-pass__route");
  const path = $<SVGPathElement>(".dd-pass__arc path");
  const plane = $(".dd-pass__plane");
  if (!host || !path || !plane) return;
  if (prefersReducedMotion) return flyAlong(path, plane, host, 1, 0);
  flyAlong(path, plane, host, 0, 0);
  onceVisible(host, () => flyAlong(path, plane, host, 1, 2600, 300), 0.6);
}

initHero();
initTimeline();
initIntegrations();
initDeparture();
