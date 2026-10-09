import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* document-creation/v1: hero document stack, live bento tiles, 18-block index, Canvas/Grid switch.
   Every loop runs only while its element is on screen and the tab is visible. */

const motion = !prefersReducedMotion;

/** Calls `onChange(true|false)` as `el` enters / leaves the viewport. */
function watch(el: Element, onChange: (visible: boolean) => void, threshold = 0.25) {
  if (!("IntersectionObserver" in window)) return onChange(true);
  new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), { threshold }).observe(el);
}

/** Removes and re-adds a class so its CSS animations start again from the first frame. */
function restart(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Counts `el` from `from` to `to` after `delay` ms (cancelled if the tile restarts). */
function countMoney(el: HTMLElement, from: number, to: number, delay: number, duration = 700) {
  el.textContent = money(from);
  const token = String(Math.random());
  el.dataset.countToken = token;
  window.setTimeout(() => {
    const start = performance.now();
    const tick = (now: number) => {
      if (el.dataset.countToken !== token) return;
      const t = Math.min(1, (now - start) / duration);
      el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

/* ───────── Hero: rotating document stack ───────── */

function initStack() {
  const stack = document.querySelector<HTMLElement>("[data-stack]");
  if (!stack) return;
  const pages = [...stack.querySelectorAll<HTMLElement>("[data-stack-page]")];
  const tabs = [...stack.querySelectorAll<HTMLButtonElement>("[data-stack-tab]")];
  const made = stack.querySelector<HTMLElement>("[data-stack-made]");
  const interval = 4600;
  stack.style.setProperty("--dc-stack-ms", `${interval}ms`);

  let current = 0;
  let timer = 0;
  let visible = false;
  let held = false;

  const show = (next: number) => {
    if (next === current) return;
    const prev = pages[current];
    prev.classList.remove("is-active", "is-play");
    prev.classList.add("is-leaving");
    window.setTimeout(() => prev.classList.remove("is-leaving"), 900);
    current = next;
    const page = pages[current];
    page.classList.add("is-active");
    if (motion) restart(page, "is-play");
    tabs.forEach((t, i) => t.setAttribute("aria-pressed", String(i === current)));
    if (made) {
      made.classList.add("is-swap");
      window.setTimeout(() => {
        made.textContent = page.dataset.blocks ?? "";
        made.classList.remove("is-swap");
      }, 220);
    }
  };

  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
    stack.classList.remove("is-auto");
  };
  const start = () => {
    stop();
    if (!motion || !visible || held || document.hidden) return;
    restart(stack, "is-auto");
    timer = window.setInterval(() => {
      show((current + 1) % pages.length);
      restart(stack, "is-auto");
    }, interval);
  };

  tabs.forEach((tab, i) =>
    tab.addEventListener("click", () => {
      show(i);
      start();
    }),
  );
  // Hold the current page while the visitor is looking at it or using the tabs.
  stack.addEventListener("pointerenter", () => ((held = true), stop()));
  stack.addEventListener("pointerleave", () => ((held = false), start()));
  stack.addEventListener("focusin", () => ((held = true), stop()));
  stack.addEventListener("focusout", (e) => {
    if (stack.contains(e.relatedTarget as Node | null)) return;
    held = false;
    start();
  });
  document.addEventListener("visibilitychange", start);

  if (motion) pages[0].classList.add("is-play");
  watch(stack, (v) => ((visible = v), start()), 0.2);
}

/* ───────── Live bento tiles ───────── */

// Length of one full story per tile (ms). The CSS sequence restarts on this beat while the tile is visible.
const CYCLE: Record<string, number> = {
  report: 7600,
  proposal: 5200,
  contract: 6000,
  pitch: 6800,
  plan: 5400,
  onboard: 6600,
  travel: 7000,
  write: 6600,
  present: 6400,
  client: 10500,
  collab: 8000,
  library: 4800,
  approve: 5200,
  track: 6400,
};

function playExtras(tile: HTMLElement) {
  const name = tile.dataset.tile;
  if (name === "proposal") {
    const total = tile.querySelector<HTMLElement>("[data-proposal-total]");
    if (total) countMoney(total, 9200, 10400, 1300);
  }
  if (name === "client") {
    const total = tile.querySelector<HTMLElement>("[data-client-total]");
    if (total) countMoney(total, 9200, 10400, 1500);
  }
}

function initTiles() {
  document.querySelectorAll<HTMLElement>("[data-tile]").forEach((tile) => {
    // Once the reveal has finished, drop its stagger delay so the hover lift reacts instantly.
    onceVisible(tile, () => window.setTimeout(() => tile.classList.add("is-settled"), 1600), 0.12);
    if (!motion) return;

    const cycle = CYCLE[tile.dataset.tile ?? ""];
    let timer = 0;
    const play = () => {
      restart(tile, "is-play");
      playExtras(tile);
    };
    watch(tile, (visible) => {
      tile.classList.toggle("is-live", visible);
      window.clearInterval(timer);
      timer = 0;
      if (!visible || !cycle) return;
      play();
      timer = window.setInterval(() => {
        if (!document.hidden) play();
      }, cycle);
    });
  });
}

/* ───────── Design tile: Canvas / Grid switch ───────── */

function initDesignSwitch() {
  const mini = document.querySelector<HTMLElement>(".mini--design[data-layout]");
  if (!mini) return;
  const buttons = [...mini.querySelectorAll<HTMLButtonElement>("[data-layout-btn]")];
  const set = (layout: string) => {
    mini.dataset.layout = layout;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layoutBtn === layout)));
  };

  let timer = 0;
  let touched = false;
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      touched = true;
      window.clearInterval(timer);
      set(b.dataset.layoutBtn ?? "canvas");
    }),
  );
  if (!motion) return;
  watch(mini, (visible) => {
    window.clearInterval(timer);
    if (!visible || touched) return;
    timer = window.setInterval(() => {
      if (!document.hidden) set(mini.dataset.layout === "canvas" ? "grid" : "canvas");
    }, 3200);
  });
}

