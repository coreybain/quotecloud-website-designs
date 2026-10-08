import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (t: number) => t * t * (3 - 2 * t);
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Toggles `is-on` while an element is on screen (pauses CSS loops offscreen). */
function watchOnScreen(el: Element, margin = "100px") {
  if (!("IntersectionObserver" in window)) return el.classList.add("is-on");
  new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-on", e.isIntersecting)),
    { rootMargin: margin },
  ).observe(el);
}

/** Sum offsetLeft/Top up to `ancestor` (ignores transforms, so measurements are in layout space). */
function offsetIn(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/* ───────── linked pricing: price table ⇄ spreadsheet ───────── */

const BASE = 18400 + 64800;
const PODS = 12600;
const TAX = 0.1;
const RATE = 0.069 / 12;

const podsBtn = $<HTMLButtonElement>("[data-b2-pods]");
const taxEl = $("[data-b2-tax]");
const totalEl = $("[data-b2-total]");
const linkedEl = $("[data-b2-linked]");
const termEls = $$("[data-b2-term]");
let shownTotal = (BASE + PODS) * (1 + TAX);
let tween = 0;

function renderTotals(total: number) {
  if (taxEl) taxEl.textContent = money((total / (1 + TAX)) * TAX);
  if (totalEl) totalEl.textContent = money(total);
  if (linkedEl) linkedEl.textContent = money(total);
  termEls.forEach((el) => {
    const n = Number(el.dataset.b2Term);
    el.textContent = money((total * RATE) / (1 - Math.pow(1 + RATE, -n)));
  });
}

function setPods(on: boolean, animate = true) {
  if (!podsBtn) return;
  podsBtn.setAttribute("aria-checked", String(on));
  const target = (BASE + (on ? PODS : 0)) * (1 + TAX);
  cancelAnimationFrame(tween);
  if (!animate || prefersReducedMotion) {
    shownTotal = target;
    renderTotals(target);
    return;
  }
  const from = shownTotal;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 700);
    shownTotal = from + (target - from) * (1 - Math.pow(1 - t, 3));
    renderTotals(shownTotal);
    if (t < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
  [linkedEl, ...termEls].forEach((el) => {
    if (!el) return;
    el.classList.remove("b2-flash");
    void el.offsetWidth;
    el.classList.add("b2-flash");
  });
}
podsBtn?.addEventListener("click", () => setPods(podsBtn.getAttribute("aria-checked") !== "true"));

/* "Alive" moments when a block lands (or scrolls into view in the stacked layout). */
let podsTimer = 0;
function onLive(slot: HTMLElement, live: boolean) {
  if (!slot.classList.contains("b2-slot--price")) return;
  window.clearTimeout(podsTimer);
  if (live) podsTimer = window.setTimeout(() => setPods(true), 650);
  else setPods(false, false);
}

/* ───────── 1. Pinned story: patchwork → one document ───────── */

const pw = $(".b2-pw");
if (pw) {
  const stage = $(".b2-stage", pw)!;
  const desk = $(".b2-desk", pw)!;
  const canvas = $(".b2-canvas", pw)!;
  const mess = $(".b2-mess", pw)!;
  const wins = $$(".b2-win", pw);
  const slots = $$(".b2-slot", pw);
  const steps = $$(".b2-step", pw);
  const countEl = $("[data-b2-count]", pw);

  const START = 0.1;
  const STEP = 0.11;
  const LEN = 0.09;
  const mq = window.matchMedia("(min-width: 1000px) and (min-height: 620px)");
  const sda = typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");
  let pinned = false;
  let lastCount = -1;
  let raf = 0;

  const measure = () => {
    if (pinned) {
      const ds = Math.min(desk.clientWidth / 740, desk.clientHeight / 780, 1.08);
      canvas.style.setProperty("--ds", ds.toFixed(4));
      wins.forEach((win, i) => {
        const slot = slots[i];
        if (!slot) return;
        const a = offsetIn(win, canvas);
        const b = offsetIn(slot, canvas);
        const ww = win.offsetWidth;
        const wh = win.offsetHeight;
        const bw = slot.offsetWidth;
        const bh = slot.offsetHeight;
        win.style.setProperty("--dx", `${b.x - a.x}px`);
        win.style.setProperty("--dy", `${b.y - a.y}px`);
        win.style.setProperty("--ksx", (bw / ww).toFixed(4));
        win.style.setProperty("--ksy", (bh / wh).toFixed(4));
        slot.style.setProperty("--bx", `${a.x - b.x}px`);
        slot.style.setProperty("--by", `${a.y - b.y}px`);
        slot.style.setProperty("--bsx", (ww / bw).toFixed(4));
        slot.style.setProperty("--bsy", (wh / bh).toFixed(4));
      });
    } else {
      mess.style.setProperty("--ms", (mess.clientWidth / 740).toFixed(4));
    }
  };

  const update = () => {
    raf = 0;
    if (!pinned) return;
    const r = pw.getBoundingClientRect();
    const p = clamp01(-r.top / Math.max(1, r.height - window.innerHeight));
    if (!sda) stage.style.setProperty("--p", p.toFixed(4));

    pw.dataset.phase = p < 0.045 ? "hero" : p >= 0.86 ? "done" : "story";

    let docked = 0;
    slots.forEach((slot, i) => {
      const e = smooth(clamp01((p - (START + i * STEP)) / LEN));
      if (e >= 0.5) docked++;
      const live = e >= 0.97;
      if (live !== slot.classList.contains("is-live")) {
        slot.classList.toggle("is-live", live);
        onLive(slot, live);
      }
    });
    if (docked !== lastCount && countEl) {
      countEl.textContent = String(docked);
      if (lastCount !== -1) {
        countEl.classList.remove("is-tick");
        void countEl.offsetWidth;
        countEl.classList.add("is-tick");
      }
      lastCount = docked;
    }
    let active = 0;
    steps.forEach((_, i) => {
      if (p >= START + i * STEP - 0.03) active = i;
    });
    steps.forEach((li, i) => {
      li.classList.toggle("is-active", i === active && pw.dataset.phase !== "done");
      li.classList.toggle("is-done", i < docked);
    });
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  const setMode = () => {
    pinned = mq.matches && !prefersReducedMotion;
    pw.classList.toggle("is-pinned", pinned);
    pw.classList.toggle("is-sda", pinned && sda);
    if (pinned) {
      slots.forEach((s) => s.classList.remove("is-live"));
      setPods(false, false);
      lastCount = -1;
    } else {
      if (!slots.some((s) => s.classList.contains("b2-slot--price") && s.classList.contains("is-live"))) setPods(false, false);
      stage.style.removeProperty("--p");
      pw.dataset.phase = "hero";
      steps.forEach((li) => li.classList.add("is-done"));
      if (countEl) countEl.textContent = "7";
    }
    measure();
    update();
  };

  // Stacked layout: blocks come alive as they scroll into view.
  slots.forEach((slot) => {
    onceVisible(
      slot,
      () => {
        if (pinned) return;
        slot.classList.add("is-live");
        onLive(slot, true);
      },
      0.35,
    );
  });

  setMode();
  mq.addEventListener("change", () => {
    setMode();
    // Blocks already scrolled past in the other layout should be live.
    if (!pinned) slots.forEach((s) => s.classList.add("is-live"));
    if (!pinned) setPods(true, false);
  });
  window.addEventListener("scroll", queue, { passive: true });
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      measure();
      queue();
    }, 120);
  });
  document.fonts?.ready.then(() => {
    measure();
    queue();
  });
}

