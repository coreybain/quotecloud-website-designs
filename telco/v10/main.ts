import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── Pricing model (illustrative sample data) ───────── */

type Term = 12 | 24 | 36;
type Site = "hq" | "wh" | "dp";
type Line = {
  qty: number;
  mrc?: [number, number, number];
  nrc?: [number, number, number];
  buy?: number; // monthly carrier/vendor cost per unit
  buyNrc?: number; // once-off cost per unit
  sites?: Partial<Record<Site, number>>; // quantity allocated to each site
  label?: string;
};

const LINES: Record<string, Line> = {
  fib1g: { qty: 1, mrc: [649, 589, 549], buy: 318, sites: { hq: 1 } },
  fib500: { qty: 1, mrc: [429, 389, 359], buy: 214, sites: { wh: 1 } },
  sdwan: { qty: 3, mrc: [95, 85, 75], nrc: [690, 690, 690], buy: 41, sites: { hq: 1, wh: 1, dp: 1 } },
  pbx: { qty: 48, mrc: [24, 21, 19], buy: 11.4, sites: { hq: 30, wh: 12, dp: 6 } },
  phones: { qty: 48, nrc: [129, 119, 99], buyNrc: 74 },
  mobile: { qty: 22, mrc: [69, 59, 52], buy: 33, sites: { dp: 22 } },
  m365: { qty: 48, mrc: [12.5, 12.5, 12.5], buy: 10.6, sites: { hq: 30, dp: 18 } },
  wifi: { qty: 12, mrc: [15, 14, 12.5], nrc: [290, 290, 290], buy: 6.2, sites: { wh: 12 } },
  install: { qty: 1, nrc: [2400, 1200, 0], buyNrc: 1450 },
};
const OPTIONS: Record<string, Line> = {
  fail5g: { qty: 1, mrc: [59, 55, 49], buy: 27, sites: { hq: 1 }, label: "5G failover" },
  support: { qty: 1, mrc: [290, 260, 240], buy: 118, label: "24/7 support" },
  rec: { qty: 48, mrc: [4, 4, 3.5], buy: 1.6, sites: { hq: 30, wh: 12, dp: 6 }, label: "Call recording" },
};
const TERM_INDEX: Record<Term, 0 | 1 | 2> = { 12: 0, 24: 1, 36: 2 };

const money = (n: number, decimals = 0) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const pct = (n: number) => `${Math.round(n * 100)}%`;

const state = { term: 36 as Term, opts: new Set<string>(), internal: false };

