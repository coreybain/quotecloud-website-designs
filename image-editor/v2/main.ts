import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const nextFrame = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

/** Toggles `is-live` while `el` is on screen, so CSS loops only run when visible. */
function whileVisible(el: Element, onChange?: (visible: boolean) => void) {
  if (!("IntersectionObserver" in window)) {
    el.classList.add("is-live");
    onChange?.(true);
    return;
  }
  new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      el.classList.toggle("is-live", e.isIntersecting);
      onChange?.(e.isIntersecting);
    }),
  ).observe(el);
}

/* ───────── The composition: one photo, four layers ───────── */

const PHOTO = "/assets/image-editor/photo-sunset-ship-deck.jpg";
const photo = (cls: string) =>
  `<img class="cmp__img ${cls}" src="${PHOTO}" width="558" height="296" alt="" decoding="async" />`;

const COMP = `
<div class="cmp">
  <div class="cmp__lyr cmp__lyr--bg" style="--z: 0">
    <div class="cmp__body"><div class="cmp__photo">${photo("")}${photo("cmp__img--adj")}${photo("cmp__img--gray")}${photo("cmp__img--sepia")}${photo("cmp__img--noir")}<span class="cmp__tint cmp__tint--warm"></span><span class="cmp__tint cmp__tint--cool"></span></div></div>
    <span class="cmp__tag">Background</span>
  </div>
  <div class="cmp__lyr cmp__lyr--logo" style="--z: 1">
    <div class="cmp__body">
      <span class="cmp__logo"><span class="cmp__logo-box"></span><svg viewBox="0 0 116 40"><circle cx="19" cy="18" r="7.5" /><path d="M8 26.5c3.5-2.4 7.5-2.4 11 0s7.5 2.4 11 0" /><text x="36" y="24.5">MERIDIAN</text></svg></span>
      <span class="cmp__ring"></span>
      <span class="cmp__wand"><svg class="ie2-i"><use href="#ie2-wand" /></svg></span>
    </div>
    <span class="cmp__tag">Logo</span>
  </div>
  <div class="cmp__lyr cmp__lyr--text" style="--z: 2">
    <div class="cmp__body"><span class="cmp__text">Golden hour at sea</span></div>
    <span class="cmp__tag">Text</span>
  </div>
  <div class="cmp__lyr cmp__lyr--arrow" style="--z: 3">
    <div class="cmp__body"><svg class="cmp__arrow" viewBox="0 0 460 244"><path pathLength="1" d="M278 80 372 114" /><path pathLength="1" d="M362 102.6 372 114l-14.7 2.9" /></svg></div>
    <span class="cmp__tag">Arrow</span>
  </div>
  <div class="cmp__crop"><span class="cmp__dim cmp__dim--t"></span><span class="cmp__dim cmp__dim--b"></span><span class="cmp__frame"><i></i><i></i><i></i><i></i></span><span class="cmp__level"></span></div>
</div>`;

type Crop = "frame" | "tight" | "applied";
interface CompState {
  tilt?: boolean;
  crop: Crop;
  preset: string;
  adj?: boolean;
  logo?: boolean;
  text?: boolean;
  explode?: boolean;
  guide?: boolean;
}

const EDITED: CompState = { crop: "applied", preset: "warm", adj: true, logo: true, text: true };
const ORIGINAL: CompState = { tilt: true, crop: "applied", preset: "original" };

/** Composition state after each story step (-1 = untouched photo). */
const STEP_STATE: Record<number, CompState> = {
  [-1]: { tilt: true, crop: "frame", preset: "original" },
  0: { tilt: true, crop: "tight", preset: "original" },
  1: { crop: "tight", preset: "original", guide: true },
  2: { crop: "applied", preset: "warm", adj: true },
  3: { crop: "applied", preset: "warm", adj: true, logo: true },
  4: EDITED,
  5: { ...EDITED, explode: true },
  6: EDITED,
};

function setComp(cmp: HTMLElement, s: CompState) {
  cmp.dataset.crop = s.crop;
  cmp.dataset.preset = s.preset;
  cmp.toggleAttribute("data-tilt", !!s.tilt);
  cmp.toggleAttribute("data-adj", !!s.adj);
  cmp.toggleAttribute("data-logo", !!s.logo);
  cmp.toggleAttribute("data-text", !!s.text);
  cmp.toggleAttribute("data-explode", !!s.explode);
  cmp.toggleAttribute("data-guide", !!s.guide);
}

/** Replaces a slot's fallback <img> with the layered composition. */
function mountComp(slot: HTMLElement, state: CompState, still = false) {
  slot.innerHTML = COMP;
  const cmp = slot.firstElementChild as HTMLElement;
  cmp.classList.add("no-anim");
  cmp.toggleAttribute("data-still", still);
  setComp(cmp, state);
  nextFrame(() => cmp.classList.remove("no-anim"));
  return cmp;
}

/* ───────── Fit fixed-size artboards to their container ───────── */