/* ───────── 2. Itinerary: segments arrive when the card reveals; beams pause offscreen ───────── */

const itin = $(".b2-itin");
if (itin) watchOnScreen(itin);

/* ───────── 3. Horizontal index of all 18 blocks ───────── */

const index = $(".b2-index");
if (index) {
  watchOnScreen(index);
  const rows = $(".b2-rows", index)!;
  const prev = $<HTMLButtonElement>("[data-b2-prev]", index);
  const next = $<HTMLButtonElement>("[data-b2-next]", index);
  const bar = $("[data-b2-progress]", index);
  const cardStep = () => {
    const card = $(".b2-fam", rows);
    return card ? card.getBoundingClientRect().width + 20 : 320;
  };
  const sync = () => {
    const max = rows.scrollWidth - rows.clientWidth;
    const view = rows.clientWidth / rows.scrollWidth;
    const pos = max > 0 ? rows.scrollLeft / max : 0;
    bar?.style.setProperty("--sp", (view + (1 - view) * pos).toFixed(3));
    if (prev) prev.disabled = rows.scrollLeft < 4;
    if (next) next.disabled = rows.scrollLeft > max - 4;
  };
  prev?.addEventListener("click", () => rows.scrollBy({ left: -cardStep(), behavior: prefersReducedMotion ? "auto" : "smooth" }));
  next?.addEventListener("click", () => rows.scrollBy({ left: cardStep(), behavior: prefersReducedMotion ? "auto" : "smooth" }));
  rows.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  sync();

  // QR code: finder patterns + seeded modules, resolving module by module.
  const qr = $<SVGSVGElement>("[data-b2-qr]", index);
  if (qr) {
    const NS = "http://www.w3.org/2000/svg";
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const inFinder = (x: number, y: number) => {
      const fx = x > 13 ? x - 14 : x;
      const fy = y > 13 ? y - 14 : y;
      const ring = fx === 0 || fx === 6 || fy === 0 || fy === 6;
      const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
      return ring || core;
    };
    const frag = document.createDocumentFragment();
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        const isFinder = finder(x, y);
        const near = (x === 7 || y === 7 || x === 13 || y === 13) && (x < 8 || y < 8 || (x < 8 && y > 12));
        const dark = isFinder ? inFinder(x, y) : !near && rand() > 0.52;
        if (!dark) continue;
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", String(x));
        r.setAttribute("y", String(y));
        r.setAttribute("width", "1.02");
        r.setAttribute("height", "1.02");
        if (!isFinder) {
          r.setAttribute("class", "q");
          r.style.setProperty("--q", String(Math.round(rand() * 1400)));
        }
        frag.append(r);
      }
    }
    qr.append(frag);
  }

  // Barcode bars
  const barcode = $("[data-b2-barcode]", index);
  if (barcode) {
    const widths = [2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 4, 1, 2, 1, 1, 3, 2, 1];
    barcode.innerHTML = widths.map((w) => `<i style="--bw:${w}px"></i>`).join("");
  }
}

/* ───────── 4–6. Loops that only run on screen ───────── */

const proof = $(".b2-proof");
if (proof) {
  watchOnScreen(proof);
  // Duplicate the logo row once for a seamless marquee.
  const track = $(".b2-logos__track", proof);
  if (track && !prefersReducedMotion) {
    $$("li", track).forEach((li) => {
      const clone = li.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      $("img", clone)?.setAttribute("alt", "");
      track.append(clone);
    });
  }
}
const final = $(".b2-final");
if (final) watchOnScreen(final);
