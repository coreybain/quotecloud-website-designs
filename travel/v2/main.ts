import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

/** Tracks whether an element is on screen, so loops can pause when it isn't. */
function visibility(el: Element, margin = "0px") {
  const state = { on: false };
  if (!("IntersectionObserver" in window)) {
    state.on = true;
    return state;
  }
  new IntersectionObserver((entries) => entries.forEach((e) => (state.on = e.isIntersecting)), {
    rootMargin: margin,
  }).observe(el);
  return state;
}

/** setTimeout that only counts down while `gate.on` is true and the tab is visible. */
function pausableSleep(gate: { on: boolean }) {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      let left = ms;
      const step = () => {
        if (!gate.on || document.hidden) {
          window.setTimeout(step, 200);
          return;
        }
        const chunk = Math.min(left, 200);
        const t0 = performance.now();
        window.setTimeout(() => {
          left -= performance.now() - t0;
          if (left <= 0) resolve();
          else step();
        }, chunk);
      };
      step();
    });
}

/* ───────── Hero: booking types out, each line lifts into a card ───────── */

function initHero() {
  const hv = document.querySelector<HTMLElement>(".hv");
  if (!hv || prefersReducedMotion) return;

  const lines = [...hv.querySelectorAll<HTMLElement>(".hv-line")];
  const texts = lines.map((l) => l.textContent ?? "");
  const cardFor = (k: string | undefined) => hv.querySelector<HTMLElement>(`.hv-card[data-k="${k}"]`);
  const cards = [...hv.querySelectorAll<HTMLElement>(".hv-card")];
  const gate = visibility(hv, "120px");
  const sleep = pausableSleep(gate);

  hv.classList.add("is-anim");
  lines.forEach((l) => (l.textContent = ""));

  const lift = async (line: HTMLElement, card: HTMLElement) => {
    line.classList.add("is-lifting");
    await sleep(260);
    const s = hv.getBoundingClientRect();
    const a = line.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "hv-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = (line.textContent ?? "").trim();
    hv.append(ghost);
    const from = {
      left: `${a.left - s.left}px`,
      top: `${a.top - s.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      backgroundColor: "rgba(255, 77, 71, 0.22)",
      borderColor: "rgba(255, 77, 71, 0.55)",
      borderRadius: "6px",
      color: "rgba(255, 255, 255, 1)",
    };
    const to = {
      left: `${b.left - s.left}px`,
      top: `${b.top - s.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
      backgroundColor: "rgba(255, 255, 255, 1)",
      borderColor: "rgba(14, 138, 140, 0.45)",
      borderRadius: "12px",
      color: "rgba(255, 255, 255, 0)",
    };
    const flight = ghost.animate([from, { offset: 0.45, color: "rgba(255, 255, 255, 0)" }, to], {
      duration: 720,
      easing: "cubic-bezier(0.65, 0, 0.25, 1)",
      fill: "forwards",
    });
    await flight.finished.catch(() => undefined);
    card.classList.add("is-in");
    line.classList.remove("is-lifting");
    line.classList.add("is-done");
    ghost
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: "forwards" })
      .finished.catch(() => undefined)
      .then(() => ghost.remove());
  };

  const run = async () => {
    await sleep(500);
    for (;;) {
      for (const [i, line] of lines.entries()) {
        const text = texts[i];
        line.classList.add("is-typing");
        for (let c = 1; c <= text.length; c += 2) {
          line.textContent = text.slice(0, c + 1);
          await sleep(16);
        }
        line.textContent = text;
        line.classList.remove("is-typing");
        const card = cardFor(line.dataset.k);
        if (card) await lift(line, card);
        else await sleep(220);
      }
      await sleep(5200);
      hv.classList.add("is-resetting");
      await sleep(600);
      lines.forEach((l) => {
        l.textContent = "";
        l.classList.remove("is-done", "is-lifting");
      });
      cards.forEach((c) => c.classList.remove("is-in"));
      await sleep(60);
      hv.classList.remove("is-resetting");
      await sleep(400);
    }
  };
  run();
}

/* ───────── Centrepiece: one document, eight stages ───────── */

const STAGES = 8;
const BOX_W = 780;
const BOX_H = 700;
const VIEW_H = 610; // visible height of the document viewport (design px)

const reaim = new WeakMap<HTMLElement, number[]>();

function applyStage(box: HTMLElement, n: number) {
  box.dataset.stage = String(n);
  for (let i = 1; i <= STAGES; i++) box.classList.toggle(`s${i}`, i <= n);
  aim(box, n);
  // segment rows grow while the stage transitions; re-aim once the layout settles
  (reaim.get(box) ?? []).forEach((t) => window.clearTimeout(t));
  reaim.set(
    box,
    [700, 1400].map((ms) => window.setTimeout(() => box.dataset.stage === String(n) && aim(box, n), ms)),
  );
}