/* ───────── 18-block index: light up what each document is made of ───────── */

const RECIPES: [string, string[]][] = [
  ["business report", ["Text", "Image", "Spreadsheet", "Table of Contents"]],
  ["proposal", ["Text", "Price Table", "Video", "eSignature"]],
  ["project plan", ["Text", "Gantt Chart", "Diagram", "Forms"]],
  ["contract", ["Text", "PDF", "eSignature", "Empty Space"]],
  ["presentation-style pitch", ["Shapes", "Image", "Gallery", "Video", "Button"]],
  ["onboarding pack", ["Video", "Forms", "Button", "eSignature"]],
  ["travel itinerary", ["Itinerary", "Gallery", "QR Code", "Barcode"]],
];

function initIndex() {
  const section = document.querySelector<HTMLElement>("[data-index]");
  if (!section) return;
  const items = [...section.querySelectorAll<HTMLElement>("li[data-b]")];
  const label = section.querySelector<HTMLElement>("[data-index-label]");
  let step = 0;
  let timer = 0;

  const light = (i: number) => {
    const [name, blocks] = RECIPES[i];
    items.forEach((li) => li.classList.toggle("is-lit", blocks.includes(li.dataset.b ?? "")));
    if (!label) return;
    if (!motion) {
      label.textContent = name;
      return;
    }
    label.classList.add("is-swap");
    window.setTimeout(() => {
      label.textContent = name;
      label.classList.remove("is-swap");
    }, 260);
  };

  light(0);
  if (!motion) return;
  watch(
    section,
    (visible) => {
      window.clearInterval(timer);
      if (!visible) return;
      timer = window.setInterval(() => {
        if (document.hidden) return;
        step = (step + 1) % RECIPES.length;
        light(step);
      }, 2600);
    },
    0.2,
  );
}

/* ───────── Closing band: fan the documents out once ───────── */

function initFinal() {
  const final = document.querySelector<HTMLElement>(".dc-final");
  if (final && motion) onceVisible(final, () => final.classList.add("is-in"), 0.3);
}

initStack();
initTiles();
initDesignSwitch();
initIndex();
initFinal();
