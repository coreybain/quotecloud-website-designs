import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const hasIO = "IntersectionObserver" in window;
const TERMS = [12, 24, 36] as const;

const money = (n: number) => (n === 0 ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const values = (el: HTMLElement, key: "m" | "n") => (el.dataset[key] ?? "0,0,0").split(",").map(Number);

/** Is the element (or its live section) currently on screen? */
const isLive = (el: Element) => !hasIO || !!el.closest("[data-sg-live]")?.classList.contains("is-live");

/* ───────── Live state: .is-live while a section is on screen (pauses CSS loops offscreen) ───────── */

function initLive() {
  const els = $$("[data-sg-live]");
  if (!hasIO) {
    els.forEach((el) => el.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("is-live", e.isIntersecting);
  });
  els.forEach((el) => io.observe(el));
}

/** Tween a money total from its current value to `to`. */
function tweenMoney(el: HTMLElement, to: number) {
  const from = Number(el.dataset.value ?? to);
  el.dataset.value = String(to);
  if (prefersReducedMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const dur = 650;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Re-price every [data-m]/[data-n] cell under `root` for term index `ti`; returns totals. */
function applyTerm(root: HTMLElement, ti: number) {
  let m = 0;
  let n = 0;
  for (const key of ["m", "n"] as const) {
    $$(`[data-${key}]`, root).forEach((cell) => {
      const v = values(cell, key)[ti];
      if (key === "m") m += v;
      else n += v;
      const text = money(v);
      if (cell.textContent !== text) {
        cell.textContent = text;
        if (!prefersReducedMotion) {
          cell.classList.remove("is-tick");
          void cell.offsetWidth;
          cell.classList.add("is-tick");
        }
      }
    });
  }
  return { m, n };
}

/* ───────── Hero: term cycling + pointer/scroll parallax ───────── */

function initHero() {
  const hero = $("[data-sg-hero]");
  const stage = $("[data-sg-stage]");
  const quote = $("[data-sg-hero-quote]");
  if (!hero || !stage || !quote) return;

  $$("[data-depth]", stage).forEach((el) => el.style.setProperty("--d", el.dataset.depth ?? "0.5"));

  const pills = $$("[data-t]", quote);
  const totM = $("[data-total='m']", quote)!;
  const totN = $("[data-total='n']", quote)!;
  totM.dataset.value = "4417";
  totN.dataset.value = "13900";
  let ti = 1;

  if (!prefersReducedMotion) {
    window.setInterval(() => {
      if (!isLive(hero) || document.hidden) return;
      ti = (ti + 1) % 3;
      pills.forEach((p, i) => p.classList.toggle("is-on", i === ti));
      const { m, n } = applyTerm(quote, ti);
      tweenMoney(totM, m);
      tweenMoney(totN, n);
    }, 3400);
  }

  if (prefersReducedMotion) return;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1081px)");
  let raf = 0;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    raf = 0;
    stage.style.setProperty("--px", tx.toFixed(3));
    stage.style.setProperty("--py", ty.toFixed(3));
    const sy = Math.min(1, window.scrollY / Math.max(1, hero.offsetHeight));
    stage.style.setProperty("--sy", sy.toFixed(3));
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  hero.addEventListener("pointermove", (e) => {
    if (!fine.matches) return;
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    queue();
  });
  hero.addEventListener("pointerleave", () => {
    tx = 0;
    ty = 0;
    queue();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY < hero.offsetHeight * 1.2) queue();
    },
    { passive: true },
  );
}

/* ───────── Build: contract-term quote ───────── */

function initQuote() {
  const quote = $("[data-sg-quote]");
  if (!quote) return;
  const group = $(".sg-terms", quote)!;
  const buttons = $$<HTMLButtonElement>("[data-term]", group);
  const totals = {
    m: $("[data-total='m']", quote)!,
    n: $("[data-total='n']", quote)!,
    tcv: $("[data-total='tcv']", quote)!,
  };
  const label = $("[data-term-label]", quote)!;
  totals.m.dataset.value = "6223";
  totals.n.dataset.value = "17500";
  totals.tcv.dataset.value = "166852";
  let touched = false;
  let current = 1;

  const select = (ti: number, focus = false) => {
    current = ti;
    group.style.setProperty("--i", String(ti));
    buttons.forEach((b, i) => {
      const on = i === ti;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    const { m, n } = applyTerm(quote, ti);
    const term = TERMS[ti];
    tweenMoney(totals.m, m);
    tweenMoney(totals.n, n);
    tweenMoney(totals.tcv, m * term + n);
    label.textContent = `over ${term} months`;
  };

  buttons.forEach((b, i) => {
    b.tabIndex = i === current ? 0 : -1;
    b.addEventListener("click", () => {
      touched = true;
      select(i);
    });
    b.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      touched = true;
      select((current + dir + 3) % 3, true);
    });
  });

  // One gentle demonstration: show the 36-month price once the quote is in view.
  if (!prefersReducedMotion) {
    onceVisible(
      quote,
      () => {
        window.setTimeout(() => !touched && select(2), 1400);
      },
      0.2,
    );
  }
}

/* ───────── Protect: catalogue, margins, approvals, tiers ───────── */

const CATALOGUE: [string, string, string][][] = [
  [
    ["FBR-1G-ENT", "Business fibre 1 Gbps", "$449"],
    ["FBR-500-BIZ", "Business fibre 500 Mbps", "$329"],
    ["SDW-EDGE-S", "SD-WAN edge · small site", "$115"],
    ["LTE-FAIL-01", "4G failover service", "$45"],
  ],
  [
    ["PBX-SEAT-STD", "Hosted PBX seat", "$25"],
    ["SIP-30CH", "SIP trunk · 30 channels", "$190"],
    ["UC-TEAMS-DR", "Teams direct routing", "$9"],
    ["DID-100", "Number block · 100 DIDs", "$30"],
  ],
  [
    ["MOB-5G-60", "5G Business 60GB plan", "$69"],
    ["DEV-PHN-128", "Smartphone 128GB on plan", "$0"],
    ["MOB-5G-UNL", "5G Unlimited plan", "$89"],
    ["MBB-5G-200", "Mobile broadband 200GB", "$55"],
  ],
  [
    ["BND-SMB-OFFICE", "Office bundle · fibre + voice + Wi-Fi", "$699"],
    ["BND-MULTI-SITE", "Multi-site bundle · SD-WAN + support", "$1,290"],
    ["BND-MOBILE-25", "Fleet bundle · 25 plans + devices", "$1,725"],
    ["BND-M365-UC", "Cloud bundle · M365 + UC", "$31"],
  ],
];
const QUERIES = ["fibre", "voice", "5g", "bundle"];

function initCatalogue() {
  const root = $("[data-sg-cat]");
  if (!root) return;
  const tabs = $$("li", $(".sg-cat__tabs", root)!);
  const list = $("[data-sg-cat-list]", root)!;
  const query = $("[data-sg-cat-query]", root)!;
  let i = 0;
  if (prefersReducedMotion) return;
  window.setInterval(() => {
    if (!isLive(root) || document.hidden) return;
    i = (i + 1) % CATALOGUE.length;
    tabs.forEach((t, k) => t.classList.toggle("is-on", k === i));
    query.textContent = QUERIES[i];
    list.innerHTML = CATALOGUE[i]
      .map(([sku, name, price], k) => `<li style="--i:${k}"><code>${sku}</code><span>${name}</span><b>${price}</b></li>`)
      .join("");
  }, 2900);
}

function initMargins() {
  const root = $("[data-sg-margin]");
  const btn = $<HTMLButtonElement>("[data-sg-margin-toggle]");
  if (!root || !btn) return;
  let touched = false;
  const set = (on: boolean) => {
    btn.setAttribute("aria-pressed", String(on));
    root.classList.toggle("is-customer", on);
  };
  btn.addEventListener("click", () => {
    touched = true;
    set(btn.getAttribute("aria-pressed") !== "true");
  });
  if (prefersReducedMotion) return;
  window.setInterval(() => {
    if (touched || !isLive(root) || document.hidden) return;
    set(btn.getAttribute("aria-pressed") !== "true");
  }, 3600);
}

function initFlow() {
  const root = $("[data-sg-flow]");
  if (!root) return;
  const steps = $$("li", root);
  if (prefersReducedMotion) {
    steps.forEach((s) => s.classList.add("is-done"));
    return;
  }
  let k = 0;
  const run = () => {
    if (isLive(root) && !document.hidden) {
      if (k < steps.length) {
        steps[k].classList.add("is-done");
        k++;
      } else {
        steps.forEach((s) => s.classList.remove("is-done"));
        k = 0;
      }
    }
    window.setTimeout(run, k === steps.length ? 3200 : k === 0 ? 700 : 1000);
  };
  onceVisible(root, run, 0.4);
}

function initTiers() {
  const root = $("[data-sg-tiers]");
  if (!root) return;
  const input = $<HTMLInputElement>("input", root)!;
  const out = $("[data-sg-seats-out]", root)!;
  const total = $("[data-sg-seats-total]", root)!;
  const bars = $$("[data-tier]", root);
  const prices = [32, 25, 21];
  const update = () => {
    const q = Number(input.value);
    const tier = q >= 50 ? 2 : q >= 10 ? 1 : 0;
    out.textContent = String(q);
    bars.forEach((b, i) => b.classList.toggle("is-on", i === tier));
    total.innerHTML = `${money(q * prices[tier])}<small>/mo</small>`;
    const pct = ((q - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--fill", `${pct}%`);
    input.setAttribute("aria-valuetext", `${q} seats at $${prices[tier]} per seat`);
  };
  input.addEventListener("input", update);
  update();
}

/* ───────── Team: diagram draws, sites cycle, backup link gets added ───────── */

function initEditor() {
  const ed = $("[data-sg-editor]");
  if (!ed) return;
  const sites = $$("span", $("[data-sg-sites]", ed)!);
  const nodes = $$("[data-site]", ed);
  const setSite = (i: number) => {
    sites.forEach((s, k) => s.classList.toggle("is-on", k === i));
    nodes.forEach((n, k) => n.classList.toggle("is-on", k === i));
  };
  setSite(0);
  if (prefersReducedMotion) {
    ed.classList.add("is-on", "is-backup");
    return;
  }
  onceVisible(
    ed,
    () => {
      ed.classList.add("is-on");
      window.setTimeout(() => {
        ed.classList.add("is-backup");
        setSite(2);
      }, 3600);
      let i = 2;
      window.setTimeout(() => {
        window.setInterval(() => {
          if (!isLive(ed) || document.hidden) return;
          i = (i + 1) % 3;
          setSite(i);
        }, 2600);
      }, 5200);
    },
    0.3,
  );
}

/* ───────── Close: options update the total, then the signature lands ───────── */

function initAccept() {
  const root = $("[data-sg-accept]");
  if (!root) return;
  const base = 5554;
  const boxes = $$<HTMLInputElement>("input[type='checkbox']", root);
  const total = $("[data-sg-accept-total]", root)!;
  total.dataset.value = String(base);
  let touched = false;
  const update = () => tweenMoney(total, base + boxes.reduce((s, b) => s + (b.checked ? Number(b.dataset.add) : 0), 0));
  boxes.forEach((b) =>
    b.addEventListener("change", () => {
      touched = true;
      update();
    }),
  );
  if (prefersReducedMotion) {
    root.classList.add("is-signed", "is-stamped");
    return;
  }
  onceVisible(
    root,
    () => {
      window.setTimeout(() => {
        if (touched) return;
        boxes[0].checked = true;
        update();
      }, 900);
      window.setTimeout(() => root.classList.add("is-signed"), 1900);
      window.setTimeout(() => root.classList.add("is-stamped"), 4300);
    },
    0.3,
  );
}

/* ───────── Integrations: wires from each logo into the hub ───────── */

function initHub() {
  const hub = $("[data-sg-hub]");
  const svg = $<SVGSVGElement>("[data-sg-hub-svg]");
  const core = $(".sg-hub__q");
  if (!hub || !svg || !core) return;
  const draw = () => {
    const h = hub.getBoundingClientRect();
    const c = core.getBoundingClientRect();
    const cx = c.left + c.width / 2 - h.left;
    const cy = c.top + c.height / 2 - h.top;
    svg.setAttribute("viewBox", `0 0 ${h.width} ${h.height}`);
    let paths = "";
    $$(".sg-logo", hub).forEach((logo, i) => {
      const r = logo.getBoundingClientRect();
      const out = !!logo.closest(".sg-hub__col--out");
      const x = r.left + r.width / 2 - h.left;
      const y = r.top + r.height / 2 - h.top;
      const horizontal = Math.abs(x - cx) > Math.abs(y - cy);
      const [x1, y1, x2, y2] = out ? [cx, cy, x, y] : [x, y, cx, cy];
      const d = horizontal
        ? `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
        : `M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
      paths += `<path class="sg-w" d="${d}"/><path class="sg-p${out ? " sg-p--out" : ""}" pathLength="100" style="animation-delay:${(-i * 0.47).toFixed(2)}s" d="${d}"/>`;
    });
    svg.innerHTML = paths;
  };
  draw();
  new ResizeObserver(draw).observe(hub);
}

/* ───────── Mobile sticky CTA: after the hero, hidden near the closing CTA and footer ───────── */

function initSticky() {
  const bar = $("[data-sg-sticky]");
  const hero = $("[data-sg-hero]");
  const final = $("[data-sg-final]");
  const footer = $(".qc-footer");
  if (!bar || !hero || !hasIO) return;
  bar.hidden = false;
  bar.classList.add("is-away");
  let heroVisible = true;
  let endVisible = false;
  const sync = () => bar.classList.toggle("is-away", heroVisible || endVisible);
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    sync();
  }).observe(hero);
  const ends = new Set<Element>();
  const endIO = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? ends.add(e.target) : ends.delete(e.target);
    endVisible = ends.size > 0;
    sync();
  });
  if (final) endIO.observe(final);
  if (footer) endIO.observe(footer);
}

initLive();
initHero();
initQuote();
initCatalogue();
initMargins();
initFlow();
initTiers();
initEditor();
initAccept();
initHub();
initSticky();
