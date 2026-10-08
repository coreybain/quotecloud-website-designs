import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

/* ─────────────────────────────────────────────────────────────
   Hero · "Many tools → One document"
   Six fragments (slide, word page, diagram, spreadsheet, email thread,
   eSign envelope) scatter around a stage, then fly to their slot inside a
   single QuoteCloud document and cross-fade into the block they become.
   Progress p ∈ [0,1] is driven by an auto timeline after load AND by the
   first ~45vh of scroll (whichever is further ahead).
   ───────────────────────────────────────────────────────────── */

type Slot = { x: number; y: number; w: number; h: number };
type Scatter = { cx: number; cy: number; r: number; s: number };
type FragSpec = { slot: Slot; wide: Scatter; narrow: Scatter; start: number };

const DOC = { w: 380, h: 512 };
const CANVAS = { wide: { w: 1200, h: 584, docY: 16 }, narrow: { w: 400, h: 640, docY: 40 } };

// slot = position inside the final document; wide/narrow = scattered state (centre, rotation, scale)
const SPECS: Record<string, FragSpec> = {
  slide: { slot: { x: 20, y: 44, w: 340, h: 120 }, wide: { cx: 205, cy: 100, r: -6, s: 1.12 }, narrow: { cx: 200, cy: 86, r: -3, s: 0.92 }, start: 0.0 },
  text: { slot: { x: 20, y: 180, w: 200, h: 110 }, wide: { cx: 150, cy: 312, r: 5, s: 1.18 }, narrow: { cx: 112, cy: 214, r: 4, s: 0.92 }, start: 0.1 },
  diagram: { slot: { x: 236, y: 180, w: 124, h: 110 }, wide: { cx: 990, cy: 108, r: 7, s: 1.22 }, narrow: { cx: 300, cy: 214, r: -5, s: 0.92 }, start: 0.06 },
  sheet: { slot: { x: 20, y: 306, w: 340, h: 112 }, wide: { cx: 992, cy: 300, r: -4, s: 1.1 }, narrow: { cx: 200, cy: 345, r: 2, s: 0.92 }, start: 0.16 },
  mail: { slot: { x: 20, y: 434, w: 162, h: 60 }, wide: { cx: 250, cy: 478, r: -5, s: 1.25 }, narrow: { cx: 112, cy: 480, r: -4, s: 0.92 }, start: 0.22 },
  sign: { slot: { x: 198, y: 434, w: 162, h: 60 }, wide: { cx: 950, cy: 478, r: 6, s: 1.25 }, narrow: { cx: 290, cy: 492, r: 5, s: 0.92 }, start: 0.28 },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);

