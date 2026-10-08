import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const money = (n: number, sym = "$") =>
  sym + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => Math.round(n) + "%";

const shown = new WeakMap<Element, number>();
const frames = new WeakMap<Element, number>();

/** Eases the number displayed in `el` to `to`. */
function tween(el: Element | null, to: number, fmt: (n: number) => string = money, duration = 700) {
  if (!el) return;
  const from = shown.get(el) ?? to;
  shown.set(el, to);
  cancelAnimationFrame(frames.get(el) ?? 0);
  if (prefersReducedMotion || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) frames.set(el, requestAnimationFrame(step));
  };
  frames.set(el, requestAnimationFrame(step));
}
/** Sets a number instantly. */
function put(el: Element | null, n: number, fmt: (n: number) => string = money) {
  if (!el) return;
  cancelAnimationFrame(frames.get(el) ?? 0);
  shown.set(el, n);
  el.textContent = fmt(n);
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel as string) as T | null;
const $$ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => [...root.querySelectorAll<T>(sel as string)] as T[];

/** Applies changes with transitions disabled (used for invisible resets). */
function snap(stage: HTMLElement, fn: () => void) {
  stage.classList.add("is-snap");
  fn();
  void stage.offsetWidth;
  stage.classList.remove("is-snap");
}

/* ───────── Loop runner: plays a demo while visible, pauses offscreen ───────── */

type Step = [run: () => void, wait: number];
interface Demo {
  /** Puts the demo in its start state (instant). */
  reset?: () => void;
  /** One cycle of the demo; the last step should return to the start state. */
  steps: Step[];
}

class Loop {
  private i = 0;
  private timer = 0;
  private playing = false;
  constructor(private demo: Demo) {}
  play() {
    if (this.playing || !this.demo.steps.length) return;
    this.playing = true;
    this.timer = window.setTimeout(this.next, 350);
  }
  pause() {
    this.playing = false;
    window.clearTimeout(this.timer);
  }
  private next = () => {
    if (!this.playing) return;
    const [run, wait] = this.demo.steps[this.i];
    run();
    this.i = (this.i + 1) % this.demo.steps.length;
    this.timer = window.setTimeout(this.next, wait);
  };
}

/** Fade the stage out, reset invisibly, fade back in. Returns two steps. */
function fadeReset(stage: HTMLElement, reset: () => void): Step[] {
  return [
    [() => stage.classList.add("is-fading"), 450],
    [
      () => {
        snap(stage, reset);
        stage.classList.remove("is-fading");
      },
      700,
    ],
  ];
}

/* ───────── Hero quote: assembles itself once ───────── */

function initHero() {
  const card = document.querySelector<HTMLElement>("[data-hero-quote]");
  if (!card) return;
  const sub = $(card, "[data-hq-sub]");
  const tax = $(card, "[data-hq-tax]");
  const total = $(card, "[data-hq-total]");
  if (prefersReducedMotion) {
    card.classList.add("is-go", "is-ready");
    return;
  }
  put(sub, 0);
  put(tax, 0);
  put(total, 0);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      card.classList.add("is-go");
      window.setTimeout(() => {
        tween(sub, 25100, money, 1300);
        tween(tax, 2510, money, 1300);
        tween(total, 27610, money, 1500);
      }, 380);
      window.setTimeout(() => card.classList.add("is-ready"), 1750);
    }),
  );
}

/* ───────── Bento demos ───────── */

