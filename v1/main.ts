import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

/* ───────── helpers ───────── */

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Tweens a currency value into `el`. Resolves when done. */
function tweenMoney(el: HTMLElement, from: number, to: number, duration = 900): Promise<void> {
  if (prefersReducedMotion || duration <= 0) {
    el.textContent = money(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = money(from + (to - from) * easeOut(t));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/** Moves an absolutely positioned cursor so its tip sits at (x, y) inside `host`. */
function placeCursor(cursor: HTMLElement, host: HTMLElement, x: number, y: number) {
  cursor.style.setProperty("--cx", `${x}px`);
  cursor.style.setProperty("--cy", `${y}px`);
  void host; // host only documents the coordinate space
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/* ───────── hero: assemble on load ───────── */

function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const total = hero.querySelector<HTMLElement>("[data-hero-total]");
  const cursor = hero.querySelector<HTMLElement>(".cur--hero");
  const win = hero.querySelector<HTMLElement>(".win");
  const optRow = hero.querySelector<HTMLElement>(".pt__row--opt");

  const ready = () => hero.classList.add("is-ready");
  // wait for fonts so the headline doesn't reflow mid-entrance
  if ("fonts" in document) document.fonts.ready.then(ready).catch(ready);
  else ready();

  if (prefersReducedMotion) {
    if (total) total.textContent = money(18480);
    hero.classList.add("is-picked");
    return;
  }

  // price total counts up once the table has landed
  window.setTimeout(() => total && tweenMoney(total, 0, 18480, 1300), 1700);

  // collaborator cursor glides in to tick the optional row
  window.setTimeout(async () => {
    if (!cursor || !win || !optRow) return;
    const w = win.getBoundingClientRect();
    const r = optRow.getBoundingClientRect();
    const check = optRow.querySelector<HTMLElement>(".pt__check");
    const c = check ? check.getBoundingClientRect() : r;
    placeCursor(cursor, win, w.width * 0.62, w.height * 1.05);
    hero.classList.add("is-cursor");
    await wait(60);
    placeCursor(cursor, win, c.left - w.left + 6, c.top - w.top + 6);
    await wait(1750);
    hero.classList.add("is-picked");
    if (total) tweenMoney(total, 18480, 22440, 700);
    await wait(900);
    placeCursor(cursor, win, c.left - w.left + 46, c.top - w.top + 30);
  }, 2600);
}

/* ───────── live tiles: run loops only while visible ───────── */

const liveListeners = new Map<Element, (live: boolean) => void>();

function initLive() {
  const targets = document.querySelectorAll<HTMLElement>("[data-live]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => {
      el.classList.add("is-live");
      liveListeners.get(el)?.(true);
    });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const live = entry.isIntersecting;
        entry.target.classList.toggle("is-live", live);
        liveListeners.get(entry.target)?.(live);
      }
    },
    { threshold: 0.25 },
  );
  targets.forEach((el) => io.observe(el));
}

/* ───────── pricing tile: customer ticks an option, totals recalc ───────── */

