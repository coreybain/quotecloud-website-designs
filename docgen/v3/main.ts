import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* docgen v3 — "Generate One Now". Everything here is illustrative sample UI. */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Calls back whenever `target` enters/leaves the viewport (used to pause loops offscreen). */
function whileVisible(target: Element, onChange: (visible: boolean) => void, threshold = 0) {
  if (!("IntersectionObserver" in window)) return onChange(true);
  new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), { threshold }).observe(target);
}

/** Tweens a money value inside `el`. */
const tweens = new WeakMap<Element, number>();
function tweenMoney(el: Element, from: number, to: number, ms = 650) {
  cancelAnimationFrame(tweens.get(el) ?? 0);
  if (prefersReducedMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = money(from + (to - from) * easeOut(t));
    if (t < 1) tweens.set(el, requestAnimationFrame(tick));
  };
  tweens.set(el, requestAnimationFrame(tick));
}
const parseMoney = (s: string | null) => Number((s ?? "").replace(/[^0-9.]/g, "")) || 0;

/* ═════════════════ HERO GENERATOR ═════════════════ */

type Item = [name: string, qty: number, amount: number];
interface Client {
  company: string;
  contact: string;
  source: string;
  project: string;
  items: Item[];
}
type TemplateKey = "proposal" | "quote" | "contract";
type ThemeKey = "coral" | "violet" | "graphite" | "ocean";

const CLIENTS: Record<string, Client> = {
  lumen: {
    company: "Lumen Solar Co.",
    contact: "Maya Chen",
    source: "HubSpot",
    project: "Solar install program",
    items: [
      ["Site survey & design", 1, 2400],
      ["Panel supply", 24, 14880],
      ["Installation", 1, 6200],
    ],
  },
  harbour: {
    company: "Harbour & Pine Architects",
    contact: "Tom Okafor",
    source: "Salesforce",
    project: "Office fit-out",
    items: [
      ["Space planning", 1, 3800],
      ["Furniture package", 1, 18450],
      ["Project management", 1, 4600],
    ],
  },
  northbeam: {
    company: "Northbeam Logistics",
    contact: "Priya Nair",
    source: "Pipedrive",
    project: "Fleet tracking rollout",
    items: [
      ["Tracking devices", 40, 9600],
      ["Platform licence (12 mo)", 1, 7200],
      ["Driver training", 1, 2100],
    ],
  },
};
const CUSTOM_ITEMS: Item[] = [
  ["Discovery workshop", 1, 2500],
  ["Implementation", 1, 12000],
  ["Support (12 months)", 1, 4800],
];
const EXTRA: Item = ["Onboarding & training", 1, 1500];
const THEME_COVER: Record<ThemeKey, string> = { coral: "#ff4d47", violet: "#5b3df5", graphite: "#2b2f3a", ocean: "#0f7b8a" };
const THEME_NAME: Record<ThemeKey, string> = { coral: "Coral", violet: "Violet", graphite: "Graphite", ocean: "Ocean" };

const F = (k: string) => `<span class="gn-f" data-k="${k}"></span>`;
const TEMPLATES: Record<
  TemplateKey,
  { kind: string; ref: string; thead: string; intro: string; clauseTitle: string; clause: string; sign: string[] }
> = {
  proposal: {
    kind: "Proposal",
    ref: "P-1042",
    thead: "Investment",
    intro: `Hi ${F("first")}, thanks for your time last week. Here is our proposal for ${F("project")}, with pricing and next steps below.`,
    clauseTitle: "Terms & disclaimer",
    clause: "Prices valid for 30 days. Delivery subject to site survey. Standard terms apply.",
    sign: ["Accept & sign"],
  },
  quote: {
    kind: "Quote",
    ref: "Q-2187",
    thead: "Item",
    intro: `Quote for ${F("company")}, prepared for ${F("first")} from your latest opportunity in the CRM.`,
    clauseTitle: "Payment terms",
    clause: "50% deposit on acceptance, balance on completion. All amounts in USD.",
    sign: ["Accept quote"],
  },
  contract: {
    kind: "Service agreement",
    ref: "C-0316",
    thead: "Schedule of fees",
    intro: `This agreement is made between Your Company and ${F("company")} for the delivery of ${F("project")}.`,
    clauseTitle: "Liability & confidentiality",
    clause: "Each party keeps the other's information confidential. Liability is limited to the fees paid under this agreement.",
    sign: ["Signed for Your Company", "Signed for client"],
  },
};
const TOKENS: Record<string, string> = {
  company: "{{client.company}}",
  contact: "{{contact.full_name}}",
  first: "{{contact.first_name}}",
  project: "{{deal.name}}",
  ref: "{{doc.ref}}",
  valid: "{{doc.valid_until}}",
  total: "{{deal.total}}",
};
const SAMPLE_COMPANIES = [
  "Lumen Solar Co.",
  "Harbour & Pine",
  "Northbeam Logistics",
  "Ridgeway Dental",
  "Alder & Finch",
  "Coastline Gyms",
  "Meridian Freight",
  "Bluegum Studios",
  "Kestrel Legal",
  "Oakfield Homes",
];

