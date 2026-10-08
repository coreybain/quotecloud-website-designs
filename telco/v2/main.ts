import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Tracks whether an element is on screen; toggles `is-paused` on it so CSS loops stop offscreen. */
function watch(el: Element, onChange?: (on: boolean) => void, margin = "0px") {
  const state = { on: false };
  if (!("IntersectionObserver" in window)) {
    state.on = true;
    onChange?.(true);
    return state;
  }
  new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        state.on = e.isIntersecting;
        el.classList.toggle("is-paused", !state.on);
        onChange?.(state.on);
      }),
    { rootMargin: margin },
  ).observe(el);
  return state;
}

/** Sleep that only counts down while `gate.on` is true and the tab is visible. */
function gatedSleep(gate: { on: boolean }, ms: number) {
  return new Promise<void>((resolve) => {
    let left = ms;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      if (gate.on && !document.hidden) left -= now - last;
      last = now;
      if (left <= 0) resolve();
      else window.setTimeout(tick, Math.min(left, 120));
    };
    window.setTimeout(tick, Math.min(left, 120));
  });
}

/* ───────── Roller: odometer-style digits that roll to their new value ───────── */

type Col = { kind: "d" | "s"; el: HTMLElement; ch: string };

class Roller {
  private cols: Col[] = [];
  private vis: HTMLElement;
  private sr: HTMLElement;
  value = NaN;

  constructor(
    private el: HTMLElement,
    private fmt: (n: number) => string = money,
  ) {
    el.classList.add("t2-roll");
    this.sr = document.createElement("span");
    this.sr.className = "qc-sr-only";
    this.vis = document.createElement("span");
    this.vis.className = "t2-roll__vis";
    this.vis.setAttribute("aria-hidden", "true");
    el.replaceChildren(this.sr, this.vis);
  }

  set(n: number, animate = true) {
    if (n === this.value) return;
    const up = n > this.value || Number.isNaN(this.value);
    this.value = n;
    const text = this.fmt(n);
    this.sr.textContent = text;
    const chars = [...text];
    const old = this.cols;
    const next: Col[] = [];
    const fresh: Col[] = [];
    for (let i = 1; i <= chars.length; i++) {
      const ch = chars[chars.length - i];
      const kind = /\d/.test(ch) ? "d" : "s";
      const prev = old[old.length - i];
      let col: Col;
      if (prev && prev.kind === kind && (kind === "d" || prev.ch === ch)) {
        col = prev;
      } else {
        col = this.make(kind, ch, up);
        if (prev) prev.el.replaceWith(col.el);
        else this.vis.prepend(col.el);
        if (animate) fresh.push(col);
      }
      col.ch = ch;
      if (kind === "d") {
        col.el.style.setProperty("--i", String(i));
        if (!fresh.includes(col)) col.el.style.setProperty("--d", ch);
      }
      next.unshift(col);
    }
    for (let i = 0; i < old.length - chars.length; i++) old[i].el.remove();
    this.cols = next;
    // New digit columns start from the edge of their strip so they still roll in.
    if (fresh.length) {
      void this.vis.offsetWidth;
      fresh.forEach((c) => {
        c.el.classList.add("is-new");
        if (c.kind === "d") c.el.style.setProperty("--d", c.ch);
      });
    }
  }

  private make(kind: "d" | "s", ch: string, up: boolean): Col {
    const el = document.createElement("span");
    if (kind === "d") {
      el.className = "t2-d";
      const strip = document.createElement("span");
      strip.className = "t2-d__strip";
      for (let d = 0; d < 10; d++) {
        const s = document.createElement("span");
        s.textContent = String(d);
        strip.append(s);
      }
      el.append(strip);
      el.style.setProperty("--d", up ? "0" : "9");
    } else {
      el.className = "t2-s";
      el.textContent = ch;
    }
    return { kind, el, ch };
  }
}

/* ───────── Pricing engine ───────── */

type Term = 12 | 24 | 36;
type LineId = "fibre" | "sdwan" | "pbx" | "mobile" | "wifi" | "install";
const TERMS: Term[] = [12, 24, 36];

