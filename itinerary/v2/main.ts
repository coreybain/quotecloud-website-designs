import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

/** Tracks whether an element is on screen; optionally toggles `is-on` so CSS loops can pause offscreen. */
function visibility(el: Element, toggleClass = false) {
  const state = { on: false };
  if (!("IntersectionObserver" in window)) {
    state.on = true;
    if (toggleClass) el.classList.add("is-on");
    return state;
  }
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      state.on = e.isIntersecting;
      if (toggleClass) el.classList.toggle("is-on", e.isIntersecting);
    }
  }).observe(el);
  return state;
}

/** A sleep that only counts down while `gate.on` is true and the tab is visible. */
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

/* ───────── Hero: drag to compare ───────── */

function initCompare() {
  const cmp = document.querySelector<HTMLElement>("[data-cmp]");
  const handle = cmp?.querySelector<HTMLElement>("[data-cmp-handle]");
  if (!cmp || !handle) return;

  let pos = 50;
  let touched = false;
  let dragging = false;
  let startX = 0;

  const set = (value: number, glide = false) => {
    pos = Math.max(0, Math.min(100, value));
    cmp.classList.toggle("is-gliding", glide);
    cmp.style.setProperty("--pos", `${pos.toFixed(2)}%`);
    const polished = Math.round(100 - pos);
    handle.setAttribute("aria-valuenow", String(Math.round(pos)));
    handle.setAttribute(
      "aria-valuetext",
      polished >= 98 ? "Fully polished" : polished <= 2 ? "Fully plain" : `${polished}% polished`,
    );
  };
  const fromX = (clientX: number) => {
    const r = cmp.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };

  cmp.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    touched = true;
    dragging = true;
    startX = e.clientX;
    cmp.setPointerCapture(e.pointerId);
    cmp.classList.add("is-dragging");
    // Mouse and pen jump straight to the click; touch waits for a horizontal move so taps don't jolt.
    if (e.pointerType !== "touch") set(fromX(e.clientX), true);
  });
  cmp.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (e.pointerType === "touch" && Math.abs(e.clientX - startX) < 4) return;
    set(fromX(e.clientX));
  });
  const end = () => {
    dragging = false;
    cmp.classList.remove("is-dragging");
  };
  cmp.addEventListener("pointerup", end);
  cmp.addEventListener("pointercancel", end);

  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 5;
    const map: Record<string, number> = {
      ArrowLeft: pos - step,
      ArrowDown: pos - step,
      ArrowRight: pos + step,
      ArrowUp: pos + step,
      PageDown: pos - 20,
      PageUp: pos + 20,
      Home: 0,
      End: 100,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    touched = true;
    set(map[e.key], true);
  });

  if (prefersReducedMotion) {
    set(10);
    return;
  }

  // Auto demo: a nudge each way, settling mostly on the polished side.
  set(50);
  const beats: [number, number][] = [
    [700, 82],
    [1000, 16],
    [1000, 34],
  ];
  let t = 0;
  for (const [delay, value] of beats) {
    t += delay;
    window.setTimeout(() => {
      if (!touched) set(value, true);
    }, t);
  }
  window.setTimeout(() => {
    if (!dragging) cmp.classList.remove("is-gliding");
  }, t + 1000);
}

/* ───────── Import: right-click → PDF or paste → segments + price table ───────── */

function initEditor() {
  const ed = document.querySelector<HTMLElement>("[data-ed]");
  if (!ed || prefersReducedMotion) return; // without motion it stays on the finished state
  const cursor = ed.querySelector<SVGElement>(".ed__cursor");
  const gate = visibility(ed);
  const sleep = pausableSleep(gate);
  const click = () => {
    cursor?.classList.remove("is-click");
    void cursor?.getBoundingClientRect();
    cursor?.classList.add("is-click");
  };
  let mode: "upload" | "paste" = "upload";

  const run = async () => {
    for (;;) {
      ed.dataset.mode = mode;
      ed.dataset.step = "idle";
      await sleep(1000);
      ed.dataset.step = "rclick";
      await sleep(850);
      click();
      ed.dataset.step = "menu";
      await sleep(800);
      ed.dataset.step = "pick";
      await sleep(900);
      click();
      await sleep(250);
      ed.dataset.step = "source";
      await sleep(2000);
      ed.dataset.step = "segs";
      await sleep(2000);
      ed.dataset.step = "done";
      await sleep(4200);
      mode = mode === "upload" ? "paste" : "upload";
    }
  };
  onceVisible(ed, () => void run(), 0.35);
}

/* ───────── Preview: device toggle + gentle document scroll ───────── */

