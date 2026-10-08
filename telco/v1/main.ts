import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const usdK = (n: number) => "$" + (n / 1000).toFixed(1) + "k";
const values = new WeakMap<HTMLElement, number>();

/** Eases the number shown in `el` to `to`. */
function tween(el: HTMLElement | null, to: number, format: (n: number) => string = usd, duration = 750) {
  if (!el) return;
  const from = values.get(el) ?? to;
  values.set(el, to);
  if (prefersReducedMotion || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const seed = (el: HTMLElement | null, n: number) => el && values.set(el, n);

function bump(el: Element | null) {
  if (!el || prefersReducedMotion) return;
  el.classList.remove("is-bump");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("is-bump");
}

type Step = [run: () => void, ms: number];
interface Player {
  play(): void;
  pause(): void;
}

/** Runs steps in order, looping back to `loopFrom`. Pausing keeps its place. */
function sequence(steps: Step[], loopFrom = 0, firstDelay = 500): Player {
  let i = 0;
  let timer = 0;
  let playing = false;
  let started = false;
  const tick = () => {
    const [run, ms] = steps[i];
    run();
    i = i + 1 >= steps.length ? loopFrom : i + 1;
    timer = window.setTimeout(tick, ms);
  };
  return {
    play() {
      if (playing) return;
      playing = true;
      timer = window.setTimeout(tick, started ? 120 : firstDelay);
      started = true;
    },
    pause() {
      playing = false;
      window.clearTimeout(timer);
    },
  };
}

/** Plays `player` (and CSS/SMIL loops inside `el`) only while `el` is on screen and the tab is visible. */
function whileVisible(el: HTMLElement, player?: Player, threshold = 0.2) {
  let visible = false;
  const svgs = [...el.querySelectorAll<SVGSVGElement>("svg")];
  const sync = () => {
    const on = visible && !document.hidden;
    el.classList.toggle("is-live", on);
    svgs.forEach((svg) => (on ? svg.unpauseAnimations?.() : svg.pauseAnimations?.()));
    if (player) on ? player.play() : player.pause();
  };
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      sync();
    },
    { threshold },
  ).observe(el);
  document.addEventListener("visibilitychange", sync);
  sync();
}

const setStep = (el: HTMLElement, step: string) => (el.dataset.step = step);

/* ───────── Shared telco pricing (hero + term tile stay consistent) ───────── */

const TERMS = [12, 24, 36] as const;
type Term = (typeof TERMS)[number];
const FACTOR: Record<Term, number> = { 12: 1.1, 24: 1, 36: 0.92 };
const ONCE_OFF: Record<Term, number> = { 12: 6400, 24: 4800, 36: 3200 };
const BASE_ROWS = [1347, 435, 760, 1125, 880];
const rowPrices = (t: Term) => BASE_ROWS.map((b) => Math.round(b * FACTOR[t]));
const monthly = (t: Term) => rowPrices(t).reduce((a, b) => a + b, 0);

/* ───────── Hero: rows land, term cycles and re-prices ───────── */

function initHero() {
  const hv = document.querySelector<HTMLElement>("[data-hero]");
  if (!hv) return;
  requestAnimationFrame(() => hv.classList.add("is-in"));
  if (prefersReducedMotion) return whileVisible(hv);

  const term = hv.querySelector<HTMLElement>("[data-hero-term]")!;
  const rows = [...hv.querySelectorAll<HTMLElement>("[data-mrc]")];
  const mrcEl = hv.querySelector<HTMLElement>("[data-hero-mrc]");
  const nrcEl = hv.querySelector<HTMLElement>("[data-hero-nrc]");
  const nrcRow = hv.querySelector<HTMLElement>("[data-hero-nrc-row]");
  rows.forEach((r, i) => seed(r, BASE_ROWS[i]));
  seed(mrcEl, monthly(24));
  seed(nrcEl, ONCE_OFF[24]);
  seed(nrcRow, ONCE_OFF[24]);

  const show = (t: Term) => () => {
    term.dataset.term = String(t);
    rowPrices(t).forEach((p, i) => tween(rows[i], p));
    tween(mrcEl, monthly(t), usd, 900);
    tween(nrcEl, ONCE_OFF[t], usd, 900);
    tween(nrcRow, ONCE_OFF[t]);
    bump(mrcEl?.closest(".hv__total") ?? null);
  };
  whileVisible(hv, sequence([[() => {}, 2600], [show(36), 3200], [show(12), 3200], [show(24), 3200]], 1, 0), 0.15);
}

