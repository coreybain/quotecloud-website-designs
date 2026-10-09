import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const LAST = 7;

/** Toggles `is-paused` while `el` is off screen so CSS loops stop. */
function pauseOffscreen(el: Element) {
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver((entries) =>
    entries.forEach((e) => el.classList.toggle("is-paused", !e.isIntersecting)),
  ).observe(el);
}

/* ───────── The document window: one source, cloned everywhere ───────── */

const source = $("[data-win]");

/** Steps: 0 plain · 1 design (canvas) · 2 grid · 3 numbers · 4 plans · 5 media · 6 form + comment · 7 signed. */
function setStep(win: HTMLElement, step: number) {
  win.dataset.step = String(step);
  win.classList.toggle("is-plain", step === 0);
  const doc = $(".bp-doc", win);
  if (!doc) return;
  doc.dataset.step = String(step);
  doc.dataset.mode = step <= 1 ? "canvas" : "grid";
  $$("[data-at]", doc).forEach((el) => el.classList.toggle("is-off", step < Number(el.dataset.at)));
}

function cloneWin(step: number) {
  if (!source) return null;
  const win = source.cloneNode(true) as HTMLElement;
  win.classList.remove("bp-win--rich");
  win.removeAttribute("data-win");
  setStep(win, step);
  return win;
}

/** Scrolls the page inside a window (transform only) so `sec` sits near the top of the view. */
function focusSection(win: HTMLElement, sec: string, ratio = 0.06) {
  const view = $(".bp-win__view", win);
  const doc = $(".bp-doc", win);
  const target = $(`[data-sec="${sec}"]`, win);
  if (!view || !doc || !target) return;
  const max = Math.max(0, doc.offsetHeight + 24 - view.clientHeight);
  const y = clamp(target.offsetTop - view.clientHeight * ratio, 0, max);
  doc.style.setProperty("--y", `${-y}px`);
}

/* ───────── Hero: plain page vs. the same page in QuoteCloud ───────── */

