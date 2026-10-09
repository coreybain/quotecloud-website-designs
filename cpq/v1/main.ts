import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const isStacked = () => window.matchMedia("(max-width: 760px)").matches;
const canHover = window.matchMedia("(hover: hover)").matches;

const shown = new WeakMap<Element, number>();
const frames = new WeakMap<Element, number>();

/** Rolls the number shown in `el` to `to`. */
function tween(el: Element | null, to: number, fmt: (n: number) => string = money, duration = 650) {
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
function setNum(el: Element | null, n: number, fmt: (n: number) => string = money) {
  if (!el) return;
  cancelAnimationFrame(frames.get(el) ?? 0);
  shown.set(el, n);
  el.textContent = fmt(n);
}

/** Toggles `is-visible` on an element and reports changes. */
function watch(el: Element, cb: (visible: boolean) => void, threshold = 0.2) {
  if (!("IntersectionObserver" in window)) return cb(true);
  new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), { threshold }).observe(el);
}

/** Orthogonal path through `pts` with rounded corners. */
function elbow(pts: [number, number][], r = 12) {
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${f(cx - ((cx - px) / l1) * rr)},${f(cy - ((cy - py) / l1) * rr)}`;
    d += ` Q${f(cx)},${f(cy)} ${f(cx + ((nx - cx) / l2) * rr)},${f(cy + ((ny - cy) / l2) * rr)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${f(lx)},${f(ly)}`;
}

/* ───────── Wire: a dashed trace with a lit layer and a travelling pulse ───────── */

class Wire {
  readonly g: SVGGElement;
  private base: SVGPathElement;
  private lit: SVGPathElement;
  private pulse: SVGPathElement;
  private ports: SVGCircleElement[];
  private len = 0;
  private isLit = false;
  private seg = 26;

  constructor(svg: SVGSVGElement, withPorts = true) {
    this.g = document.createElementNS(SVG_NS, "g");
    this.g.setAttribute("class", "wire");
    const mk = (cls: string) => {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("class", cls);
      this.g.append(p);
      return p;
    };
    this.base = mk("wire__base");
    this.lit = mk("wire__lit");
    this.pulse = mk("wire__pulse");
    this.ports = withPorts
      ? [0, 1].map(() => {
          const c = document.createElementNS(SVG_NS, "circle");
          c.setAttribute("class", "wire__port");
          c.setAttribute("r", "3.5");
          this.g.append(c);
          return c;
        })
      : [];
    svg.append(this.g);
  }

  set(pts: [number, number][]) {
    const d = elbow(pts);
    for (const p of [this.base, this.lit, this.pulse]) p.setAttribute("d", d);
    this.len = this.base.getTotalLength();
    this.lit.style.strokeDasharray = `${this.len}`;
    this.lit.style.strokeDashoffset = this.isLit ? "0" : `${this.len}`;
    this.pulse.style.strokeDasharray = `${this.seg} ${this.len + this.seg}`;
    this.pulse.style.strokeDashoffset = `${this.seg}`;
    const ends = [pts[0], pts[pts.length - 1]];
    this.ports.forEach((c, i) => {
      c.setAttribute("cx", String(ends[i][0]));
      c.setAttribute("cy", String(ends[i][1]));
    });
  }

  /** Draws the lit trace with the pulse at its head. */
  async light(duration = 650) {
    if (this.isLit) return this.travel(duration);
    this.isLit = true;
    this.g.classList.add("is-lit");
    if (prefersReducedMotion) {
      this.lit.style.strokeDashoffset = "0";
      return;
    }
    const ease = "cubic-bezier(.45,0,.25,1)";
    const a = this.lit.animate([{ strokeDashoffset: `${this.len}px` }, { strokeDashoffset: "0px" }], { duration, easing: ease });
    void this.travel(duration);
    await a.finished.catch(() => {});
    this.lit.style.strokeDashoffset = "0";
  }

  /** Sends one pulse along the trace. */
  async travel(duration = 800, reverse = false) {
    if (prefersReducedMotion) return;
    const from = `${this.seg}px`;
    const to = `${-this.len}px`;
    const a = this.pulse.animate([{ strokeDashoffset: reverse ? to : from }, { strokeDashoffset: reverse ? from : to }], {
      duration,
      easing: "cubic-bezier(.45,0,.25,1)",
    });
    await a.finished.catch(() => {});
  }

  reset() {
    this.isLit = false;
    this.g.classList.remove("is-lit");
    this.lit.getAnimations().forEach((a) => a.cancel());
    this.lit.style.strokeDashoffset = `${this.len}`;
  }

  highlight(on: boolean) {
    this.g.classList.toggle("is-hl", on);
  }
}

function relRect(el: Element, origin: DOMRect) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - origin.left,
    top: r.top - origin.top,
    right: r.right - origin.left,
    bottom: r.bottom - origin.top,
    cx: r.left + r.width / 2 - origin.left,
    cy: r.top + r.height / 2 - origin.top,
  };
}

function sizeSvg(svg: SVGSVGElement, box: DOMRect) {
  svg.setAttribute("width", String(box.width));
  svg.setAttribute("height", String(box.height));
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
}

/** Re-runs `fn` on resize, batched to one frame. */
function onResize(el: Element, fn: () => void) {
  let raf = 0;
  const run = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  };
  new ResizeObserver(run).observe(el);
  document.fonts?.ready.then(run);
  run();
}

/* ───────── Player: a looping step machine that pauses offscreen ───────── */

type Step = [run: () => void, holdMs: number];

class Player {
  private i = 0;
  private timer = 0;
  private visible = false;
  private started = false;
  private stopped = false;

  constructor(
    private steps: Step[],
    private final: () => void,
  ) {}

  start() {
    this.started = true;
    if (prefersReducedMotion) return this.final();
    this.i = 0;
    if (this.visible && !this.timer) this.tick();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!this.started || this.stopped || prefersReducedMotion) return;
    if (v && !this.timer) this.tick();
    if (!v) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private tick = () => {
    if (!this.visible || this.stopped) {
      this.timer = 0;
      return;
    }
    const [run, hold] = this.steps[this.i];
    run();
    this.i = (this.i + 1) % this.steps.length;
    this.timer = window.setTimeout(this.tick, hold);
  };
}

/* ───────── Hero: rule chips wired into the deal card ───────── */

function initDeal() {
  const deal = $("[data-deal]");
  const svg = $<SVGSVGElement>("[data-deal-wires]");
  if (!deal || !svg) return;
  const rules = $$("[data-rule]", deal);
  const lines = $$("[data-line]", deal);
  const total = $("[data-deal-total]", deal);
  const status = $("[data-deal-status]", deal);
  const wires = rules.map(() => new Wire(svg));

  const layout = () => {
    const box = deal.getBoundingClientRect();
    sizeSvg(svg, box);
    rules.forEach((rule, i) => {
      const a = relRect(rule, box);
      const b = relRect(lines[i], box);
      const x2 = b.left - 27;
      const mid = a.right + (x2 - a.right) * 0.45;
      wires[i].set([
        [a.right, a.cy],
        [mid, a.cy],
        [mid, b.cy],
        [x2, b.cy],
      ]);
    });
  };
  onResize(deal, layout);

  // List total $3,590/mo → APAC price list → 50+ seat tier → 24-month rate = $3,130/mo
  const totals = [3530, 3170, 3130];
  const apply = (i: number) => {
    rules[i].classList.add("is-on");
    const go = () => {
      lines[i].classList.add("is-applied");
      tween(total, totals[i]);
    };
    if (isStacked()) window.setTimeout(go, 250);
    else wires[i].light(600).then(go);
  };

  const player = new Player(
    [
      [
        () => {
          deal.classList.remove("is-done");
          rules.forEach((r) => r.classList.remove("is-on"));
          lines.forEach((l) => l.classList.remove("is-applied"));
          wires.forEach((w) => w.reset());
          setNum(total, 3590);
          if (status) status.textContent = "Draft";
        },
        900,
      ],
      [() => apply(0), 1400],
      [() => apply(1), 1400],
      [() => apply(2), 1300],
      [
        () => {
          deal.classList.add("is-done");
          if (status) status.textContent = "Ready";
        },
        5200,
      ],
    ],
    () => wires.forEach((w) => w.light()),
  );
  setNum(total, 3130);
  watch(deal, (v) => player.setVisible(v), 0.25);
  player.start();
}

/* ───────── Tile demos ───────── */

function cfgPlayer(root: HTMLElement) {
  const opt = (k: string) => $(`[data-opt="${k}"]`, root)!;
  const [wifi, fibre, adsl] = ["wifi", "fibre", "adsl"].map(opt);
  return new Player(
    [
      [
        () => {
          root.classList.remove("is-valid");
          wifi.classList.remove("is-on", "is-press");
          fibre.classList.remove("is-on", "is-auto");
          adsl.classList.remove("is-blocked");
        },
        1100,
      ],
      [() => wifi.classList.add("is-on", "is-press"), 750],
      [() => fibre.classList.add("is-on", "is-auto"), 1200],
      [() => adsl.classList.add("is-blocked"), 1000],
      [() => root.classList.add("is-valid"), 3600],
    ],
    () => {},
  );
}

function bundlePlayer(root: HTMLElement) {
  return new Player(
    [
      [() => root.classList.remove("is-added", "is-press"), 1100],
      [() => root.classList.add("is-press"), 260],
      [
        () => {
          root.classList.remove("is-press");
          root.classList.add("is-added");
        },
        4200,
      ],
    ],
    () => {},
  );
}

function tierPlayer(root: HTMLElement) {
  const ladder = $(".tier__ladder", root)!;
  const rows = $$("li:not(.tier__hl)", ladder);
  const seats = $("[data-tier-seats]", root);
  const calc = $("[data-tier-calc]", root);
  const amt = $("[data-tier-amt]", root);
  const prices = [42, 39, 36, 33];
  const tierOf = (n: number) => (n >= 100 ? 3 : n >= 50 ? 2 : n >= 20 ? 1 : 0);
  const show = (n: number, instant = false) => {
    const t = tierOf(n);
    ladder.style.setProperty("--t", String(t));
    rows.forEach((r, i) => r.classList.toggle("is-act", i === t));
    if (seats) seats.textContent = String(n);
    if (calc) calc.textContent = `${n} × $${prices[t]}`;
    (instant ? setNum : tween)(amt, n * prices[t], (v) => money(v) + "/mo");
  };
  const steps: Step[] = [12, 24, 36, 48, 60].map((n, i) => [() => show(n, i === 0), i === 4 ? 3400 : 850]);
  return new Player(steps, () => {});
}

function termTile(root: HTMLElement) {
  const btns = $$<HTMLButtonElement>("[data-term-btn]", root);
  const seg = $(".term__seg", root)!;
  const price = $("[data-term-price]", root);
  const months = $("[data-term-months]", root);
  const total = $("[data-term-total]", root);
  const plans: Record<number, number> = { 12: 96, 24: 52, 36: 37 };
  setNum(price, 52);
  setNum(total, 1248);
  const set = (m: number) => {
    btns.forEach((b, i) => {
      const on = Number(b.dataset.termBtn) === m;
      b.setAttribute("aria-pressed", String(on));
      if (on) seg.style.setProperty("--k", String(i));
    });
    if (months) months.textContent = String(m);
    tween(price, plans[m]);
    tween(total, plans[m] * m);
  };
  const order = [36, 12, 24];
  const player = new Player(
    order.map((m) => [() => set(m), 2300]),
    () => {},
  );
  btns.forEach((b) =>
    b.addEventListener("click", () => {
      player.stop();
      set(Number(b.dataset.termBtn));
    }),
  );
  return player;
}

function sheetPlayer(root: HTMLElement) {
  const hours = $("[data-sheet-hours]", root);
  const out = $("[data-sheet-out]", root);
  const row = $("[data-sheet-row]", root);
  return new Player(
    [
      [
        () => {
          root.classList.remove("is-edit", "is-calc", "is-flow", "is-hit");
          if (hours) hours.textContent = "12";
          setNum(out, 3240);
          setNum(row, 3240);
        },
        1100,
      ],
      [
        () => {
          root.classList.add("is-edit");
          if (hours) hours.textContent = "18";
        },
        650,
      ],
      [
        () => {
          root.classList.remove("is-edit");
          root.classList.add("is-calc");
          tween(out, 4860);
        },
        750,
      ],
      [() => root.classList.add("is-flow"), 600],
      [
        () => {
          root.classList.add("is-hit");
          tween(row, 4860);
        },
        3400,
      ],
    ],
    () => {},
  );
}

function approvalPlayer(root: HTMLElement) {
  const mgr = $(".st--mgr", root)!;
  const com = $(".st--com", root)!;
  const ready = $(".st--ready", root)!;
  return new Player(
    [
      [
        () => {
          root.classList.remove("is-ready");
          mgr.classList.remove("is-pending", "is-away", "is-backup", "is-done");
          com.classList.remove("is-pending", "is-done");
          ready.classList.remove("is-done");
        },
        900,
      ],
      [() => mgr.classList.add("is-pending"), 1100],
      [() => mgr.classList.add("is-away"), 1300],
      [
        () => {
          mgr.classList.remove("is-pending");
          mgr.classList.add("is-backup", "is-done");
        },
        1000,
      ],
      [() => com.classList.add("is-pending"), 1000],
      [
        () => {
          com.classList.remove("is-pending");
          com.classList.add("is-done");
        },
        700,
      ],
      [
        () => {
          ready.classList.add("is-done");
          root.classList.add("is-ready");
        },
        3400,
      ],
    ],
    () => {},
  );
}

function versionPlayer(root: HTMLElement) {
  const marks = $$(".ver__track li:not(.ver__fill)", root);
  const diffs = $$(".ver__diff", root);
  const show = (v: number) => {
    root.style.setProperty("--v", String(v));
    marks.forEach((m, i) => m.classList.toggle("is-act", i <= v));
    diffs.forEach((d, i) => d.classList.toggle("is-cur", i === v));
  };
  return new Player(
    [0, 1, 2, 3].map((v) => [() => show(v), v === 3 ? 3200 : 1700]),
    () => {},
  );
}

function acceptPlayer(root: HTMLElement) {
  const total = $("[data-acc-total]", root);
  return new Player(
    [
      [
        () => {
          root.classList.remove("is-checked", "is-signed", "is-paid");
          setNum(total, 3130);
        },
        1100,
      ],
      [
        () => {
          root.classList.add("is-checked");
          tween(total, 3175);
        },
        1100,
      ],
      [() => root.classList.add("is-signed"), 1600],
      [() => root.classList.add("is-paid"), 3600],
    ],
    () => {},
  );
}

/* ───────── The circuit: tiles wired in sequence ───────── */

function initCircuit() {
  const circuit = $("[data-circuit]");
  const svg = $<SVGSVGElement>("[data-circuit-wires]");
  if (!circuit || !svg) return;
  const tiles = $$("[data-tile]", circuit);
  const wires = tiles.slice(1).map(() => new Wire(svg));

  const factories: [string, (el: HTMLElement) => Player][] = [
    ["[data-cfg]", cfgPlayer],
    ["[data-bnd]", bundlePlayer],
    ["[data-tier]", tierPlayer],
    ["[data-term]", termTile],
    ["[data-sheet]", sheetPlayer],
    ["[data-apv]", approvalPlayer],
    ["[data-ver]", versionPlayer],
    ["[data-acc]", acceptPlayer],
  ];
  const players = tiles.map((tile, i) => {
    const [sel, make] = factories[i];
    const el = $(sel, tile);
    return el ? make(el) : null;
  });
  tiles.forEach((t) => {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.setAttribute("aria-hidden", "true");
    t.prepend(spark);
  });

  // Each trace leaves the top of a tile (or its bottom, when the next tile sits on the
  // next row), runs along the gutter above the destination row and lands on its node.
  const layout = () => {
    if (isStacked()) return;
    const box = circuit.getBoundingClientRect();
    sizeSvg(svg, box);
    const gap = parseFloat(getComputedStyle(circuit).rowGap) || 32;
    tiles.slice(1).forEach((tile, k) => {
      const a = relRect(tiles[k], box);
      const b = relRect(tile, box);
      const dot = relRect($(".node i", tile)!, box);
      const bx = dot.cx;
      const ax = a.right - 40;
      const sameRow = Math.abs(a.top - b.top) < 8;
      const y = sameRow ? b.top - gap * 0.36 : b.top - gap * 0.64;
      wires[k].set([
        [ax, sameRow ? a.top : a.bottom],
        [ax, y],
        [bx, y],
        [bx, b.top],
      ]);
    });
  };
  onResize(circuit, layout);

  const ping = (i: number) => {
    const t = tiles[i];
    t.classList.remove("is-ping");
    void t.offsetWidth;
    t.classList.add("is-ping");
  };

  // Activation runs in order: a tile goes live once it is in view and its predecessor is live.
  const seen = tiles.map(() => false);
  let next = 0;
  let busy = false;
  let circuitVisible = false;
  const activate = async () => {
    if (busy) return;
    busy = true;
    while (next < tiles.length && seen[next]) {
      const i = next;
      if (i > 0 && !prefersReducedMotion) {
        if (isStacked()) {
          tiles[i].classList.add("is-arriving");
          await wait(560);
        } else {
          await wires[i - 1].light(720);
        }
      } else if (i > 0) {
        void wires[i - 1].light();
      }
      tiles[i].classList.add("is-live");
      ping(i);
      players[i]?.start();
      next++;
    }
    busy = false;
    if (next === tiles.length) void ambient();
  };

  // After the cascade, a single pulse keeps travelling the whole circuit while it is in view.
  let ambientOn = false;
  const ambient = async () => {
    if (ambientOn || prefersReducedMotion) return;
    ambientOn = true;
    await wait(1600);
    for (;;) {
      if (!circuitVisible || isStacked()) {
        await wait(600);
        continue;
      }
      for (let k = 0; k < wires.length; k++) {
        if (!circuitVisible) break;
        await wires[k].travel(760);
        ping(k + 1);
        await wait(380);
      }
      await wait(2200);
    }
  };

  tiles.forEach((tile, i) =>
    watch(
      tile,
      (v) => {
        tile.classList.toggle("is-visible", v);
        players[i]?.setVisible(v);
        if (v && !seen[i]) {
          seen[i] = true;
          void activate();
        }
      },
      0.3,
    ),
  );
  watch(circuit, (v) => (circuitVisible = v), 0);

  if (canHover) {
    tiles.forEach((tile, i) => {
      const links = [wires[i - 1], wires[i]].filter(Boolean);
      const peers = [tiles[i - 1], tiles[i + 1]].filter(Boolean);
      tile.addEventListener("pointerenter", () => {
        links.forEach((w) => w.highlight(true));
        peers.forEach((p) => p.classList.add("is-linked"));
      });
      tile.addEventListener("pointerleave", () => {
        links.forEach((w) => w.highlight(false));
        peers.forEach((p) => p.classList.remove("is-linked"));
      });
    });
  }
}

/* ───────── Integrations hub ───────── */

function initHub() {
  const hub = $("[data-hub]");
  const svg = $<SVGSVGElement>("[data-hub-wires]");
  const core = $("[data-hub-core]");
  if (!hub || !svg || !core) return;
  const ports = $$("[data-hub-port]", hub);
  const wires = ports.map(() => new Wire(svg));

  const layout = () => {
    if (isStacked()) return;
    const box = hub.getBoundingClientRect();
    sizeSvg(svg, box);
    const c = relRect(core, box);
    ports.forEach((port, i) => {
      const p = relRect(port, box);
      const left = port.classList.contains("port--l");
      const row = Number(getComputedStyle(port).getPropertyValue("--r")) || 1;
      const cy = c.cy + (row - 2) * 34;
      const cx = left ? c.left : c.right;
      const px = left ? p.right : p.left;
      const mid = left ? px + (cx - px) * 0.5 : cx + (px - cx) * 0.5;
      wires[i].set([
        [cx, cy],
        [mid, cy],
        [mid, p.cy],
        [px, p.cy],
      ]);
    });
  };
  onResize(hub, layout);

  ports.forEach((port, i) => {
    port.addEventListener("pointerenter", () => wires[i].highlight(true));
    port.addEventListener("pointerleave", () => wires[i].highlight(false));
    port.addEventListener("focus", () => wires[i].highlight(true));
    port.addEventListener("blur", () => wires[i].highlight(false));
  });

  let visible = false;
  let started = false;
  const hit = (i: number) => {
    ports[i].classList.add("is-hit");
    window.setTimeout(() => ports[i].classList.remove("is-hit"), 700);
  };
  const run = async () => {
    started = true;
    if (prefersReducedMotion || isStacked()) {
      wires.forEach((w) => void w.light());
      return;
    }
    hub.classList.add("is-beat");
    await Promise.all(wires.map((w, i) => wait(i * 110).then(() => w.light(700))));
    let k = 0;
    for (;;) {
      await wait(1100);
      if (!visible || isStacked()) continue;
      const i = [0, 3, 1, 4, 2, 5][k++ % 6];
      const inbound = k % 2 === 0;
      if (inbound) {
        await wires[i].travel(900, true);
        hub.classList.remove("is-beat");
        void hub.offsetWidth;
        hub.classList.add("is-beat");
      } else {
        await wires[i].travel(900);
        hit(i);
      }
    }
  };
  watch(
    hub,
    (v) => {
      visible = v;
      if (v && !started) void run();
    },
    0.3,
  );
}

/* ───────── Closing CTA traces run only while visible ───────── */

function initClose() {
  const panel = $("[data-close]");
  if (panel) watch(panel, (v) => panel.classList.toggle("is-visible", v), 0.1);
}

initDeal();
initCircuit();
initHub();
initClose();
