import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Tiny tween for numbers (ease-out quart). Returns a cancel function. */
function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void) {
  if (prefersReducedMotion) {
    onUpdate(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate(from + (to - from) * (1 - Math.pow(1 - t, 4)));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Runs `start` when visible, calls the returned `stop` when it leaves the viewport. */
function whileVisible(el: Element, start: () => () => void, threshold = 0.25) {
  let stop: (() => void) | null = null;
  if (!("IntersectionObserver" in window)) {
    start();
    return;
  }
  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !stop) stop = start();
        else if (!entry.isIntersecting && stop) {
          stop();
          stop = null;
        }
      }
    },
    { threshold },
  ).observe(el);
}

/** Types `lines` one after another into `el`, looping. */
function typewriter(el: HTMLElement, lines: string[], speed = 28, hold = 2600) {
  if (prefersReducedMotion) {
    el.textContent = lines[0];
    return () => {};
  }
  let line = 0;
  let i = 0;
  let timer = 0;
  const step = () => {
    const text = lines[line];
    i++;
    el.textContent = text.slice(0, i);
    if (i < text.length) {
      const ch = text[i - 1];
      timer = window.setTimeout(step, ch === "." || ch === "," ? speed * 6 : speed + Math.random() * 30);
    } else {
      timer = window.setTimeout(() => {
        line = (line + 1) % lines.length;
        i = 0;
        el.textContent = "";
        timer = window.setTimeout(step, 400);
      }, hold);
    }
  };
  timer = window.setTimeout(step, 500);
  return () => window.clearTimeout(timer);
}

/* ───────── Hero: 3D tilt that follows the pointer (desktop only) ───────── */

function initHeroTilt() {
  const stage = $(".mn-stage");
  const win = $("#mn-window");
  if (!stage || !win || !canHover || prefersReducedMotion) return;
  const hero = $(".mn-hero")!;
  let raf = 0;
  let tx = 0;
  let ty = 0;

  const onMove = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // -1 … 1 relative to the stage centre, clamped so far-away pointers only nudge
    const dx = Math.max(-1.4, Math.min(1.4, (e.clientX - cx) / (r.width / 2)));
    const dy = Math.max(-1.4, Math.min(1.4, (e.clientY - cy) / (r.height / 2)));
    tx = -12 + dx * 9; // rest at -12deg, swing ±9
    ty = 6 + dy * -7; // rest at 6deg
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const apply = () => {
    raf = 0;
    win.style.setProperty("--ry", `${tx.toFixed(2)}deg`);
    win.style.setProperty("--rx", `${ty.toFixed(2)}deg`);
  };
  hero.addEventListener("pointerenter", () => stage.classList.add("is-tracking"));
  hero.addEventListener("pointermove", onMove, { passive: true });
  hero.addEventListener("pointerleave", () => {
    stage.classList.remove("is-tracking");
    win.style.removeProperty("--ry");
    win.style.removeProperty("--rx");
  });
}

/* ───────── Hero window: optional items toggle, totals recalc, AI side panel ───────── */

function initHeroWindow() {
  const win = $("#mn-window");
  if (!win) return;
  const opts = $$<HTMLTableRowElement>("[data-opt]", win);
  const total = $("[data-total]", win);
  const ai = $("[data-hero-ai]", win);
  const base = 4800 + 14400;
  const prices = [6000, 1900];

  whileVisible(win, () => {
    win.classList.add("is-live");
    const stops: Array<() => void> = [];
    if (ai) stops.push(typewriter(ai, ["Northwind’s migration moves 12 workloads to AWS in 8 weeks with zero downtime.", "Suggesting a 10% bundle discount to lift the managed-support attach rate."], 24));

    if (total && opts.length && !prefersReducedMotion) {
      let current = base + prices[0];
      let cancel = () => {};
      const timer = window.setInterval(() => {
        const idx = Math.random() < 0.5 ? 0 : 1;
        const row = opts[idx];
        row.classList.toggle("is-on");
        const next = base + opts.reduce((sum, r, i) => sum + (r.classList.contains("is-on") ? prices[i] : 0), 0);
        cancel();
        cancel = tween(current, next, 700, (v) => (total.textContent = money(v)));
        current = next;
      }, 3200);
      stops.push(() => {
        window.clearInterval(timer);
        cancel();
      });
    }
    return () => {
      win.classList.remove("is-live");
      stops.forEach((s) => s());
    };
  }, 0.2);
}

/* ───────── Bento: spotlight borders + living visuals ───────── */

