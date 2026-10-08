import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Calls back with true/false as `el` enters/leaves the viewport (used to pause loops offscreen). */
function whileVisible(el: Element, onChange: (visible: boolean) => void, options: IntersectionObserverInit = {}) {
  if (!("IntersectionObserver" in window)) return onChange(true);
  new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), options).observe(el);
}

/** Tweens a money value inside `el`. */
const running = new WeakMap<Element, number>();
function tween(el: HTMLElement, from: number, to: number, duration = 700) {
  cancelAnimationFrame(running.get(el) ?? 0);
  if (prefersReducedMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) running.set(el, requestAnimationFrame(frame));
  };
  running.set(el, requestAnimationFrame(frame));
}

/* ───────── Hero: pause the layer loops offscreen ───────── */

function initHero() {
  const visual = $(".hero__visual");
  if (visual) whileVisible(visual, (v) => visual.classList.toggle("is-paused", !v));
}

/* ───────── Layers: active step drives the sticky stack; each card runs while live ───────── */

type Demo = { start: () => void; stop: () => void };

function initLayers(demos: Map<number, Demo>) {
  const rail = $("[data-rail]");
  const steps = $$<HTMLElement>(".step");
  if (!steps.length) return;

  const parts = rail ? [$$(".rl", rail), $$(".rail__labels li", rail)] : [];
  const setActive = (k: number) => {
    if (!rail || rail.dataset.active === String(k)) return;
    rail.dataset.active = String(k);
    for (const list of parts) {
      list.forEach((el, j) => {
        el.classList.toggle("is-active", j === k);
        el.classList.toggle("is-ahead", j > k);
        el.classList.toggle("is-behind", j < k);
      });
    }
  };
  if (rail) {
    rail.dataset.active = "";
    setActive(0);
  }

  if (!("IntersectionObserver" in window)) {
    demos.forEach((d) => d.start());
    return;
  }

  // Whichever step crosses the middle band of the viewport is the active layer.
  const middle = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  steps.forEach((s) => middle.observe(s));

  // Cards animate only while on screen.
  steps.forEach((step) => {
    const demo = demos.get(Number(step.dataset.step));
    if (!demo) return;
    let live = false;
    whileVisible(
      $(".card", step) ?? step,
      (v) => {
        if (v === live) return;
        live = v;
        if (v) demo.start();
        else demo.stop();
      },
      { threshold: 0.35 },
    );
  });
}

/* ───────── 01 · Quote: monthly vs once-off across contract terms ───────── */

function initQuote(): Demo | undefined {
  const card = $("[data-quote]");
  if (!card) return;
  const rows = $$<HTMLTableRowElement>("tbody tr", card);
  const buttons = $$<HTMLButtonElement>(".seg__btn", card);
  const totals = {
    m: $('[data-total="m"]', card)!,
    o: $('[data-total="o"]', card)!,
    c: $('[data-total="c"]', card)!,
  };
  const col: Record<number, number> = { 12: 0, 24: 1, 36: 2 };
  const current = { m: 0, o: 0, c: 0 };
  let auto = !prefersReducedMotion;
  let timer = 0;

  const cell = (td: HTMLElement, value: number, free: string | undefined, animate: boolean) => {
    const text = value ? money(value) : (free ?? "—");
    const span = td.querySelector<HTMLElement>(".v");
    if (span && span.textContent === text) return;
    td.innerHTML = "";
    const v = document.createElement("span");
    v.className = "v" + (value ? "" : free ? " is-free" : " is-dash") + (animate ? " is-flip" : "");
    v.textContent = text;
    td.append(v);
  };

  const set = (term: number, animate = true) => {
    card.dataset.term = String(term);
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.term === String(term))));
    let m = 0;
    let o = 0;
    for (const row of rows) {
      const mv = Number(row.dataset.m!.split(",")[col[term]]);
      const ov = Number(row.dataset.o!.split(",")[col[term]]);
      m += mv;
      o += ov;
      cell(row.querySelector(".q__m")!, mv, undefined, animate);
      cell(row.querySelector(".q__o")!, ov, row.dataset.free, animate);
    }
    const next = { m, o, c: m * term + o };
    (Object.keys(next) as (keyof typeof next)[]).forEach((k) => {
      if (animate) tween(totals[k], current[k], next[k]);
      else totals[k].textContent = money(next[k]);
      current[k] = next[k];
    });
  };

  set(36, false);
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      auto = false;
      window.clearInterval(timer);
      set(Number(b.dataset.term));
    }),
  );

  const order = [12, 24, 36];
  return {
    start() {
      if (!auto) return;
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        const now = Number(card.dataset.term);
        set(order[(order.indexOf(now) + 1) % order.length]);
      }, 3400);
    },
    stop() {
      window.clearInterval(timer);
    },
  };
}