/** Animated number text: tweens from the last rendered value to the new one. */
const shown = new WeakMap<HTMLElement, number>();
function tween(el: HTMLElement, to: number, fmt: (n: number) => string) {
  const from = shown.get(el);
  shown.set(el, to);
  if (from === undefined || from === to || prefersReducedMotion) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const dur = 520;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (t < 1 && shown.get(el) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function totalsFor(term: Term, opts: Set<string>) {
  const i = TERM_INDEX[term];
  let mrc = 0;
  let nrc = 0;
  let cost = 0;
  const sites: Record<Site, number> = { hq: 0, wh: 0, dp: 0 };
  const add = (line: Line) => {
    if (line.mrc) {
      mrc += line.mrc[i] * line.qty;
      cost += (line.buy ?? 0) * line.qty;
      for (const [s, q] of Object.entries(line.sites ?? {})) sites[s as Site] += line.mrc[i] * (q ?? 0);
    }
    if (line.nrc) nrc += line.nrc[i] * line.qty;
  };
  Object.values(LINES).forEach(add);
  opts.forEach((id) => add(OPTIONS[id]));
  return { mrc, nrc, tcv: mrc * term + nrc, margin: mrc ? (mrc - cost) / mrc : 0, sites };
}

function initPricing() {
  const section = document.querySelector<HTMLElement>(".pp-sec--pricing");
  if (!section) return;
  const table = section.querySelector<HTMLTableElement>("[data-pt]")!;
  const seg = section.querySelector<HTMLElement>("[data-term]")!;
  const thumb = seg.querySelector<HTMLElement>(".seg__thumb")!;
  const toggle = section.querySelector<HTMLButtonElement>("[data-internal-toggle]")!;

  const placeThumb = () => {
    const checked = seg.querySelector<HTMLInputElement>("input:checked");
    const label = checked?.closest("label");
    if (!label) return;
    thumb.style.setProperty("--tx", `${label.offsetLeft}px`);
    thumb.style.setProperty("--tw", `${label.offsetWidth}px`);
  };

  const render = (flash = false) => {
    const i = TERM_INDEX[state.term];
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tr[data-line]")) {
      const id = row.dataset.line!;
      const line = LINES[id];
      const cell = (name: string) => row.querySelector<HTMLElement>(`[data-cell="${name}"]`);
      const unit = line.mrc ? line.mrc[i] : (line.nrc?.[i] ?? 0);
      const unitEl = cell("unit");
      if (unitEl) tween(unitEl, unit, (n) => money(n, 2));

      const mrcEl = cell("mrc")!;
      if (line.mrc) tween(mrcEl, line.mrc[i] * line.qty, (n) => money(n));
      const nrcEl = cell("nrc")!;
      nrcEl.classList.remove("is-waived", "is-zero");
      if (line.nrc) {
        const v = line.nrc[i] * line.qty;
        if (v === 0) {
          shown.delete(nrcEl);
          nrcEl.textContent = "Waived";
          nrcEl.classList.add("is-waived");
        } else tween(nrcEl, v, (n) => money(n));
      }
      if (!line.mrc) mrcEl.classList.add("is-zero");
      if (!line.nrc) nrcEl.classList.add("is-zero");

      // internal columns
      const buyEl = cell("buy")!;
      const mEl = cell("margin")!;
      let sell: number;
      let buy: number;
      if (line.mrc) {
        sell = line.mrc[i] * line.qty;
        buy = (line.buy ?? 0) * line.qty;
      } else {
        sell = (line.nrc?.[i] ?? 0) * line.qty;
        buy = (line.buyNrc ?? 0) * line.qty;
      }
      buyEl.textContent = money(buy);
      const m = sell ? (sell - buy) / sell : null;
      mEl.textContent = m === null ? "Absorbed" : pct(m);
      mEl.classList.toggle("is-low", m === null || m < 0.2);

      const flag = cell("flag");
      if (flag) {
        flag.hidden = state.term === 12;
        flag.textContent = state.term === 36 ? "Approved waiver" : "Approved discount";
      }
      if (flash) {
        row.classList.remove("flash");
        void row.offsetWidth;
        row.classList.add("flash");
      }
    }

    for (const [id, opt] of Object.entries(OPTIONS)) {
      const el = section.querySelector<HTMLElement>(`[data-optprice="${id}"]`);
      if (el) el.textContent = `+${money(opt.mrc![i] * opt.qty)}/mo`;
    }

    const t = totalsFor(state.term, state.opts);
    const base = totalsFor(12, state.opts);
    document.querySelectorAll<HTMLElement>('[data-total="mrc"], [data-total="mrc-bar"]').forEach((el) => tween(el, t.mrc, (n) => money(n)));
    document.querySelectorAll<HTMLElement>('[data-total="nrc"]').forEach((el) => tween(el, t.nrc, (n) => money(n)));
    document.querySelectorAll<HTMLElement>('[data-total="tcv"]').forEach((el) => tween(el, t.tcv, (n) => money(n)));
    document.querySelectorAll<HTMLElement>('[data-total="margin"]').forEach((el) => (el.textContent = pct(t.margin)));
    for (const s of ["hq", "wh", "dp"] as Site[]) {
      const el = document.querySelector<HTMLElement>(`[data-site="${s}"]`);
      if (el) tween(el, t.sites[s], (n) => money(n));
    }

    const save = section.querySelector<HTMLElement>("[data-save]")!;
    const diff = base.mrc - t.mrc;
    save.classList.toggle("is-none", diff <= 0);
    save.textContent = diff > 0 ? `Saving ${money(diff)}/mo against the 12‑month term` : "Choose 24 or 36 months to lower the monthly price";

    document.querySelectorAll<HTMLElement>("[data-term-label]").forEach((el) => (el.textContent = `${state.term} months`));
    document.querySelectorAll<HTMLElement>("[data-bar-term]").forEach((el) => (el.textContent = `${state.term}-month`));
    const names = [...state.opts].map((id) => OPTIONS[id].label);
    document.querySelectorAll<HTMLElement>("[data-opts-label]").forEach((el) => (el.textContent = names.length ? names.join(", ") : "None selected"));
    document.querySelectorAll<HTMLElement>("[data-opts-audit]").forEach((el) => (el.textContent = names.length ? names.join(", ") : "no upgrades"));
  };

  seg.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    state.term = Number(input.value) as Term;
    placeThumb();
    render(true);
  });
  section.querySelectorAll<HTMLInputElement>("[data-opt]").forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) state.opts.add(box.dataset.opt!);
      else state.opts.delete(box.dataset.opt!);
      render();
    });
  });
  toggle.addEventListener("click", () => {
    state.internal = !state.internal;
    toggle.setAttribute("aria-pressed", String(state.internal));
    toggle.lastChild!.textContent = state.internal ? "Hide sales view" : "Show sales view";
    section.classList.toggle("is-internal", state.internal);
  });

  // Sync with whatever the browser restored into the form controls.
  const checked = seg.querySelector<HTMLInputElement>("input:checked");
  if (checked) state.term = Number(checked.value) as Term;
  section.querySelectorAll<HTMLInputElement>("[data-opt]:checked").forEach((b) => state.opts.add(b.dataset.opt!));
  render();
  placeThumb();
  new ResizeObserver(placeThumb).observe(seg);
  document.fonts?.ready.then(placeThumb);
}

