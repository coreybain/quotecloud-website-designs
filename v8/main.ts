import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

/* ───────── Grid lines: crosshair marks + draw-in when a grid enters ───────── */

function initGrids() {
  const grids = [...document.querySelectorAll<HTMLElement>("[data-grid]")];
  for (const grid of grids) {
    const cells = [...grid.querySelectorAll<HTMLElement>(":scope > .g-cell")];
    cells.forEach((cell, i) => {
      cell.style.setProperty("--i", String(i));
      for (const corner of ["tl", "tr", "bl", "br"]) {
        const x = document.createElement("i");
        x.className = `g-x g-x--${corner}`;
        x.setAttribute("aria-hidden", "true");
        cell.appendChild(x);
      }
    });
  }
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    grids.forEach((g) => g.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
  );
  grids.forEach((g) => io.observe(g));
}

/* ───────── Scenes: class-based timelines that loop while visible ───────── */

type Step = [ms: number, cls: string];

const SCENES: Record<string, { steps: Step[]; loop: number }> = {
  editor: {
    loop: 9800,
    steps: [
      [300, "s-cur"],
      [1200, "s-pick"],
      [2000, "s-drag"],
      [3000, "s-drop"],
      [4200, "s-opt"],
      [5600, "s-mia"],
      [6600, "s-comment"],
    ],
  },
  customer: {
    loop: 11000,
    steps: [
      [200, "s-opened"],
      [1300, "s-cur"],
      [2400, "s-select"],
      [3900, "s-comment"],
      [5400, "s-sign"],
      [7400, "s-paid"],
    ],
  },
};

function initScenes() {
  document.querySelectorAll<HTMLElement>("[data-scene]").forEach((el) => {
    const def = SCENES[el.dataset.scene ?? ""];
    if (!def) return;
    const all = def.steps.map(([, c]) => c);
    const section = el.closest("section") ?? el;
    const trackSteps = [...section.querySelectorAll<HTMLElement>("[data-step]")];
    const sync = () => {
      for (const t of trackSteps) t.classList.toggle("is-on", el.classList.contains(`s-${t.dataset.step}`));
    };

    if (prefersReducedMotion) {
      el.classList.add(...all, "s-final");
      sync();
      return;
    }

    let timers: number[] = [];
    let running = false;
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const run = () => {
      el.classList.remove(...all);
      sync();
      timers = def.steps.map(([ms, cls]) =>
        window.setTimeout(() => {
          el.classList.add(cls);
          sync();
        }, ms),
      );
      timers.push(window.setTimeout(run, def.loop));
    };
    const start = () => {
      if (running) return;
      running = true;
      el.classList.add("is-live");
      run();
    };
    const stop = () => {
      running = false;
      el.classList.remove("is-live");
      clear();
    };
    if (!("IntersectionObserver" in window)) return start();
    new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())), {
      threshold: 0.25,
    }).observe(el);
  });
}

/* ───────── Feature cells: only run SVG loops while visible ───────── */

function initFeatures() {
  const feats = [...document.querySelectorAll<HTMLElement>("[data-feat]")];
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    feats.forEach((f) => f.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { threshold: 0.2 },
  );
  feats.forEach((f) => io.observe(f));
}

/* ───────── Hero parallax (desktop pointer devices only) ───────── */

function initParallax() {
  const el = document.querySelector<HTMLElement>("[data-parallax]");
  if (!el || prefersReducedMotion) return;
  const mq = window.matchMedia("(min-width: 1024px) and (hover: hover)");
  let raf = 0;
  const update = () => {
    raf = 0;
    const y = mq.matches ? Math.min(window.scrollY, 900) * -0.09 : 0;
    el.style.setProperty("--py", `${y.toFixed(1)}px`);
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  mq.addEventListener("change", update);
  update();
}

/* ───────── "Six tools" list: strike through one by one ───────── */

function initStrike() {
  const list = document.querySelector<HTMLElement>("[data-strike]");
  if (!list) return;
  const items = [...list.children] as HTMLElement[];
  const fire = () => items.forEach((li, i) => window.setTimeout(() => li.classList.add("is-struck"), 350 + i * 260));
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((li) => li.classList.add("is-struck"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fire();
    },
    { threshold: 0.4 },
  );
  io.observe(list);
}

/* ───────── Mobile sticky CTA: after the hero, hidden near the closing CTA / footer ───────── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>("[data-sticky]");
  const hero = document.getElementById("hero");
  const closing = document.getElementById("start");
  const footer = document.querySelector("footer");
  if (!bar || !hero || !closing || !("IntersectionObserver" in window)) return;
  const link = bar.querySelector("a");
  const visible = new Set<Element>([hero]);
  const apply = () => {
    const on = !visible.has(hero) && !visible.has(closing) && !(footer && visible.has(footer));
    bar.classList.toggle("is-on", on);
    bar.setAttribute("aria-hidden", String(!on));
    link?.setAttribute("tabindex", on ? "0" : "-1");
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
      apply();
    },
    { threshold: 0.05 },
  );
  io.observe(hero);
  io.observe(closing);
  if (footer) io.observe(footer);
}

initGrids();
initScenes();
initFeatures();
initParallax();
initStrike();
initSticky();