function catalogueDemo(stage: HTMLElement): Demo {
  const query = $(stage, "[data-cat-query]");
  const items = $$(stage, "[data-cat-item]");
  const lines = $$(stage, "[data-cat-line]");
  const total = $(stage, "[data-cat-total]");
  const amounts = [498, 136, 90];
  const word = "Lighting";
  let typer = 0;

  const reset = () => {
    window.clearInterval(typer);
    if (query) query.textContent = "";
    items.forEach((i) => i.classList.remove("is-hot"));
    lines.forEach((l) => l.classList.add("is-out"));
    put(total, 0);
  };
  const type = () => {
    let n = 0;
    window.clearInterval(typer);
    typer = window.setInterval(() => {
      n += 1;
      if (query) query.textContent = word.slice(0, n);
      if (n >= word.length) window.clearInterval(typer);
    }, 85);
  };
  const fly = (k: number) => {
    const from = $(items[k], ".sw");
    const to = $(lines[k], ".sw");
    if (!from || !to) return;
    const s = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = from.cloneNode(true) as HTMLElement;
    ghost.classList.add("cat__fly");
    ghost.style.width = a.width + "px";
    ghost.style.height = a.height + "px";
    stage.append(ghost);
    const scale = b.width / a.width;
    const anim = ghost.animate(
      [
        { transform: `translate(${a.left - s.left}px, ${a.top - s.top}px) scale(1)`, opacity: 1 },
        { transform: `translate(${a.left - s.left + 6}px, ${a.top - s.top - 10}px) scale(1.12)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${b.left - s.left}px, ${b.top - s.top}px) scale(${scale})`, opacity: 1 },
      ],
      { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    anim.onfinish = () => ghost.remove();
  };
  const add = (k: number): Step[] => [
    [() => items[k].classList.add("is-hot"), 420],
    [
      () => {
        fly(k);
        window.setTimeout(() => {
          lines[k].classList.remove("is-out");
          tween(total, amounts.slice(0, k + 1).reduce((x, y) => x + y, 0));
        }, 480);
      },
      760,
    ],
    [() => items[k].classList.remove("is-hot"), 260],
  ];
  return {
    reset,
    steps: [[type, 1100], ...add(0), ...add(1), ...add(2), [() => {}, 2600], ...fadeReset(stage, reset)],
  };
}

function discountDemo(stage: HTMLElement): Demo {
  const rows = $$(stage, "[data-dis-row]");
  const chip = $(stage, "[data-dis-default]");
  const save = $(stage, "[data-dis-save]");
  const total = $(stage, "[data-dis-total]");
  const bases = rows.map((r) => Number(r.dataset.base));
  const sum = bases.reduce((a, b) => a + b, 0);
  const pcts = rows.map(() => 0);

  const apply = (k: number, p: number) => {
    const row = rows[k];
    pcts[k] = p;
    tween($(row, "[data-dis-pct]"), p, pct, 600);
    tween($(row, "[data-dis-line]"), bases[k] * (1 - p / 100), money, 600);
    row.classList.add("is-flash");
    window.setTimeout(() => row.classList.remove("is-flash"), 260);
    const next = bases.reduce((acc, b, i) => acc + b * (1 - pcts[i] / 100), 0);
    tween(total, next, money, 650);
    tween(save, sum - next, money, 650);
  };
  const reset = () => {
    rows.forEach((row, k) => {
      pcts[k] = 0;
      put($(row, "[data-dis-pct]"), 0, pct);
      put($(row, "[data-dis-line]"), bases[k]);
    });
    put(chip, 0, pct);
    put(total, sum);
    put(save, 0);
  };
  return {
    reset,
    steps: [
      [() => tween(chip, 10, pct, 500), 650],
      ...rows.map((_, k): Step => [() => apply(k, 10), 480]),
      [() => {}, 2800],
      [
        () => {
          tween(chip, 0, pct, 500);
          rows.forEach((_, k) => window.setTimeout(() => apply(k, 0), k * 120));
        },
        2000,
      ],
    ],
  };
}

function optionalDemo(stage: HTMLElement): Demo {
  const total = $(stage, "[data-opt-total]");
  const box = $(stage, ".opt__box");
  const cursor = $(stage, ".cursor");
  const place = () => {
    if (!box || !cursor) return;
    const s = stage.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    stage.style.setProperty("--cx", `${b.left - s.left + b.width * 0.55}px`);
    stage.style.setProperty("--cy", `${b.top - s.top + b.height * 0.5}px`);
    stage.style.setProperty("--rx", `${Math.min(s.width - 40, b.left - s.left + 170)}px`);
    stage.style.setProperty("--ry", `${b.top - s.top + 70}px`);
  };
  place();
  window.addEventListener("resize", place, { passive: true });
  stage.classList.add("has-cursor");
  const press = (on: boolean) => {
    cursor?.classList.add("is-press");
    window.setTimeout(() => cursor?.classList.remove("is-press"), 160);
    stage.classList.toggle("is-off", !on);
    tween(total, on ? 6060 : 4860);
  };
  return {
    reset: () => {
      stage.classList.add("is-off");
      cursor?.classList.remove("is-aim");
      put(total, 4860);
    },
    steps: [
      [place, 50],
      [() => cursor?.classList.add("is-aim"), 1000],
      [() => press(true), 2600],
      [() => press(false), 1300],
      [() => cursor?.classList.remove("is-aim"), 1300],
    ],
  };
}

function currencyDemo(stage: HTMLElement): Demo {
  const opts = $$(stage, "[data-cur-opt]");
  const pill = $(stage, "[data-cur-pill]");
  const sym = $(stage, "[data-cur-sym]");
  const totalEl = $(stage, "[data-cur-total]");
  const lineEls = $$(stage, "[data-cur-val]");
  const base = Number(totalEl?.dataset.curBase ?? 0);
  const cur = [
    { s: "$", rate: 1 },
    { s: "€", rate: 0.92 },
    { s: "£", rate: 0.79 },
  ];
  let k = 0;
  const plain = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (next: number, instant = false) => {
    k = next;
    const { s, rate } = cur[k];
    opts.forEach((o, i) => o.classList.toggle("is-on", i === k));
    pill?.style.setProperty("--k", String(k));
    const fmt = (n: number) => money(n, s);
    lineEls.forEach((el) => (instant ? put : tween)(el, Number(el.dataset.curVal) * rate, fmt, 650));
    (instant ? put : tween)(totalEl, base * rate, plain, 750);
    if (!sym) return;
    if (instant || prefersReducedMotion) {
      sym.textContent = s;
      return;
    }
    const out = sym.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-100%)", opacity: 0 }], {
      duration: 220,
      easing: "ease-in",
    });
    out.onfinish = () => {
      sym.textContent = s;
      sym.animate([{ transform: "translateY(100%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], {
        duration: 420,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      });
    };
  };
  return {
    reset: () => set(0, true),
    steps: [
      [() => set(1), 2300],
      [() => set(2), 2300],
      [() => set(0), 2300],
    ],
  };
}