const PRICES: Record<LineId, { mrc: Record<Term, number>; nrc: Record<Term, number> }> = {
  fibre: { mrc: { 12: 329, 24: 299, 36: 269 }, nrc: { 12: 990, 24: 495, 36: 0 } },
  sdwan: { mrc: { 12: 149, 24: 135, 36: 119 }, nrc: { 12: 780, 24: 390, 36: 0 } },
  pbx: { mrc: { 12: 26, 24: 23, 36: 21 }, nrc: { 12: 25, 24: 10, 36: 0 } },
  mobile: { mrc: { 12: 69, 24: 65, 36: 62 }, nrc: { 12: 720, 24: 240, 36: 0 } },
  wifi: { mrc: { 12: 22, 24: 19, 36: 17 }, nrc: { 12: 290, 24: 145, 36: 0 } },
  install: { mrc: { 12: 0, 24: 0, 36: 0 }, nrc: { 12: 3200, 24: 2400, 36: 1600 } },
};
const LIMITS: Partial<Record<LineId, [number, number]>> = { fibre: [1, 9], pbx: [5, 200], mobile: [1, 60] };

const state = {
  term: 24 as Term,
  qty: { fibre: 3, sdwan: 3, pbx: 40, mobile: 12, wifi: 8, install: 1 } as Record<LineId, number>,
};

function price(term: Term) {
  const lines = {} as Record<LineId, { mrc: number; nrc: number }>;
  let mrc = 0;
  let nrc = 0;
  (Object.keys(PRICES) as LineId[]).forEach((id) => {
    const q = state.qty[id];
    const l = { mrc: PRICES[id].mrc[term] * q, nrc: PRICES[id].nrc[term] * q };
    lines[id] = l;
    mrc += l.mrc;
    nrc += l.nrc;
  });
  return { lines, mrc, nrc, tcv: mrc * term + nrc };
}

const listeners: Array<(user: boolean) => void> = [];
const emit = (user: boolean) => listeners.forEach((fn) => fn(user));

function setTerm(term: Term, user: boolean) {
  if (term === state.term) return;
  state.term = term;
  emit(user);
}

/* ───────── Hero: the term switch ───────── */

function initHero() {
  const quote = $("[data-quote]");
  if (!quote) return;

  const radios = $$<HTMLInputElement>('input[name="t2-term"]', quote);
  const live = $("[data-live]", quote)!;
  const table = $(".t2-lines", quote)!;

  const lineRollers = new Map<LineId, { row: HTMLElement; mrc: Roller; nrc: Roller; qty: HTMLElement }>();
  $$<HTMLElement>("[data-line]", quote).forEach((row) => {
    const id = row.dataset.line as LineId;
    lineRollers.set(id, {
      row,
      mrc: new Roller($("[data-mrc]", row)!),
      nrc: new Roller($("[data-nrc]", row)!),
      qty: $("[data-qty]", row)!,
    });
  });
  const totals = {
    mrc: new Roller($('[data-total="mrc"]', quote)!),
    nrc: new Roller($('[data-total="nrc"]', quote)!),
    tcv: new Roller($('[data-total="tcv"]', quote)!),
  };
  const termPrices = TERMS.map(
    (t) => [t, new Roller($(`[data-term-price="${t}"]`, quote)!, (n) => money(n) + "/mo")] as const,
  );
  const bar = $(".t2-tcvbar", quote)!;

  let announce = 0;
  const render = (user: boolean, animate = true) => {
    const p = price(state.term);
    radios.forEach((r) => (r.checked = Number(r.value) === state.term));
    quote.dataset.term = String(state.term);
    lineRollers.forEach((l, id) => {
      l.mrc.set(p.lines[id].mrc, animate);
      l.nrc.set(p.lines[id].nrc, animate);
      l.qty.textContent = String(state.qty[id]);
      l.row.classList.toggle("is-waived", p.lines[id].nrc === 0);
      l.row.classList.toggle("is-nomrc", p.lines[id].mrc === 0);
    });
    totals.mrc.set(p.mrc, animate);
    totals.nrc.set(p.nrc, animate);
    totals.tcv.set(p.tcv, animate);
    termPrices.forEach(([t, r]) => r.set(price(t).mrc, animate));
    const max = Math.max(...TERMS.map((t) => price(t).tcv));
    bar.style.setProperty("--r", String((p.mrc * state.term) / max));
    bar.style.setProperty("--o", String(p.nrc / max));
    $$<HTMLButtonElement>("[data-step]", quote).forEach((b) => {
      const id = b.closest<HTMLElement>("[data-line]")!.dataset.line as LineId;
      const [min, maxQ] = LIMITS[id]!;
      const step = Number(b.dataset.step);
      b.disabled = step < 0 ? state.qty[id] <= min : state.qty[id] >= maxQ;
    });
    if (animate) {
      table.classList.remove("is-sweep");
      void table.offsetWidth;
      table.classList.add("is-sweep");
    }
    if (user) {
      window.clearTimeout(announce);
      announce = window.setTimeout(() => {
        live.textContent = `${state.term}-month term. Monthly recurring ${money(p.mrc)}, once-off ${money(p.nrc)}, total contract value ${money(p.tcv)}.`;
      }, 350);
    }
  };

  render(false, false);
  requestAnimationFrame(() => quote.classList.add("is-ready"));
  listeners.push((user) => render(user));

  radios.forEach((r) => r.addEventListener("change", () => setTerm(Number(r.value) as Term, true)));
  quote.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-step]");
    if (!btn) return;
    const id = btn.closest<HTMLElement>("[data-line]")!.dataset.line as LineId;
    const [min, max] = LIMITS[id]!;
    state.qty[id] = Math.min(max, Math.max(min, state.qty[id] + Number(btn.dataset.step)));
    if (id === "fibre") state.qty.sdwan = state.qty.fibre;
    emit(true);
  });

  // One gentle demo pass through the terms, until the visitor takes over.
  if (prefersReducedMotion) return;
  const gate = watch(quote);
  let stopped = false;
  const stop = () => (stopped = true);
  ["pointerdown", "keydown", "focusin"].forEach((ev) => quote.addEventListener(ev, stop, { once: true }));
  (async () => {
    await gatedSleep(gate, 2200);
    for (const t of [36, 12, 24] as Term[]) {
      if (stopped) return;
      setTerm(t, false);
      await gatedSleep(gate, 2600);
    }
  })();
}

