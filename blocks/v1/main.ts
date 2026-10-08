import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* blocks/v1 — "The Block Wall".
   Each tile owns a short, self-resetting micro-animation (.is-play + CSS keyframes, plus a small JS "player"
   for typing, counters and layout swaps). Tiles play once when they first enter the viewport; after that a
   gentle round-robin scheduler replays one visible tile at a time. Nothing runs offscreen or with reduced motion. */

const RM = prefersReducedMotion;
const wall = document.querySelector<HTMLElement>("[data-wall]");
const tiles = wall ? [...wall.querySelectorAll<HTMLElement>(".bw-tile")] : [];

/* ───────── helpers ───────── */

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const timers = new WeakMap<HTMLElement, number[]>();
const frames = new WeakMap<HTMLElement, number>();

function later(tile: HTMLElement, fn: () => void, ms: number) {
  const list = timers.get(tile) ?? [];
  list.push(window.setTimeout(fn, ms));
  timers.set(tile, list);
}
function clearTile(tile: HTMLElement) {
  (timers.get(tile) ?? []).forEach((t) => clearTimeout(t));
  timers.set(tile, []);
  const f = frames.get(tile);
  if (f) cancelAnimationFrame(f);
}

/** Tween a numeric text value (money by default) without layout work beyond the text node. */
function tween(el: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string = money) {
  if (RM || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Type text into a set of spans, one character at a time, keeping the original text as the resting state. */
function typeInto(tile: HTMLElement, spans: HTMLElement[], cps: number, delay: number, onChar?: (span: HTMLElement) => void) {
  const texts = spans.map((s) => (s.dataset.full ??= s.textContent ?? ""));
  spans.forEach((s) => (s.textContent = ""));
  let si = 0;
  let ci = 0;
  const tick = () => {
    if (si >= spans.length) return;
    const span = spans[si];
    const full = texts[si];
    ci++;
    span.textContent = full.slice(0, ci);
    onChar?.(span);
    if (ci >= full.length) {
      si++;
      ci = 0;
    }
    if (si < spans.length) later(tile, tick, 1000 / cps);
  };
  later(tile, tick, delay);
}
function restoreTyped(tile: HTMLElement) {
  tile.querySelectorAll<HTMLElement>("[data-type]").forEach((s) => {
    if (s.dataset.full !== undefined) s.textContent = s.dataset.full;
  });
}

/* ───────── per-tile players (JS parts; CSS handles the rest under .is-play) ───────── */

type Player = (tile: HTMLElement) => void;

const players: Record<string, Player> = {
  price(tile) {
    const total = tile.querySelector<HTMLElement>('[data-pt="total"]');
    if (total) later(tile, () => tween(total, 0, state.total, 1100), 350);
  },

  text(tile) {
    const spans = [...tile.querySelectorAll<HTMLElement>("[data-type]")];
    const bold = tile.querySelector<HTMLElement>(".tx__bar > b");
    typeInto(tile, spans, 48, 250, (span) => bold?.classList.toggle("is-active", span.tagName === "STRONG"));
    later(tile, () => bold?.classList.remove("is-active"), 3200);
  },

  toc(tile) {
    const vis = tile.querySelector<HTMLElement>(".toc");
    const items = [...tile.querySelectorAll<HTMLElement>(".toc__list li")];
    const seq = [0, 1, 2, 3, 4, 2];
    seq.forEach((i, n) =>
      later(
        tile,
        () => {
          vis?.style.setProperty("--i", String(i));
          items.forEach((li, k) => li.classList.toggle("is-active", k === i));
        },
        n * 650,
      ),
    );
  },

  form(tile) {
    const spans = [...tile.querySelectorAll<HTMLElement>("[data-type]")];
    typeInto(tile, spans, 16, 200);
  },

  itin(tile) {
    const chips = [...tile.querySelectorAll<HTMLElement>(".it__s")];
    [1, 2, 3, 0].forEach((i, n) =>
      later(tile, () => chips.forEach((c, k) => c.classList.toggle("is-on", k === i)), 900 + n * 650),
    );
  },

  video(tile) {
    const t = tile.querySelector<HTMLElement>("[data-vd]");
    if (!t) return;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    t.textContent = "0:00";
    later(tile, () => tween(t, 0, 72, 3200, fmt), 600);
  },

  pdf(tile) {
    const pg = tile.querySelector<HTMLElement>("[data-pdf]");
    if (!pg) return;
    pg.textContent = "1";
    later(tile, () => (pg.textContent = "2"), 1000);
    later(tile, () => (pg.textContent = "3"), 1950);
  },

  gallery(tile) {
    const gl = tile.querySelector<HTMLElement>(".gl");
    if (!gl) return;
    gl.dataset.layout = "1";
    [2, 3, 1].forEach((l, n) => later(tile, () => flipLayout(gl, String(l)), 1300 + n * 1500));
  },
};

/** FLIP the gallery images into a new grid layout using transforms only. */
function flipLayout(gl: HTMLElement, layout: string) {
  const imgs = [...gl.querySelectorAll<HTMLElement>(".gl__grid img")];
  const before = imgs.map((i) => i.getBoundingClientRect());
  gl.dataset.layout = layout;
  imgs.forEach((img, k) => {
    const a = before[k];
    const b = img.getBoundingClientRect();
    if (!b.width || !b.height) return;
    img.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 700, delay: k * 40, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    );
  });
}

/* ───────── play / schedule ───────── */

const lastPlay = new WeakMap<HTMLElement, number>();
const lastTouch = new WeakMap<HTMLElement, number>();
const hovered = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
const seen = new WeakSet<HTMLElement>();

function play(tile: HTMLElement) {
  if (RM) return;
  clearTile(tile);
  restoreTyped(tile);
  tile.classList.remove("is-play");
  void tile.offsetWidth; // restart CSS animations
  tile.classList.add("is-play");
  lastPlay.set(tile, performance.now());
  players[tile.dataset.anim ?? ""]?.(tile);
}

let cursor = 0;
let loop = 0;
function tickScheduler() {
  if (document.hidden || !visible.size) return stopScheduler();
  const now = performance.now();
  for (let n = 0; n < tiles.length; n++) {
    const tile = tiles[(cursor + n) % tiles.length];
    if (!visible.has(tile) || hovered.has(tile)) continue;
    if (now - (lastTouch.get(tile) ?? -1e9) < 10000) continue;
    if (now - (lastPlay.get(tile) ?? -1e9) < 6000) continue;
    cursor = (tiles.indexOf(tile) + 1) % tiles.length;
    play(tile);
    return;
  }
}
function startScheduler() {
  if (RM || loop || document.hidden || !visible.size) return;
  loop = window.setInterval(tickScheduler, 2400);
}
function stopScheduler() {
  clearInterval(loop);
  loop = 0;
}

if (!RM && tiles.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const tile = e.target as HTMLElement;
        if (e.isIntersecting) {
          visible.add(tile);
          if (!seen.has(tile)) {
            seen.add(tile);
            const delay = Number(tile.style.getPropertyValue("--reveal-delay")) || 0;
            lastPlay.set(tile, performance.now() + delay);
            window.setTimeout(() => visible.has(tile) && play(tile), delay + 260);
          }
        } else {
          visible.delete(tile);
        }
      });
      visible.size ? startScheduler() : stopScheduler();
    },
    { threshold: 0.35 },
  );
  tiles.forEach((t) => io.observe(t));

  document.addEventListener("visibilitychange", () => (document.hidden ? stopScheduler() : startScheduler()));

  tiles.forEach((tile) => {
    tile.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      hovered.add(tile);
      if (tile.dataset.anim === "price") return; // don't disturb a tile people are about to use
      if (performance.now() - (lastPlay.get(tile) ?? -1e9) > 1500) play(tile);
    });
    tile.addEventListener("pointerleave", () => hovered.delete(tile));
    tile.addEventListener("focusin", () => {
      if (tile.dataset.anim !== "price" && performance.now() - (lastPlay.get(tile) ?? -1e9) > 1500) play(tile);
    });
  });
}