/* ───────── Network diagram: lines drawn between real DOM nodes ───────── */

const SVG_NS = "http://www.w3.org/2000/svg";

function initNetwork() {
  const fig = document.querySelector<HTMLElement>("[data-net]");
  if (!fig) return;
  const stage = fig.querySelector<HTMLElement>(".net__stage")!;
  const svg = stage.querySelector<SVGSVGElement>(".net__lines")!;
  const pulsesEl = stage.querySelector<HTMLElement>(".net__pulses")!;
  const cursor = stage.querySelector<HTMLElement>(".net__cursor")!;
  const node = (id: string) => stage.querySelector<HTMLElement>(`[data-node="${id}"]`)!;

  const links: [string, string, "p" | "s" | "b"][] = [
    ["hq", "core", "p"],
    ["wh", "core", "p"],
    ["dp", "core", "p"],
    ["core", "inet", "s"],
    ["core", "pbx", "s"],
    ["core", "m365", "s"],
    ["hq", "inet", "b"],
  ];
  const paths = links.map(([, , kind]) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("pathLength", "1");
    p.classList.add(`is-${kind}`);
    svg.appendChild(p);
    return p;
  });
  const pulses = links
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l[2] !== "b")
    .map(({ i }, k) => {
      const dot = document.createElement("span");
      dot.className = "net__pulse";
      dot.style.animationDelay = `${(k % 3) * 0.9 + (k > 2 ? 1.6 : 0)}s`;
      pulsesEl.appendChild(dot);
      return { dot, i };
    });

  const layout = () => {
    const box = stage.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    links.forEach(([a, b], i) => {
      const ra = node(a).getBoundingClientRect();
      const rb = node(b).getBoundingClientRect();
      const ax = ra.left + ra.width / 2 - box.left;
      const ay = ra.top + ra.height / 2 - box.top;
      const bx = rb.left + rb.width / 2 - box.left;
      const by = rb.top + rb.height / 2 - box.top;
      let d: string;
      if (Math.abs(bx - ax) > Math.abs(by - ay)) {
        const dir = Math.sign(bx - ax);
        const x1 = ax + (dir * ra.width) / 2;
        const x2 = bx - (dir * rb.width) / 2;
        const mx = (x1 + x2) / 2;
        d = `M${x1} ${ay}C${mx} ${ay} ${mx} ${by} ${x2} ${by}`;
      } else {
        const dir = Math.sign(by - ay);
        const y1 = ay + (dir * ra.height) / 2;
        const y2 = by - (dir * rb.height) / 2;
        const my = (y1 + y2) / 2;
        d = `M${ax} ${y1}C${ax} ${my} ${bx} ${my} ${bx} ${y2}`;
      }
      paths[i].setAttribute("d", d);
    });
    for (const { dot, i } of pulses) dot.style.offsetPath = `path("${paths[i].getAttribute("d")}")`;
  };

  layout();
  new ResizeObserver(layout).observe(stage);

  const backup = paths[paths.length - 1];
  const finish = () => {
    fig.classList.add("is-in", "is-drawn", "is-backup");
    backup.removeAttribute("pathLength");
    backup.classList.add("is-dashed");
  };
  if (prefersReducedMotion) {
    finish();
    return;
  }

  onceVisible(
    fig,
    () => {
      fig.classList.add("is-in");
      window.setTimeout(() => fig.classList.add("is-drawn"), 450);
      // Engineering's cursor drops in and adds the 5G failover link.
      window.setTimeout(() => {
        const box = stage.getBoundingClientRect();
        const hq = node("hq").getBoundingClientRect();
        const inet = node("inet").getBoundingClientRect();
        const horizontal = Math.abs(inet.left - hq.left) > Math.abs(inet.top - hq.top);
        const tx = horizontal ? hq.right - box.left + 8 : hq.left - box.left + hq.width * 0.4;
        const ty = horizontal ? hq.top - box.top + hq.height * 0.5 : hq.top - box.top + 2;
        // Stacked layout: glide in along the gap above the site row, clear of node text.
        cursor.style.transition = "none";
        cursor.style.setProperty("--cx", `${box.width * 0.62}px`);
        cursor.style.setProperty("--cy", `${horizontal ? box.height * 0.92 : ty}px`);
        void cursor.offsetWidth;
        cursor.style.transition = "";
        cursor.classList.add("is-on");
        requestAnimationFrame(() => {
          cursor.style.setProperty("--cx", `${tx}px`);
          cursor.style.setProperty("--cy", `${ty}px`);
        });
      }, 1700);
      window.setTimeout(() => {
        node("hq").classList.add("is-target");
        fig.classList.add("is-backup");
      }, 3200);
      window.setTimeout(() => {
        backup.removeAttribute("pathLength");
        backup.classList.add("is-dashed");
        node("hq").classList.remove("is-target");
      }, 4500);
      window.setTimeout(() => cursor.classList.remove("is-on"), 5600);
    },
    0.35,
  );
}