function initCompare() {
  const box = $("[data-compare]");
  if (!box || !source) return;
  const plain = cloneWin(0);
  if (!plain) return;
  plain.classList.add("bp-win--plain");
  box.append(plain);

  const knob = document.createElement("button");
  knob.type = "button";
  knob.className = "bp-compare__knob";
  knob.setAttribute("role", "slider");
  knob.setAttribute("aria-label", "Compare a plain word-processor page with the same document in QuoteCloud");
  knob.setAttribute("aria-valuemin", "0");
  knob.setAttribute("aria-valuemax", "100");
  knob.innerHTML = '<span aria-hidden="true"></span>';
  box.append(knob);

  let x = 100;
  let touched = false;
  const set = (v: number) => {
    x = clamp(v, 0, 100);
    box.style.setProperty("--x", `${x}%`);
    knob.setAttribute("aria-valuenow", String(Math.round(x)));
    knob.setAttribute("aria-valuetext", `${Math.round(100 - x)}% QuoteCloud`);
  };
  set(100);
  box.classList.add("is-ready");

  const REST = 38;
  if (prefersReducedMotion) set(REST);
  else {
    window.setTimeout(() => {
      if (touched) return;
      const start = performance.now();
      const from = x;
      const dur = 1700;
      const tick = (now: number) => {
        if (touched) return;
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        set(from + (REST - from) * e);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 900);
  }

  const fromPointer = (e: PointerEvent) => {
    const r = box.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  knob.addEventListener("pointerdown", (e) => {
    touched = true;
    knob.setPointerCapture(e.pointerId);
    box.classList.add("is-dragging");
    fromPointer(e);
  });
  knob.addEventListener("pointermove", (e) => {
    if (knob.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  const end = (e: PointerEvent) => {
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
    box.classList.remove("is-dragging");
  };
  knob.addEventListener("pointerup", end);
  knob.addEventListener("pointercancel", end);
  knob.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 20 : 5;
    const keys: Record<string, number> = { ArrowLeft: x - step, ArrowDown: x - step, ArrowRight: x + step, ArrowUp: x + step, Home: 0, End: 100 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    touched = true;
    set(keys[e.key]);
  });

  pauseOffscreen(box);
}

/* ───────── Pinned story (desktop) and step cards (≤900px / reduced motion) ───────── */

const STEP_FOCUS = ["cover", "cover", "cover", "fin", "plan", "media", "ok", "ok"];
const stackedQuery = window.matchMedia("(max-width: 900px), (prefers-reduced-motion: reduce)");

function initStory() {
  const track = $("[data-story]");
  const stage = $("[data-stage]");
  const ledger = $("[data-ledger]");
  if (!track || !stage || !ledger || !source) return;

  let stageWin: HTMLElement | null = null;
  let current = -1;
  let counted = false;
  const rows = $$<HTMLTableRowElement>("tr[data-at]", ledger);

  const countTotal = (win: HTMLElement) => {
    const el = $("[data-total]", win);
    if (!el || counted || prefersReducedMotion) return;
    counted = true;
    const to = 48180;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1300);
      el.textContent = `$${Math.round(to * (1 - Math.pow(1 - t, 4))).toLocaleString("en-US")}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const go = (step: number) => {
    if (step === current || !stageWin) return;
    current = step;
    setStep(stageWin, step);
    track.dataset.step = String(step);
    track.style.setProperty("--p", String(step / LAST));
    rows.forEach((row) => {
      const at = Number(row.dataset.at);
      row.classList.toggle("is-done", step >= at);
      row.classList.toggle("is-active", at === step || (step === 2 && at === 1) || (step === 7 && at === 7));
    });
    const doc = $(".bp-doc", stageWin);
    $$(".bp-sec", doc ?? stageWin).forEach((s) => s.classList.toggle("is-active", s.dataset.sec === STEP_FOCUS[step] && step > 0));
    focusSection(stageWin, STEP_FOCUS[step], step >= 3 ? 0.08 : 0);
    if (step >= 3) countTotal(stageWin);
  };

  const buildStage = () => {
    if (stageWin) return;
    stageWin = cloneWin(0);
    if (!stageWin) return;
    stage.append(stageWin);
    pauseOffscreen(stageWin);
    go(0);
    new ResizeObserver(() => stageWin && focusSection(stageWin, STEP_FOCUS[Math.max(0, current)], current >= 3 ? 0.08 : 0)).observe(stage);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) go(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    $$("[data-step]", $(".bp-story__markers", track) ?? track).forEach((m) => io.observe(m));
  };

  let cardsBuilt = false;
  const buildCards = () => {
    if (cardsBuilt) return;
    cardsBuilt = true;
    $$("[data-slot]", ledger).forEach((slot) => {
      const to = Number(slot.dataset.slot);
      const from = Number(slot.dataset.from);
      const animate = !prefersReducedMotion && to !== from;
      const win = cloneWin(animate ? from : to);
      if (!win) return;
      win.classList.add("bp-win--card");
      slot.append(win);
      const sec = slot.dataset.sec ?? "cover";
      const fit = () => {
        const view = $(".bp-win__view", win);
        const target = $(`[data-sec="${sec}"]`, win);
        if (!view || !target) return;
        view.style.height = `${target.offsetHeight + 28}px`;
        focusSection(win, sec, 0);
        const doc = $(".bp-doc", win);
        doc?.style.setProperty("--y", `${-(target.offsetTop - 14)}px`);
      };
      fit();
      new ResizeObserver(fit).observe(slot);
      pauseOffscreen(win);
      if (animate) onceVisible(slot, () => window.setTimeout(() => setStep(win, to), 250), 0.45);
    });
    // In stacked mode every ledger row is shown in its final, filled state.
    rows.forEach((r) => r.classList.add("is-done"));
  };

  const apply = () => (stackedQuery.matches ? buildCards() : buildStage());
  apply();
  stackedQuery.addEventListener("change", apply);
}

/* ───────── Business bento + closing loops pause off screen ───────── */

$$("[data-biz], [data-close]").forEach(pauseOffscreen);

/* ───────── Toolkit index: reveal names in sequence ───────── */

const kit = $("[data-kit]");
if (kit) {
  $$("li", kit).forEach((li, i) => li.style.setProperty("--i", String(i)));
  if (prefersReducedMotion) kit.classList.add("is-in");
  else onceVisible(kit, () => kit.classList.add("is-in"), 0.2);
}

initCompare();
initStory();
