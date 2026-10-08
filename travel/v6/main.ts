import "../../src/shared/site.ts";
import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const hasIO = "IntersectionObserver" in window;

/* ───────── Play state: .is-on once on first view, .is-live while on screen ───────── */

function initPlayState() {
  const els = $$("[data-gh-play]");
  if (!hasIO || prefersReducedMotion) {
    els.forEach((el) => el.classList.add("is-on", "is-live"));
    return;
  }
  const onIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-on");
        e.target.dispatchEvent(new CustomEvent("gh:on"));
        onIO.unobserve(e.target);
      }
    },
    { threshold: 0.28 },
  );
  const liveIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      e.target.classList.toggle("is-live", e.isIntersecting);
      e.target.dispatchEvent(new CustomEvent(e.isIntersecting ? "gh:live" : "gh:idle"));
    }
  });
  els.forEach((el) => {
    onIO.observe(el);
    liveIO.observe(el);
  });
}

/* ───────── Hero: pointer parallax + pause loops offscreen ───────── */

function initHero() {
  const hero = $("[data-gh-hero]");
  const stage = $("[data-gh-stage]");
  if (!hero || !stage) return;

  if (hasIO) {
    new IntersectionObserver(([e]) => hero.classList.toggle("is-paused", !e.isIntersecting)).observe(hero);
  }

  const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1081px)");
  if (prefersReducedMotion) return;

  let raf = 0;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    raf = 0;
    stage.style.setProperty("--px", tx.toFixed(3));
    stage.style.setProperty("--py", ty.toFixed(3));
  };
  hero.addEventListener("pointermove", (e) => {
    if (!fine.matches) return;
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  hero.addEventListener("pointerleave", () => {
    tx = 0;
    ty = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });
}

/* ───────── Import: source tabs swap the raw booking and replay ───────── */

const SOURCES: Record<string, [string, string][]> = {
  sabre: [
    ["RLOC", "KX7Q2M · 2 PAX"],
    ["1", "QF 43 Y 04APR SYDDPS HK2 1035 1515"],
    ["2", "HHL HK2 DPS IN04APR OUT10APR LAGUNA"],
    ["3", "CAR DPS 04APR PRIVATE TRANSFER"],
    ["4", "TUR DPS 06APR ULUWATU TEMPLE"],
  ],
  powersuite: [
    ["BKG", "PS-20418 · Bali Discovery"],
    ["AIR", "QF43 SYD-DPS 04/04 10:35 CONF"],
    ["ACC", "Laguna Resort & Spa 6N CONF"],
    ["TRF", "DPS airport → resort PRIVATE"],
    ["TOUR", "Uluwatu Temple 06/04 HALF DAY"],
  ],
  tramada: [
    ["REF", "TRM-88213 · 2 travellers"],
    ["FLT", "Qantas QF43 · Sydney → Denpasar"],
    ["HTL", "The Laguna · 04–10 Apr · 6 nights"],
    ["TFR", "Private transfer · arrival"],
    ["ACT", "Uluwatu Temple tour · 06 Apr"],
  ],
};

function initImport() {
  const root = $("[data-gh-import]");
  const panel = root?.closest<HTMLElement>("[data-gh-play]");
  const body = $("[data-gh-term]", root ?? document);
  if (!root || !panel || !body) return;
  const tabs = $$<HTMLButtonElement>("[role=tab]", root);

  const select = (tab: HTMLButtonElement, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (focus) tab.focus();
    const lines = SOURCES[tab.dataset.source ?? "sabre"];
    body.replaceChildren(
      ...lines.map(([k, v]) => {
        const p = document.createElement("p");
        p.className = "gh-term__line";
        const s = document.createElement("span");
        s.textContent = k;
        p.append(s, ` ${v}`);
        return p;
      }),
    );
    if (prefersReducedMotion) return;
    // replay the import sequence
    panel.classList.remove("is-on");
    void panel.offsetWidth;
    panel.classList.add("is-on");
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
}

/* ───────── Trip cost: optional extras update the total ───────── */

function initCost() {
  const root = $("[data-gh-cost]");
  const out = $<HTMLOutputElement>("[data-gh-total]", root ?? document);
  if (!root || !out) return;
  const base = Number(root.dataset.base) || 0;
  const boxes = $$<HTMLInputElement>("input[type=checkbox]", root);
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  let shown = base;
  let raf = 0;

  const update = () => {
    const to = base + boxes.reduce((sum, b) => sum + (b.checked ? Number(b.value) : 0), 0);
    cancelAnimationFrame(raf);
    out.classList.remove("is-bump");
    void out.offsetWidth;
    out.classList.add("is-bump");
    if (prefersReducedMotion) {
      shown = to;
      out.textContent = fmt(to);
      return;
    }
    const from = shown;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      out.textContent = fmt(shown);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  boxes.forEach((b) => b.addEventListener("change", update));

  // A gentle demo: the traveller picks an extra shortly after the panel appears.
  const panel = root.closest("[data-gh-play]");
  const auto = $<HTMLInputElement>("[data-gh-auto]", root);
  let touched = false;
  root.addEventListener("pointerdown", () => (touched = true), { once: true });
  root.addEventListener("keydown", () => (touched = true), { once: true });
  panel?.addEventListener(
    "gh:on",
    () => {
      window.setTimeout(() => {
        if (!touched && auto && !auto.checked) {
          auto.checked = true;
          update();
        }
      }, 1600);
    },
    { once: true },
  );
}

/* ───────── Sign & pay: a looping 4-step sequence while visible ───────── */

function initSign() {
  const root = $("[data-gh-sign]");
  const panel = root?.closest<HTMLElement>("[data-gh-play]");
  if (!root || !panel) return;
  if (prefersReducedMotion) {
    root.dataset.step = "3";
    return;
  }
  const steps: [number, number][] = [
    [1, 500],
    [2, 2400],
    [3, 3900],
    [0, 8400],
  ];
  let timers: number[] = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const run = () => {
    stop();
    root.dataset.step = "0";
    for (const [step, at] of steps) {
      timers.push(
        window.setTimeout(() => {
          root.dataset.step = String(step);
          if (step === 0) run();
        }, at),
      );
    }
  };
  panel.addEventListener("gh:live", run);
  panel.addEventListener("gh:idle", () => {
    stop();
    root.dataset.step = "3";
  });
}

/* ───────── Bento: cursor-following glow ───────── */

function initBento() {
  const grid = $("[data-gh-bento]");
  if (!grid || !window.matchMedia("(hover: hover)").matches) return;
  const tiles = $$(".gh-tile", grid);
  let raf = 0;
  let last: PointerEvent | null = null;
  const apply = () => {
    raf = 0;
    if (!last) return;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${last.clientX - r.left}px`);
      t.style.setProperty("--my", `${last.clientY - r.top}px`);
    }
  };
  grid.addEventListener("pointermove", (e) => {
    last = e;
    if (!raf) raf = requestAnimationFrame(apply);
  });
}

/* ───────── Mobile sticky CTA: after the hero, hidden near the closing CTA ───────── */

function initSticky() {
  const bar = $("[data-gh-sticky]");
  const hero = $("[data-gh-hero]");
  const final = $("[data-gh-final]");
  const footer = $(".qc-footer");
  if (!bar || !hero || !final || !hasIO) return;
  bar.hidden = false;
  let heroVisible = true;
  let endVisible = false;
  const sync = () => {
    const show = !heroVisible && !endVisible;
    bar.classList.toggle("is-shown", show);
    bar.toggleAttribute("inert", !show);
  };
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    sync();
  }).observe(hero);
  const seen = new Set<Element>();
  const endIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target);
      else seen.delete(e.target);
    }
    endVisible = seen.size > 0;
    sync();
  });
  endIO.observe(final);
  if (footer) endIO.observe(footer);
  sync();
}

initPlayState();
initHero();
initImport();
initCost();
initSign();
initBento();
initSticky();