/* ───────── Bento scenes ───────── */

function sceneSplit(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".split")!;
  const m = el.querySelector<HTMLElement>("[data-split-m]");
  const o = el.querySelector<HTMLElement>("[data-split-o]");
  const y = el.querySelector<HTMLElement>("[data-split-y]");
  setStep(el, "0");
  return sequence([
    [() => setStep(el, "0"), 1700],
    [
      () => {
        setStep(el, "1");
        seed(m, 0);
        seed(o, 0);
        seed(y, 0);
        [m, o, y].forEach((n) => n && (n.textContent = usd(0)));
        window.setTimeout(() => {
          tween(m, 3667, usd, 1100);
          tween(o, 8400, usd, 1100);
        }, 550);
        window.setTimeout(() => tween(y, 12 * 3667 + 8400, usd, 1300), 1000);
      },
      5200,
    ],
  ]);
}

function sceneTerm(tile: HTMLElement): Player {
  const box = tile.querySelector<HTMLElement>(".termx")!;
  const buttons = [...box.querySelectorAll<HTMLButtonElement>("[data-term-btn]")];
  const mrc = box.querySelector<HTMLElement>("[data-term-mrc]");
  const nrc = box.querySelector<HTMLElement>("[data-term-nrc]");
  const tcv = box.querySelector<HTMLElement>("[data-term-tcv]");
  seed(mrc, monthly(24));
  seed(nrc, ONCE_OFF[24]);
  seed(tcv, monthly(24) * 24 + ONCE_OFF[24]);
  let holdUntil = 0;

  const set = (t: Term) => {
    box.style.setProperty("--k", String(TERMS.indexOf(t)));
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.termBtn === String(t))));
    tween(mrc, monthly(t), usd, 800);
    tween(nrc, ONCE_OFF[t], usd, 800);
    tween(tcv, monthly(t) * t + ONCE_OFF[t], usdK, 800);
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      holdUntil = Date.now() + 9000;
      set(Number(b.dataset.termBtn) as Term);
    }),
  );
  const auto = (t: Term) => () => Date.now() > holdUntil && set(t);
  return sequence([
    [auto(36), 2800],
    [auto(12), 2800],
    [auto(24), 2800],
  ], 0, 1400);
}

function sceneMargin(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".mg")!;
  setStep(el, "0");
  return sequence([
    [() => setStep(el, "0"), 350],
    [() => setStep(el, "in"), 3000],
    [() => setStep(el, "1"), 2800],
  ]);
}

function sceneApprove(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".ap")!;
  const val = el.querySelector<HTMLElement>("[data-ap-val]");
  const pct = (n: number) => Math.round(n) + "%";
  seed(val, 4);
  if (val) val.textContent = "4%";
  setStep(el, "0");
  return sequence([
    [() => (setStep(el, "0"), tween(val, 4, pct, 500)), 1200],
    [() => (setStep(el, "1"), tween(val, 12, pct, 1300)), 1900],
    [() => setStep(el, "2"), 1500],
    [() => setStep(el, "ok"), 3400],
  ]);
}

function sceneDevice(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".dv")!;
  const qty = el.querySelector<HTMLElement>("[data-dv-qty]");
  const total = el.querySelector<HTMLElement>("[data-dv-total]");
  const ghost = el.querySelector<HTMLElement>(".dv__ghost")!;
  const attached = el.querySelector<HTMLElement>(".dv__attached")!;
  const perMonth = (n: number) => usd(n) + "/mo";
  const reset = () => {
    setStep(el, "0");
    seed(qty, 1);
    seed(total, 81);
    if (qty) qty.textContent = "1";
    if (total) total.textContent = perMonth(81);
  };
  reset();
  return sequence([
    [reset, 1200],
    [
      () => {
        const g = ghost.getBoundingClientRect();
        const a = attached.getBoundingClientRect();
        el.style.setProperty("--ghost-y", `${Math.round(a.top - g.top + (a.height - g.height) / 2)}px`);
        setStep(el, "1");
      },
      1600,
    ],
    [
      () => {
        setStep(el, "2");
        tween(qty, 25, (n) => String(Math.round(n)), 1400);
        tween(total, 81 * 25, perMonth, 1400);
      },
      3800,
    ],
  ]);
}

