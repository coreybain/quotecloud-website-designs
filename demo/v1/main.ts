import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const STEPS = 5;

function setScene(scene: HTMLElement, n: number) {
  for (let k = 1; k <= STEPS; k++) scene.classList.toggle(`is-${k}`, k <= n);
  scene.dataset.step = String(n);
}

/** Apply a state instantly (no transitions), then re-enable motion on the next frames. */
function setSceneInstant(scene: HTMLElement, n: number) {
  scene.classList.add("no-anim");
  setScene(scene, n);
  void scene.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.remove("no-anim")));
}

function watch(el: Element, cb: (visible: boolean) => void, opts: IntersectionObserverInit = {}) {
  if (!("IntersectionObserver" in window)) return cb(true);
  new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), opts).observe(el);
}

/* ───────── booking: Cal.com inline embed, initialised when the frame nears the viewport ───────── */

type CalApi = ((...args: unknown[]) => void) & { q?: unknown[][] };
type CalFn = CalApi & { loaded?: boolean; ns: Record<string, CalApi> };
declare global {
  interface Window {
    Cal?: CalFn;
  }
}

const CAL_NS = "quotecloud-demo";
const CAL_SRC = "https://app.cal.com/embed/embed.js";

/** Cal.com's official loader snippet (queues calls until embed.js arrives). */
function calLoader(onError: () => void): CalFn {
  const w = window;
  if (!w.Cal) {
    const push = (a: CalApi, args: unknown[]) => (a.q ??= []).push(args);
    const cal = function (...args: unknown[]) {
      const c = w.Cal as CalFn;
      if (!c.loaded) {
        c.ns = {};
        c.q ??= [];
        const s = document.createElement("script");
        s.src = CAL_SRC;
        s.async = true;
        s.addEventListener("error", onError);
        document.head.appendChild(s);
        c.loaded = true;
      }
      if (args[0] === "init") {
        const api: CalApi = (...a: unknown[]) => push(api, a);
        const namespace = args[1];
        if (typeof namespace === "string") {
          c.ns[namespace] ??= api;
          push(c.ns[namespace], args);
          push(c, ["initNamespace", namespace]);
        } else push(c, args);
        return;
      }
      push(c, args);
    } as CalFn;
    w.Cal = cal;
  }
  return w.Cal;
}

function initBooking() {
  const frame = document.querySelector<HTMLElement>("[data-cal-frame]");
  const host = document.querySelector<HTMLElement>("[data-cal-host]");
  if (!frame || !host) return;
  frame.classList.add("is-loading");

  let started = false;
  let ready = false;
  const fail = () => {
    if (ready) return;
    frame.classList.remove("is-loading");
    frame.classList.add("is-failed");
  };
  const done = () => {
    if (ready) return;
    ready = true;
    frame.classList.remove("is-loading", "is-failed");
    frame.classList.add("is-ready");
  };

  const start = () => {
    if (started) return;
    started = true;
    const Cal = calLoader(fail);
    Cal("init", CAL_NS, { origin: "https://app.cal.com" });
    const ns = Cal.ns[CAL_NS];
    ns("inline", {
      elementOrSelector: "#d1-cal",
      config: { layout: "month_view", theme: "light" },
      calLink: "quotecloud/quotecloud-demo",
    });
    ns("ui", {
      hideEventTypeDetails: true,
      layout: "month_view",
      theme: "light",
      cssVarsPerTheme: { light: { "cal-brand": "#242424" } },
    });
    ns("on", { action: "linkReady", callback: done });
    ns("on", { action: "linkFailed", callback: fail });
    // Slow network or blocked third-party script: offer the hosted booking page instead of a blank frame.
    window.setTimeout(() => {
      if (!ready && host.querySelector("iframe")) done();
      else if (!ready) fail();
    }, 15000);
  };

  // The calendar sits at (or just below) the fold: start as soon as it's near, or when the browser is idle.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(frame);
  } else start();
}