const fitObserver =
  "ResizeObserver" in window
    ? new ResizeObserver((entries) =>
        entries.forEach((e) => {
          const el = e.target as HTMLElement;
          el.style.setProperty("--fit", String(el.clientWidth / Number(el.dataset.w || 460)));
        }),
      )
    : null;
const observeFit = (el: HTMLElement) => fitObserver?.observe(el);

/* ───────── Hero: filter presets cycle across the live photo ───────── */

function initHero() {
  const editor = $("[data-hero-editor]");
  const slot = editor && $("[data-comp]", editor);
  if (!editor || !slot) return;
  const cmp = mountComp(slot, EDITED, true);
  const tiles = $$("[data-presets] .preset", editor);
  if (prefersReducedMotion) return;

  const cycle = ["warm", "cool", "noir", "sepia", "grayscale", "original"];
  let i = 0;
  let timer = 0;
  const show = (preset: string) => {
    cmp.dataset.preset = preset;
    cmp.toggleAttribute("data-adj", preset === "warm");
    tiles.forEach((t) => t.classList.toggle("is-on", t.dataset.p === preset));
  };
  const tick = () => {
    i = (i + 1) % cycle.length;
    show(cycle[i]);
  };
  whileVisible(editor, (visible) => {
    window.clearInterval(timer);
    if (visible) timer = window.setInterval(tick, 2200);
  });
}

/* ───────── Story: pinned exploded-view stage on desktop, before/after cards elsewhere ───────── */

const STEPS = 7;

function stageAttrs(step: number) {
  return {
    bar: step <= 0 ? "crop" : step === 1 ? "rotate" : step === 3 ? "eraser" : step === 4 ? "text" : "none",
    tool: step <= 1 ? "crop" : step === 2 ? "select" : step === 3 ? "eraser" : step === 4 ? "text" : "none",
    tab: step === 2 ? "filters" : "layers",
    layers: step < 3 ? "1" : step === 3 ? "2" : "4",
  };
}

const CARD_NOTES = [
  "21:9 · Output 1260 × 540",
  "Rotation angle 2.5° → 0°",
  "Warm preset · Contrast +18",
  "Magic Eraser Tool · Tolerance 32",
  "Text · Arrow",
];

function buildCards(story: HTMLElement, stage: HTMLElement) {
  $$<HTMLElement>("[data-card]", story).forEach((card) => {
    const i = Number(card.dataset.card);
    if (i <= 4) {
      card.innerHTML = `<div class="fit fit--full" data-fit data-w="460"><div class="fit__in" data-comp></div></div><span class="ex-card__note"><span class="ex-card__tag"><span class="ex-card__b">Before</span><span class="ex-card__a">After</span></span>${CARD_NOTES[i]}</span>`;
      const fit = $(".fit", card)!;
      observeFit(fit);
      const cmp = mountComp($("[data-comp]", card)!, prefersReducedMotion ? STEP_STATE[i] : STEP_STATE[i - 1], true);
      if (prefersReducedMotion) {
        card.classList.add("is-after");
        return;
      }
      onceVisible(card, () => window.setTimeout(() => {
        card.classList.add("is-after");
        setComp(cmp, STEP_STATE[i]);
      }, 350), 0.6);
    } else if (i === 5) {
      const rows = $(".lrows", stage)?.cloneNode(true) as HTMLElement | undefined;
      if (rows) {
        rows.className = "ex-card__layers";
        card.append(rows);
      }
    } else {
      const page = $(".pg", stage)?.cloneNode(true) as HTMLElement | undefined;
      if (!page) return;
      card.innerHTML = `<div class="fit fit--page" data-fit data-w="320"><div class="fit__in"></div></div>`;
      const fit = $(".fit", card)!;
      $(".fit__in", card)!.append(page);
      const slot = $(".pg__slot", page)!;
      slot.innerHTML = `<span class="pg__comp" data-comp></span>`;
      mountComp($("[data-comp]", slot)!, EDITED, true);
      observeFit(fit);
    }
  });
}

