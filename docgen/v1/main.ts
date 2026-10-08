import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

type Step = [run: () => void, waitMs: number];

/** A pausable sequence of timed steps that loops forever. */
function player(steps: Step[]) {
  let i = 0;
  let timer = 0;
  let playing = false;
  const next = () => {
    if (!playing) return;
    const [run, wait] = steps[i];
    i = (i + 1) % steps.length;
    run();
    timer = window.setTimeout(next, wait);
  };
  return {
    play() {
      if (playing) return;
      playing = true;
      timer = window.setTimeout(next, 120);
    },
    pause() {
      playing = false;
      window.clearTimeout(timer);
    },
  };
}

/** Calls start/stop as `el` enters and leaves the viewport. */
function whileVisible(el: Element, start: () => void, stop: () => void, threshold = 0.2) {
  if (!("IntersectionObserver" in window)) return start();
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= threshold) start();
        else if (!e.isIntersecting) stop();
      }
    },
    { threshold: [0, threshold] },
  ).observe(el);
}

/** Tween the number shown in `el`. */
const shown = new WeakMap<HTMLElement, number>();
function tween(el: HTMLElement, to: number, duration = 650) {
  const from = shown.get(el) ?? to;
  shown.set(el, to);
  if (prefersReducedMotion || from === to) {
    el.textContent = usd(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    el.textContent = usd(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function restartClass(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/* ───────── Hero: merge tokens resolve into a finished proposal ───────── */

const CLIENTS = [
  { company: "Halden & Co.", initials: "HC", first: "Maya", l0: 32400, l1: 9600, l2: 6600, expiry: "30 Nov 2026" },
  { company: "Northwind Freight", initials: "NF", first: "James", l0: 84000, l1: 28800, l2: 13600, expiry: "14 Dec 2026" },
  { company: "Aster Dental Group", initials: "AD", first: "Priya", l0: 12600, l1: 4200, l2: 2150, expiry: "9 Jan 2027" },
];

function initHero() {
  const doc = $("[data-hero-doc]");
  if (!doc || prefersReducedMotion) return;

  const tokens = $$(".tok", doc);
  const rows = $$(".hdoc__row:not(.hdoc__row--head):not(.hdoc__row--total)", doc);
  const src = $(".hdoc__src", doc)!;
  const set = (key: string, value: string) => $$(`[data-hd="${key}"]`, doc).forEach((el) => (el.textContent = value));
  const tokFor = (key: string) => tokens.filter((t) => t.querySelector(`[data-hd="${key}"]`));
  const resolve = (key: string) =>
    tokFor(key).forEach((t) => {
      restartClass(t, "is-resolving");
      t.classList.add("is-done");
    });

  let c = 0;
  const reset = () => {
    const d = CLIENTS[c];
    c = (c + 1) % CLIENTS.length;
    doc.classList.add("is-armed", "is-generating");
    doc.classList.remove("is-ready");
    tokens.forEach((t) => t.classList.remove("is-done", "is-resolving"));
    rows.forEach((r) => r.classList.remove("is-in"));
    set("company", d.company);
    set("initials", d.initials);
    set("first", d.first);
    set("l0", usd(d.l0));
    set("l1", usd(d.l1));
    set("l2", usd(d.l2));
    set("total", usd(d.l0 + d.l1 + d.l2));
    set("expiry", d.expiry);
    restartClass(src, "is-swap");
  };
  const row = (i: number) => () => rows[i]?.classList.add("is-in");

  const p = player([
    [reset, 1100],
    [() => resolve("company"), 520],
    [() => resolve("first"), 520],
    [row(0), 240],
    [row(1), 240],
    [row(2), 480],
    [() => resolve("total"), 520],
    [() => resolve("expiry"), 600],
    [
      () => {
        doc.classList.remove("is-generating");
        doc.classList.add("is-ready");
      },
      4600,
    ],
  ]);
  whileVisible(doc, p.play, p.pause, 0.15);
}

/* ───────── Bento: loops run only while each tile is in view ───────── */

function initTiles() {
  $$(".bt").forEach((tile) =>
    whileVisible(
      tile,
      () => tile.classList.add("is-live"),
      () => tile.classList.remove("is-live"),
      0.2,
    ),
  );
}

/* CRM record → page: values fly from the record into their placeholders. */
function initCrm() {
  const tile = $('[data-tile="crm"]');
  const stage = tile && $(".crm", tile);
  if (!tile || !stage || prefersReducedMotion || !("animate" in Element.prototype)) return;

  const keys = ["company", "contact", "items", "total", "date"];
  const slots = keys.map((k) => $(`[data-slot="${k}"]`, stage)!);

  const fly = (k: string, i: number) => () => {
    const from = $(`[data-src="${k}"]`, stage);
    const to = slots[i];
    if (!from || !to) return;
    const st = stage.getBoundingClientRect();
    const fr = from.getBoundingClientRect();
    const tr = to.getBoundingClientRect();
    const chip = document.createElement("span");
    chip.className = "crm__chip";
    chip.textContent = from.textContent;
    stage.append(chip);
    const cr = chip.getBoundingClientRect();
    const x0 = fr.right - st.left - cr.width + 8;
    const y0 = fr.top - st.top + fr.height / 2 - cr.height / 2;
    const block = k === "items";
    const x1 = block ? tr.left - st.left + tr.width / 2 - cr.width / 2 : tr.right - st.left - cr.width + 6;
    const y1 = tr.top - st.top + tr.height / 2 - cr.height / 2;
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`;
    chip
      .animate(
        [
          { transform: at(x0, y0, 0.85), opacity: 0 },
          { transform: at(x0, y0 - 4, 1), opacity: 1, offset: 0.16 },
          { transform: at(x1, y1, 1), opacity: 1, offset: 0.84 },
          { transform: at(x1, y1, 0.8), opacity: 0 },
        ],
        { duration: 950, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
      )
      .finished.then(() => chip.remove());
    const field = from.closest(".crm__f");
    field?.classList.add("is-hot");
    window.setTimeout(() => field?.classList.remove("is-hot"), 800);
    window.setTimeout(() => to.classList.add("is-filled"), 780);
  };

  const p = player([
    [
      () => {
        stage.classList.add("is-armed");
        stage.classList.remove("is-complete");
        slots.forEach((s) => s.classList.remove("is-filled"));
      },
      900,
    ],
    ...keys.map((k, i): Step => [fly(k, i), 720]),
    [() => stage.classList.add("is-complete"), 3200],
  ]);
  whileVisible(tile, p.play, p.pause, 0.35);
}

/* Brand theme: one swatch re-skins every document (clip-path wipe). */
function initBrand() {
  const tile = $('[data-tile="brand"]');
  if (!tile) return;
  const swatches = $$<HTMLButtonElement>(".sw", tile);
  const themes = swatches.map((s) => s.style.getPropertyValue("--a"));
  const docs = $$(".brand__doc", tile);

  // Clone the default skin once per theme.
  const skins = docs.map((doc) => {
    const base = $(".brand__skin", doc)!;
    return themes.map((color, t) => {
      if (t === 0) return base;
      const clone = base.cloneNode(true) as HTMLElement;
      clone.classList.remove("is-on");
      clone.style.setProperty("--a", color);
      doc.append(clone);
      return clone;
    });
  });

  let current = 0;
  let z = 1;
  const apply = (t: number) => {
    if (t === current) return;
    const prev = current;
    current = t;
    swatches.forEach((s, i) => s.setAttribute("aria-pressed", String(i === t)));
    skins.forEach((list, d) => {
      const next = list[t];
      next.style.zIndex = String(++z);
      next.style.transitionDelay = `${d * 110}ms`;
      next.classList.add("is-on");
      window.setTimeout(() => {
        if (current !== prev) list[prev].classList.remove("is-on");
      }, 1200 + d * 110);
    });
  };

  let auto = !prefersReducedMotion;
  let timer = 0;
  const loop = () => {
    window.clearTimeout(timer);
    if (!auto) return;
    timer = window.setTimeout(() => {
      apply((current + 1) % themes.length);
      loop();
    }, 2600);
  };
  swatches.forEach((s, i) =>
    s.addEventListener("click", () => {
      auto = false;
      window.clearTimeout(timer);
      apply(i);
    }),
  );
  whileVisible(tile, loop, () => window.clearTimeout(timer), 0.3);
}

/* API tile: the count climbs in step with the flying pages. */
function initApi() {
  const tile = $('[data-tile="api"]');
  const out = tile && $("[data-api-count]", tile);
  if (!tile || !out || prefersReducedMotion) return;
  const TOTAL = 1200;
  const PERIOD = 7200;
  const RUN = 4200;
  let elapsed = 0;
  let last = 0;
  let raf = 0;
  const tick = (now: number) => {
    elapsed = (elapsed + (last ? now - last : 0)) % PERIOD;
    last = now;
    const t = Math.min(1, elapsed / RUN);
    const eased = 1 - Math.pow(1 - t, 2.2);
    out.textContent = Math.round(TOTAL * eased).toLocaleString("en-US");
    raf = requestAnimationFrame(tick);
  };
  whileVisible(
    tile,
    () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    () => {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  );
}

/* Interactive pricing: options, seats and a live total. */
function initPricing() {
  const tile = $('[data-tile="price"]');
  if (!tile) return;
  const totalEl = $("[data-price-total]", tile)!;
  const opts = $$<HTMLInputElement>("[data-price-opt]", tile);
  const qtyOut = $<HTMLOutputElement>("[data-qty-out]", tile)!;
  const BASE = 32400 + 9600;
  const SEAT = 480;
  let seats = Number(qtyOut.textContent) || 0;
  let touched = false;

  const update = () => {
    const total = BASE + opts.reduce((sum, o) => sum + (o.checked ? Number(o.dataset.priceOpt) : 0), 0) + seats * SEAT;
    qtyOut.textContent = String(seats);
    tween(totalEl, total);
    if (!prefersReducedMotion) restartClass(totalEl, "is-bump");
  };
  shown.set(totalEl, 49560);

  opts.forEach((o) =>
    o.addEventListener("change", () => {
      touched = true;
      update();
    }),
  );
  $$<HTMLButtonElement>("[data-qty]", tile).forEach((b) =>
    b.addEventListener("click", () => {
      touched = true;
      seats = Math.max(0, Math.min(20, seats + Number(b.dataset.qty)));
      update();
    }),
  );

  // A single gentle demonstration so visitors see it is live.
  if (!prefersReducedMotion) {
    onceVisible(
      tile,
      () =>
        window.setTimeout(() => {
          if (touched || !opts[1]) return;
          opts[1].checked = true;
          update();
        }, 1600),
      0.5,
    );
  }
}

/* Closing: the pages fan out once. */
function initClose() {
  const close = $("[data-close]");
  if (!close || prefersReducedMotion) return;
  close.classList.add("is-armed");
  onceVisible(close, () => close.classList.add("is-fanned"), 0.25);
}

initHero();
initTiles();
initCrm();
initBrand();
initApi();
initPricing();
initClose();