/* ───────── the story: pinned on large screens, stacked cards on small ───────── */

function initStory() {
  const story = document.querySelector<HTMLElement>("[data-story]");
  if (!story) return;
  const track = story.querySelector<HTMLElement>(".d1-story__track");
  const pin = story.querySelector<HTMLElement>(".d1-story__pin");
  const stage = story.querySelector<HTMLElement>(".d1-stage");
  const scene = story.querySelector<HTMLElement>("[data-scene]");
  const line = story.querySelector<HTMLElement>(".d1-rail__line");
  const steps = [...story.querySelectorAll<HTMLElement>(".d1-step")];
  if (!track || !pin || !stage || !scene) return;

  const pinnedMq = window.matchMedia("(min-width: 901px) and (min-height: 620px)");
  let current = -1;
  let raf = 0;

  const markRail = (n: number) => {
    steps.forEach((li, i) => {
      li.classList.toggle("is-active", i + 1 === n || (n === 0 && i === 0));
      li.classList.toggle("is-done", i + 1 < n);
      if (i + 1 === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  };

  const stepFor = (): { n: number; p: number } => {
    const r = track.getBoundingClientRect();
    const headerH = parseFloat(getComputedStyle(pin).top) || 64;
    const run = Math.max(1, r.height - pin.offsetHeight);
    const p = Math.min(1, Math.max(0, (headerH - r.top) / run));
    // Nothing has "landed" until the stage is well into view.
    if (r.top > window.innerHeight * 0.55) return { n: 0, p: 0 };
    return { n: Math.min(STEPS, Math.floor(p * STEPS) + 1), p };
  };

  const update = (instant = false) => {
    raf = 0;
    if (!pinnedMq.matches) return;
    const { n, p } = stepFor();
    line?.style.setProperty("--p", p.toFixed(4));
    if (n === current) return;
    if (instant || prefersReducedMotion) setSceneInstant(scene, n);
    else setScene(scene, n);
    current = n;
    markRail(n);
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(() => update());
  };

  /* stacked mode: each step card gets its own cropped copy of the scene */
  let built = false;
  const buildCards = () => {
    if (built) return;
    built = true;
    steps.forEach((li, i) => {
      const n = i + 1;
      const viz = document.createElement("div");
      viz.className = "d1-step__viz";
      viz.dataset.n = String(n);
      viz.setAttribute("aria-hidden", "true");
      const clone = scene.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-scene");
      viz.append(clone);
      li.append(viz);
      const rest = () => setSceneInstant(clone, n - 1);
      if (prefersReducedMotion) {
        setSceneInstant(clone, n);
        return;
      }
      rest();
      let playing = false;
      watch(
        viz,
        (v) => {
          if (v && !playing) {
            playing = true;
            setScene(clone, n);
          } else if (!v && playing) {
            playing = false;
            rest();
          }
        },
        { threshold: 0.45 },
      );
    });
  };

  const applyMode = () => {
    if (pinnedMq.matches) {
      current = -1;
      update(true);
    } else {
      buildCards();
      steps.forEach((li) => {
        li.classList.remove("is-active", "is-done");
        li.removeAttribute("aria-current");
      });
      setSceneInstant(scene, STEPS);
    }
  };

  applyMode();
  pinnedMq.addEventListener("change", applyMode);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  watch(stage, (v) => stage.classList.toggle("is-paused", !v));
}

/* ───────── industry vignettes: play once when they come into view ───────── */

function initVignettes() {
  document.querySelectorAll<HTMLElement>("[data-play]").forEach((el) => {
    if (prefersReducedMotion) {
      el.classList.add("is-play");
      return;
    }
    onceVisible(el, () => el.classList.add("is-play"), 0.5);
  });
}

/* ───────── closing panel ───────── */

function initClose() {
  const panel = document.querySelector<HTMLElement>("[data-close]");
  if (panel) onceVisible(panel, () => panel.classList.add("is-in"), 0.35);
}

initBooking();
initStory();
initVignettes();
initClose();