/* ───────── Proposal shell: sticky bar, progress, active tab, notes ───────── */

function initShell() {
  const pp = document.querySelector<HTMLElement>("[data-pp]");
  if (!pp) return;
  const barrow = pp.querySelector<HTMLElement>(".pp-barrow")!;
  const progress = pp.querySelector<HTMLElement>(".pp-bar__progress")!;
  const tabs = [...pp.querySelectorAll<HTMLAnchorElement>(".pp-bar__tabs a")];
  const sections = [...pp.querySelectorAll<HTMLElement>(".pp-sec")];

  let ticking = false;
  const update = () => {
    ticking = false;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--qc-header-h")) || 64;
    const r = pp.getBoundingClientRect();
    const b = barrow.getBoundingClientRect();
    barrow.classList.toggle("is-stuck", r.top < headerH - 1 && b.top <= headerH + 1);
    const span = r.height - window.innerHeight * 0.5;
    const p = Math.min(1, Math.max(0, (headerH - r.top) / span));
    progress.style.setProperty("--p", p.toFixed(4));
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  if ("IntersectionObserver" in window) {
    const active = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).id;
          tabs.forEach((t) => t.setAttribute("aria-current", String(t.getAttribute("href") === `#${id}`)));
        }
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    sections.filter((s) => s.id).forEach((s) => active.observe(s));

    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-seen");
          seen.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    sections.forEach((s) => seen.observe(s));
  } else sections.forEach((s) => s.classList.add("is-seen"));
  if (prefersReducedMotion) sections.forEach((s) => s.classList.add("is-seen"));

  // Notes collapse to tappable markers on smaller screens.
  pp.querySelectorAll<HTMLElement>(".anno").forEach((anno, i) => {
    const pin = anno.querySelector<HTMLButtonElement>(".anno__pin")!;
    const card = anno.querySelector<HTMLElement>(".anno__card")!;
    card.id = `anno-${i + 1}`;
    pin.setAttribute("aria-controls", card.id);
    pin.addEventListener("click", () => {
      const open = !anno.classList.contains("is-open");
      anno.classList.toggle("is-open", open);
      pin.setAttribute("aria-expanded", String(open));
    });
  });

  const gantt = pp.querySelector<HTMLElement>("[data-gantt]");
  if (gantt) onceVisible(gantt, () => gantt.classList.add("is-on"), 0.4);
}