function initPriceDemo() {
  const tile = document.querySelector<HTMLElement>('[data-demo="price"]');
  if (!tile) return;
  const check = tile.querySelector<HTMLInputElement>("[data-price-opt]");
  const row = tile.querySelector<HTMLElement>(".price__row--opt");
  const disc = tile.querySelector<HTMLElement>("[data-price-disc]");
  const tax = tile.querySelector<HTMLElement>("[data-price-tax]");
  const total = tile.querySelector<HTMLElement>("[data-price-total]");
  const cursor = tile.querySelector<HTMLElement>(".cur--price");
  const stage = tile.querySelector<HTMLElement>(".price");
  if (!check || !row || !disc || !tax || !total || !cursor || !stage) return;

  const BASE = 18000;
  const OPT = 3600;
  let current = { disc: 900, tax: 1710, total: 18810 };

  const compute = (opt: boolean) => {
    const sub = BASE + (opt ? OPT : 0);
    const d = sub * 0.05;
    const t = (sub - d) * 0.1;
    return { disc: d, tax: t, total: sub - d + t };
  };

  const render = (opt: boolean, animate = true) => {
    const next = compute(opt);
    const dur = animate ? 700 : 0;
    tweenMoney(total, current.total, next.total, dur);
    tweenMoney(tax, current.tax, next.tax, dur);
    const dStart = current.disc;
    const dEnd = next.disc;
    if (animate && !prefersReducedMotion) {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        disc.textContent = "−" + money(dStart + (dEnd - dStart) * easeOut(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else disc.textContent = "−" + money(dEnd);
    current = next;
  };

  let live = false;
  let userHold = 0;
  let running = false;

  // real control: keyboard + pointer
  check.addEventListener("change", () => {
    userHold = performance.now() + 9000;
    render(check.checked);
  });
  tile.addEventListener("pointerenter", () => (userHold = performance.now() + 4000));
  tile.addEventListener("focusin", () => (userHold = performance.now() + 9000));

  const restCursor = () => {
    const s = stage.getBoundingClientRect();
    placeCursor(cursor, stage, s.width * 0.74, s.height * 0.86);
  };

  const loop = async () => {
    if (running) return;
    running = true;
    restCursor();
    while (live) {
      await wait(1800);
      if (!live) break;
      if (performance.now() < userHold) continue;
      // glide to the checkbox
      const s = stage.getBoundingClientRect();
      const b = row.querySelector<HTMLElement>(".price__box")!.getBoundingClientRect();
      placeCursor(cursor, stage, b.left - s.left + 8, b.top - s.top + 8);
      await wait(1150);
      if (!live || performance.now() < userHold) continue;
      cursor.classList.add("is-down");
      row.classList.add("is-pressed");
      await wait(140);
      cursor.classList.remove("is-down");
      row.classList.remove("is-pressed");
      check.checked = !check.checked;
      render(check.checked);
      await wait(1500);
      restCursor();
      await wait(1600);
    }
    running = false;
  };

  if (prefersReducedMotion) {
    check.checked = true;
    render(true, false);
    return;
  }

  liveListeners.set(tile, (isLive) => {
    live = isLive;
    if (live) loop();
  });
}

/* ───────── AI tile: suggested paragraph types itself ───────── */

function initAiDemo() {
  const tile = document.querySelector<HTMLElement>('[data-demo="ai"]');
  if (!tile) return;
  const out = tile.querySelector<HTMLElement>("[data-ai-out]");
  const stage = tile.querySelector<HTMLElement>(".ai");
  if (!out || !stage) return;
  const TEXT =
    "Thank you for considering Northwind for your fleet upgrade. This proposal outlines a phased rollout across all three depots, fixed pricing for 12 months and a dedicated support team from day one.";

  if (prefersReducedMotion) {
    out.textContent = TEXT;
    stage.classList.add("is-done");
    return;
  }

  let live = false;
  let running = false;
  const loop = async () => {
    if (running) return;
    running = true;
    while (live) {
      out.textContent = "";
      stage.classList.remove("is-done");
      await wait(900);
      for (let i = 0; i <= TEXT.length && live; i += 2) {
        out.textContent = TEXT.slice(0, i);
        await wait(TEXT[i - 1] === "." ? 180 : 22);
      }
      out.textContent = TEXT;
      stage.classList.add("is-done");
      await wait(4200);
    }
    running = false;
  };
  liveListeners.set(tile, (isLive) => {
    live = isLive;
    if (live) loop();
  });
}

/* ───────── canvas / grid tile ───────── */

function initModeDemo() {
  const tile = document.querySelector<HTMLElement>('[data-demo="mode"]');
  if (!tile) return;
  const stage = tile.querySelector<HTMLElement>(".mode");
  const buttons = [...tile.querySelectorAll<HTMLButtonElement>(".mode__btn")];
  if (!stage || buttons.length < 2) return;

  let userHold = 0;
  const set = (mode: string) => {
    stage.classList.toggle("is-grid", mode === "grid");
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      userHold = performance.now() + 8000;
      set(b.dataset.mode ?? "canvas");
    }),
  );

  if (prefersReducedMotion) return;

  let live = false;
  let timer = 0;
  const tick = () => {
    if (!live) return;
    if (performance.now() >= userHold) set(stage.classList.contains("is-grid") ? "canvas" : "grid");
    timer = window.setTimeout(tick, 2600);
  };
  liveListeners.set(tile, (isLive) => {
    live = isLive;
    window.clearTimeout(timer);
    if (live) timer = window.setTimeout(tick, 1200);
  });
}

/* ───────── spotlight follows the pointer across tiles ───────── */

function initSpotlight() {
  const grid = document.querySelector<HTMLElement>("[data-spotlight]");
  if (!grid || !window.matchMedia("(hover: hover)").matches) return;
  grid.addEventListener("pointermove", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".tile");
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    tile.style.setProperty("--mx", `${e.clientX - r.left}px`);
    tile.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}

/* ───────── slim sticky CTA on mobile ───────── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>("[data-sticky]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const end = document.querySelector<HTMLElement>("#start");
  const footer = document.querySelector<HTMLElement>(".qc-footer");
  if (!bar || !hero || !end || !("IntersectionObserver" in window)) return;
  let heroGone = false;
  let nearEnd = false;
  const update = () => bar.classList.toggle("is-shown", heroGone && !nearEnd);
  new IntersectionObserver(
    (entries) => {
      heroGone = !entries[0].isIntersecting && entries[0].boundingClientRect.bottom < 0;
      update();
    },
    { threshold: 0 },
  ).observe(hero);
  const visible = new Map<Element, boolean>();
  const endIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(e.target, e.isIntersecting));
      nearEnd = [...visible.values()].some(Boolean);
      update();
    },
    { threshold: 0 },
  );
  endIo.observe(end);
  if (footer) endIo.observe(footer);
}

initHero();
initPriceDemo();
initAiDemo();
initModeDemo();
initLive();
initSpotlight();
initSticky();