function initBento() {
  const bento = $("#mn-bento");
  if (!bento) return;
  const cards = $$(".mn-card", bento);

  if (canHover) {
    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    bento.addEventListener(
      "pointermove",
      (e) => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (!raf) raf = requestAnimationFrame(paint);
      },
      { passive: true },
    );
    const paint = () => {
      raf = 0;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${lastX - r.left}px`);
        card.style.setProperty("--my", `${lastY - r.top}px`);
      }
    };
    bento.addEventListener("pointerleave", () => {
      for (const card of cards) {
        card.style.removeProperty("--mx");
        card.style.removeProperty("--my");
      }
    });
  }

  for (const card of cards) {
    whileVisible(card, () => {
      card.classList.add("is-live");
      const stop = startCardLoop(card);
      return () => {
        card.classList.remove("is-live");
        stop();
      };
    });
  }
}

function startCardLoop(card: HTMLElement): () => void {
  switch (card.dataset.live) {
    case "pricing":
      return startPricing(card);
    case "ai": {
      const out = $("[data-ai-text]", card);
      return out
        ? typewriter(
            out,
            [
              "Northwind is ready to leave on-premise servers behind. This proposal moves your 12 core workloads to AWS in eight weeks, with zero downtime and a fixed price.",
              "You asked for a migration that doesn’t interrupt trading. Here is how we deliver it: phased cut-overs, nightly rollbacks and a dedicated engineer on call.",
            ],
            22,
            3200,
          )
        : () => {};
    }
    default:
      return () => {};
  }
}

function startPricing(card: HTMLElement) {
  const rows = $$("[data-cpq-opt]", card);
  const total = $("[data-cpq-total]", card);
  const disc = $("[data-cpq-disc]", card);
  if (!rows.length || !total || !disc || prefersReducedMotion) return () => {};
  const basePrice = 299;
  const optPrice = [180, 45, 120];
  const discount = 0.1;
  const calc = () => {
    const sub = basePrice + rows.reduce((s, r, i) => s + (r.classList.contains("is-on") ? optPrice[i] : 0), 0);
    return { sub, disc: sub * discount, total: sub * (1 - discount) };
  };
  let state = calc();
  let cancel = () => {};
  // Walk a deliberate sequence so it reads as someone configuring the quote.
  const sequence = [1, 2, 0, 1, 0, 2];
  let step = 0;
  const timer = window.setInterval(() => {
    const row = rows[sequence[step++ % sequence.length]];
    row.classList.toggle("is-on");
    row.querySelector(".mn-tick")?.classList.toggle("is-on");
    const next = calc();
    cancel();
    const from = state;
    cancel = tween(0, 1, 650, (t) => {
      total.textContent = money(from.total + (next.total - from.total) * t);
      disc.textContent = "−" + money(from.disc + (next.disc - from.disc) * t);
    });
    total.classList.remove("is-bump");
    void total.offsetWidth;
    total.classList.add("is-bump");
    state = next;
  }, 2600);
  return () => {
    window.clearInterval(timer);
    cancel();
  };
}

/* ───────── Sticky mobile CTA: after hero, hidden near the closing CTA ───────── */

function initStickyCta() {
  const bar = $("#mn-sticky");
  const hero = $("#hero");
  const close = $("#start");
  if (!bar || !hero || !close || !("IntersectionObserver" in window)) return;
  let heroGone = false;
  let closeNear = false;
  const update = () => {
    const show = heroGone && !closeNear;
    bar.classList.toggle("is-visible", show);
    bar.setAttribute("aria-hidden", String(!show));
    bar.querySelector("a")?.setAttribute("tabindex", show ? "0" : "-1");
  };
  new IntersectionObserver(
    ([e]) => {
      heroGone = !e.isIntersecting && e.boundingClientRect.bottom < 0;
      update();
    },
    { threshold: 0 },
  ).observe(hero);
  new IntersectionObserver(
    ([e]) => {
      closeNear = e.isIntersecting;
      update();
    },
    { threshold: 0, rootMargin: "0px 0px 120px 0px" },
  ).observe(close);
}

/* Sections with ambient loops (hero glow/grid, logo tiles, closing glow) only animate on screen */
function initPausable() {
  for (const el of $$("[data-pause]:not([data-live])")) {
    whileVisible(
      el,
      () => {
        el.classList.add("is-live");
        return () => el.classList.remove("is-live");
      },
      0.05,
    );
  }
}

initHeroTilt();
initHeroWindow();
initBento();
initPausable();
initStickyCta();