function marginsDemo(stage: HTMLElement): Demo {
  const table = $(stage, "[data-mar-table]");
  const place = () => {
    if (!table) return;
    const cells = $$(table, ".mtable__row--head .m-int");
    if (cells.length < 2) return;
    const t = table.getBoundingClientRect();
    const a = cells[0].getBoundingClientRect();
    const b = cells[1].getBoundingClientRect();
    table.style.setProperty("--fx", `${a.left - t.left - 8}px`);
    table.style.setProperty("--fw", `${b.right - a.left + 16}px`);
  };
  place();
  window.addEventListener("resize", place, { passive: true });
  return {
    reset: () => stage.classList.remove("is-cust"),
    steps: [
      [place, 1500],
      [() => stage.classList.add("is-cust"), 3000],
      [() => stage.classList.remove("is-cust"), 1500],
    ],
  };
}

function approvalsDemo(stage: HTMLElement): Demo {
  const steps = $$(stage, "[data-app-step]");
  const reset = () => {
    stage.classList.add("is-pre");
    steps.forEach((s) => {
      s.classList.add("is-todo");
      s.classList.remove("is-wait");
    });
  };
  const done = (k: number) => {
    steps[k].classList.remove("is-todo", "is-wait");
  };
  return {
    reset,
    steps: [
      [() => stage.classList.remove("is-pre"), 900],
      [() => done(0), 700],
      [() => steps[1].classList.add("is-wait"), 1600],
      [() => done(1), 800],
      [() => done(2), 3000],
      ...fadeReset(stage, reset),
    ],
  };
}

function versionsDemo(stage: HTMLElement): Demo {
  return {
    reset: () => stage.classList.add("is-stacked"),
    steps: [
      [() => stage.classList.remove("is-stacked"), 3400],
      [() => stage.classList.add("is-stacked"), 1700],
    ],
  };
}

function formulaDemo(stage: HTMLElement): Demo {
  const cells = $$(stage, "[data-for-cell]");
  const cost = $(stage, "[data-for-cost]");
  const mk = $(stage, "[data-for-mk]");
  const out = $(stage, "[data-for-out]");
  const name = $(stage, "[data-for-name]");
  const items = [
    { n: "Solar inverter 5kW", c: 480, m: 1.35 },
    { n: "Smart thermostat", c: 180, m: 1.4 },
    { n: "Battery module 10kWh", c: 1250, m: 1.2 },
  ];
  const two = (n: number) => n.toFixed(2);
  const hot = (k: number) => cells.forEach((c, i) => c.classList.toggle("is-hot", i === k));
  const run = (it: (typeof items)[number]): Step[] => [
    [
      () => {
        if (name) name.textContent = it.n;
        hot(0);
        out?.classList.add("is-stale");
        tween(cost, it.c, money, 600);
      },
      750,
    ],
    [
      () => {
        hot(1);
        tween(mk, it.m, two, 500);
      },
      750,
    ],
    [
      () => {
        hot(2);
        out?.classList.remove("is-stale");
        tween(out, it.c * it.m, money, 700);
      },
      1500,
    ],
    [() => hot(-1), 900],
  ];
  return {
    reset: () => {
      put(cost, 480);
      put(mk, 1.35, two);
      put(out, 648);
      out?.classList.remove("is-stale");
    },
    steps: [...run(items[1]), ...run(items[2]), ...run(items[0])],
  };
}

function signDemo(stage: HTMLElement): Demo {
  const reset = () => {
    stage.classList.remove("is-drawing", "is-press");
    stage.classList.add("is-blank", "is-unpaid");
  };
  return {
    reset,
    steps: [
      [
        () => {
          stage.classList.add("is-drawing");
          stage.classList.remove("is-blank");
        },
        2000,
      ],
      [() => stage.classList.add("is-press"), 220],
      [
        () => {
          stage.classList.remove("is-press", "is-unpaid");
        },
        3200,
      ],
      ...fadeReset(stage, reset),
    ],
  };
}