/* ───────── Clarity: customer-facing term comparison (synced with the hero) ───────── */

function initCompare() {
  const box = $("[data-compare]");
  if (!box) return;
  const cards = TERMS.map((t) => {
    const card = $(`[data-opt="${t}"]`, box)!;
    return {
      t,
      input: $<HTMLInputElement>("input", card)!,
      mrc: new Roller($('[data-c="mrc"]', card)!),
      nrc: new Roller($('[data-c="nrc"]', card)!),
      tcv: new Roller($('[data-c="tcv"]', card)!),
    };
  });
  const sync = $$("[data-sync]");
  const splitEl = $("[data-split]", box)!;
  const split = {
    r: new Roller($('[data-split="r"]', splitEl)!),
    o: new Roller($('[data-split="o"]', splitEl)!),
    term: $("[data-split-term]", splitEl)!,
    bar: $(".t2-split__bar", splitEl)!,
  };
  const render = (animate = true) => {
    cards.forEach((c) => {
      const p = price(c.t);
      c.mrc.set(p.mrc, animate);
      c.nrc.set(p.nrc, animate);
      c.tcv.set(p.tcv, animate);
      c.input.checked = c.t === state.term;
    });
    box.dataset.term = String(state.term);
    const cur = price(state.term);
    const rec = cur.mrc * state.term;
    split.r.set(rec, animate);
    split.o.set(cur.nrc, animate);
    split.term.textContent = `${state.term}-month`;
    split.bar.style.setProperty("--r", String(rec / cur.tcv));
    sync.forEach((el) => {
      const key = el.dataset.sync;
      el.textContent = String(key === "sites" ? state.qty.fibre : state.qty[key as LineId]);
    });
  };
  render(false);
  listeners.push(() => render());
  cards.forEach((c) => c.input.addEventListener("change", () => setTerm(c.t, true)));
}

/* ───────── Bento: catalogue, margins, approvals, tiers ───────── */

function initCatalogue() {
  const card = $("[data-catalogue]");
  if (!card) return;
  const typed = $("[data-typed]", card)!;
  const word = typed.textContent ?? "";
  if (prefersReducedMotion) {
    card.classList.add("is-found", "is-added");
    return;
  }
  typed.textContent = "";
  onceVisible(
    card,
    async () => {
      const gate = { on: true };
      await gatedSleep(gate, 500);
      for (const ch of word) {
        typed.textContent += ch;
        await gatedSleep(gate, 110);
      }
      await gatedSleep(gate, 350);
      card.classList.add("is-found");
      await gatedSleep(gate, 900);
      card.classList.add("is-added");
    },
    0.4,
  );
}

function initMargin() {
  const card = $("[data-margin]");
  const sw = card && $<HTMLButtonElement>("[data-margin-switch]", card);
  if (!card || !sw) return;
  const set = (on: boolean) => {
    sw.setAttribute("aria-checked", String(on));
    card.classList.toggle("is-customer", !on);
  };
  let touched = false;
  sw.addEventListener("click", () => {
    touched = true;
    set(sw.getAttribute("aria-checked") !== "true");
  });
  if (prefersReducedMotion) return;
  const gate = watch(card);
  (async () => {
    while (!touched) {
      await gatedSleep(gate, 3400);
      if (touched) return;
      set(sw.getAttribute("aria-checked") !== "true");
    }
  })();
}