/* ───────── Accept & e-sign ───────── */

function initSign() {
  const form = document.querySelector<HTMLFormElement>("[data-sign]");
  if (!form) return;
  const name = form.querySelector<HTMLInputElement>("[data-sign-name]")!;
  const agree = form.querySelector<HTMLInputElement>("[data-sign-agree]")!;
  const script = form.querySelector<HTMLElement>("[data-sign-script]")!;
  const sig = form.querySelector<HTMLElement>(".sign__sig")!;
  const err = form.querySelector<HTMLElement>("[data-sign-err]")!;
  const pad = form.querySelector<HTMLElement>(".sign__pad")!;
  const done = form.querySelector<HTMLElement>("[data-sign-done]")!;
  const who = form.querySelector<HTMLElement>("[data-sign-who]")!;
  const time = form.querySelector<HTMLElement>("[data-sign-time]")!;
  const btn = form.querySelector<HTMLButtonElement>("[data-sign-btn]")!;
  const placeholder = script.textContent ?? "";

  const sync = () => {
    const v = name.value.trim();
    script.textContent = v || placeholder;
    sig.classList.toggle("has-name", Boolean(v));
    if (v && err.textContent) err.textContent = "";
  };
  name.addEventListener("input", sync);
  agree.addEventListener("change", () => agree.checked && (err.textContent = ""));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = name.value.trim();
    if (!v) {
      err.textContent = "Type your full name to sign.";
      name.focus();
      return;
    }
    if (!agree.checked) {
      err.textContent = "Tick the box to accept the proposal terms.";
      agree.focus();
      return;
    }
    err.textContent = "";
    btn.disabled = true;
    form.classList.add("is-signed");
    who.textContent = v;
    const now = new Date();
    time.textContent = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;
    window.setTimeout(
      () => {
        pad.hidden = true;
        done.hidden = false;
        done.focus();
      },
      prefersReducedMotion ? 0 : 1000,
    );
  });

  form.querySelector<HTMLButtonElement>("[data-sign-reset]")!.addEventListener("click", () => {
    form.classList.remove("is-signed");
    name.value = "";
    agree.checked = false;
    btn.disabled = false;
    sync();
    done.hidden = true;
    pad.hidden = false;
    name.focus();
  });
}

/* ───────── Pause looping art when offscreen ───────── */

function initPausers() {
  const targets = document.querySelectorAll<HTMLElement>(".cv, .pp-cover, .close, .net, .intg");
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("is-paused", !e.isIntersecting);
  });
  targets.forEach((t) => io.observe(t));
}

initPricing();
initNetwork();
initShell();
initSign();
initPausers();