function initPreview() {
  const pv = document.querySelector<HTMLElement>("[data-pv]");
  if (!pv) return;
  const frame = pv.querySelector<HTMLElement>(".pv__frame");
  const scroller = pv.querySelector<HTMLElement>(".pv__scroll");
  const buttons = [...pv.querySelectorAll<HTMLButtonElement>("[data-dev]")];

  const measure = () => {
    if (!frame || !scroller) return;
    const distance = Math.max(0, scroller.scrollHeight - frame.clientHeight);
    pv.style.setProperty("--pv-scroll", `${-distance}px`);
  };
  if (frame && scroller && "ResizeObserver" in window) {
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(scroller);
  }
  measure();

  for (const button of buttons) {
    button.addEventListener("click", () => {
      pv.dataset.device = button.dataset.dev;
      for (const b of buttons) b.setAttribute("aria-pressed", String(b === button));
    });
  }

  if (!prefersReducedMotion) visibility(pv, true);
}

/* ───────── TravelDocs: sign in with surname + booking ref, then the trip ───────── */

function initTravelDocs() {
  const stage = document.querySelector<HTMLElement>("[data-td]");
  if (!stage || prefersReducedMotion) return;
  const fields = [...stage.querySelectorAll<HTMLElement>("[data-type]")];
  const gate = visibility(stage);
  const sleep = pausableSleep(gate);

  const type = async (el: HTMLElement) => {
    const text = el.dataset.type ?? "";
    el.classList.add("is-typing");
    for (let i = 1; i <= text.length; i++) {
      el.textContent = text.slice(0, i);
      await sleep(95);
    }
    await sleep(250);
    el.classList.remove("is-typing");
  };

  const run = async () => {
    for (;;) {
      for (const f of fields) f.textContent = "";
      stage.dataset.screen = "signin";
      await sleep(800);
      for (const f of fields) await type(f);
      await sleep(350);
      stage.classList.add("is-pressed");
      await sleep(220);
      stage.classList.remove("is-pressed");
      stage.dataset.screen = "trip";
      await sleep(5600);
    }
  };
  onceVisible(stage, () => void run(), 0.4);
}

/* ───────── Currency converter ───────── */

function initFx() {
  const fx = document.querySelector<HTMLElement>("[data-fx]");
  const from = fx?.querySelector<HTMLElement>("[data-fx-from]");
  const to = fx?.querySelector<HTMLElement>("[data-fx-to]");
  if (!fx || !from || !to || prefersReducedMotion) return;
  const rate = 10500; // sample IDR per AUD, for the illustration only
  const amounts = [250000, 85000, 1200000, 40000];
  const gate = visibility(fx);
  const sleep = pausableSleep(gate);
  const fmt = (n: number, d = 0) => n.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });

  const tween = (a: number, b: number) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / 700);
        const e = 1 - Math.pow(1 - k, 3);
        const v = a + (b - a) * e;
        from.textContent = fmt(Math.round(v / 1000) * 1000);
        to.textContent = fmt(v / rate, 2);
        if (k < 1) requestAnimationFrame(tick);
        else {
          from.textContent = fmt(b);
          to.textContent = fmt(b / rate, 2);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });

  const run = async () => {
    let i = 0;
    for (;;) {
      await sleep(2600);
      const a = amounts[i % amounts.length];
      const b = amounts[(i + 1) % amounts.length];
      await tween(a, b);
      i++;
    }
  };
  onceVisible(fx, () => void run(), 0.5);
}

/* ───────── Integration pipe: only animate on screen ───────── */

function initLoops() {
  document.querySelectorAll(".route--gds").forEach((el) => visibility(el, true));
}

/* ───────── Sticky mobile CTA ───────── */

function initSticky() {
  const sticky = document.querySelector<HTMLElement>("[data-sticky]");
  const hero = document.querySelector(".hero");
  const ends = [document.querySelector(".close"), document.querySelector(".qc-footer")].filter(
    (el): el is Element => !!el,
  );
  if (!sticky || !hero || !("IntersectionObserver" in window)) return;
  sticky.hidden = false;
  let pastHero = false;
  const nearEnd = new Set<Element>();
  const update = () => {
    const shown = pastHero && nearEnd.size === 0;
    sticky.classList.toggle("is-shown", shown);
    sticky.toggleAttribute("inert", !shown);
  };
  new IntersectionObserver((entries) => {
    for (const e of entries) pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
    update();
  }).observe(hero);
  const endIo = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) nearEnd.add(e.target);
      else nearEnd.delete(e.target);
    }
    update();
  });
  ends.forEach((el) => endIo.observe(el));
  update();
}

initCompare();
initEditor();
initPreview();
initTravelDocs();
initFx();
initLoops();
initSticky();