function initApprove() {
  const card = $("[data-approve]");
  if (!card) return;
  const disc = $("[data-disc]", card)!;
  const setDisc = (n: number) => {
    disc.textContent = `${n}%`;
    card.style.setProperty("--disc", String(n / 20));
  };
  const phase = (p: string) => (card.dataset.phase = p);
  setDisc(6);
  phase("ok");
  if (prefersReducedMotion) {
    setDisc(15);
    phase("done");
    return;
  }
  const gate = watch(card);
  (async () => {
    for (;;) {
      setDisc(6);
      phase("ok");
      await gatedSleep(gate, 1800);
      for (let n = 7; n <= 15; n++) {
        setDisc(n);
        if (n === 11) phase("wait");
        await gatedSleep(gate, 120);
      }
      await gatedSleep(gate, 2000);
      phase("done");
      await gatedSleep(gate, 2800);
    }
  })();
}

function initTiers() {
  const card = $("[data-tiers]");
  if (!card) return;
  const seats = $("[data-seats]", card)!;
  const tiers = $$("[data-tier]", card);
  const show = (n: number) => {
    seats.textContent = String(n);
    const idx = n >= 50 ? 2 : n >= 20 ? 1 : 0;
    tiers.forEach((t, i) => t.classList.toggle("is-on", i === idx));
  };
  show(40);
  if (prefersReducedMotion) return;
  const gate = watch(card);
  (async () => {
    const steps = [12, 40, 64];
    for (let i = 0; ; i = (i + 1) % steps.length) {
      show(steps[i]);
      await gatedSleep(gate, 2200);
    }
  })();
}

/* ───────── Network diagram (two layouts: wide and tall) ───────── */

type NetNode = { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; kind: "site" | "core" | "svc" };

function netSvg(tall: boolean) {
  const svg = (s: string) => s;
  let w: number, h: number, nodes: NetNode[], edges: string[], failover: string, fLabel: [number, number];
  if (!tall) {
    w = 720;
    h = 330;
    const site = (id: string, y: number, title: string, sub: string): NetNode => ({ id, x: 16, y, w: 162, h: 56, title, sub, kind: "site" });
    const svc = (id: string, y: number, title: string, sub: string): NetNode => ({ id, x: 542, y, w: 162, h: 56, title, sub, kind: "svc" });
    nodes = [
      site("hq", 26, "Head office", "Fibre 1000 · SD-WAN"),
      site("dc", 136, "Distribution centre", "Fibre 1000 · Wi-Fi 6"),
      site("rt", 246, "Retail store", "Fibre 1000 · PBX"),
      { id: "core", x: 270, y: 132, w: 180, h: 64, title: "SD-WAN fabric", sub: "Managed · 99.95% SLA", kind: "core" },
      svc("inet", 26, "Internet", "1 Gbps aggregated"),
      svc("m365", 136, "Microsoft 365", "Business Standard"),
      svc("voice", 246, "Hosted voice", "PBX · SIP trunks"),
    ];
    edges = [54, 164, 274].map((y) => `M178 ${y} C 230 ${y} 222 164 270 164`);
    edges.push(...[54, 164, 274].map((y) => `M450 164 C 498 164 490 ${y} 542 ${y}`));
    failover = "M178 296 C 236 296 262 250 286 196";
    fLabel = [236, 288];
  } else {
    w = 340;
    h = 470;
    const site = (id: string, x: number, title: string, sub: string): NetNode => ({ id, x, y: 8, w: 104, h: 54, title, sub, kind: "site" });
    const svc = (id: string, x: number, title: string, sub: string): NetNode => ({ id, x, y: 404, w: 104, h: 54, title, sub, kind: "svc" });
    nodes = [
      site("hq", 6, "Head office", "Fibre · SD-WAN"),
      site("dc", 118, "Distribution", "Fibre · Wi-Fi 6"),
      site("rt", 230, "Retail store", "Fibre · PBX"),
      { id: "core", x: 75, y: 204, w: 190, h: 62, title: "SD-WAN fabric", sub: "Managed · 99.95% SLA", kind: "core" },
      svc("inet", 6, "Internet", "1 Gbps"),
      svc("m365", 118, "Microsoft 365", "Business Std"),
      svc("voice", 230, "Hosted voice", "PBX · SIP"),
    ];
    edges = [58, 170, 282].map((x) => `M${x} 62 C ${x} 140 170 130 170 204`);
    edges.push(...[58, 170, 282].map((x) => `M170 266 C 170 340 ${x} 330 ${x} 404`));
    failover = "M334 40 C 352 120 340 220 265 235";
    fLabel = [322, 150];
  }
  const paths = edges
    .map((d, i) => `<path id="t2e${tall ? "t" : "w"}${i}" class="t2-net__edge" d="${d}" pathLength="1" style="--i:${i}"/>`)
    .join("");
  const pulses = prefersReducedMotion
    ? ""
    : edges
        .map(
          (_, i) =>
            `<circle r="3.2" class="t2-net__pulse${i >= 3 ? " t2-net__pulse--out" : ""}"><animateMotion dur="2.6s" begin="${(i % 3) * 0.7 + (i >= 3 ? 1.3 : 0)}s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath href="#t2e${tall ? "t" : "w"}${i}"/></animateMotion></circle>`,
        )
        .join("");
  const boxes = nodes
    .map(
      (n) =>
        `<g class="t2-net__node t2-net__node--${n.kind}" transform="translate(${n.x} ${n.y})"><rect width="${n.w}" height="${n.h}" rx="${n.kind === "core" ? 16 : 12}"/><text x="${n.w / 2}" y="${n.h / 2 - 3}" class="t2-net__t">${n.title}</text><text x="${n.w / 2}" y="${n.h / 2 + 14}" class="t2-net__s">${n.sub}</text></g>`,
    )
    .join("");
  return svg(
    `<svg viewBox="0 0 ${w} ${h}" class="t2-net__svg t2-net__svg--${tall ? "tall" : "wide"}" aria-hidden="true" focusable="false">${paths}<g class="t2-net__fail"><path d="${failover}" class="t2-net__failpath"/><g transform="translate(${fLabel[0] - 18} ${fLabel[1] - 11})"><rect width="36" height="22" rx="11"/><text x="18" y="15">4G</text></g></g>${pulses}${boxes}</svg>`,
  );
}