/** Points the document "camera" at the part of the page that matters for stage n. */
function aim(box: HTMLElement, n: number) {
  const page = box.querySelector<HTMLElement>(".doc__page");
  if (!page) return;
  const el = (sel: string) => page.querySelector<HTMLElement>(sel);
  // offset of a node within the page, independent of intermediate positioned parents
  const yIn = (node: HTMLElement | null) => {
    let y = 0;
    for (let n: HTMLElement | null = node; n && n !== page; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
    return y;
  };
  const topOf = (sel: string, pad = 24) => yIn(el(sel)) - pad;

  let y = 0;
  let s = 1;
  switch (n) {
    case 0:
    case 1:
    case 2:
      y = topOf(".pg-itin");
      break;
    case 4: {
      // keep the last two segments in view, then the library cards
      y = topOf(".pg-segs > li:nth-child(4)", 20);
      break;
    }
    case 5:
      s = 0.56;
      break;
    case 6:
      y = topOf(".pg-price", 24);
      break;
    case 7: {
      const sign = el(".pg-sign");
      y = Math.max(topOf(".pg-price", 24), sign ? yIn(sign) + sign.offsetHeight + 28 - VIEW_H : 0);
      break;
    }
  }
  const max = page.offsetHeight + 22 + 22 - VIEW_H;
  box.style.setProperty("--cam-y", String(Math.max(0, Math.min(y, max))));
  box.style.setProperty("--cam-s", String(s));
}

function initTransformation() {
  const tx = document.querySelector<HTMLElement>(".tx");
  const box = tx?.querySelector<HTMLElement>(".tx-stage .tx-box");
  const fit = tx?.querySelector<HTMLElement>(".tx-stage .tx-fit");
  const stage = tx?.querySelector<HTMLElement>(".tx-stage");
  if (!tx || !box || !fit || !stage) return;

  const steps = [...tx.querySelectorAll<HTMLElement>(".tx-step")];
  const rail = [...tx.querySelectorAll<HTMLAnchorElement>("[data-rail]")];
  const railFill = tx.querySelector<HTMLElement>(".tx-rail__fill");
  const desktop = window.matchMedia("(min-width: 1100px) and (min-height: 640px)");

  /* desktop: sticky stage, scroll picks the active step */
  let current = -1;
  let ticking = false;

  const setActive = (n: number) => {
    if (n === current) return;
    current = n;
    applyStage(box, n);
    steps.forEach((s, i) => s.classList.toggle("is-active", i + 1 === n));
    rail.forEach((a, i) => {
      a.classList.toggle("is-active", i + 1 === n);
      a.classList.toggle("is-past", i + 1 < n);
      if (i + 1 === n) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
  };

  const measure = () => {
    ticking = false;
    if (!desktop.matches) return;
    const mid = window.innerHeight * 0.5;
    let n = 0;
    steps.forEach((s, i) => {
      if (s.getBoundingClientRect().top < mid) n = i + 1;
    });
    const first = steps[0].getBoundingClientRect();
    const last = steps[steps.length - 1].getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (mid - first.top) / (last.top + last.height * 0.5 - first.top)));
    railFill?.style.setProperty("--p", p.toFixed(4));
    setActive(n);
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(measure);
    }
  };

  const fitStage = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight - 32;
    const f = Math.min(w / BOX_W, h / BOX_H, 1.1);
    fit.style.setProperty("--fit", f.toFixed(4));
  };

  /* tablet + mobile: one miniature of the same document per stage card */
  let minisBuilt = false;
  const minis: HTMLElement[] = [];
  const buildMinis = () => {
    if (minisBuilt) return;
    minisBuilt = true;
    steps.forEach((step, i) => {
      const mini = step.querySelector<HTMLElement>(".tx-mini");
      if (!mini) return;
      const clone = box.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      clone.classList.add("no-trans");
      mini.append(clone);
      minis.push(mini);
      const target = i + 1;
      applyStage(clone, prefersReducedMotion ? target : target - 1);
      requestAnimationFrame(() => requestAnimationFrame(() => clone.classList.remove("no-trans")));
      if (!prefersReducedMotion) onceVisible(mini, () => window.setTimeout(() => applyStage(clone, target), 200), 0.45);
    });
    sizeMinis();
  };
  const sizeMinis = () => {
    minis.forEach((mini) => {
      const w = mini.clientWidth;
      if (!w) return;
      // fit the whole stage box inside the card; centre it vertically if the card is taller
      const s = Math.min(w / BOX_W, 0.62);
      mini.style.setProperty("--ms", s.toFixed(4));
      const box2 = mini.querySelector<HTMLElement>(".tx-box");
      if (box2) {
        box2.style.left = `${(w - BOX_W * s) / 2}px`;
        box2.style.top = `${Math.max(0, (mini.clientHeight - BOX_H * s) / 2)}px`;
      }
    });
  };

  const setMode = () => {
    if (desktop.matches) {
      fitStage();
      box.classList.add("no-trans");
      current = -1;
      measure();
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove("no-trans")));
    } else {
      buildMinis();
      sizeMinis();
    }
  };

  setMode();
  desktop.addEventListener("change", setMode);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    if (desktop.matches) {
      fitStage();
      onScroll();
    } else sizeMinis();
  });
}

/* ───────── Integrations: run the data beams only while visible ───────── */

function initBeams() {
  const flow = document.querySelector<HTMLElement>(".ig__flow");
  if (!flow || prefersReducedMotion || !("IntersectionObserver" in window)) return;
  new IntersectionObserver((entries) => entries.forEach((e) => flow.classList.toggle("is-on", e.isIntersecting))).observe(
    flow,
  );
}

initHero();
initTransformation();
initBeams();
