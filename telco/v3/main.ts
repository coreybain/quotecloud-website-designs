import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Calls back whenever `target` enters/leaves the viewport (used to pause loops offscreen). */
function whileVisible(target: Element, onChange: (visible: boolean) => void, threshold = 0) {
  if (!("IntersectionObserver" in window)) return onChange(true);
  new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), { threshold }).observe(target);
}

/** Pauses SMIL pulses (and CSS loops via .is-paused) while an svg is offscreen. */
function pauseOffscreen(svg: SVGSVGElement | null, host?: Element) {
  if (!svg) return;
  if (prefersReducedMotion) {
    svg.pauseAnimations();
    return;
  }
  whileVisible(host ?? svg, (v) => {
    if (v) svg.unpauseAnimations();
    else svg.pauseAnimations();
    host?.classList.toggle("is-paused", !v);
  });
}

/** Tweens the number inside `el` from its current value to `to`. */
function tweenMoney(el: HTMLElement, to: number, suffix = "", duration = 650) {
  const from = Number((el.textContent ?? "0").replace(/[^\d.]/g, "")) || 0;
  if (prefersReducedMotion || from === to) {
    el.innerHTML = money(to) + suffix;
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    el.innerHTML = money(from + (to - from) * e) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ───────── Hero: map draws itself, proposal card cycles terms then signs ───────── */

const TERMS: Record<number, { mrc: number; idx: number }> = {
  12: { mrc: 6980, idx: 0 },
  24: { mrc: 6520, idx: 1 },
  36: { mrc: 6240, idx: 2 },
};

function initHero() {
  const map = $(".nm-hero [data-nm-map]");
  const quote = $("[data-nm-quote]");
  if (!map) return;

  requestAnimationFrame(() => requestAnimationFrame(() => map.classList.add("is-drawn")));
  pauseOffscreen($<SVGSVGElement>(".nm-map__svg", map), map);

  if (!quote) return;
  const status = $("[data-nm-status]", quote);
  const mrc = $("[data-nm-mrc]", quote);
  const thumb = $(".nm-quote__thumb", quote);
  const labels = $$(".nm-quote__term span", quote);
  if (!status || !mrc || !thumb) return;

  if (prefersReducedMotion) {
    quote.classList.add("is-signed");
    status.textContent = "Signed";
    status.classList.add("is-signed");
    return;
  }

  let visible = true;
  whileVisible(quote, (v) => (visible = v));

  const setTerm = (term: number) => {
    const { mrc: value, idx } = TERMS[term];
    thumb.style.setProperty("--t", String(idx));
    labels.forEach((l, i) => l.classList.toggle("is-on", i === idx));
    tweenMoney(mrc, value);
  };

  const loop = async () => {
    await wait(2200);
    for (;;) {
      while (!visible) await wait(400);
      quote.classList.remove("is-signed", "is-signing");
      status.textContent = "Sent";
      status.classList.remove("is-signed");
      setTerm(12);
      await wait(1300);
      setTerm(24);
      await wait(1300);
      setTerm(36);
      await wait(1400);
      quote.classList.add("is-signing");
      await wait(250);
      quote.classList.remove("is-signing");
      quote.classList.add("is-signed");
      status.textContent = "Viewed";
      await wait(1300);
      status.textContent = "Signed";
      status.classList.add("is-signed");
      await wait(4200);
    }
  };
  // Start from 12 so the first cycle reads as a choice being made.
  thumb.style.setProperty("--t", "0");
  labels.forEach((l, i) => l.classList.toggle("is-on", i === 0));
  mrc.textContent = money(TERMS[12].mrc);
  void loop();
}

/* ───────── Story: clone the map into the sticky stage, light it step by step ───────── */

function initStory() {
  const stage = $("[data-nm-stage]");
  const list = $("[data-nm-steps]");
  const heroMap = $(".nm-hero [data-nm-map]");
  if (!list) return;
  const steps = $$<HTMLLIElement>(".nm-step", list);
  const live = new Set<Element>();

  if (stage && heroMap) {
    const clone = heroMap.cloneNode(true) as HTMLElement;
    clone.classList.remove("is-drawn");
    stage.append(clone);
    const svg = $<SVGSVGElement>(".nm-map__svg", clone);
    pauseOffscreen(svg, stage);
    whileVisible(stage, (v) => v && clone.classList.add("is-drawn"), 0.2);
  }

  const makeLive = (step: HTMLElement) => {
    if (live.has(step)) return;
    live.add(step);
    step.classList.add("is-live");
    onLive[step.dataset.step ?? ""]?.(step);
  };

  const setActive = (step: HTMLElement) => {
    const n = Number(step.dataset.step);
    steps.forEach((s) => {
      const k = Number(s.dataset.step);
      s.classList.toggle("is-active", k === n);
      s.classList.toggle("is-past", k < n);
    });
    if (stage) stage.dataset.step = String(n);
    makeLive(step);
  };

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    steps.forEach(makeLive);
    steps[0] && setActive(steps[0]);
    document.documentElement.classList.add("no-anim");
    return;
  }

  // A step is "active" while it crosses the middle band of the viewport.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target as HTMLElement);
    },
    { rootMargin: "-46% 0px -46% 0px" },
  );
  steps.forEach((s) => io.observe(s));

  // Panels on small screens start as soon as they're readable, not only mid-viewport.
  const early = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        makeLive(e.target as HTMLElement);
        early.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -22% 0px", threshold: 0.2 },
  );
  if (window.matchMedia("(max-width: 1080px)").matches) steps.forEach((s) => early.observe(s));

  // Spine fill follows the viewport centre.
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = list.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.5 - r.top) / r.height));
    list.style.setProperty("--p", p.toFixed(4));
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  whileVisible(list, (v) => {
    if (v) {
      window.addEventListener("scroll", onScroll, { passive: true });
      update();
    } else window.removeEventListener("scroll", onScroll);
  });
}