/* ───────── static decoration: QR + barcode stagger ───────── */

document.querySelectorAll<SVGRectElement>(".qr__m rect").forEach((r, i) => {
  // pseudo-random but deterministic, so every play looks the same
  r.style.setProperty("--d", String(((i * 37) % 23) * 30));
});
document.querySelectorAll<SVGRectElement>(".bc__svg rect").forEach((r, i) => {
  r.style.setProperty("--d", String(i * 18));
});
// TOC: mark the resting active item (Pricing) once JS is available
document.querySelectorAll<HTMLElement>(".toc__list li").forEach((li, i) => li.classList.toggle("is-active", i === 2));

/* ───────── Price Table ⇄ Spreadsheet link ───────── */

const BASE = 2400 + 6800 + 6000;
const state = { sub: 16400, disc: 820, tax: 1558, total: 17138 };
const priceTile = document.querySelector<HTMLElement>(".t-price");
const sheetTile = document.querySelector<HTMLElement>(".t-sheet");

function pmt(total: number, months: number) {
  const r = 0.069 / 12;
  return (total * r) / (1 - Math.pow(1 + r, -months));
}

function recalc() {
  if (!priceTile) return;
  const opts = [...priceTile.querySelectorAll<HTMLElement>(".pt__opt.is-on")].reduce(
    (sum, row) => sum + Number(row.dataset.opt || 0),
    0,
  );
  const sub = BASE + opts;
  const disc = Math.round(sub * 0.05);
  const tax = Math.round((sub - disc) * 0.1);
  const total = sub - disc + tax;
  const q = (k: string) => priceTile.querySelector<HTMLElement>(`[data-pt="${k}"]`);
  const subEl = q("sub");
  const discEl = q("disc");
  const taxEl = q("tax");
  const totalEl = q("total");
  if (subEl) tween(subEl, state.sub, sub, 500);
  if (discEl) tween(discEl, state.disc, disc, 500, (n) => "−" + money(n));
  if (taxEl) tween(taxEl, state.tax, tax, 500);
  if (totalEl) {
    tween(totalEl, state.total, total, 700);
    const wrap = totalEl.parentElement;
    wrap?.classList.remove("is-bump");
    void wrap?.offsetWidth;
    wrap?.classList.add("is-bump");
  }
  if (sheetTile) {
    const linked = sheetTile.querySelector<HTMLElement>('[data-ss="total"]');
    if (linked) {
      tween(linked, state.total, total, 700);
      linked.classList.remove("is-flash");
      void linked.offsetWidth;
      linked.classList.add("is-flash");
    }
    [12, 24, 36, 48].forEach((m) => {
      const cell = sheetTile.querySelector<HTMLElement>(`[data-ss="${m}"]`);
      if (cell) tween(cell, pmt(state.total, m), pmt(total, m), 700);
    });
    lastTouch.set(sheetTile, performance.now());
  }
  Object.assign(state, { sub, disc, tax, total });
}