function initCanvas() {
  const canvas = $("[data-canvas]");
  const net = canvas && $("[data-net]", canvas);
  if (!canvas || !net) return;
  net.innerHTML = netSvg(false) + netSvg(true);
  const svgs = $$<SVGSVGElement>("svg", net);
  onceVisible(canvas, () => canvas.classList.add("is-live"), 0.25);
  watch(canvas, (on) => svgs.forEach((s) => (on ? s.unpauseAnimations() : s.pauseAnimations())));
}

/* ───────── Close: customer options feed a live total ───────── */

function initOptions() {
  const box = $("[data-options]");
  if (!box) return;
  const total = new Roller($("[data-opt-mrc]", box)!);
  const nrcR = new Roller($("[data-opt-nrc]", box)!);
  const tcvR = new Roller($("[data-opt-tcv]", box)!);
  const termLabel = $("[data-opt-term]", box)!;
  const live = $("[data-opt-live]", box)!;
  const inputs = $$<HTMLInputElement>("[data-add]", box);
  const render = (user: boolean, animate = true) => {
    let mrc = price(state.term).mrc;
    inputs.forEach((i) => {
      if (!i.checked) return;
      if (i.dataset.add === "failover") mrc += 35 * state.qty.fibre;
      if (i.dataset.add === "support") mrc += 240;
      if (i.dataset.add === "m365") mrc += 19 * state.qty.mobile;
    });
    const nrc = price(state.term).nrc;
    total.set(mrc, animate);
    nrcR.set(nrc, animate);
    tcvR.set(mrc * state.term + nrc, animate);
    termLabel.textContent = `${state.term} months`;
    if (user) live.textContent = `Monthly total ${money(mrc)} on a ${state.term}-month term. Total contract value ${money(mrc * state.term + nrc)}.`;
  };
  render(false, false);
  listeners.push(() => render(false));
  inputs.forEach((i) => i.addEventListener("change", () => render(true)));
}

function initSign() {
  const el = $("[data-sign]");
  if (!el) return;
  onceVisible(el, () => el.classList.add("is-signed"), 0.45);
}

/* ───────── Loops that should only run on screen ───────── */

function initLoops() {
  $$(".t2-hero, [data-flow], .t2-final__panel").forEach((el) => watch(el));
  const timeline = $(".t2-timeline");
  if (timeline) onceVisible(timeline, () => timeline.classList.add("is-on"), 0.5);
}

initHero();
initCompare();
initCatalogue();
initMargin();
initApprove();
initTiers();
initCanvas();
initOptions();
initSign();
initLoops();
