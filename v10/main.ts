import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  [...root.querySelectorAll<T>(sel)];

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween a number into an element's text. Returns a cancel function. */
function tween(el: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string) {
  if (prefersReducedMotion || ms <= 0) {
    el.textContent = fmt(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(from + (to - from) * easeOut(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const int = (n: number) => Math.round(n).toLocaleString("en-US");

/* ───────── Visuals only run while on screen ───────── */

function initLive() {
  const targets = $$("[data-live]");
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { threshold: 0.15 },
  );
  targets.forEach((el) => io.observe(el));
}

/* ───────── Hero: Draft → Sent → Viewed → Signed → Paid ───────── */

function initHeroDeal() {
  const deal = $("[data-deal]");
  const track = $(".track");
  const totalEl = $("[data-deal-total]");
  const elapsedEl = $("[data-deal-elapsed]");
  if (!deal || !track || !totalEl || !elapsedEl) return;

  const PHASES = ["p0", "p1", "p2", "p3", "p4"];
  // phase → [hold duration ms, elapsed-minutes target]
  const TIMING: [number, number][] = [
    [2600, 2],
    [1500, 4],
    [2600, 9],
    [2300, 13],
    [3200, 14],
  ];

  const setPhase = (n: number) => {
    for (let i = 0; i < PHASES.length; i++) {
      deal.classList.toggle(PHASES[i], i <= n);
      track.classList.toggle(PHASES[i], i <= n);
    }
  };

  // The markup ships in its final "Paid" state (for no-JS and reduced motion); the loop starts from empty.
  if (prefersReducedMotion) return;

  let timer = 0;
  let cancelTotal = () => {};
  let cancelElapsed = () => {};
  let phase = -1;
  let running = false;

  const reset = () => {
    cancelTotal();
    cancelElapsed();
    deal.classList.add("is-reset");
    setPhase(-1);
    totalEl.textContent = money(21400);
    elapsedEl.textContent = "0";
    void deal.offsetWidth; // flush so the reset applies without transitions
    deal.classList.remove("is-reset");
  };

  const advance = () => {
    phase += 1;
    if (phase > 4) {
      reset();
      phase = -1;
      timer = window.setTimeout(advance, 500);
      return;
    }
    setPhase(phase);
    const [hold, minutes] = TIMING[phase];
    const from = Number(elapsedEl.textContent) || 0;
    cancelElapsed = tween(elapsedEl, from, minutes, hold * 0.85, int);
    if (phase === 2) cancelTotal = tween(totalEl, 21400, 24800, 900, money);
    timer = window.setTimeout(advance, hold);
  };

  const start = () => {
    if (running) return;
    running = true;
    reset();
    phase = -1;
    timer = window.setTimeout(advance, 350);
  };
  const stop = () => {
    running = false;
    window.clearTimeout(timer);
    cancelTotal();
    cancelElapsed();
  };

  reset(); // clear the static final state before first paint
  if (!("IntersectionObserver" in window)) return start();
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
    { threshold: 0.25 },
  );
  io.observe(deal);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (deal.getBoundingClientRect().bottom > 0) start();
  });
}

/* ───────── Pillars: expand the features behind each outcome ───────── */

function initPillars() {
  $$<HTMLButtonElement>(".pillar__toggle").forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute("aria-controls") ?? "");
    if (!panel) return;
    const set = (open: boolean) => {
      btn.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
    };
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    // If a user lands on a deep link inside the panel, open it.
    panel.addEventListener("focusin", () => set(true));
  });
}

/* ───────── Estimator ───────── */

function initEstimator() {
  const root = $("[data-estimator]");
  if (!root) return;
  const team = $<HTMLInputElement>("[data-est-team]", root);
  const per = $<HTMLInputElement>("[data-est-per]", root);
  const teamOut = $("[data-est-team-out]", root);
  const perOut = $("[data-est-per-out]", root);
  const hoursEl = $("[data-est-hours]", root);
  const daysEl = $("[data-est-days]", root);
  if (!team || !per || !teamOut || !perOut || !hoursEl || !daysEl) return;

  const HOURS_PER_PROPOSAL = 2;
  const HOURS_PER_DAY = 8;
  let shownHours = 0;
  let cancel = () => {};

  const paint = (input: HTMLInputElement) => {
    const p = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--p", p + "%");
  };

  const update = (animate: boolean) => {
    paint(team);
    paint(per);
    teamOut.textContent = team.value;
    perOut.textContent = per.value;
    const hours = Number(team.value) * Number(per.value) * HOURS_PER_PROPOSAL;
    const days = hours / HOURS_PER_DAY;
    daysEl.textContent = days < 10 ? (Math.round(days * 10) / 10).toLocaleString("en-US") : int(days);
    cancel();
    if (animate) cancel = tween(hoursEl, shownHours, hours, 420, int);
    else hoursEl.textContent = int(hours);
    shownHours = hours;
  };

  team.addEventListener("input", () => update(true));
  per.addEventListener("input", () => update(true));
  update(false);
}

/* ───────── Before / after comparison ───────── */

function initCompare() {
  const stage = $("[data-compare]");
  const range = $<HTMLInputElement>("[data-compare-range]");
  if (!stage || !range) return;
  const apply = () => {
    const v = Number(range.value);
    stage.style.setProperty("--pos", String(v));
    range.setAttribute("aria-valuetext", `${100 - v}% QuoteCloud document revealed`);
  };
  range.addEventListener("input", apply);
  apply();

  // A little invitation: nudge the handle once when it first scrolls into view.
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const base = Number(range.value);
      const nudge = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        const offset = Math.sin(t * Math.PI * 2) * 9 * (1 - t);
        if (document.activeElement === range) return;
        range.value = String(base + offset);
        apply();
        if (t < 1) requestAnimationFrame(nudge);
      };
      requestAnimationFrame(nudge);
    },
    { threshold: 0.6 },
  );
  io.observe(stage);
}

/* ───────── Integrations marquee: duplicate the list for a seamless loop ───────── */

function initMarquee() {
  const track = $(".marquee__track");
  if (!track || prefersReducedMotion) return;
  const items = [...track.children];
  items.forEach((li) => {
    const clone = li.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  });
}

/* ───────── Sticky mobile CTA ───────── */

function initStickyCta() {
  const bar = $("[data-sticky]");
  const hero = $(".hero");
  const close = $("[data-close]");
  const footer = $(".qc-footer");
  if (!bar || !hero || !close || !footer || !("IntersectionObserver" in window)) return;
  bar.hidden = false;
  let heroVisible = true;
  let endVisible = false;
  const paint = () => bar.classList.toggle("is-visible", !heroVisible && !endVisible);
  new IntersectionObserver(
    (entries) => {
      heroVisible = entries[0].isIntersecting;
      paint();
    },
    { threshold: 0.1 },
  ).observe(hero);
  const endIo = new IntersectionObserver(
    (entries) => {
      endVisible = entries.some((e) => e.isIntersecting) || endVisible;
      // recompute from scratch each time either end element changes
      endVisible = [close, footer].some((el) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      paint();
    },
    { threshold: 0 },
  );
  endIo.observe(close);
  endIo.observe(footer);
}

initLive();
initHeroDeal();
initPillars();
initEstimator();
initCompare();
initMarquee();
initStickyCta();