priceTile?.querySelectorAll<HTMLButtonElement>(".pt__sw").forEach((sw) => {
  sw.addEventListener("click", () => {
    const row = sw.closest<HTMLElement>(".pt__opt");
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(on));
    row?.classList.toggle("is-on", on);
    lastTouch.set(priceTile, performance.now());
    recalc();
  });
});

/* ───────── Mobile "Show all 18" disclosure ───────── */

const wallSec = document.querySelector<HTMLElement>(".bw-wall-sec");
const toggle = document.querySelector<HTMLButtonElement>("[data-wall-toggle]");
toggle?.addEventListener("click", () => {
  if (!wallSec) return;
  const open = !wallSec.classList.contains("is-open");
  wallSec.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  if (open) {
    // newly shown tiles: reveal immediately so they never sit invisible
    wallSec.querySelectorAll<HTMLElement>(".bw-tile").forEach((t) => t.classList.add("is-revealed"));
  } else {
    toggle.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
  }
});

/* ───────── Mini block maps (use cases + closing panel) ───────── */

const AREAS = [
  "price", "text", "toc", "sign", "sheet", "gantt", "form", "diagram", "qr",
  "barcode", "button", "itin", "video", "shapes", "pdf", "image", "gallery", "space",
];

function buildMap(host: HTMLElement, lit: string[] = []) {
  const frag = document.createDocumentFragment();
  AREAS.forEach((a) => {
    const cell = document.createElement("i");
    cell.className = "bw-map-cell";
    cell.style.gridArea = a;
    const n = lit.indexOf(a);
    if (n >= 0) {
      cell.classList.add("is-lit");
      cell.style.setProperty("--n", String(n));
      if (RM) cell.classList.add("is-static");
    }
    frag.append(cell);
  });
  host.append(frag);
}

document.querySelectorAll<HTMLElement>(".bw-uc").forEach((uc) => {
  const map = uc.querySelector<HTMLElement>(".bw-uc__map");
  if (map) buildMap(map, (uc.dataset.uses ?? "").split(/\s+/));
});

const closeMap = document.querySelector<HTMLElement>(".bw-close__map");
if (closeMap) {
  buildMap(closeMap);
  // a fixed shuffle so the "lighting up" wanders across the wall
  const order = [0, 7, 13, 4, 16, 2, 10, 5, 15, 8, 1, 12, 6, 17, 3, 11, 14, 9];
  [...closeMap.children].forEach((c, i) => (c as HTMLElement).style.setProperty("--n", String(order[i])));
  if (!RM) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => closeMap.classList.toggle("is-live", e.isIntersecting));
    }).observe(closeMap);
  }
}