interface GenState {
  template: TemplateKey;
  clientKey: string;
  client: Client;
  theme: ThemeKey;
  extra: boolean;
  volume: number;
}

function initGenerator() {
  const genEl = $("[data-gn-gen]");
  if (!genEl) return;
  const gen: HTMLElement = genEl;
  const form = $<HTMLFormElement>("[data-gn-form]", gen)!;
  const doc = $("[data-gn-doc]", gen)!;
  const page = $("[data-gn-page]", gen)!;
  const stage = $("[data-gn-stage]", gen)!;
  const go = $<HTMLButtonElement>("[data-gn-go]", gen)!;
  const goLabel = $("[data-gn-go-label]", gen)!;
  const status = $("[data-gn-status]", gen)!;
  const statusTxt = $("[data-gn-status-txt]", gen)!;
  const stale = $<HTMLButtonElement>("[data-gn-stale]", gen)!;
  const live = $("[data-gn-live]", gen)!;
  const pull = $("[data-gn-pull]", gen)!;
  const pullTxt = $("[data-gn-pull-txt]", gen)!;
  const company = $<HTMLInputElement>("[data-gn-company]", gen)!;
  const apiToggle = $<HTMLButtonElement>("[data-gn-api-toggle]", gen)!;
  const json = $("[data-gn-json]", gen)!;
  const batch = $("[data-gn-batch]", gen)!;
  const grid = $("[data-gn-grid]", gen)!;
  const batchCount = $("[data-gn-batch-count]", gen)!;
  const batchTotal = $("[data-gn-batch-total]", gen)!;

  // skeleton layer used while building
  const skel = document.createElement("div");
  skel.className = "gn-doc__skel";
  skel.setAttribute("aria-hidden", "true");
  skel.innerHTML = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
  page.append(skel);

  let building = false;
  let queued = false;
  let shown: GenState | null = null;

  const radio = (name: string) => (form.elements.namedItem(name) as RadioNodeList).value;
  const readState = (): GenState => {
    const typed = company.value.trim();
    const clientKey = typed ? "custom" : radio("client");
    const client: Client = typed
      ? { company: typed, contact: "Alex Morgan", source: "your CRM", project: "Growth program", items: CUSTOM_ITEMS }
      : CLIENTS[clientKey];
    return {
      template: radio("template") as TemplateKey,
      clientKey,
      client,
      theme: radio("theme") as ThemeKey,
      extra: (form.elements.namedItem("extra") as HTMLInputElement).checked,
      volume: Number(radio("volume")) || 1,
    };
  };
  const itemsOf = (s: GenState) => (s.extra ? [...s.client.items, EXTRA] : s.client.items);
  const sums = (s: GenState) => {
    const sub = itemsOf(s).reduce((a, [, , amt]) => a + amt, 0);
    const tax = Math.round(sub * 0.1);
    return { sub, tax, total: sub + tax };
  };
  const dateIn = (days: number) =>
    new Date(Date.now() + days * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const values = (s: GenState): Record<string, string> => ({
    company: s.client.company,
    contact: s.client.contact,
    first: s.client.contact.split(" ")[0],
    project: s.client.project,
    ref: TEMPLATES[s.template].ref,
    valid: dateIn(30),
    total: money(sums(s).total),
  });
  const fields = () => $$(".gn-f", page).filter((el) => !el.closest(".gn-doc__wipe"));

  const rowsHTML = (s: GenState) =>
    itemsOf(s)
      .map(
        ([n, q, a], i) =>
          `<tr${s.extra && i === itemsOf(s).length - 1 ? ' class="is-opt"' : ""}><td>${esc(n)}</td><td>${q}</td><td>${money(a)}</td></tr>`,
      )
      .join("");

  /** Writes the document for state `s`. With `tokens`, merge fields show their {{placeholders}}. */
  function render(s: GenState, tokens: boolean) {
    const t = TEMPLATES[s.template];
    doc.dataset.template = s.template;
    doc.dataset.theme = s.theme;
    $("[data-gn-kind]", page)!.textContent = t.kind;
    $("[data-gn-thead]", page)!.textContent = t.thead;
    $("[data-gn-intro]", page)!.innerHTML = t.intro;
    $("[data-gn-rows]", page)!.innerHTML = rowsHTML(s);
    $("[data-gn-clause-title]", page)!.textContent = t.clauseTitle;
    $("[data-gn-clause]", page)!.textContent = t.clause;
    $("[data-gn-sign]", page)!.innerHTML = t.sign
      .map(
        (label, i) =>
          `<div><span class="gn-doc__line"></span><small>${esc(label)}${
            t.sign.length === 1 || i === 1 ? ` · ${F("contact")}` : ""
          }</small></div>`,
      )
      .join("");
    const { sub, tax } = sums(s);
    $("[data-gn-sub]", page)!.textContent = money(sub);
    $("[data-gn-tax]", page)!.textContent = money(tax);
    const v = values(s);
    for (const el of fields()) {
      const k = el.dataset.k ?? "";
      el.classList.remove("is-filled");
      el.classList.toggle("is-token", tokens);
      el.textContent = tokens ? TOKENS[k] : v[k];
    }
  }

  function setStatus(on: boolean, text?: string) {
    if (text) statusTxt.textContent = text;
    status.classList.toggle("is-off", !on);
    status.classList.toggle("is-on", on);
  }

  function setStale(on: boolean) {
    stage.classList.toggle("is-stale", on);
    stale.hidden = !on;
    go.classList.toggle("is-attn", on);
    if (on) setStatus(false);
  }

  const updateGoLabel = () => {
    const s = readState();
    if (gen.dataset.mode === "api") {
      goLabel.textContent = s.volume === 1 ? "Generate 1 document" : `Generate ${s.volume.toLocaleString("en-US")} documents`;
    } else {
      goLabel.textContent = `Generate ${TEMPLATES[s.template].kind.toLowerCase()}`;
    }
  };

  const updateSummaries = () => {
    const s = readState();
    const set = (k: string, v: string) => {
      const el = $(`[data-sum="${k}"]`, gen);
      if (el) el.textContent = v;
    };
    set("template", TEMPLATES[s.template].kind.replace("Service agreement", "Contract"));
    set("client", s.client.company.replace(/ (Co\.|Architects|Logistics)$/, ""));
    set("theme", THEME_NAME[s.theme]);
    set("extra", s.extra ? "On" : "Off");
  };

  function renderJSON() {
    const s = readState();
    const body = {
      template: s.template,
      theme: s.theme,
      client: {
        company: s.client.company,
        contact: s.client.contact,
        source: s.client.source.toLowerCase().replace(/\s+/g, "_"),
      },
      options: { onboarding: s.extra },
      records: s.volume,
      deliver: ["email", "pdf"],
    };
    const text = esc(JSON.stringify(body, null, 2));
    json.innerHTML = text
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, (_m, str: string, colon?: string) =>
        colon ? `<span class="k">${str}</span><span class="p">:</span>` : `<span class="s">${str}</span>`,
      )
      .replace(/(:\s)(\d+|true|false)/g, '$1<span class="n">$2</span>')
      .replace(/([{}[\],])/g, '<span class="p">$1</span>');
  }

  function exitBatch() {
    stage.classList.remove("is-batch");
    batch.hidden = true;
    grid.textContent = "";
  }

  /** Theme re-skin: a clone of the old cover wipes away to reveal the new theme. */
  function applyTheme(theme: ThemeKey) {
    if (doc.dataset.theme === theme) return;
    const cover = $(".gn-doc__cover", page)!;
    if (!prefersReducedMotion && !building) {
      const clone = cover.cloneNode(true) as HTMLElement;
      clone.classList.remove("gn-blk", "is-in");
      clone.classList.add("gn-doc__wipe");
      clone.style.background = getComputedStyle(cover).backgroundColor;
      clone.style.height = `${cover.offsetHeight}px`;
      page.append(clone);
      clone
        .animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }], {
          duration: 750,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        })
        .finished.then(() => clone.remove(), () => clone.remove());
    }
    doc.dataset.theme = theme;
    $$<HTMLElement>(".gn-th", grid).forEach((th) => th.style.setProperty("--d-cover", THEME_COVER[theme]));
    if (shown) shown.theme = theme;
  }

  /** Optional line item: row slides in/out, totals re-tween. */
  function applyExtra(on: boolean) {
    if (!shown || building) return;
    const before = sums(shown).total;
    shown.extra = on;
    const { sub, tax, total } = sums(shown);
    $("[data-gn-rows]", page)!.innerHTML = rowsHTML(shown);
    if (on) $("[data-gn-rows] tr:last-child", page)?.classList.add("is-new");
    $("[data-gn-sub]", page)!.textContent = money(sub);
    $("[data-gn-tax]", page)!.textContent = money(tax);
    const totalEl = $('.gn-f[data-k="total"]', page)!;
    totalEl.classList.remove("is-filled");
    void totalEl.offsetWidth;
    totalEl.classList.add("is-filled");
    tweenMoney(totalEl, before, total);
    live.textContent = `Total updated to ${money(total)}.`;
  }

  async function buildSingle(s: GenState) {
    exitBatch();
    setStale(false);
    const t = TEMPLATES[s.template];
    if (prefersReducedMotion) {
      render(s, false);
      shown = { ...s };
      setStatus(true, `${t.kind} ready to send`);
      live.textContent = `${t.kind} for ${s.client.company} generated. Total ${money(sums(s).total)}.`;
      return;
    }
    setStatus(false);
    const blocks = $$(".gn-blk", page).filter((el) => !el.classList.contains("gn-doc__wipe"));
    blocks.forEach((b) => b.classList.remove("is-in"));
    doc.classList.add("is-building", "is-blank");
    render(s, true);
    pullTxt.textContent = `Pulling record from ${s.client.source}`;
    pull.classList.add("is-on");
    await wait(380);
    doc.classList.remove("is-blank");
    for (const b of blocks) {
      b.classList.add("is-in");
      if (b.querySelector("tbody")) {
        for (const tr of $$("tbody tr", b)) {
          await wait(90);
          tr.classList.add("is-in");
        }
      }
      await wait(120);
    }
    await wait(160);
    const v = values(s);
    const total = sums(s).total;
    for (const el of fields()) {
      const k = el.dataset.k ?? "";
      el.classList.remove("is-token");
      el.classList.add("is-filled");
      if (k === "total") tweenMoney(el, 0, total, 700);
      else el.textContent = v[k];
      await wait(k === "project" || k === "company" ? 130 : 85);
    }
    await wait(450);
    pull.classList.remove("is-on");
    doc.classList.remove("is-building");
    $$("tbody tr", page).forEach((tr) => tr.classList.remove("is-in"));
    blocks.forEach((b) => b.classList.remove("is-in"));
    shown = { ...s };
    setStatus(true, `${t.kind} ready to send`);
    live.textContent = `${t.kind} for ${s.client.company} generated. Total ${money(total)}.`;
  }

  /** API volume: fills a grid of personalised thumbnails. */
  async function buildBatch(s: GenState) {
    setStale(false);
    setStatus(false);
    const n = s.volume;
    stage.classList.add("is-batch");
    batch.hidden = false;
    batchTotal.textContent = n.toLocaleString("en-US");
    batchCount.textContent = "0";
    grid.textContent = "";
    grid.dataset.size = n <= 10 ? "lg" : n <= 100 ? "md" : "xs";
    // fit n portrait tiles into the grid box
    const W = grid.clientWidth;
    const H = grid.clientHeight;
    const gap = n <= 10 ? 14 : n <= 100 ? 6 : 3;
    let best = { c: 1, w: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = Math.min((W - gap * (c - 1)) / c, ((H - gap * (r - 1)) / r) * 0.75);
      if (w > best.w) best = { c, w };
    }
    grid.style.gridTemplateColumns = `repeat(${best.c}, ${Math.floor(best.w)}px)`;
    grid.style.gap = `${gap}px`;
    const names = company.value.trim() ? [company.value.trim(), ...SAMPLE_COMPANIES] : SAMPLE_COMPANIES;
    const frag = document.createDocumentFragment();
    const tiles: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      const th = document.createElement("div");
      th.className = "gn-th";
      th.style.setProperty("--d-cover", THEME_COVER[s.theme]);
      if (n <= 10) {
        const b = document.createElement("b");
        b.textContent = names[i % names.length];
        th.append(b);
      }
      tiles.push(th);
      frag.append(th);
    }
    grid.append(frag);
    const done = () => {
      tiles.forEach((t) => t.classList.add("is-on"));
      batchCount.textContent = n.toLocaleString("en-US");
      setStatus(true, `${n.toLocaleString("en-US")} documents generated`);
      live.textContent = `${n.toLocaleString("en-US")} personalised documents generated, emailed and archived as PDF.`;
      shown = { ...s };
    };
    if (prefersReducedMotion) return done();
    const dur = n <= 10 ? 900 : n <= 100 ? 1500 : 2200;
    await new Promise<void>((resolve) => {
      const start = performance.now();
      let on = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const target = Math.floor(n * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
        while (on < target) tiles[on++].classList.add("is-on");
        batchCount.textContent = on.toLocaleString("en-US");
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    await wait(250);
    done();
  }

  const differs = (a: GenState, b: GenState) =>
    a.template !== b.template || a.clientKey !== b.clientKey || a.client.company !== b.client.company;

  async function generate(fromUser = true) {
    if (building) {
      // a request made mid-build runs as soon as the current build lands
      if (fromUser) queued = true;
      return;
    }
    building = true;
    go.setAttribute("aria-disabled", "true");
    const s = readState();
    if (fromUser && window.matchMedia("(max-width: 860px)").matches) {
      const r = stage.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.55) stage.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    }
    try {
      if (gen.dataset.mode === "api" && s.volume > 1) await buildBatch(s);
      else await buildSingle(s);
    } finally {
      building = false;
      go.removeAttribute("aria-disabled");
    }
    if (queued) {
      queued = false;
      void generate(true);
    } else if (shown && gen.dataset.mode !== "api" && differs(readState(), shown)) {
      setStale(true);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void generate(true);
  });
  stale.addEventListener("click", () => void generate(true));

  const onChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.name === "client" && company.value) {
      company.value = "";
      company.classList.remove("is-active");
    }
    if (target === company) company.classList.toggle("is-active", !!company.value.trim());
    updateSummaries();
    updateGoLabel();
    renderJSON();
    if (target.name === "theme") return applyTheme(target.value as ThemeKey);
    if (target.name === "extra") return applyExtra(target.checked);
    if (target.name === "volume") return;
    const s = readState();
    if (shown && !building && differs(s, shown)) {
      setStale(true);
    } else if (shown && !stage.classList.contains("is-batch")) {
      setStale(false);
      setStatus(true);
    }
  };
  form.addEventListener("change", onChange);
  company.addEventListener("input", onChange);
  company.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void generate(true);
    }
  });

  apiToggle.addEventListener("click", () => {
    const api = gen.dataset.mode !== "api";
    gen.dataset.mode = api ? "api" : "editor";
    apiToggle.setAttribute("aria-pressed", String(api));
    renderJSON();
    updateGoLabel();
    if (!api && stage.classList.contains("is-batch")) {
      exitBatch();
      setStatus(!!shown, shown ? `${TEMPLATES[shown.template].kind} ready to send` : undefined);
    }
  });

  /* mobile stepper */
  const steps = $$<HTMLButtonElement>("[data-gn-steps] [role=tab]", gen);
  const panels = $$<HTMLElement>(".gn-ctrl__editor .gn-fs", gen);
  const selectStep = (btn: HTMLButtonElement, focus = false) => {
    steps.forEach((b) => {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => p.classList.toggle("is-current", p.dataset.panel === btn.dataset.step));
    if (focus) btn.focus();
  };
  steps.forEach((btn, i) => {
    btn.addEventListener("click", () => selectStep(btn));
    btn.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      selectStep(steps[(i + d + steps.length) % steps.length], true);
    });
  });
  if (steps[0]) selectStep(steps[0]);

  // initial state + one autoplay
  updateSummaries();
  updateGoLabel();
  renderJSON();
  shown = readState();
  setStatus(true, "Proposal ready to send");
  onceVisible(gen, () => window.setTimeout(() => void generate(false), 600), 0.2);
}