function sceneCollab(tile: HTMLElement): Player {
  const out = tile.querySelector<HTMLElement>("[data-cb-type]")!;
  const text = out.textContent ?? "";
  let typer = 0;
  out.textContent = "";
  const type = () => {
    let n = 0;
    window.clearInterval(typer);
    typer = window.setInterval(() => {
      n += 1;
      out.textContent = text.slice(0, n);
      if (n >= text.length) window.clearInterval(typer);
    }, 55);
  };
  const seq = sequence([
    [type, 5200],
    [() => (window.clearInterval(typer), (out.textContent = "")), 700],
  ], 0, 700);
  return {
    play: seq.play,
    pause() {
      seq.pause();
      window.clearInterval(typer);
    },
  };
}

function sceneNetwork(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".nw")!;
  const items = [...el.querySelectorAll<HTMLElement>(".nw__time li")];
  const stage = (k: number) => () =>
    items.forEach((li, i) => {
      li.classList.toggle("is-on", i < k);
      li.classList.toggle("is-done", i < k - 1);
    });
  setStep(el, "0");
  el.classList.add("is-timed");
  stage(0)();
  return sequence(
    [
      [() => setStep(el, "1"), 1900],
      [stage(1), 700],
      [stage(2), 700],
      [stage(3), 700],
      [stage(4), 700],
      [stage(5), 3200],
      [stage(0), 700],
    ],
    1,
  );
}

function sceneSign(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".sg")!;
  const total = el.querySelector<HTMLElement>("[data-sg-total]");
  seed(total, 4547);
  if (total) total.textContent = usd(4547);
  setStep(el, "0");
  return sequence([
    [() => (setStep(el, "0"), tween(total, 4547, usd, 500)), 1100],
    [() => (setStep(el, "1"), tween(total, 4787), bump(total)), 1200],
    [() => (setStep(el, "2"), tween(total, 4877), bump(total)), 1400],
    [() => setStep(el, "3"), 2100],
    [() => setStep(el, "done"), 3600],
  ]);
}

function sceneLibrary(tile: HTMLElement): Player {
  const el = tile.querySelector<HTMLElement>(".lb")!;
  const pick = el.querySelector<HTMLElement>(".lb__item--pick")!;
  const slot = el.querySelector<HTMLElement>(".lb__slot")!;
  const measure = () => {
    const box = el.getBoundingClientRect();
    const a = pick.getBoundingClientRect();
    const b = slot.getBoundingClientRect();
    el.style.setProperty("--gx0", `${Math.round(a.left - box.left)}px`);
    el.style.setProperty("--gy0", `${Math.round(a.top - box.top)}px`);
    el.style.setProperty("--gx1", `${Math.round(b.left - box.left)}px`);
    el.style.setProperty("--gy1", `${Math.round(b.top - box.top)}px`);
  };
  setStep(el, "0");
  return sequence([
    [() => (setStep(el, "0"), measure()), 900],
    [() => setStep(el, "1"), 700],
    [() => setStep(el, "2"), 1000],
    [() => setStep(el, "done"), 3800],
  ]);
}

function sceneSync(el: HTMLElement): Player {
  setStep(el, "0");
  return sequence([
    [() => setStep(el, "0"), 700],
    [() => setStep(el, "1"), 420],
    [() => setStep(el, "2"), 420],
    [() => setStep(el, "3"), 420],
    [() => setStep(el, "4"), 650],
    [() => setStep(el, "5"), 3400],
  ]);
}

const SCENES: Record<string, (el: HTMLElement) => Player> = {
  split: sceneSplit,
  term: sceneTerm,
  margin: sceneMargin,
  approve: sceneApprove,
  device: sceneDevice,
  collab: sceneCollab,
  network: sceneNetwork,
  sign: sceneSign,
  library: sceneLibrary,
  sync: sceneSync,
};

function initScenes() {
  document.querySelectorAll<HTMLElement>("[data-scene]").forEach((el) => {
    const make = SCENES[el.dataset.scene ?? ""];
    if (!make) return;
    if (prefersReducedMotion) {
      // final states are the CSS defaults; only the term buttons stay interactive
      if (el.dataset.scene === "term") make(el);
      whileVisible(el);
      return;
    }
    whileVisible(el, make(el), 0.3);
  });
  const close = document.querySelector<HTMLElement>(".close__panel");
  if (close) whileVisible(close);
}

/* ───────── Tile spotlight ───────── */

function initSpotlight() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.querySelectorAll<HTMLElement>(".tile").forEach((tile) => {
    tile.addEventListener("pointermove", (e) => {
      const r = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", `${e.clientX - r.left}px`);
      tile.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}

initHero();
initScenes();
initSpotlight();
