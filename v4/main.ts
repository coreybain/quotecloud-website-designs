import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Tweens a number into an element's text (rAF, eased out). Returns a cancel fn. */
function tweenText(el: HTMLElement, from: number, to: number, ms: number, format = money) {
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * e);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/* ───────── Hero deal card: status + value cycle while visible ───────── */

function initHeroDeal() {
  const card = $("[data-deal]");
  if (!card) return;
  const chip = $("[data-deal-chip]", card)!;
  const value = $("[data-deal-value]", card)!;
  const note = $("[data-deal-note]", card)!;
  const steps = [...card.querySelectorAll<HTMLElement>(".deal__steps li")];

  const phases = [
    { state: "draft", label: "Draft", value: 0, note: "Mia is writing the introduction", step: 0 },
    { state: "price", label: "Priced", value: 48500, note: "Acme can choose optional items", step: 0 },
    { state: "sent", label: "Sent", value: 48500, note: "One link, no PDF attached", step: 1 },
    { state: "viewed", label: "Viewed", value: 48500, note: "Opened 3 times · 4 min reading", step: 2 },
    { state: "signed", label: "Signed", value: 48500, note: "Dana Reyes signed · audit trail saved", step: 3 },
    { state: "paid", label: "Paid", value: 48500, note: "Deposit received via Stripe", step: 4 },
  ];

  let current = 0;
  let shown = 0;
  let timer = 0;
  let cancelTween = () => {};

  const apply = (i: number, animate: boolean) => {
    const ph = phases[i]!;
    chip.dataset.state = ph.state;
    chip.textContent = ph.label;
    card.dataset.phase = ph.state;
    steps.forEach((li, n) => li.classList.toggle("is-done", n <= ph.step));
    cancelTween();
    if (animate && ph.value !== shown) cancelTween = tweenText(value, shown, ph.value, 900);
    else value.textContent = money(ph.value);
    shown = ph.value;
    if (animate) {
      note.classList.add("is-swapping");
      window.setTimeout(() => {
        note.textContent = ph.note;
        note.classList.remove("is-swapping");
      }, 300);
    } else note.textContent = ph.note;
  };

  if (prefersReducedMotion) {
    apply(phases.length - 1, false);
    return;
  }
  apply(0, false);

  const next = () => {
    current = (current + 1) % phases.length;
    apply(current, current !== 0);
    timer = window.setTimeout(next, current === phases.length - 1 ? 3600 : current === 0 ? 1800 : 2400);
  };
  const start = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(next, 1600);
  };
  const stop = () => window.clearTimeout(timer);

  const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()), { threshold: 0.4 });
  io.observe(card);
}

/* ───────── Deal Journey: pinned horizontal track with carousel fallback ───────── */