function notifyDemo(stage: HTMLElement): Demo {
  const list = $(stage, "[data-not-list]");
  const items = $$(stage, "[data-not]").sort((a, b) => Number(a.dataset.not) - Number(b.dataset.not));
  if (!list) return { steps: [] };
  list.classList.add("is-js");
  const gap = 68;
  const show = (k: number) => {
    items.forEach((el, i) => {
      const visible = i <= k;
      el.style.setProperty("--o", visible ? "1" : "0");
      el.style.setProperty("--y", visible ? `${(k - i) * gap}px` : "-18px");
      el.style.setProperty("--s", visible ? "1" : "0.96");
    });
    const fresh = items[k];
    if (fresh) {
      fresh.classList.remove("is-ping");
      void fresh.offsetWidth;
      fresh.classList.add("is-ping");
    }
  };
  const reset = () => show(-1);
  return {
    reset,
    steps: [
      [() => show(0), 1400],
      [() => show(1), 1400],
      [() => show(2), 1600],
      [() => show(3), 3200],
      ...fadeReset(stage, reset),
    ],
  };
}

function pipelineDemo(stage: HTMLElement): Demo {
  const fc = $(stage, "[data-vis-fc]");
  const wr = $(stage, "[data-vis-wr]");
  const counts = $$(stage, "[data-vis-n]");
  const accepted = $(stage, ".vis__bars i.is-ok");
  const state = (a: { fc: number; acc: number; viewed: number }) => {
    tween(fc, a.fc, whole, 900);
    tween(wr, (a.acc / 18) * 100, pct, 900);
    tween(counts[1], a.viewed, (n) => String(Math.round(n)), 900);
    tween(counts[2], a.acc, (n) => String(Math.round(n)), 900);
    $$(stage, ".vis__bars i")[1]?.style.setProperty("--v", String(a.viewed / 18));
    accepted?.style.setProperty("--v", String(a.acc / 18));
  };
  const intLabel = (n: number) => String(Math.round(n));
  return {
    reset: () => {
      stage.classList.add("is-empty");
      put(fc, 0, whole);
      put(wr, 0, pct);
      counts.forEach((c) => put(c, 0, intLabel));
    },
    steps: [
      [
        () => {
          stage.classList.remove("is-empty");
          tween(counts[0], 18, intLabel, 1000);
          state({ fc: 184200, acc: 9, viewed: 14 });
        },
        3400,
      ],
      [() => state({ fc: 196400, acc: 10, viewed: 15 }), 3200],
      [() => state({ fc: 184200, acc: 9, viewed: 14 }), 3200],
    ],
  };
}

const demos: Record<string, (stage: HTMLElement) => Demo> = {
  catalogue: catalogueDemo,
  discount: discountDemo,
  optional: optionalDemo,
  currency: currencyDemo,
  margins: marginsDemo,
  approvals: approvalsDemo,
  versions: versionsDemo,
  formula: formulaDemo,
  sign: signDemo,
  notify: notifyDemo,
  pipeline: pipelineDemo,
  orbit: () => ({ steps: [] }),
};

function initBento() {
  const tiles = $$(document, "[data-demo]");
  const loops = new Map<Element, Loop>();

  for (const tile of tiles) {
    // Decorative light sweep along the border on hover.
    const sweep = document.createElement("span");
    sweep.className = "tile__sweep";
    sweep.setAttribute("aria-hidden", "true");
    tile.append(sweep);

    if (prefersReducedMotion) continue;
    const stage = $(tile, ".tile__stage");
    const make = demos[tile.dataset.demo ?? ""];
    if (!stage || !make) continue;
    const demo = make(stage);
    if (demo.reset) snap(stage, demo.reset);
    loops.set(tile, new Loop(demo));
  }
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    tiles.forEach((t) => t.classList.add("is-playing"));
    return;
  }

  const visible = new Set<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const loop = loops.get(e.target);
        if (e.isIntersecting) {
          visible.add(e.target);
          e.target.classList.add("is-playing");
          if (!document.hidden) loop?.play();
        } else {
          visible.delete(e.target);
          e.target.classList.remove("is-playing");
          loop?.pause();
        }
      }
    },
    { threshold: 0.35 },
  );
  tiles.forEach((t) => io.observe(t));
  document.addEventListener("visibilitychange", () => {
    for (const [tile, loop] of loops) {
      if (document.hidden) loop.pause();
      else if (visible.has(tile)) loop.play();
    }
  });
}

initHero();
initBento();
