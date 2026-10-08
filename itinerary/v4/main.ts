import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/* ───────── Route A: PNR line → segment (one-shot) ───────── */

document.querySelectorAll<HTMLElement>("[data-pnr]").forEach((el) => {
  if (prefersReducedMotion) return el.classList.add("is-on");
  onceVisible(el, () => el.classList.add("is-on"), 0.5);
});

/* ───────── Route B: right-click → upload / paste → segments + price table ───────── */

function initImportDemo(root: HTMLElement) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-imp-mode]")];
  const total = root.querySelector<HTMLElement>("[data-imp-total]");
  const TOTAL = 6240;

  const setMode = (mode: string) => {
    root.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.impMode === mode)));
  };
  const setStep = (step: number) => {
    root.dataset.step = String(step);
    root.dataset.stage = step >= 6 ? "3" : step >= 4 ? "2" : step >= 1 ? "1" : "";
  };

  const countTotal = () => {
    if (!total) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      total.textContent = Math.round(TOTAL * (1 - Math.pow(1 - t, 3))).toLocaleString("en-US");
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (prefersReducedMotion) {
    setStep(9);
    root.dataset.stage = "3";
    buttons.forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.impMode ?? "upload")),
    );
    return;
  }

  // [step, hold ms]
  const script: [number, number][] = [
    [0, 700],
    [1, 900],
    [2, 750],
    [3, 750],
    [4, 700],
    [5, 1300],
    [6, 800],
    [7, 3600],
  ];

  let run = 0; // bumps to cancel an in-flight sequence
  let visible = false;
  let playing = false;

  const play = async (mode?: string) => {
    const id = ++run;
    playing = true;
    if (mode) setMode(mode);
    while (id === run) {
      for (const [step, hold] of script) {
        if (id !== run) return;
        // pause while offscreen
        while (!visible) {
          await wait(250);
          if (id !== run) return;
        }
        setStep(step);
        if (step === 7) countTotal();
        await wait(hold);
      }
      if (id !== run) return;
      setMode(root.dataset.mode === "upload" ? "paste" : "upload");
    }
  };

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      visible = true;
      play(b.dataset.impMode ?? "upload");
    }),
  );

  new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !playing) play();
    },
    { threshold: 0.35 },
  ).observe(root);
}

document.querySelectorAll<HTMLElement>("[data-imp]").forEach(initImportDemo);

/* ───────── TravelDocs: the cover folds and docks into the phone ───────── */

function initFold(root: HTMLElement) {
  const typed = [...root.querySelectorAll<HTMLElement>("[data-type]")];
  if (prefersReducedMotion) {
    root.classList.add("is-docked", "is-done");
    return;
  }

  const words = typed.map((el) => el.textContent ?? "");
  typed.forEach((el) => (el.textContent = ""));
  root.classList.add("is-armed");

  const type = async () => {
    for (const [i, el] of typed.entries()) {
      el.classList.add("is-typing");
      for (const ch of words[i]) {
        el.textContent += ch;
        await wait(85);
      }
      el.classList.remove("is-typing");
      await wait(200);
    }
  };

  onceVisible(
    root,
    async () => {
      await wait(450);
      root.classList.add("is-folded");
      await wait(900);
      root.classList.add("is-docked");
      await wait(950);
      root.classList.add("is-done");
      type();
    },
    0.45,
  );
}

document.querySelectorAll<HTMLElement>("[data-fold]").forEach(initFold);

/* ───────── Sticky mobile CTA: after the hero, hidden near the closing CTA ───────── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>("[data-sticky]");
  const hero = document.querySelector(".hero__ctas");
  const closing = document.querySelector(".closing");
  const footer = document.querySelector(".qc-footer");
  if (!bar || !hero) return;

  let pastHero = false;
  let nearEnd = false;
  const update = () => bar.classList.toggle("is-on", pastHero && !nearEnd);

  new IntersectionObserver(([entry]) => {
    pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    update();
  }).observe(hero);

  const ends = new Set<Element>();
  const endIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? ends.add(e.target) : ends.delete(e.target)));
    nearEnd = ends.size > 0;
    update();
  });
  if (closing) endIo.observe(closing);
  if (footer) endIo.observe(footer);
}

initSticky();
