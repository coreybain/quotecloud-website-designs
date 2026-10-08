import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

type Step = [run: () => void, ms: number];
interface Player {
  play(): void;
  pause(): void;
}

/** Runs steps in order and loops; pausing keeps its place. */
function sequence(steps: Step[], firstDelay = 600): Player {
  let i = 0;
  let timer = 0;
  let playing = false;
  let started = false;
  const tick = () => {
    const [run, ms] = steps[i];
    run();
    i = (i + 1) % steps.length;
    timer = window.setTimeout(tick, ms);
  };
  return {
    play() {
      if (playing) return;
      playing = true;
      timer = window.setTimeout(tick, started ? 200 : firstDelay);
      started = true;
    },
    pause() {
      playing = false;
      window.clearTimeout(timer);
    },
  };
}

const watched: { el: HTMLElement; visible: boolean; players: Player[] }[] = [];

/** Toggles .is-live on `el` (pauses CSS loops) and plays/pauses `players` while it is on screen. */
function whileVisible(el: HTMLElement, ...players: Player[]) {
  const entry = { el, visible: false, players };
  watched.push(entry);
  io.observe(el);
}
function sync(entry: (typeof watched)[number]) {
  const on = entry.visible && !document.hidden;
  entry.el.classList.toggle("is-live", on);
  entry.players.forEach((p) => (on ? p.play() : p.pause()));
}
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const entry = watched.find((w) => w.el === e.target);
      if (!entry) continue;
      entry.visible = e.isIntersecting;
      sync(entry);
    }
  },
  { threshold: 0.15 },
);
document.addEventListener("visibilitychange", () => watched.forEach(sync));

/* ───────── Hero: Canvas ⇄ Grid ───────── */

function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const buttons = [...hero.querySelectorAll<HTMLButtonElement>("[data-set-mode]")];
  const cursor = hero.querySelector<SVGSVGElement>(".hx__cursor");
  const block = (name: string) => hero.querySelector<HTMLElement>(`[data-b="${name}"]`);
  let selTimer = 0;

  const setMode = (mode: "canvas" | "grid") => {
    if (hero.dataset.mode === mode) return;
    hero.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setMode === mode)));
    // selection hides while blocks travel, then lands on a block
    hero.dataset.sel = "";
    window.clearTimeout(selTimer);
    selTimer = window.setTimeout(() => (hero.dataset.sel = mode === "canvas" ? "price" : "text"), 1300);
    hero.classList.remove("is-flash-c", "is-flash-g");
    void hero.offsetWidth;
    hero.classList.add(mode === "canvas" ? "is-flash-c" : "is-flash-g");
  };

  const moveCursor = (target: Element | null | undefined, fx = 0.5, fy = 0.55) => {
    if (!cursor || !target) return;
    const h = hero.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = r.left - h.left + r.width * fx;
    const y = r.top - h.top + r.height * fy;
    cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  const click = () => {
    if (!cursor) return;
    cursor.classList.remove("is-click");
    void cursor.getBoundingClientRect();
    cursor.classList.add("is-click");
  };
  const btn = (mode: string) => buttons.find((b) => b.dataset.setMode === mode);

  let player: Player | undefined;
  if (!prefersReducedMotion) {
    // park the cursor at the bottom-right of the stage before it first appears
    const stage = hero.querySelector(".hx__stage");
    moveCursor(stage, 0.86, 0.9);
    player = sequence([
      [() => (hero.classList.add("is-auto"), moveCursor(block("price"), 0.62, 0.62)), 2600],
      [() => moveCursor(btn("grid"), 0.55, 0.6), 950],
      [() => (click(), setMode("grid")), 1400],
      [() => moveCursor(block("text"), 0.7, 0.5), 2600],
      [() => moveCursor(btn("canvas"), 0.55, 0.6), 950],
      [() => (click(), setMode("canvas")), 1700],
    ]);
  }

  buttons.forEach((b) =>
    b.addEventListener("click", (event) => {
      // a real click (not the demo) hands control to the visitor
      if (event.isTrusted && player) {
        player.pause();
        player = undefined;
        hero.classList.remove("is-auto");
        const entry = watched.find((w) => w.el === hero);
        if (entry) entry.players = [];
      }
      setMode(b.dataset.setMode === "grid" ? "grid" : "canvas");
    }),
  );

  whileVisible(hero, ...(player ? [player] : []));
}

/* ───────── Centre tile: same block, both modes ───────── */

function initPalette() {
  const tile = document.querySelector<HTMLElement>("[data-palette]");
  if (!tile) return;
  const chips = [...tile.querySelectorAll<HTMLButtonElement>(".pal__chip")];
  const slots = [...tile.querySelectorAll<HTMLElement>(".pv__slot")];
  let k = 0;
  let holdUntil = 0;

  const show = (next: number) => {
    k = next;
    chips.forEach((c, i) => {
      c.classList.toggle("is-on", i === k);
      c.setAttribute("aria-pressed", String(i === k));
    });
    slots.forEach((slot) =>
      [...slot.querySelectorAll<HTMLElement>(".mb")].forEach((mb, i) => mb.classList.toggle("is-on", i === k)),
    );
  };
  chips.forEach((c, i) =>
    c.addEventListener("click", () => {
      holdUntil = performance.now() + 9000;
      show(i);
    }),
  );

  const player = prefersReducedMotion
    ? undefined
    : sequence([[() => performance.now() > holdUntil && show((k + 1) % chips.length), 2400]], 2400);
  whileVisible(tile, ...(player ? [player] : []));
}

/* ───────── Grid tile: 1 → 2 → resize → 3 columns ───────── */

function initColumns() {
  const tile = document.querySelector<HTMLElement>("[data-cols]");
  const demo = tile?.querySelector<HTMLElement>(".d-cols");
  if (!tile || !demo) return;
  const cells = [...demo.querySelectorAll<HTMLElement>(".d-cols__cell")];
  const track = demo.querySelector<HTMLElement>(".d-cols__track");

  // [left%, right%] of each cell; a cell with left === right is hidden
  type Layout = { n: number; k: number; cells: [number, number][] };
  const layouts: Layout[] = [
    { n: 1, k: 1, cells: [[0, 100], [100, 100], [100, 100]] },
    { n: 2, k: 0.5, cells: [[0, 49], [51, 100], [100, 100]] },
    { n: 2, k: 0.66, cells: [[0, 65], [67, 100], [100, 100]] },
    { n: 3, k: 0.33, cells: [[0, 32], [34, 66], [68, 100]] },
  ];
  const apply = (l: Layout) => {
    demo.dataset.n = String(l.n);
    track?.style.setProperty("--k", String(l.k));
    l.cells.forEach(([a, b], i) => {
      cells[i]?.style.setProperty("--l", `${a}%`);
      cells[i]?.style.setProperty("--r", `${b}%`);
    });
  };
  apply(layouts[1]);
  if (prefersReducedMotion) return whileVisible(tile);

  let i = 1;
  const player = sequence([[() => apply(layouts[(i = (i + 1) % layouts.length)]), 1900]], 1200);
  whileVisible(tile, player);
}

/* ───────── Loops that are pure CSS just need pausing off-screen ───────── */

initHero();
initPalette();
initColumns();
document
  .querySelectorAll<HTMLElement>("[data-tile]:not([data-palette]):not([data-cols]), [data-close]")
  .forEach((el) => whileVisible(el));