/* ───────── 02 · Governance: internal vs customer view, approval on discount ───────── */

function initGov(): Demo | undefined {
  const card = $("[data-gov]");
  if (!card) return;
  const appr = $(".appr", card)!;
  const buttons = $$<HTMLButtonElement>(".seg__btn", card);
  let auto = !prefersReducedMotion;
  let timers: number[] = [];

  const setView = (view: string) => {
    card.dataset.view = view;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      auto = false;
      timers.forEach((t) => window.clearTimeout(t));
      setView(b.dataset.view!);
    }),
  );

  return {
    start() {
      card.classList.add("is-live");
      if (prefersReducedMotion) return;
      appr.dataset.state = "wait";
      timers.push(window.setTimeout(() => (appr.dataset.state = "ok"), 2000));
      if (auto) {
        timers.push(window.setTimeout(() => auto && setView("customer"), 3600));
        timers.push(window.setTimeout(() => auto && setView("internal"), 6800));
      }
    },
    stop() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      card.classList.remove("is-live");
      if (auto) setView("internal");
    },
  };
}

/* ───────── 03 · Team: loops gated by .is-live ───────── */

function initTeam(): Demo | undefined {
  const card = $("[data-team]");
  if (!card) return;
  return {
    start: () => card.classList.add("is-live"),
    stop: () => card.classList.remove("is-live"),
  };
}

/* ───────── 04 · Close: pick options, sign, pay ───────── */

function initClose(): Demo | undefined {
  const card = $("[data-close]");
  if (!card) return;
  const inputs = $$<HTMLInputElement>("input[data-add]", card);
  const totalEl = $("[data-close-total]", card)!;
  const base = 4580;
  let shown = base;
  let touched = false;
  let timers: number[] = [];

  const update = () => {
    const to = base + inputs.reduce((sum, i) => sum + (i.checked ? Number(i.dataset.add) : 0), 0);
    tween(totalEl, shown, to);
    shown = to;
  };
  inputs.forEach((i) =>
    i.addEventListener("change", () => {
      touched = true;
      update();
    }),
  );

  if (prefersReducedMotion) {
    inputs[0].checked = true;
    update();
    card.dataset.state = "signed";
    return { start() {}, stop() {} };
  }

  card.dataset.state = "open";
  return {
    start() {
      if (touched) {
        card.dataset.state = "signed";
        return;
      }
      card.dataset.state = "open";
      inputs.forEach((i) => (i.checked = false));
      update();
      timers.push(
        window.setTimeout(() => {
          if (touched) return;
          inputs[0].checked = true;
          update();
        }, 1100),
      );
      timers.push(window.setTimeout(() => (card.dataset.state = "signed"), 2500));
    },
    stop() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    },
  };
}

/* ───────── Templates fan, integration + closing loops ───────── */

function initMisc() {
  const fan = $("[data-fan]");
  if (fan) onceVisible(fan, () => fan.classList.add("is-open"), 0.3);

  for (const el of [$("[data-intg]"), $("[data-final]")]) {
    if (el) whileVisible(el, (v) => el.classList.toggle("is-paused", !v));
  }
}

/* ───────── Mobile sticky CTA: after the hero CTAs, hidden near the closing CTA/footer ───────── */

function initStickyCta() {
  const bar = $("[data-mcta]");
  const heroCtas = $(".hero__ctas");
  if (!bar || !heroCtas || !("IntersectionObserver" in window)) return;
  const ends = [$(".mid__ctas"), $("[data-final]"), $(".qc-footer")].filter(Boolean) as HTMLElement[];
  let heroVisible = true;
  const endsVisible = new Set<Element>();
  const update = () => bar.classList.toggle("is-on", !heroVisible && endsVisible.size === 0);
  // Hero CTAs count as "passed" only once they are above the viewport.
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting || e.boundingClientRect.top > 0;
    update();
  }).observe(heroCtas);
  const endObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) endsVisible.add(e.target);
      else endsVisible.delete(e.target);
    }
    update();
  });
  ends.forEach((el) => endObserver.observe(el));
}

const demos = new Map<number, Demo>();
[initQuote(), initGov(), initTeam(), initClose()].forEach((d, i) => d && demos.set(i, d));

initHero();
initLayers(demos);
initMisc();
initStickyCta();