function initJourney() {
  const section = $("[data-journey]");
  if (!section) return;
  const track = $("[data-j-track]", section)!;
  const stages = [...section.querySelectorAll<HTMLElement>(".stage")];
  const n = stages.length;
  const chip = $("[data-j-chip]", section)!;
  const valueEl = $("[data-j-value]", section)!;
  const timeEl = $("[data-j-time]", section)!;
  const indexEl = $("[data-j-index]", section);
  const prevBtn = $<HTMLButtonElement>("[data-j-prev]", section);
  const nextBtn = $<HTMLButtonElement>("[data-j-next]", section);
  const cpqTotal = $("[data-cpq-total]", section);

  const states = [
    { state: "draft", label: "Draft", day: 1 },
    { state: "design", label: "Designing", day: 1 },
    { state: "price", label: "Priced", day: 1 },
    { state: "collab", label: "In review", day: 2 },
    { state: "approve", label: "Approved", day: 2 },
    { state: "send", label: "Sent", day: 3 },
    { state: "sign", label: "Signed", day: 4 },
    { state: "paid", label: "Paid", day: 5 },
  ];
  const DEAL_VALUE = 48500;

  // Carousel on touch devices, narrow screens, reduced motion (or when CSS/JS can't pin).
  const carouselQuery = window.matchMedia(
    "(hover: none) and (pointer: coarse), (max-width: 980px), (prefers-reduced-motion: reduce)",
  );
  const cssTimeline = CSS.supports("animation-timeline: scroll()");
  let mode: "pin" | "carousel" = "pin";
  let p = 0;
  let active = -1;
  let raf = 0;
  let cancelCpq = () => {};

  const setP = (next: number) => {
    p = clamp01(next);
    // In pin mode with native scroll-driven animations the transform comes from CSS; --p still drives the meter + bar.
    section.style.setProperty("--p", p.toFixed(4));
    section.classList.toggle("is-started", p > 0.02);
    updateMeter();
    setActive(Math.round(p * (n - 1)));
  };

  const updateMeter = () => {
    const f = p * (n - 1); // 0 … n-1, fractional stage position
    const valueT = clamp01((f - 1.4) / 0.9); // value appears while the Price stage centres
    const v = DEAL_VALUE * (1 - Math.pow(1 - valueT, 3));
    valueEl.textContent = money(v);
    const i = Math.round(f);
    const lo = states[Math.floor(f)]!;
    const hi = states[Math.min(n - 1, Math.ceil(f))]!;
    const day = Math.round(lo.day + (hi.day - lo.day) * (f - Math.floor(f)));
    timeEl.textContent = `Day ${day}`;
    const s = states[i]!;
    if (chip.dataset.state !== s.state) {
      chip.dataset.state = s.state;
      chip.textContent = s.label;
    }
  };

  const playCpq = () => {
    if (!cpqTotal) return;
    cancelCpq();
    if (prefersReducedMotion) {
      cpqTotal.textContent = money(DEAL_VALUE);
      return;
    }
    cpqTotal.textContent = money(41300);
    const t1 = window.setTimeout(() => (cancelCpq = tweenText(cpqTotal, 41300, 45500, 500)), 1000);
    const t2 = window.setTimeout(() => (cancelCpq = tweenText(cpqTotal, 45500, DEAL_VALUE, 600)), 2300);
    cancelCpq = () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  };

  const setActive = (i: number) => {
    if (i === active) return;
    active = i;
    stages.forEach((st, k) => {
      st.classList.toggle("is-active", k === i || prefersReducedMotion);
      st.classList.toggle("is-passed", k < i);
    });
    const priceIndex = stages.findIndex((st) => st.dataset.stage === "price");
    if (i === priceIndex) playCpq();
    else if (cpqTotal) {
      cancelCpq();
      cpqTotal.textContent = money(i > priceIndex ? DEAL_VALUE : 41300);
    }
    if (indexEl) indexEl.textContent = String(i + 1);
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === n - 1;
  };

  /* pin mode: progress from the section's position in the window */
  const pinProgress = () => {
    const rect = section.getBoundingClientRect();
    const range = section.offsetHeight - window.innerHeight;
    return range > 0 ? -rect.top / range : 0;
  };
  const onWindowScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (mode === "pin") setP(pinProgress());
    });
  };

  /* carousel mode: progress from the track's horizontal scroll */
  const carouselProgress = () => {
    const range = track.scrollWidth - track.clientWidth;
    return range > 0 ? track.scrollLeft / range : 0;
  };
  const onTrackScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (mode === "carousel") setP(carouselProgress());
    });
  };

  const scrollToStage = (i: number) => {
    const target = stages[Math.min(n - 1, Math.max(0, i))]!;
    if (mode === "carousel") {
      const left = target.offsetLeft + target.offsetWidth / 2 - track.clientWidth / 2;
      track.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
    } else {
      const top = section.getBoundingClientRect().top + window.scrollY;
      const range = section.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + (i / (n - 1)) * range, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  };

  const applyMode = () => {
    mode = carouselQuery.matches ? "carousel" : "pin";
    section.dataset.mode = mode;
    section.dataset.timeline = mode === "pin" && cssTimeline ? "css" : "js";
    active = -1;
    if (mode === "carousel") {
      // land on the stage we were on, keep the pin offset sane
      requestAnimationFrame(() => setP(carouselProgress()));
    } else {
      track.scrollLeft = 0;
      setP(pinProgress());
    }
  };

  window.addEventListener("scroll", onWindowScroll, { passive: true });
  track.addEventListener("scroll", onTrackScroll, { passive: true });
  window.addEventListener("resize", onWindowScroll, { passive: true });
  carouselQuery.addEventListener("change", applyMode);

  prevBtn?.addEventListener("click", () => scrollToStage(active - 1));
  nextBtn?.addEventListener("click", () => scrollToStage(active + 1));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollToStage(active + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollToStage(active - 1);
    }
  });
  // Keyboard users tabbing into an off-screen card: bring that stage into view.
  track.addEventListener("focusin", (e) => {
    const stage = (e.target as HTMLElement).closest<HTMLElement>(".stage");
    if (!stage) return;
    const i = stages.indexOf(stage);
    if (i !== active) scrollToStage(i);
  });

  applyMode();
}

/* ───────── Marquee: pause when offscreen, duplicate for the loop ───────── */

function initMarquee() {
  const marquee = $("[data-marquee]");
  const row = marquee?.querySelector<HTMLElement>(".marquee__row");
  if (!marquee || !row) return;
  if (!prefersReducedMotion) {
    [...row.children].forEach((li) => {
      const clone = li.cloneNode(true) as HTMLElement;
      clone.classList.add("is-clone");
      clone.setAttribute("aria-hidden", "true");
      row.appendChild(clone);
    });
  }
  const io = new IntersectionObserver(([entry]) => marquee.classList.toggle("is-paused", !entry?.isIntersecting));
  io.observe(marquee);
}

/* ───────── Sticky mobile CTA: after the hero CTA leaves, hide near the closing CTA/footer ───────── */

function initStickyCta() {
  const bar = $("[data-sticky-cta]");
  const heroCta = $('[data-qc-cta="hero"]');
  const closing = $("[data-closing]");
  const footer = $(".qc-footer");
  if (!bar || !heroCta) return;
  bar.hidden = false;
  let heroGone = false;
  let endNear = false;
  const update = () => bar.classList.toggle("is-visible", heroGone && !endNear);
  new IntersectionObserver(([e]) => {
    heroGone = !e!.isIntersecting && e!.boundingClientRect.top < 0;
    update();
  }).observe(heroCta);
  const endIo = new IntersectionObserver((entries) => {
    endNear = entries.some((e) => e.isIntersecting) || endNear;
    // recompute strictly: visible if any observed end element intersects
    endNear = [closing, footer].some((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    update();
  });
  if (closing) endIo.observe(closing);
  if (footer) endIo.observe(footer);
}

/* ───────── Stage visuals: scale the 520px design box to the card (backs up the CSS cqw calc) ───────── */

function initVisualScale() {
  const visuals = [...document.querySelectorAll<HTMLElement>(".stage__visual")];
  if (!visuals.length || !("ResizeObserver" in window)) return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      if (w > 0) (entry.target as HTMLElement).style.setProperty("--s", (w / 520).toFixed(4));
    }
  });
  visuals.forEach((v) => ro.observe(v));
}

initHeroDeal();
initVisualScale();
initJourney();
initMarquee();
initStickyCta();