/* ═════════════════ BRAND & COMPLIANCE TABS ═════════════════ */

function initBrandTabs() {
  const section = $(".gn-brand");
  const tablist = $("[data-gn-tabs]");
  if (!section || !tablist) return;
  const tabs = $$<HTMLButtonElement>("[role=tab]", tablist);
  const views = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls") ?? "")!);
  const lockView = $(".gn-view--lock");
  const TAB_MS = 6500;
  tablist.style.setProperty("--gn-tab-ms", `${TAB_MS}ms`);
  let index = 0;
  let auto = !prefersReducedMotion;
  let visible = false;
  let timer = 0;

  const select = (i: number, focus = false) => {
    index = i;
    tabs.forEach((t, j) => {
      const on = j === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      views[j].hidden = !on;
      views[j].classList.toggle("is-active", on);
    });
    lockView?.classList.toggle("is-playing", views[i] === lockView && !prefersReducedMotion);
    if (focus) tabs[i].focus();
    schedule();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    if (auto && visible) timer = window.setTimeout(() => select((index + 1) % tabs.length), TAB_MS);
  };
  const stopAuto = () => {
    auto = false;
    tablist.classList.remove("is-auto");
    window.clearTimeout(timer);
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      stopAuto();
      select(i);
    });
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      stopAuto();
      select((i + d + tabs.length) % tabs.length, true);
    });
  });
  if (auto) tablist.classList.add("is-auto");
  select(0);
  whileVisible(
    section,
    (v) => {
      visible = v;
      section.classList.toggle("is-paused", !v);
      if (v) {
        // restart the progress bar with the timer
        if (auto) select(index);
      } else window.clearTimeout(timer);
    },
    0.25,
  );

  /* theme view: one theme re-skins all three templates */
  const themeView = $("[data-gn-themeview]");
  if (!themeView) return;
  const minis = $$(".gn-mini", themeView);
  const sw = $$(".gn-tpanel__sw i", themeView);
  const colors = ["#ff4d47", "#5b3df5", "#2b2f3a", "#0f7b8a"];
  let c = 0;
  const paint = (next: number, animate: boolean) => {
    const prev = colors[c];
    c = next;
    sw.forEach((s, i) => s.classList.toggle("is-on", i === c));
    minis.forEach((m, i) => {
      m.style.setProperty("--c", colors[c]);
      if (!animate) return;
      const cover = $(".gn-mini__cover", m)!;
      const wipe = document.createElement("span");
      wipe.className = "gn-mini__wipe";
      wipe.style.background = prev;
      cover.prepend(wipe);
      wipe
        .animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }], {
          duration: 700,
          delay: i * 110,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "backwards",
        })
        .finished.then(() => wipe.remove(), () => wipe.remove());
    });
  };
  paint(0, false);
  if (prefersReducedMotion) return;
  window.setInterval(() => {
    if (!visible || themeView.hidden || document.hidden) return;
    paint((c + 1) % colors.length, true);
  }, 2000);
}

