import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const STEPS = 6;
const GRID_FROM = 4;

/** Toggles `is-paused` while `el` is off screen so CSS loops stop. */
function pauseOffscreen(el: Element, onChange?: (visible: boolean) => void) {
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      el.classList.toggle("is-paused", !e.isIntersecting);
      onChange?.(e.isIntersecting);
    }),
  ).observe(el);
}

/* ───────── The document: one template, stamped everywhere ───────── */

/** Deterministic QR-style module pattern (sample UI, not a real code). */
function qrPath() {
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const finder = (x: number, y: number) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  let d = finder(0, 0) + finder(14, 0) + finder(0, 14);
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (!inFinder && rand() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

const tpl = $<HTMLTemplateElement>("#c2-doc-tpl");
if (tpl) $("[data-qr]", tpl.content)?.setAttribute("d", qrPath());

function setStep(doc: HTMLElement, step: number) {
  doc.dataset.step = String(step);
  doc.dataset.mode = step >= GRID_FROM ? "grid" : "canvas";
}

function stamp(slot: HTMLElement) {
  if (!tpl) return null;
  const doc = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  doc.setAttribute("aria-hidden", "true");
  doc.dataset.ui = slot.dataset.ui ?? "none";
  setStep(doc, Number(slot.dataset.step ?? 3));
  slot.append(doc);
  return doc;
}

const docs = new Map<HTMLElement, HTMLElement>();
$$("[data-doc-slot]").forEach((slot) => {
  const doc = stamp(slot);
  if (doc) docs.set(slot, doc);
});

/* ───────── Hero: drag the seam between Canvas and Grid ───────── */

function initCompare() {
  const root = $("[data-compare]");
  const stage = root && $(".c2-compare__stage", root);
  const knob = root && $<HTMLButtonElement>(".c2-seam__knob", root);
  if (!root || !stage || !knob) return;

  if (!prefersReducedMotion) stage.classList.add("is-auto");
  pauseOffscreen(stage);

  const describe = (v: number) =>
    v > 85 ? "Mostly Canvas Mode" : v < 15 ? "Mostly Grid Mode" : v > 55 ? "More Canvas" : v < 45 ? "More Grid" : "Half Canvas, half Grid";

  const set = (v: number) => {
    const value = clamp(v, 0, 100);
    stage.classList.remove("is-auto");
    stage.style.setProperty("--seam", `${value}%`);
    knob.setAttribute("aria-valuenow", String(Math.round(value)));
    knob.setAttribute("aria-valuetext", describe(value));
  };
  const current = () => {
    const raw = getComputedStyle(stage).getPropertyValue("--seam").trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 50;
  };
  const fromPointer = (clientX: number) => {
    const r = stage.getBoundingClientRect();
    set(((clientX - r.left) / r.width) * 100);
  };

  knob.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    stage.classList.add("is-dragging");
    fromPointer(e.clientX);
  });
  knob.addEventListener("pointermove", (e) => {
    if (knob.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
  });
  const end = (e: PointerEvent) => {
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
    stage.classList.remove("is-dragging");
  };
  knob.addEventListener("pointerup", end);
  knob.addEventListener("pointercancel", end);
  knob.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 20 : 5;
    const map: Record<string, number> = {
      ArrowLeft: current() - step,
      ArrowDown: current() - step,
      ArrowRight: current() + step,
      ArrowUp: current() + step,
      Home: 0,
      End: 100,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    set(map[e.key]);
  });
}

/* ───────── Story: pinned scroll on desktop, swipeable step cards elsewhere ───────── */

