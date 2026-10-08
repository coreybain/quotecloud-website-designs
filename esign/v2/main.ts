import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const STEPS = 6;

function setScene(scene: HTMLElement, n: number) {
  for (let k = 1; k <= STEPS; k++) scene.classList.toggle(`is-${k}`, k <= n);
  scene.dataset.step = String(n);
}

/** Apply a state instantly (no transitions), then re-enable motion on the next frames. */
function setSceneInstant(scene: HTMLElement, n: number, step = n) {
  scene.classList.add("no-anim");
  setScene(scene, n);
  scene.dataset.step = String(step);
  void scene.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.remove("no-anim")));
}

function watch(el: Element, cb: (visible: boolean) => void, opts: IntersectionObserverInit = {}) {
  if (!("IntersectionObserver" in window)) return cb(true);
  new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), opts).observe(el);
}

/* ───────── hero ───────── */

function initHero() {
  const hero = document.querySelector<HTMLElement>(".e2-hero");
  if (!hero) return;
  requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("is-in")));
  watch(hero, (v) => hero.classList.toggle("is-away", !v));
}

/* ───────── the story: pinned on large screens, stacked cards on small ───────── */

function initStory() {
  const story = document.querySelector<HTMLElement>("[data-story]");
  if (!story) return;
  const track = story.querySelector<HTMLElement>(".e2-story__track");
  const pin = story.querySelector<HTMLElement>(".e2-story__pin");
  const stage = story.querySelector<HTMLElement>(".e2-stage");
  const scene = story.querySelector<HTMLElement>("[data-scene]");
  const line = story.querySelector<HTMLElement>(".e2-rail__line");
  const steps = [...story.querySelectorAll<HTMLElement>(".e2-step")];
  if (!track || !pin || !stage || !scene) return;

  const pinnedMq = window.matchMedia("(min-width: 901px) and (min-height: 620px)");
  // Step 5 (three people signing) needs the most scroll time.
  const weights = [1, 1, 1, 1, 1.45, 1];
  const total = weights.reduce((a, b) => a + b, 0);

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
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i] / total;
      if (p < acc - 0.0001) return { n: i + 1, p };
    }
    return { n: STEPS, p };
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
      viz.className = "e2-step__viz";
      viz.dataset.n = String(n);
      viz.setAttribute("aria-hidden", "true");
      const clone = scene.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-scene");
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      viz.append(clone);
      li.append(viz);
      // Before it plays: the previous steps are done, no transient overlay showing.
      const rest = () => setSceneInstant(clone, n - 1, 0);
      if (prefersReducedMotion) setSceneInstant(clone, n);
      else rest();
      let playing = false;
      watch(
        viz,
        (v) => {
          viz.classList.toggle("is-paused", !v);
          if (prefersReducedMotion) return;
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

/* ───────── looping vignettes: play while visible, rest, replay ───────── */

function initLoops() {
  const holds: [string, number][] = [
    [".e2-lanes", 7600],
    [".e2-tile--block", 6200],
    [".e2-tile--form", 5600],
  ];
  document.querySelectorAll<HTMLElement>("[data-loop]").forEach((el) => {
    if (prefersReducedMotion) {
      el.classList.add("is-play");
      return;
    }
    const hold = holds.find(([sel]) => el.matches(sel))?.[1] ?? 5000;
    let timer = 0;
    let on = false;
    const cycle = () => {
      el.classList.add("is-play");
      timer = window.setTimeout(() => {
        el.classList.remove("is-play");
        timer = window.setTimeout(cycle, 1000);
      }, hold);
    };
    watch(
      el,
      (v) => {
        if (v === on) return;
        on = v;
        window.clearTimeout(timer);
        if (v) timer = window.setTimeout(cycle, 250);
        else el.classList.remove("is-play");
      },
      { threshold: 0.35 },
    );
  });
}

/* ───────── closing signature ───────── */

function initClose() {
  const panel = document.querySelector<HTMLElement>("[data-close]");
  if (panel) onceVisible(panel, () => panel.classList.add("is-in"), 0.35);
}

initHero();
initStory();
initLoops();
initClose();