function initStory() {
  const story = $("[data-story]");
  const track = story && $("[data-track]", story);
  const stage = story && $("[data-stage]", story);
  const stageWrap = story && $("[data-stage-wrap]", story);
  const compSlot = stage && $("[data-comp]", stage);
  if (!story || !track || !stage || !stageWrap || !compSlot) return;

  const cmp = mountComp(compSlot, STEP_STATE[-1]);
  const steps = $$(".ex-step", story);
  const ticks = $$<HTMLButtonElement>(".ex-tick", story);
  buildCards(story, stage);

  const pinMQ = window.matchMedia("(min-width: 901px) and (min-height: 620px)");
  const canPin = () => pinMQ.matches && !prefersReducedMotion;
  let current = -2;

  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    const a = stageAttrs(i);
    stage.dataset.step = String(i);
    stage.dataset.bar = a.bar;
    stage.dataset.tool = a.tool;
    stage.dataset.tab = a.tab;
    stage.dataset.layers = a.layers;
    setComp(cmp, STEP_STATE[i]);
    steps.forEach((s, k) => s.classList.toggle("is-active", k === Math.max(0, i)));
    ticks.forEach((t, k) => {
      t.classList.toggle("is-done", k <= i);
      if (k === i) t.setAttribute("aria-current", "step");
      else t.removeAttribute("aria-current");
    });
  };

  const header = () => $(".qc-header")?.getBoundingClientRect().height ?? 64;
  const span = () => track.offsetHeight - stageWrap.closest<HTMLElement>(".ex__pin")!.offsetHeight;
  const trackTop = () => track.getBoundingClientRect().top + window.scrollY;
  const supportsTimeline = CSS.supports("animation-timeline: view()");

  const fitStage = () => {
    const pin = stageWrap.closest<HTMLElement>(".ex__pin")!;
    const w = stageWrap.clientWidth || 760;
    const h = pin.clientHeight - 56;
    stageWrap.style.setProperty("--fit", String(clamp(Math.min(w / 760, h / 520), 0.4, 1)));
  };

  let raf = 0;
  const measure = () => {
    raf = 0;
    const raw = (window.scrollY + header() - trackTop()) / Math.max(1, span());
    const p = clamp(raw, 0, 1);
    if (!supportsTimeline) story.style.setProperty("--p", p.toFixed(4));
    activate(raw < -0.02 ? -1 : Math.min(STEPS - 1, Math.floor(p * STEPS * 0.999 + 0.0001)));
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };

  let near = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting);
        if (near && story.classList.contains("is-pinned")) onScroll();
      },
      { rootMargin: "200px 0px" },
    ).observe(track);
  } else near = true;

  window.addEventListener("scroll", () => near && story.classList.contains("is-pinned") && onScroll(), { passive: true });
  window.addEventListener(
    "resize",
    () => {
      if (!story.classList.contains("is-pinned")) return;
      fitStage();
      onScroll();
    },
    { passive: true },
  );

  ticks.forEach((t) =>
    t.addEventListener("click", () => {
      if (!story.classList.contains("is-pinned")) return;
      const i = Number(t.dataset.goto);
      const top = trackTop() - header() + ((i + 0.5) / STEPS) * span();
      window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }),
  );

  const applyLayout = () => {
    const pin = canPin();
    story.classList.toggle("is-pinned", pin);
    story.classList.toggle("is-cards", !pin);
    if (pin) {
      fitStage();
      current = -2;
      measure();
    }
  };
  applyLayout();
  pinMQ.addEventListener("change", applyLayout);
}

/* ───────── Where it opens: the "Open Editor" chip moves from tile to tile ───────── */

function initWhere() {
  const list = $("[data-where]");
  if (!list || prefersReducedMotion) return;
  const tiles = $$(".wt", list);
  let i = -1;
  let timer = 0;
  const tick = () => {
    i = (i + 1) % tiles.length;
    tiles.forEach((t, k) => t.classList.toggle("is-active", k === i));
  };
  whileVisible(list, (visible) => {
    window.clearInterval(timer);
    if (visible) {
      if (i < 0) tick();
      timer = window.setInterval(tick, 1800);
    }
  });
}

/* ───────── Bento loops ───────── */

function initBento() {
  $$("[data-loop]").forEach((tile) => {
    if (prefersReducedMotion) {
      tile.classList.add("is-static");
      if (tile.dataset.loop === "sel") tile.dataset.s = "2";
      return;
    }
    if (tile.dataset.loop === "sel") {
      let s = 0;
      let timer = 0;
      tile.dataset.s = "0";
      whileVisible(tile, (visible) => {
        window.clearInterval(timer);
        if (visible)
          timer = window.setInterval(() => {
            s = (s + 1) % 4;
            tile.dataset.s = String(s);
          }, 2400);
      });
    } else whileVisible(tile);
  });
}

/* ───────── Original compare ───────── */

function initOriginal() {
  const card = $("[data-orig]");
  const btn = card && $<HTMLButtonElement>("[data-orig-btn]", card);
  const slot = card && $("[data-comp]", card);
  if (!card || !btn || !slot) return;
  const cmp = mountComp(slot, EDITED, true);
  let touched = false;
  const set = (original: boolean) => {
    btn.setAttribute("aria-pressed", String(original));
    card.classList.toggle("is-original", original);
    setComp(cmp, original ? ORIGINAL : EDITED);
  };
  btn.addEventListener("click", () => {
    touched = true;
    set(btn.getAttribute("aria-pressed") !== "true");
  });
  if (prefersReducedMotion) return;
  onceVisible(card, () => {
    window.setTimeout(() => !touched && set(true), 900);
    window.setTimeout(() => !touched && set(false), 2900);
  }, 0.6);
}

/* ───────── Static final compositions (closing CTA) ───────── */

function initStatics() {
  $$<HTMLElement>("[data-comp][data-state='final']").forEach((slot) => {
    if (slot.closest("[data-hero-editor], [data-orig]")) return;
    mountComp(slot, EDITED, true);
  });
  $$<HTMLElement>("[data-fit]").forEach(observeFit);
}

initHero();
initStory();
initOriginal();
initStatics();
initWhere();
initBento();