/* ═════════════════ CRM → DOCUMENT FLOW ═════════════════ */

const SOURCES: Record<string, { company: string; contact: string; deal: string; items: string; amount: number }> = {
  salesforce: { company: "Harbour & Pine Architects", contact: "Tom Okafor", deal: "Office fit-out", items: "3 line items", amount: 26850 },
  hubspot: { company: "Lumen Solar Co.", contact: "Maya Chen", deal: "Solar install program", items: "3 line items", amount: 23480 },
  dynamics: { company: "Kestrel Legal Group", contact: "Ana Ruiz", deal: "Practice systems rollout", items: "4 line items", amount: 41200 },
  monday: { company: "Bluegum Studios", contact: "Sam Whitford", deal: "Brand refresh", items: "2 line items", amount: 12600 },
};
const WIRE_KEYS = ["company", "contact", "deal", "items", "amount"];

function initFlow() {
  const flow = $("[data-gn-flow]");
  const svg = $<SVGSVGElement>("[data-gn-wires]");
  const group = $("[data-gn-src]");
  if (!flow || !svg || !group) return;
  const btns = $$<HTMLButtonElement>("button", group);
  const NS = "http://www.w3.org/2000/svg";
  let current = "salesforce";
  let auto = !prefersReducedMotion;
  let visible = false;
  let timer = 0;

  const draw = () => {
    svg.textContent = "";
    const box = flow.getBoundingClientRect();
    if (getComputedStyle(svg).display === "none") {
      const rec = $(".gn-rec", flow)!.getBoundingClientRect();
      const frag = $(".gn-frag", flow)!.getBoundingClientRect();
      flow.style.setProperty("--gn-mid", `${(rec.bottom + frag.top) / 2 - box.top}px`);
      return;
    }
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    for (const k of WIRE_KEYS) {
      const a = $(`[data-src-field="${k}"]`, flow)?.getBoundingClientRect();
      const b = $(`[data-dst="${k}"]`, flow)?.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.right - box.left;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left;
      const y2 = b.top + Math.min(b.height / 2, 18) - box.top;
      const mx = (x1 + x2) / 2;
      const d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
      for (const cls of ["w-base", "w-pulse"]) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("class", cls);
        p.setAttribute("pathLength", "1");
        p.dataset.k = k;
        svg.append(p);
      }
      for (const [cx, cy] of [
        [x1, y1],
        [x2, y2],
      ]) {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", String(cx));
        c.setAttribute("cy", String(cy));
        c.setAttribute("r", "3.5");
        svg.append(c);
      }
    }
  };

  const fill = async (key: string, animate: boolean) => {
    const data = SOURCES[key];
    const vals: Record<string, string> = {
      company: data.company,
      contact: data.contact,
      deal: data.deal,
      items: data.items,
      amount: money(data.amount),
    };
    for (const k of WIRE_KEYS) {
      const dd = $(`[data-src-field="${k}"] dd`, flow);
      if (dd) dd.textContent = vals[k];
    }
    if (!animate) {
      for (const k of WIRE_KEYS) {
        const f = $(`[data-dst="${k}"] .gn-f`, flow);
        if (f) f.textContent = vals[k];
      }
      return;
    }
    const prevAmount = parseMoney($('[data-dst="amount"] .gn-f', flow)?.textContent ?? "");
    for (const [i, k] of WIRE_KEYS.entries()) {
      const row = $(`[data-src-field="${k}"]`, flow);
      row?.classList.remove("is-sending");
      void row?.offsetWidth;
      row?.classList.add("is-sending");
      const pulse = svg.querySelector<SVGPathElement>(`.w-pulse[data-k="${k}"]`);
      if (pulse) {
        pulse.classList.remove("is-run");
        void pulse.getBoundingClientRect();
        pulse.style.animationDelay = `${i * 70}ms`;
        pulse.classList.add("is-run");
      }
    }
    await wait(520);
    for (const k of WIRE_KEYS) {
      const dst = $(`[data-dst="${k}"]`, flow);
      if (!dst) continue;
      if (k === "items") {
        dst.classList.remove("is-filled");
        void dst.offsetWidth;
        dst.classList.add("is-filled");
        continue;
      }
      const f = $(".gn-f", dst)!;
      f.classList.remove("is-filled");
      void f.offsetWidth;
      f.classList.add("is-filled");
      if (k === "amount") tweenMoney(f, prevAmount, data.amount);
      else f.textContent = vals[k];
      await wait(70);
    }
  };

  const select = (key: string, animate = true, focus = false) => {
    current = key;
    btns.forEach((b) => {
      const on = b.dataset.src === key;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    void fill(key, animate && !prefersReducedMotion);
    schedule();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    if (auto && visible) {
      timer = window.setTimeout(() => {
        const i = btns.findIndex((b) => b.dataset.src === current);
        select(btns[(i + 1) % btns.length].dataset.src ?? "salesforce");
      }, 3600);
    }
  };
  btns.forEach((b, i) => {
    b.addEventListener("click", () => {
      auto = false;
      select(b.dataset.src ?? "salesforce");
    });
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      auto = false;
      select(btns[(i + d + btns.length) % btns.length].dataset.src ?? "salesforce", true, true);
    });
  });

  draw();
  if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(flow);
  whileVisible(
    flow,
    (v) => {
      visible = v;
      if (v) {
        draw();
        schedule();
      } else window.clearTimeout(timer);
    },
    0.3,
  );
}

