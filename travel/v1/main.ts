import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** Tweens a number into `el`, easing out. */
function tween(el: HTMLElement, from: number, to: number, format: (n: number) => string, duration = 800) {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function restartClass(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/* ───────── Hero: segments drop into the itinerary, total counts up ───────── */

function initHero() {
  const ed = document.querySelector<HTMLElement>("[data-editor]");
  if (!ed || prefersReducedMotion) return;

  const totalEl = ed.querySelector<HTMLElement>("[data-total]")!;
  const totalCard = ed.querySelector<HTMLElement>(".ed__total")!;
  const ghost = ed.querySelector<HTMLElement>(".ed__ghost")!;
  const segs = [...ed.querySelectorAll<HTMLElement>(".seg")];
  let total = 0;

  ed.classList.add("is-pre");
  totalEl.textContent = "0";

  const flashPalette = (key: string) => {
    const tile = ed.querySelector(`[data-pal="${key}"]`);
    if (!tile) return;
    tile.classList.add("is-hot");
    window.setTimeout(() => tile.classList.remove("is-hot"), 700);
  };

  const drop = (seg: HTMLElement) => {
    const key = seg.dataset.seg ?? "";
    seg.classList.add("is-in");
    ed.querySelector(`[data-bar="${key}"]`)?.classList.add("is-in");
    const next = total + Number(seg.dataset.amount ?? 0);
    tween(totalEl, total, next, money, 900);
    total = next;
    restartClass(totalCard, "is-bump");
  };

  const drag = async (key: string, target: HTMLElement) => {
    const from = ed.querySelector<HTMLElement>(`[data-pal="${key}"]`);
    if (!from || !from.offsetParent || !ghost.animate) return;
    const box = ed.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const chip = ghost.getBoundingClientRect();
    const fx = a.left - box.left + a.width / 2 - chip.width / 2;
    const fy = a.top - box.top + a.height / 2 - chip.height / 2;
    const tx = b.left - box.left + b.width * 0.42 - chip.width / 2;
    const ty = b.top - box.top + b.height / 2 - chip.height / 2;
    from.classList.add("is-hot");
    await ghost.animate(
      [
        { opacity: 0, transform: `translate(${fx}px, ${fy}px) scale(0.85)` },
        { opacity: 1, transform: `translate(${fx}px, ${fy}px) scale(1)`, offset: 0.18 },
        { opacity: 1, transform: `translate(${tx}px, ${ty}px) scale(1)`, offset: 0.86 },
        { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(0.92)` },
      ],
      { duration: 1300, easing: "cubic-bezier(0.55, 0, 0.25, 1)" },
    ).finished;
    from.classList.remove("is-hot");
  };

  (async () => {
    await wait(1000);
    flashPalette("flight");
    drop(segs[0]);
    await wait(850);
    flashPalette("hotel");
    drop(segs[1]);
    await wait(700);
    await drag("tour", segs[2]);
    drop(segs[2]);
  })();
}

/* ───────── Bento: tiles loop only while visible ───────── */

type Hooks = { start: () => void; stop: () => void };
const tileHooks = new WeakMap<Element, Hooks>();

function initTiles() {
  const tiles = document.querySelectorAll<HTMLElement>("[data-tile]");
  if (!("IntersectionObserver" in window)) {
    tiles.forEach((t) => t.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const live = entry.isIntersecting;
        entry.target.classList.toggle("is-live", live);
        if (prefersReducedMotion) continue;
        const hooks = tileHooks.get(entry.target);
        if (hooks) live ? hooks.start() : hooks.stop();
      }
    },
    { threshold: 0.2 },
  );
  tiles.forEach((t) => io.observe(t));
}

/* Trip cost: a real checkbox; auto-demos itself until the visitor takes over */
function initCost() {
  const stage = document.querySelector<HTMLElement>("[data-cost]");
  const tile = stage?.closest("[data-tile]");
  if (!stage || !tile) return;
  const box = stage.querySelector<HTMLInputElement>("[data-cost-opt]")!;
  const out = stage.querySelector<HTMLElement>("[data-cost-total]")!;
  const tick = stage.querySelector<HTMLElement>(".cost__box")!;
  const base = 4550;
  const extra = 220;
  let shown = base;
  let userOwned = false;
  let hovering = false;
  let timers: number[] = [];

  const render = () => {
    const to = box.checked ? base + extra : base;
    tween(out, shown, to, (n) => `$${money(n)}`, 650);
    shown = to;
    restartClass(out, "is-bump");
  };

  box.addEventListener("change", (event) => {
    if (event.isTrusted && !userOwned) {
      userOwned = true;
      out.setAttribute("aria-live", "polite");
      stop();
    }
    render();
  });
  stage.addEventListener("pointerenter", () => (hovering = true));
  stage.addEventListener("pointerleave", () => (hovering = false));
  box.addEventListener("focus", () => (hovering = true));
  box.addEventListener("blur", () => (hovering = false));

  const placeCursor = () => {
    const s = stage.getBoundingClientRect();
    const b = tick.getBoundingClientRect();
    stage.style.setProperty("--cx", `${b.left - s.left + b.width / 2 - 5}px`);
    stage.style.setProperty("--cy", `${b.top - s.top + b.height / 2 - 4}px`);
  };

  const cycle = () => {
    if (userOwned) return;
    if (!hovering) {
      placeCursor();
      restartClass(stage, "is-clicking");
      timers.push(
        window.setTimeout(() => {
          box.checked = !box.checked;
          render();
        }, 800),
      );
    }
    timers.push(window.setTimeout(cycle, box.checked ? 3400 : 2600));
  };

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    stage!.classList.remove("is-clicking");
  }

  tileHooks.set(tile, {
    start: () => {
      stop();
      if (!userOwned) timers.push(window.setTimeout(cycle, 900));
    },
    stop,
  });
}

/* TravelDocs countdown ticks while visible */
function initCountdown() {
  const tile = document.querySelector(".t-phone");
  if (!tile) return;
  const parts = {
    d: tile.querySelector<HTMLElement>('[data-cd="d"]')!,
    h: tile.querySelector<HTMLElement>('[data-cd="h"]')!,
    m: tile.querySelector<HTMLElement>('[data-cd="m"]')!,
    s: tile.querySelector<HTMLElement>('[data-cd="s"]')!,
  };
  const target = Date.now() + (((24 * 24 + 18) * 60 + 42) * 60 + 7) * 1000;
  let timer = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  const set = (el: HTMLElement, value: string) => {
    if (el.textContent === value) return;
    el.textContent = value;
    restartClass(el, "is-tick");
  };
  const render = () => {
    let left = Math.max(0, Math.round((target - Date.now()) / 1000));
    const d = Math.floor(left / 86400);
    left -= d * 86400;
    const h = Math.floor(left / 3600);
    left -= h * 3600;
    const m = Math.floor(left / 60);
    set(parts.d, String(d));
    set(parts.h, pad(h));
    set(parts.m, pad(m));
    set(parts.s, pad(left - m * 60));
  };
  tileHooks.set(tile, {
    start: () => {
      window.clearInterval(timer);
      render();
      timer = window.setInterval(render, 1000);
    },
    stop: () => window.clearInterval(timer),
  });
}

/* Integrations: wires drawn from each logo to the QuoteCloud hub */
function initIntegrations() {
  const stage = document.querySelector<HTMLElement>("[data-integ]");
  if (!stage) return;
  const svg = stage.querySelector<SVGSVGElement>(".integ__wires")!;
  const hub = stage.querySelector<HTMLElement>("[data-hub]")!;
  const sources = [...stage.querySelectorAll<HTMLElement>("[data-src]")];

  const draw = () => {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const h = hub.getBoundingClientRect();
    const vertical = h.top >= sources[0].getBoundingClientRect().bottom;
    svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    svg.innerHTML = sources
      .map((src, i) => {
        const b = src.getBoundingClientRect();
        let d: string;
        if (vertical) {
          const x1 = b.left + b.width / 2 - r.left;
          const y1 = b.bottom - r.top;
          const x2 = h.left + h.width / 2 - r.left;
          const y2 = h.top - r.top;
          const my = (y1 + y2) / 2;
          d = `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
        } else {
          const x1 = b.right - r.left;
          const y1 = b.top + b.height / 2 - r.top;
          const x2 = h.left - r.left;
          const y2 = h.top + h.height / 2 - r.top;
          const mx = (x1 + x2) / 2;
          d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
        }
        return `<path class="integ__wire" d="${d}"/><path class="integ__pulse" style="--i:${i}" d="${d}" pathLength="1"/>`;
      })
      .join("");
  };

  draw();
  new ResizeObserver(draw).observe(stage);
}

/* ───────── Slim sticky CTA on mobile ───────── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>("[data-sticky]");
  const heroCtas = document.querySelector(".hero__ctas");
  if (!bar || !heroCtas || !("IntersectionObserver" in window)) return;
  const ends = [document.querySelector("[data-close]"), document.querySelector(".qc-footer")].filter(Boolean) as Element[];
  let heroVisible = true;
  const endsVisible = new Set<Element>();
  bar.hidden = false;

  const update = () => bar.classList.toggle("is-shown", !heroVisible && endsVisible.size === 0);
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting || entry.boundingClientRect.top > 0;
    update();
  }).observe(heroCtas);
  const endIo = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? endsVisible.add(e.target) : endsVisible.delete(e.target);
    update();
  });
  ends.forEach((el) => endIo.observe(el));
}

initHero();
initCost();
initCountdown();
initIntegrations();
initTiles();
initSticky();