function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const stage = hero?.querySelector<HTMLElement>("[data-stage]");
  const canvas = stage?.querySelector<HTMLElement>("[data-canvas]");
  const doc = canvas?.querySelector<HTMLElement>("[data-doc]");
  const replay = stage?.querySelector<HTMLButtonElement>("[data-replay]");
  if (!hero || !stage || !canvas || !doc) return;

  const frags = [...canvas.querySelectorAll<HTMLElement>("[data-frag]")]
    .map((el) => ({ el, spec: SPECS[el.dataset.frag ?? ""], old: el.querySelector<HTMLElement>(".frag__old")!, nu: el.querySelector<HTMLElement>(".frag__new")! }))
    .filter((f) => f.spec);

  let layout: "wide" | "narrow" = "wide";
  let docOrigin = { x: 0, y: 0 };

  const applyLayout = () => {
    const stageW = stage.clientWidth;
    layout = stageW < 900 ? "narrow" : "wide";
    const cv = CANVAS[layout];
    docOrigin = { x: Math.round((cv.w - DOC.w) / 2), y: cv.docY };

    // Fit the canvas into the stage width and, on wide screens, (roughly) the remaining viewport height,
    // allowing the bottom edge of the document to sit just under the fold on short viewports.
    let scale = stageW / cv.w;
    if (layout === "wide") {
      const stageTop = stage.getBoundingClientRect().top + window.scrollY;
      const availH = window.innerHeight - stageTop + 20;
      scale = Math.max(0.72, Math.min(scale, availH / cv.h));
    }
    scale = Math.min(scale, 1);
    canvas.style.width = `${cv.w}px`;
    canvas.style.height = `${cv.h}px`;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.marginLeft = `${Math.round((stageW - cv.w * scale) / 2)}px`;
    stage.style.height = `${Math.round(cv.h * scale)}px`;

    doc.style.left = `${docOrigin.x}px`;
    doc.style.top = `${docOrigin.y}px`;
    doc.style.width = `${DOC.w}px`;
    doc.style.height = `${DOC.h}px`;
    for (const f of frags) {
      const { slot } = f.spec;
      f.el.style.left = `${docOrigin.x + slot.x}px`;
      f.el.style.top = `${docOrigin.y + slot.y}px`;
      f.el.style.width = `${slot.w}px`;
      f.el.style.height = `${slot.h}px`;
    }
  };

  let p = 0;
  let done = false;

  const render = (progress: number) => {
    p = clamp01(progress);
    for (const f of frags) {
      const { slot, start } = f.spec;
      const sc = f.spec[layout];
      const local = easeInOut(clamp01((p - start) / (1 - start)));
      const finalCx = docOrigin.x + slot.x + slot.w / 2;
      const finalCy = docOrigin.y + slot.y + slot.h / 2;
      const tx = (sc.cx - finalCx) * (1 - local);
      const ty = (sc.cy - finalCy) * (1 - local);
      const rot = sc.r * (1 - local);
      const s = sc.s + (1 - sc.s) * local;
      f.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(4)})`;
      const fade = smooth(clamp01((local - 0.62) / 0.3));
      f.old.style.opacity = String(1 - fade);
      f.nu.style.opacity = String(fade);
    }
    const dv = smooth(clamp01((p - 0.5) / 0.35));
    doc.style.opacity = String(dv);
    doc.style.transform = `scale(${(0.965 + 0.035 * dv).toFixed(4)})`;
    canvas.style.setProperty("--amp", (1 - p).toFixed(3));
    stage.classList.toggle("is-one", p > 0.82);
    if (p >= 1 && !done) {
      done = true;
      stage.classList.add("is-done");
      if (replay) replay.hidden = false;
    }
  };

  applyLayout();
  new ResizeObserver(() => {
    applyLayout();
    render(p);
  }).observe(stage);

  if (prefersReducedMotion) {
    stage.classList.add("is-ready");
    render(1);
    return;
  }

  // Auto timeline + scroll scrubbing.
  let autoStart = 0;
  let raf = 0;
  let ignoreScroll = false;
  const HOLD = 1500; // ms the scattered state is held before converging
  const DURATION = 2300;

  const scrollP = () => (ignoreScroll ? 0 : clamp01(window.scrollY / (window.innerHeight * 0.45)));

  const tick = (now: number) => {
    const auto = clamp01((now - autoStart - HOLD) / DURATION);
    const next = Math.max(auto, scrollP());
    render(next);
    if (next < 1) raf = requestAnimationFrame(tick);
    else raf = 0;
  };

  const play = () => {
    cancelAnimationFrame(raf);
    done = false;
    stage.classList.remove("is-done");
    if (replay) replay.hidden = true;
    autoStart = performance.now();
    render(scrollP());
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (done || raf) return;
      raf = requestAnimationFrame(tick);
    },
    { passive: true },
  );

  replay?.addEventListener("click", () => {
    ignoreScroll = true;
    stage.classList.remove("is-ready");
    render(0);
    requestAnimationFrame(() => {
      stage.classList.add("is-ready");
      window.setTimeout(() => {
        ignoreScroll = false;
      }, HOLD + DURATION + 200);
      play();
    });
  });

  // Let fonts/paint settle, then fade fragments in and start.
  render(0);
  window.setTimeout(() => {
    stage.classList.add("is-ready");
    play();
  }, 350);
}

/* ───────── Bento tiles: run their CSS loops only while on screen ───────── */

function initTiles() {
  const tiles = document.querySelectorAll<HTMLElement>("[data-tile]");
  if (!tiles.length) return;
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    tiles.forEach((t) => t.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { threshold: 0.25 },
  );
  tiles.forEach((t) => io.observe(t));
}

/* ───────── Before / after comparison slider ───────── */

function initCompare() {
  const cmp = document.querySelector<HTMLElement>("[data-cmp]");
  const range = cmp?.querySelector<HTMLInputElement>("[data-cmp-range]");
  if (!cmp || !range) return;

  const set = (v: number) => cmp.style.setProperty("--split", `${v}%`);
  set(Number(range.value));
  range.addEventListener("input", () => set(Number(range.value)));
  range.addEventListener("pointerdown", () => cmp.classList.add("is-dragging"));
  window.addEventListener("pointerup", () => cmp.classList.remove("is-dragging"));

  // A one-off nudge the first time it scrolls into view so the divider reads as draggable.
  if (prefersReducedMotion) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const nudge = (now: number) => {
        const t = Math.min(1, (now - start) / 1600);
        const v = 50 + Math.sin(t * Math.PI * 2) * 14 * (1 - t);
        range.value = String(Math.round(v));
        set(v);
        if (t < 1 && !cmp.classList.contains("is-dragging")) requestAnimationFrame(nudge);
      };
      window.setTimeout(() => requestAnimationFrame(nudge), 500);
    },
    { threshold: 0.6 },
  );
  io.observe(cmp);
}

/* ───────── Marquee: duplicate the track once; pause when off screen ───────── */

function initMarquee() {
  const marquee = document.querySelector<HTMLElement>("[data-marquee]");
  const track = marquee?.querySelector<HTMLUListElement>(".marquee__track");
  if (!marquee || !track) return;
  if (prefersReducedMotion) {
    marquee.classList.add("is-static");
    return;
  }
  const clone = track.cloneNode(true) as HTMLUListElement;
  clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll("img").forEach((img) => img.setAttribute("alt", ""));
  marquee.append(clone);
  marquee.classList.add("is-animated");
  const io = new IntersectionObserver((entries) => entries.forEach((e) => marquee.classList.toggle("is-live", e.isIntersecting)));
  io.observe(marquee);
}

/* ───────── Slim sticky CTA on mobile (after hero, hidden near closing CTA/footer) ───────── */

function initStickyCta() {
  const bar = document.querySelector<HTMLElement>("[data-sticky]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const close = document.querySelector<HTMLElement>("[data-close]");
  const footer = document.querySelector<HTMLElement>(".qc-footer");
  if (!bar || !hero || !close) return;
  const mq = window.matchMedia("(max-width: 767px)");
  const visible = new Map<Element, boolean>([[hero, true]]);
  const update = () => {
    const show = mq.matches && ![...visible.values()].some(Boolean);
    bar.hidden = !show;
    document.body.classList.toggle("has-sticky-cta", show);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target, e.isIntersecting);
    update();
  });
  io.observe(hero);
  io.observe(close);
  if (footer) io.observe(footer);
  mq.addEventListener("change", update);
}

initHero();
initTiles();
initCompare();
initMarquee();
initStickyCta();