/* ═════════════════ API LOG FEED ═════════════════ */

function initLog() {
  const log = $("[data-gn-log]");
  const list = $("[data-gn-loglist]");
  if (!log || !list || prefersReducedMotion) return;
  const docs: [string, string, string][] = [
    ["Invoice INV-%n", "Archived", "pdf"],
    ["Renewal quote Q-%n", "Emailed", "mail"],
    ["Welcome pack · Alder & Finch", "Emailed", "mail"],
    ["Service agreement C-%n", "Archived", "pdf"],
    ["Statement · Coastline Gyms", "Invoiced", "inv"],
    ["Proposal · Meridian Freight", "Emailed", "mail"],
    ["Invoice INV-%n", "Emailed", "mail"],
    ["Newsletter offer · Oakfield Homes", "Emailed", "mail"],
  ];
  let n = 20419;
  let minute = 2 * 60 + 14;
  let i = 0;
  let visible = false;
  whileVisible(log, (v) => (visible = v));
  window.setInterval(() => {
    if (!visible || document.hidden) return;
    const [label, chip, kind] = docs[i++ % docs.length];
    if (i % 2 === 0) minute++;
    const li = document.createElement("li");
    const hh = String(Math.floor(minute / 60) % 24).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    li.innerHTML = `<time>${hh}:${mm}</time><span>${esc(label.replace("%n", String(n++)))}</span><em class="gn-chip gn-chip--${kind}">${chip}</em>`;
    li.classList.add("is-new");
    list.prepend(li);
    list.lastElementChild?.remove();
    list.animate([{ transform: "translateY(-50px)" }, { transform: "none" }], { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, 1900);
}

/* ═════════════════ CLIENT VIEW: AI, pricing, sign ═════════════════ */

function initClient() {
  const root = $("[data-gn-client]");
  if (!root) return;
  const aiBtn = $<HTMLButtonElement>("[data-gn-ai-btn]", root)!;
  const aiTxt = $("[data-gn-ai-txt]", root)!;
  const draft = aiTxt.textContent ?? "";
  const polished = "We'll design and install solar across all three of your sites, handle every permit, and start cutting your energy costs from day one.";
  aiBtn.addEventListener("click", () => {
    const on = aiBtn.getAttribute("aria-pressed") !== "true";
    aiBtn.setAttribute("aria-pressed", String(on));
    $("span", aiBtn)!.textContent = on ? "Show original" : "Polish with AI";
    aiTxt.textContent = on ? polished : draft;
    aiTxt.classList.toggle("is-polished", on);
    aiTxt.classList.remove("is-swap");
    void aiTxt.offsetWidth;
    aiTxt.classList.add("is-swap");
  });

  const totalEl = $("[data-gn-client-total]", root)!;
  const addon = $<HTMLInputElement>("[data-gn-addon]", root)!;
  const sig = $("[data-gn-sig]", root)!;
  const sigTxt = $("[data-gn-sig-txt]", root)!;
  const signBtn = $<HTMLButtonElement>("[data-gn-sign-btn]", root)!;
  const total = () =>
    Number(($<HTMLInputElement>('input[name="pkg"]:checked', root)?.value ?? "0")) + (addon.checked ? Number(addon.value) : 0);
  let last = total();
  const unsign = () => {
    sig.classList.remove("is-signed");
    sigTxt.textContent = "Awaiting signature";
    signBtn.classList.remove("is-done");
    signBtn.textContent = "Accept & sign";
    signBtn.removeAttribute("aria-disabled");
  };
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== "pkg" && t !== addon) return;
    const next = total();
    tweenMoney(totalEl, last, next);
    last = next;
    unsign();
  });
  signBtn.addEventListener("click", () => {
    if (signBtn.getAttribute("aria-disabled") === "true") return;
    sig.classList.add("is-signed");
    signBtn.classList.add("is-done");
    signBtn.textContent = "Signed";
    signBtn.setAttribute("aria-disabled", "true");
    sigTxt.textContent = `Signed by Maya Chen for ${money(total())} · audit trail recorded`;
  });

  // delivery icons ping once in sequence
  const deliv = $$("[data-gn-deliv] li");
  const first = deliv[0];
  if (first && !prefersReducedMotion) {
    onceVisible(first, () => deliv.forEach((li, i) => window.setTimeout(() => li.classList.add("is-ping"), 300 + i * 260)), 0.6);
  }
}

/* ═════════════════ TEMPLATE MARQUEE + CLOSING FAN ═════════════════ */

function initMarquee() {
  const m = $("[data-gn-marquee]");
  const track = $(".gn-marquee__track", m ?? document);
  if (!m || !track || prefersReducedMotion) return;
  for (const li of [...track.children]) {
    const clone = li.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    track.append(clone);
  }
  m.classList.add("is-ready");
  whileVisible(m, (v) => m.classList.toggle("is-paused", !v));
}

function initFan() {
  const end = $("[data-gn-end]");
  const fan = $(".gn-fan", end ?? document);
  if (!end || !fan) return;
  if (prefersReducedMotion) return fan.classList.add("is-open");
  onceVisible(fan, () => window.setTimeout(() => fan.classList.add("is-open"), 250), 0.4);
}

initGenerator();
initBrandTabs();
initFlow();
initLog();
initClient();
initMarquee();
initFan();