/* per-step one-shot animations */
const onLive: Record<string, (step: HTMLElement) => void> = {
  "5": (step) => {
    const target = $("[data-nm-type]", step);
    if (!target || prefersReducedMotion) return;
    const text = target.dataset.nmType ?? "";
    target.textContent = "";
    let i = 0;
    const type = () => {
      i += 1;
      target.textContent = text.slice(0, i);
      if (i < text.length) window.setTimeout(type, 22 + Math.random() * 40);
    };
    window.setTimeout(type, 500);
  },
  "6": async (step) => {
    const items = $$("li", $(".nm-flow", step) ?? step);
    if (prefersReducedMotion) {
      items.forEach((li) => li.classList.add("is-done"));
      return;
    }
    for (const li of items.slice(1)) {
      await wait(750);
      li.classList.add("is-done");
    }
  },
};

/* ───────── Interactive: contract term switcher ───────── */

function initTerm() {
  const root = $("[data-nm-term]");
  if (!root) return;
  const buttons = $$<HTMLButtonElement>("button[data-term]", root);
  const thumb = $(".nm-term__thumb", root);
  const mrc = $("[data-term-mrc]", root);
  const tcv = $("[data-term-tcv]", root);
  const save = $("[data-term-save]", root);
  const ONCE = 14850;

  const set = (term: number) => {
    const { mrc: m, idx } = TERMS[term];
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.term) === term)));
    thumb?.style.setProperty("--t", String(idx));
    if (mrc) tweenMoney(mrc, m, "<small>/mo</small>");
    if (tcv) tweenMoney(tcv, m * term + ONCE);
    if (save) {
      const saving = (TERMS[12].mrc - m) * term;
      save.hidden = saving <= 0;
      if (saving > 0) save.textContent = `Saves ${money(saving)} against the 12-month price`;
    }
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => set(Number(b.dataset.term)));
    b.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = buttons[(i + dir + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  });
}

/* ───────── Interactive: optional upgrades update the total ───────── */

function initOptions() {
  const root = $("[data-nm-sign]");
  const total = $("[data-sign-total]", root ?? document);
  if (!root || !total) return;
  const boxes = $$<HTMLInputElement>("input[data-add]", root);
  const update = () => {
    const sum = 6240 + boxes.reduce((s, b) => s + (b.checked ? Number(b.dataset.add) : 0), 0);
    tweenMoney(total, sum, "<small>/mo</small>", 450);
  };
  boxes.forEach((b) => b.addEventListener("change", update));
}

/* ───────── Integrations + closing: pause loops offscreen ───────── */

function initLoops() {
  const patch = $("[data-nm-patch]");
  if (patch) whileVisible(patch, (v) => patch.classList.toggle("is-paused", !v));
  const close = $("[data-nm-close]");
  pauseOffscreen($<SVGSVGElement>(".nm-close__net", close ?? document), close ?? undefined);
}

/* ───────── Mobile sticky CTA: after the hero, hidden near the closing CTA/footer ───────── */

function initSticky() {
  const bar = $("[data-nm-sticky]");
  const hero = $(".nm-hero__ctas");
  const close = $("[data-nm-close]");
  const footer = $(".qc-footer");
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  const link = $("a", bar);
  let heroGone = false;
  let endVisible = false;
  const sync = () => {
    const show = heroGone && !endVisible;
    bar.classList.toggle("is-shown", show);
    link?.setAttribute("tabindex", show ? "0" : "-1");
    bar.setAttribute("aria-hidden", String(!show));
  };
  new IntersectionObserver(([e]) => {
    heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
    sync();
  }).observe(hero);
  const ends = [$(".nm-midcta"), close, footer].filter(Boolean) as Element[];
  const seen = new Map<Element, boolean>();
  const endIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target, e.isIntersecting));
    endVisible = [...seen.values()].some(Boolean);
    sync();
  });
  ends.forEach((el) => endIo.observe(el));
  sync();
}

initHero();
initStory();
initTerm();
initOptions();
initLoops();
initSticky();