function initStory() {
  const story = $("[data-story]");
  const track = story && $("[data-track]", story);
  const stage = story && $("[data-stage]", story);
  const stageSlot = story && $("[data-stage-doc]", story);
  if (!story || !track || !stage || !stageSlot) return;
  const stageDoc = docs.get(stageSlot);
  const captions = $$(".c2-step", story);
  const ticks = $$<HTMLButtonElement>(".c2-tick", story);
  const toggles = $$<HTMLButtonElement>(".c2-toggle__btn", story);

  const pinMQ = window.matchMedia("(min-width: 901px) and (min-height: 600px)");
  const canPin = () => pinMQ.matches && !prefersReducedMotion;
  let current = -1;

  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    stage.dataset.step = String(i);
    stage.dataset.mode = i >= GRID_FROM ? "grid" : "canvas";
    if (stageDoc) setStep(stageDoc, i);
    captions.forEach((c, k) => c.classList.toggle("is-active", k === i));
    ticks.forEach((t, k) => {
      t.classList.toggle("is-done", k <= i);
      if (k === i) t.setAttribute("aria-current", "step");
      else t.removeAttribute("aria-current");
    });
    toggles.forEach((t, k) => t.setAttribute("aria-pressed", String(k === 0 ? i < GRID_FROM : i >= GRID_FROM)));
  };

  /* progress: 0 → 1 across the pinned stretch of the track */
  const header = () => $(".qc-header")?.getBoundingClientRect().height ?? 64;
  const span = () => track.offsetHeight - stage.offsetHeight;
  const trackTop = () => track.getBoundingClientRect().top + window.scrollY;
  const supportsTimeline = CSS.supports("animation-timeline: view()");

  let raf = 0;
  const measure = () => {
    raf = 0;
    const p = clamp((window.scrollY + header() - trackTop()) / Math.max(1, span()), 0, 1);
    if (!supportsTimeline) stage.style.setProperty("--p", p.toFixed(4));
    activate(Math.min(STEPS - 1, Math.floor(p * STEPS * 0.999 + 0.0001)));
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };

  let near = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      near = entries.some((e) => e.isIntersecting);
      if (near && story.classList.contains("is-pinned")) onScroll();
    }, { rootMargin: "200px 0px" }).observe(track);
  } else near = true;

  window.addEventListener("scroll", () => near && story.classList.contains("is-pinned") && onScroll(), { passive: true });
  window.addEventListener("resize", () => story.classList.contains("is-pinned") && onScroll(), { passive: true });

  const goto = (i: number) => {
    if (!story.classList.contains("is-pinned")) return;
    const top = trackTop() - header() + ((i + 0.5) / STEPS) * span();
    window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };
  ticks.forEach((t) => t.addEventListener("click", () => goto(Number(t.dataset.goto))));
  toggles.forEach((t) => t.addEventListener("click", () => goto(Number(t.dataset.goto))));

  const applyLayout = () => {
    const pin = canPin();
    story.classList.toggle("is-pinned", pin);
    story.classList.toggle("is-cards", !pin);
    if (pin) {
      current = -1;
      measure();
    }
  };
  applyLayout();
  pinMQ.addEventListener("change", applyLayout);

  /* cards: each card's page plays from the previous step into its own step when it scrolls into view */
  if (!prefersReducedMotion) {
    $$<HTMLElement>("[data-card]", story).forEach((slot) => {
      const doc = docs.get(slot);
      const step = Number(slot.dataset.step);
      if (!doc || step === 0) return;
      setStep(doc, step - 1);
      onceVisible(slot, () => {
        requestAnimationFrame(() => requestAnimationFrame(() => setStep(doc, step)));
      }, 0.55);
    });
  }
}

/* ───────── Act 3: the pair splits apart ───────── */

function initPair() {
  const pair = $("[data-pair]");
  if (!pair) return;
  if (prefersReducedMotion) {
    pair.classList.add("is-split");
    return;
  }
  pair.classList.add("is-armed");
  onceVisible(pair, () => pair.classList.add("is-split"), 0.35);
}

/* ───────── Use-case lanes: seamless marquees, paused off screen ───────── */

function initMarquees() {
  $$("[data-marquee]").forEach((marquee) => {
    const track = $(".c2-marquee__track", marquee);
    if (!track) return;
    if (prefersReducedMotion) {
      marquee.classList.add("is-static");
      return;
    }
    [...track.children].forEach((item) => {
      const copy = item.cloneNode(true) as HTMLElement;
      copy.setAttribute("aria-hidden", "true");
      track.append(copy);
    });
    marquee.classList.add("is-running");
    pauseOffscreen(marquee);
  });
}

/* ───────── Closing panel toggle loop ───────── */

function initClose() {
  const panel = $(".c2-close__panel");
  if (panel) pauseOffscreen(panel);
}

initCompare();
initStory();
initPair();
initMarquees();
initClose();
