import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ════════════════════════════════════════════════════════════════════
   Rules-driven deal configurator (hero)
   All money is integer cents (AUD, ex GST): unit prices are rounded
   once, then multiplied, so every displayed figure adds up exactly.
   ════════════════════════════════════════════════════════════════════ */

type BundleId = "starter" | "multi" | "enterprise";
type RegionId = "anz" | "apac" | "ukeu";
type Term = 12 | 24 | 36;
type AddonId = "wifi" | "fibre" | "sdwan" | "security";
type Approval = "none" | "routing" | "approved";

const BUNDLES: Record<BundleId, { name: string; sites: number; rates: number[]; cost: number }> = {
  starter: { name: "Office Starter", sites: 1, rates: [49, 45, 41, 38], cost: 27 },
  multi: { name: "Multi-site", sites: 3, rates: [64, 59, 54, 49], cost: 34 },
  enterprise: { name: "Enterprise", sites: 6, rates: [82, 76, 69, 62], cost: 41 },
};
const TIERS = [
  { min: 1, label: "1–24", jump: 10 },
  { min: 25, label: "25–49", jump: 25 },
  { min: 50, label: "50–99", jump: 50 },
  { min: 100, label: "100+", jump: 100 },
];
const TERMS: Record<Term, { svc: number; router: number; routerCost: number; rule: string; chip: string }> = {
  12: { svc: 1, router: 96, routerCost: 88, rule: "Standard service rates · router $96/mo", chip: "12-mo term" },
  24: { svc: 0.95, router: 52, routerCost: 44, rule: "Services −5% · router $52/mo", chip: "24-mo term −5%" },
  36: { svc: 0.9, router: 38, routerCost: 30, rule: "Services −10% · router $38/mo", chip: "36-mo term −10%" },
};
const REGIONS: Record<RegionId, { f: number; rule: string; chip: string }> = {
  anz: { f: 1, rule: "ANZ price list · standard rates", chip: "ANZ price list" },
  apac: { f: 1.05, rule: "APAC rule · +5% on services", chip: "APAC +5%" },
  ukeu: { f: 1.08, rule: "UK & EU rule · +8% on services", chip: "UK & EU +8%" },
};
const ADDONS: Record<AddonId, { name: string; unit: "seat" | "site"; price: number; cost: number; tail?: string }> = {
  wifi: { name: "Managed Wi-Fi", unit: "seat", price: 9, cost: 4, tail: "needs fibre" },
  fibre: { name: "Business Fibre 1 Gbps", unit: "site", price: 420, cost: 260 },
  sdwan: { name: "SD-WAN", unit: "site", price: 180, cost: 95, tail: "2+ sites" },
  security: { name: "Endpoint security", unit: "seat", price: 6, cost: 3 },
};
const ADDON_ORDER: AddonId[] = ["wifi", "fibre", "sdwan", "security"];
const ONBOARDING = { price: 3200, cost: 1900 };
const DISCOUNT_LIMIT = 15;
const MARGIN_FLOOR = 25;
const SEATS_MIN = 5;
const SEATS_MAX = 150;

interface State {
  bundle: BundleId;
  seats: number;
  term: Term;
  region: RegionId;
  addons: Set<AddonId>;
  auto: Set<AddonId>; // added by a dependency rule, not by the rep
  discount: number;
  internal: boolean;
  approval: Approval;
  approvedAt: number; // discount % the approval covers
}

interface Line {
  id: string;
  name: string;
  detail: string;
  cents: number;
  costCents: number;
  once?: boolean;
  included?: boolean;
}

interface Quote {
  lines: Line[];
  sub: number;
  disc: number;
  monthly: number;
  once: number;
  tcv: number;
  margin: number;
  tier: number;
  seatUnit: number;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const tierOf = (seats: number) => TIERS.reduce((t, tier, i) => (seats >= tier.min ? i : t), 0);
const sitesOf = (s: Pick<State, "bundle">) => BUNDLES[s.bundle].sites;
const svcUnit = (s: State, base: number) => Math.round(base * 100 * TERMS[s.term].svc * REGIONS[s.region].f);

function price(s: State, addons: Set<AddonId> = s.addons): Quote {
  const b = BUNDLES[s.bundle];
  const t = TERMS[s.term];
  const tier = tierOf(s.seats);
  const seatUnit = svcUnit(s, b.rates[tier]);
  const lines: Line[] = [
    {
      id: "seats",
      name: `${b.name} managed seats`,
      detail: `${s.seats} seats × ${money(seatUnit)}`,
      cents: seatUnit * s.seats,
      costCents: b.cost * 100 * s.seats,
    },
    {
      id: "routers",
      name: `Edge routers · ${s.term}-mo plan`,
      detail: `${b.sites} × ${money(t.router * 100)}`,
      cents: t.router * 100 * b.sites,
      costCents: t.routerCost * 100 * b.sites,
    },
  ];
  for (const id of ADDON_ORDER) {
    if (!addons.has(id)) continue;
    const a = ADDONS[id];
    const qty = a.unit === "seat" ? s.seats : b.sites;
    const unit = svcUnit(s, a.price);
    lines.push({
      id,
      name: a.name,
      detail: `${qty} ${a.unit}${qty === 1 ? "" : "s"} × ${money(unit)}`,
      cents: unit * qty,
      costCents: a.cost * 100 * qty,
    });
  }
  const included = s.bundle === "enterprise";
  lines.push({
    id: "onboarding",
    name: "Onboarding & migration",
    detail: included ? "Included with Enterprise" : "Once-off",
    cents: included ? 0 : ONBOARDING.price * 100,
    costCents: ONBOARDING.cost * 100,
    once: true,
    included,
  });

  const recurring = lines.filter((l) => !l.once);
  const sub = recurring.reduce((n, l) => n + l.cents, 0);
  const disc = Math.round((sub * s.discount) / 100);
  const monthly = sub - disc;
  const once = lines.filter((l) => l.once).reduce((n, l) => n + l.cents, 0);
  const tcv = monthly * s.term + once;
  const monthlyCost = recurring.reduce((n, l) => n + l.costCents, 0);
  const onceCost = lines.filter((l) => l.once).reduce((n, l) => n + l.costCents, 0);
  const cost = monthlyCost * s.term + onceCost;
  const margin = tcv > 0 ? ((tcv - cost) / tcv) * 100 : 0;
  return { lines, sub, disc, monthly, once, tcv, margin, tier, seatUnit };
}

/** Enforces dependencies and exclusions. Returns human messages for whatever fired. */
function applyRules(s: State, changed?: AddonId | "bundle", turnedOn?: boolean): string[] {
  const msgs: string[] = [];
  if (sitesOf(s) < 2 && s.addons.has("sdwan")) {
    s.addons.delete("sdwan");
    msgs.push("SD-WAN removed: Office Starter covers one site.");
  }
  if (changed === "wifi" && !turnedOn && s.auto.has("fibre")) {
    s.addons.delete("fibre");
    s.auto.delete("fibre");
    msgs.push("Business Fibre removed with Managed Wi-Fi.");
  }
  if (s.addons.has("wifi") && !s.addons.has("fibre")) {
    s.addons.add("fibre");
    s.auto.add("fibre");
    msgs.push("Business Fibre added because Managed Wi-Fi needs a fibre service.");
  }
  if (changed === "fibre" && turnedOn) s.auto.delete("fibre");
  return msgs;
}

function approvalState(s: State): "ok" | "need" | "routing" | "approved" {
  if (s.discount <= DISCOUNT_LIMIT) return "ok";
  if (s.approval === "routing") return "routing";
  if (s.approval === "approved" && s.discount <= s.approvedAt) return "approved";
  return "need";
}

/* ───────── Number roll ───────── */
const shown = new WeakMap<HTMLElement, number>();
const rolling = new WeakMap<HTMLElement, number>();
function roll(el: HTMLElement | null, cents: number, fmt: (n: number) => string = money) {
  if (!el) return;
  const from = shown.get(el);
  shown.set(el, cents);
  cancelAnimationFrame(rolling.get(el) ?? 0);
  if (from === undefined || from === cents || prefersReducedMotion) {
    el.textContent = fmt(cents);
    return;
  }
  el.classList.remove("is-tick");
  void el.offsetWidth;
  el.classList.add("is-tick");
  const start = performance.now();
  const dur = 520;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(from + (cents - from) * e));
    if (t < 1) rolling.set(el, requestAnimationFrame(step));
  };
  rolling.set(el, requestAnimationFrame(step));
}

function flash(el: Element | null | undefined) {
  if (!el || prefersReducedMotion) return;
  el.classList.remove("is-flash");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("is-flash");
}

/* ───────── Keyed list rendering (enter/leave animations) ───────── */
function renderKeyed<T extends { id: string }>(
  list: HTMLElement,
  items: T[],
  build: (item: T) => HTMLLIElement,
  update: (li: HTMLLIElement, item: T) => void,
  animate: boolean,
) {
  const existing = new Map<string, HTMLLIElement>();
  list.querySelectorAll<HTMLLIElement>(":scope > li[data-key]").forEach((li) => existing.set(li.dataset.key!, li));
  const keep = new Set(items.map((i) => i.id));
  existing.forEach((li, key) => {
    if (keep.has(key)) return;
    existing.delete(key);
    if (!animate) return li.remove();
    li.classList.add("is-leaving");
    li.removeAttribute("data-key");
    window.setTimeout(() => li.remove(), 260);
  });
  for (const item of items) {
    let li = existing.get(item.id);
    if (!li) {
      li = build(item);
      li.dataset.key = item.id;
      if (animate) li.classList.add("is-entering");
      window.setTimeout(() => li!.classList.remove("is-entering"), 700);
    }
    update(li, item);
    list.append(li);
  }
  // keep leaving nodes at the end so they fade in place without reflowing the rest much
  list.querySelectorAll(":scope > li.is-leaving").forEach((li) => list.append(li));
}

function initConfigurator() {
  const app = document.querySelector<HTMLElement>("[data-cq-app]");
  if (!app) return;
  const $ = <T extends Element = HTMLElement>(sel: string) => app.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...app.querySelectorAll<T>(sel)];

  const s: State = {
    bundle: "multi",
    seats: 40,
    term: 24,
    region: "anz",
    addons: new Set<AddonId>(["security"]),
    auto: new Set<AddonId>(),
    discount: 10,
    internal: false,
    approval: "none",
    approvedAt: 0,
  };

  const el = {
    seatOut: $("[data-cq-seat-out]")!,
    seatRate: $("[data-cq-seat-rate]")!,
    seatWhy: $("[data-cq-seat-why]")!,
    ladder: $("[data-cq-ladder]")!,
    termRule: $("[data-cq-term-rule]")!,
    regionRule: $("[data-cq-region-rule]")!,
    monthly: $("[data-cq-monthly]")!,
    once: $("[data-cq-once]")!,
    tcv: $("[data-cq-tcv]")!,
    termLabel: $("[data-cq-term-label]")!,
    lines: $("[data-cq-lines]")!,
    sub: $("[data-cq-sub]")!,
    discLabel: $("[data-cq-disc-label]")!,
    discAmt: $("[data-cq-disc-amt]")!,
    marginVal: $("[data-cq-margin-val]")!,
    marginFill: $("[data-cq-margin-fill]")!,
    margin: $("[data-cq-margin]")!,
    chips: $("[data-cq-chips]")!,
    disc: $<HTMLInputElement>("[data-cq-disc]")!,
    discOut: $("[data-cq-disc-out]")!,
    appr: $("[data-cq-appr]")!,
    apprText: $("[data-cq-appr-text]")!,
    action: $<HTMLButtonElement>("[data-cq-action]")!,
    actionLabel: $("[data-cq-action-label]")!,
    actQuote: $("[data-cq-act-quote]")!,
    live: $("[data-cq-live]")!,
    internal: $<HTMLInputElement>("[data-cq-internal]")!,
  };

  /* ── live announcements (debounced) ── */
  let liveTimer = 0;
  let pendingMsgs: string[] = [];
  const announce = (msgs: string[] = []) => {
    pendingMsgs.push(...msgs);
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      const q = price(s);
      el.live.textContent = [
        ...pendingMsgs,
        `Monthly ${money(q.monthly)}, contract value ${money(q.tcv)}.`,
      ].join(" ");
      pendingMsgs = [];
    }, 650);
  };

  /* ── render ── */
  let firstRender = true;
  const render = () => {
    const q = price(s);
    const b = BUNDLES[s.bundle];
    const animate = !firstRender && !prefersReducedMotion;

    // controls
    $$<HTMLInputElement>("input[name=cq-bundle]").forEach((i) => (i.checked = i.value === s.bundle));
    $$<HTMLInputElement>("input[name=cq-term]").forEach((i) => (i.checked = Number(i.value) === s.term));
    $$<HTMLInputElement>("input[name=cq-region]").forEach((i) => (i.checked = i.value === s.region));
    el.seatOut.textContent = String(s.seats);
    $$<HTMLButtonElement>("[data-cq-seats]").forEach((btn) => {
      const d = Number(btn.dataset.cqSeats);
      btn.disabled = d < 0 ? s.seats <= SEATS_MIN : s.seats >= SEATS_MAX;
    });
    roll(el.seatRate, q.seatUnit);
    const termNote = TERMS[s.term].svc < 1 ? ` · ${s.term}-mo term −${Math.round((1 - TERMS[s.term].svc) * 100)}%` : "";
    const regionNote = REGIONS[s.region].f > 1 ? ` · ${REGIONS[s.region].chip}` : "";
    el.seatWhy.textContent = `Tier ${TIERS[q.tier].label}${termNote}${regionNote}`;
    el.ladder.style.setProperty("--tier", String(q.tier));
    $$<HTMLElement>("[data-tier]").forEach((btn, i) => {
      btn.setAttribute("aria-pressed", String(i === q.tier));
      const p = btn.querySelector("[data-tier-price]");
      if (p) p.textContent = `$${b.rates[i]}`;
    });
    setRule(el.termRule, TERMS[s.term].rule, animate);
    setRule(el.regionRule, REGIONS[s.region].rule, animate, REGIONS[s.region].f > 1);

    // add-ons
    for (const id of ADDON_ORDER) {
      const row = $(`[data-addon="${id}"]`)!;
      const input = row.querySelector<HTMLInputElement>("input")!;
      const note = row.querySelector<HTMLElement>("[data-addon-note]")!;
      const a = ADDONS[id];
      const blocked = id === "sdwan" && b.sites < 2;
      const locked = id === "fibre" && s.addons.has("wifi");
      input.checked = s.addons.has(id);
      input.disabled = blocked || locked;
      let state = "default";
      let text = `${money(svcUnit(s, a.price))} per ${a.unit} / mo${a.tail ? ` · ${a.tail}` : ""}`;
      if (blocked) {
        state = "blocked";
        text = "Needs 2+ sites: choose Multi-site or Enterprise";
      } else if (locked) {
        state = "added";
        text = s.auto.has("fibre") ? "Added because Managed Wi-Fi needs a fibre service" : "Required by Managed Wi-Fi";
      }
      if (row.dataset.state !== state && animate) flash(note);
      row.dataset.state = state;
      note.textContent = text;
    }

    // summary
    roll(el.monthly, q.monthly);
    roll(el.once, q.once);
    roll(el.tcv, q.tcv);
    el.termLabel.textContent = `${s.term} mo`;
    renderKeyed(
      el.lines,
      q.lines,
      () => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="cq-line__name"><span data-n></span><small data-d></small><small class="cq-int" data-c></small></span><span class="cq-line__amt" data-a></span>`;
        return li;
      },
      (li, l) => {
        li.classList.toggle("is-once", !!l.once);
        li.querySelector("[data-n]")!.textContent = l.name;
        li.querySelector("[data-d]")!.textContent = l.detail;
        li.querySelector("[data-c]")!.textContent = `Cost ${money(l.costCents)}`;
        const amt = li.querySelector<HTMLElement>("[data-a]")!;
        if (l.included) {
          shown.delete(amt);
          amt.textContent = "Included";
        } else roll(amt, l.cents);
      },
      animate,
    );
    roll(el.sub, q.sub);
    el.discLabel.textContent = `${s.discount}%`;
    roll(el.discAmt, q.disc, (n) => `−${money(n)}`);
    roll(el.marginVal, Math.round(q.margin * 10), (n) => `${(n / 10).toFixed(1)}%`);
    el.marginFill.style.setProperty("--m", String(Math.max(0, Math.min(1, q.margin / 60))));
    el.margin.dataset.low = String(q.margin < MARGIN_FLOOR);

    // rule chips
    const ap = approvalState(s);
    const chips: { id: string; text: string; kind: string }[] = [
      { id: "bundle", text: `${b.name} · ${b.sites} site${b.sites > 1 ? "s" : ""}`, kind: "price" },
      { id: `tier`, text: `Tier ${TIERS[q.tier].label}`, kind: "price" },
      { id: "term", text: TERMS[s.term].chip, kind: "price" },
      { id: "region", text: REGIONS[s.region].chip, kind: "price" },
    ];
    if (s.auto.has("fibre") && s.addons.has("wifi")) chips.push({ id: "dep", text: "Fibre auto-added", kind: "dep" });
    if (b.sites < 2) chips.push({ id: "block", text: "SD-WAN blocked: 1 site", kind: "block" });
    if (s.bundle === "enterprise") chips.push({ id: "incl", text: "Onboarding included", kind: "dep" });
    chips.push(
      ap === "ok"
        ? { id: "disc", text: `Discount ${s.discount}% · in limit`, kind: "ok" }
        : { id: "disc", text: `Discount ${s.discount}% · over ${DISCOUNT_LIMIT}%`, kind: "warn" },
    );
    renderKeyed(
      el.chips,
      chips,
      () => document.createElement("li"),
      (li, c) => {
        if (li.textContent !== c.text && li.textContent && animate) flash(li);
        li.textContent = c.text;
        li.dataset.kind = c.kind;
      },
      animate,
    );

    // discount + approval
    el.disc.value = String(s.discount);
    el.disc.style.setProperty("--p", `${(s.discount / 25) * 100}%`);
    el.discOut.textContent = `${s.discount}%`;
    el.disc.setAttribute("aria-valuetext", `${s.discount}%${s.discount > DISCOUNT_LIMIT ? ", needs approval" : ""}`);
    el.appr.dataset.state = ap;
    el.apprText.textContent = {
      ok: "Within pricing rules · ready to send",
      need: `Needs approval: discount ${s.discount}% is over ${DISCOUNT_LIMIT}%`,
      routing: "Routing for approval…",
      approved: `Approved at ${s.approvedAt}% · ready to send`,
    }[ap];
    if (ap !== "routing") {
      const mgr = $("[data-cq-step=manager]")!;
      const com = $("[data-cq-step=commercial]")!;
      mgr.dataset.state = ap === "approved" ? "done" : ap === "need" ? "pending" : "idle";
      com.dataset.state = ap === "approved" ? "done" : ap === "need" ? "pending" : "idle";
      com.dataset.backup = String(ap === "approved");
      mgr.querySelector("[data-cq-step-note]")!.textContent = ap === "approved" ? "Dana W. · approved" : "Dana Whitfield";
      com.querySelector("[data-cq-step-note]")!.textContent =
        ap === "approved" ? "Tom A. for Priya R." : "Priya R. · backup Tom A.";
    }
    el.action.disabled = ap === "routing";
    el.action.dataset.mode = ap === "need" ? "route" : "preview";
    el.actionLabel.textContent = ap === "need" ? "Route for approval" : ap === "routing" ? "Waiting on approvers" : "Preview as customer";
    el.actQuote.classList.toggle("is-on", ap === "ok" || ap === "approved");

    firstRender = false;
  };

  function setRule(p: HTMLElement, text: string, animate: boolean, active = false) {
    const span = p.querySelector("span:last-child")!;
    p.dataset.active = String(active);
    if (span.textContent === text) return;
    span.textContent = text;
    if (animate) flash(p);
  }

  /* ── events ── */
  const change = (msgs: string[] = []) => {
    render();
    announce(msgs);
  };

  app.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "cq-bundle") {
      s.bundle = t.value as BundleId;
      change(applyRules(s, "bundle"));
    } else if (t.name === "cq-term") {
      s.term = Number(t.value) as Term;
      change([TERMS[s.term].rule + "."]);
    } else if (t.name === "cq-region") {
      s.region = t.value as RegionId;
      change([REGIONS[s.region].rule + "."]);
    } else if (t.closest("[data-addon]")) {
      const id = t.value as AddonId;
      if (t.checked) s.addons.add(id);
      else s.addons.delete(id);
      change(applyRules(s, id, t.checked));
    } else if (t === el.internal) {
      s.internal = t.checked;
      app.classList.toggle("is-internal", s.internal);
      announce([s.internal ? "Internal view on: costs and margin shown." : "Internal view off."]);
    }
  });

  el.disc.addEventListener("input", () => {
    const before = approvalState(s);
    s.discount = Number(el.disc.value);
    if (s.approval === "approved" && s.discount > s.approvedAt) s.approval = "none";
    render();
    const after = approvalState(s);
    if (after !== before && after === "need") flash(el.appr);
    announce(after === "need" ? [`Needs approval: discount over ${DISCOUNT_LIMIT}%.`] : []);
  });

  const setSeats = (n: number) => {
    const prevTier = tierOf(s.seats);
    s.seats = Math.max(SEATS_MIN, Math.min(SEATS_MAX, n));
    const tier = tierOf(s.seats);
    render();
    if (tier !== prevTier) flash(el.ladder);
    announce(tier !== prevTier ? [`Tier ${TIERS[tier].label} seats applied.`] : [`${s.seats} seats.`]);
  };
  $$<HTMLButtonElement>("[data-cq-seats]").forEach((btn) =>
    btn.addEventListener("click", () => setSeats(s.seats + Number(btn.dataset.cqSeats))),
  );
  $$<HTMLButtonElement>("[data-tier]").forEach((btn) =>
    btn.addEventListener("click", () => setSeats(TIERS[Number(btn.dataset.tier)].jump)),
  );

  /* ── approval routing ── */
  let routeTimers: number[] = [];
  const routeApproval = () => {
    if (approvalState(s) !== "need") return;
    s.approval = "routing";
    render();
    announce(["Routed to Dana Whitfield, then Commercial."]);
    const mgr = $("[data-cq-step=manager]")!;
    const com = $("[data-cq-step=commercial]")!;
    const note = (li: HTMLElement, t: string) => (li.querySelector("[data-cq-step-note]")!.textContent = t);
    const d = prefersReducedMotion ? 0.1 : 1;
    mgr.dataset.state = "active";
    note(mgr, "Dana Whitfield · reviewing");
    routeTimers.forEach(clearTimeout);
    routeTimers = [
      window.setTimeout(() => {
        mgr.dataset.state = "done";
        note(mgr, "Dana W. · approved");
        com.dataset.state = "active";
        note(com, "Priya R. · away");
      }, 1000 * d),
      window.setTimeout(() => {
        com.dataset.backup = "true";
        note(com, "Backup Tom A. · reviewing");
      }, 1900 * d),
      window.setTimeout(() => {
        s.approval = "approved";
        s.approvedAt = s.discount;
        render();
        flash(el.appr);
        announce([`Approved by Dana Whitfield and Tom Ashby, backup for Priya Raman. Ready to send.`]);
      }, 2900 * d),
    ];
  };

  /* ── customer preview ── */
  const custExtra = new Set<AddonId>();
  const custAuto = new Set<AddonId>();
  const custPane = $("[data-cq-pane=customer]")!;
  const configPane = $("[data-cq-pane=config]")!;
  custPane.hidden = false;
  custPane.setAttribute("inert", "");
  custPane.setAttribute("aria-hidden", "true");
  const sign = $("[data-cq-sign]")!;
  const accept = $<HTMLButtonElement>("[data-cq-accept]")!;
  const pay = $<HTMLButtonElement>("[data-cq-pay]")!;
  const paid = $("[data-cq-paid]")!;
  const signName = $("[data-cq-sign-name]")!;

  const custAddons = () => new Set<AddonId>([...s.addons, ...custExtra]);
  const renderCustomer = () => {
    const all = custAddons();
    const q = price(s, all);
    const b = BUNDLES[s.bundle];
    $("[data-cq-cust-term]")!.textContent = `${s.term}-month`;
    const clines = $("[data-cq-clines]")!;
    renderKeyed(
      clines,
      q.lines.filter((l) => !custExtra.has(l.id as AddonId)),
      () => {
        const li = document.createElement("li");
        li.innerHTML = `<span><span data-n></span><small data-d></small></span><b data-a></b>`;
        return li;
      },
      (li, l) => {
        li.querySelector("[data-n]")!.textContent = l.name;
        li.querySelector("[data-d]")!.textContent = l.once ? l.detail : `${l.detail} / mo`;
        li.querySelector("[data-a]")!.textContent = l.included ? "Included" : money(l.cents);
      },
      false,
    );
    const options = ADDON_ORDER.filter((id) => !s.addons.has(id) && !(id === "sdwan" && b.sites < 2));
    const copts = $("[data-cq-copts]")!;
    $("[data-cq-copt-head]")!.hidden = options.length === 0;
    renderKeyed(
      copts,
      options.map((id) => ({ id })),
      ({ id }) => {
        const li = document.createElement("li");
        li.innerHTML = `<label><input type="checkbox" value="${id}" /><span class="cq-cbox" aria-hidden="true"><svg width="12" height="12"><use href="#cq-i-check" /></svg></span><span class="cq-copt__txt"><span data-n></span><small data-d></small></span><b data-a></b></label>`;
        return li;
      },
      (li, { id }) => {
        const a = ADDONS[id as AddonId];
        const qty = a.unit === "seat" ? s.seats : b.sites;
        const unit = svcUnit(s, a.price);
        const input = li.querySelector("input")!;
        const lockedByWifi = id === "fibre" && custExtra.has("wifi");
        input.checked = custExtra.has(id as AddonId);
        input.disabled = lockedByWifi;
        li.querySelector("[data-n]")!.textContent = a.name;
        li.querySelector("[data-d]")!.textContent = lockedByWifi
          ? "Included because Managed Wi-Fi needs a fibre service"
          : `${qty} ${a.unit}${qty === 1 ? "" : "s"} × ${money(unit)} / mo`;
        li.querySelector("[data-a]")!.textContent = `+${money(unit * qty)}`;
        li.classList.toggle("is-on", input.checked);
      },
      false,
    );
    $("[data-cq-c-monthly]")!.textContent = money(q.monthly);
    $("[data-cq-c-once]")!.textContent = money(q.once);
    roll($("[data-cq-c-tcv]"), q.tcv);
    $("[data-cq-pay-amt]")!.textContent = money(q.once);
    return q;
  };

  $("[data-cq-copts]")!.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    const id = t.value as AddonId;
    const msgs: string[] = [];
    if (t.checked) custExtra.add(id);
    else custExtra.delete(id);
    if (id === "wifi" && t.checked && !s.addons.has("fibre") && !custExtra.has("fibre")) {
      custExtra.add("fibre");
      custAuto.add("fibre");
      msgs.push("Business Fibre included because Managed Wi-Fi needs a fibre service.");
    }
    if (id === "wifi" && !t.checked && custAuto.has("fibre")) {
      custExtra.delete("fibre");
      custAuto.delete("fibre");
    }
    if (id === "fibre") custAuto.delete("fibre");
    const q = renderCustomer();
    el.live.textContent = [...msgs, `Contract value ${money(q.tcv)}.`].join(" ");
  });

  const resetSign = () => {
    sign.dataset.state = "idle";
    accept.hidden = false;
    pay.hidden = true;
    paid.hidden = true;
    signName.textContent = "Sign here";
  };

  const setView = (view: "config" | "customer") => {
    app.dataset.view = view;
    const showCust = view === "customer";
    if (showCust) {
      custExtra.clear();
      custAuto.clear();
      resetSign();
      renderCustomer();
      if (app.getBoundingClientRect().top < 64)
        app.scrollIntoView({ block: "start", behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
    custPane.toggleAttribute("inert", !showCust);
    custPane.setAttribute("aria-hidden", String(!showCust));
    configPane.toggleAttribute("inert", showCust);
    configPane.setAttribute("aria-hidden", String(showCust));
    window.setTimeout(
      () => (showCust ? $<HTMLButtonElement>("[data-cq-back]") : el.action)?.focus({ preventScroll: true }),
      prefersReducedMotion ? 0 : 380,
    );
    el.live.textContent = showCust
      ? "Customer view: the interactive price table your customer sees. Costs and margin are hidden."
      : "Back to the configurator.";
  };

  el.action.addEventListener("click", () => {
    if (el.action.dataset.mode === "route") routeApproval();
    else setView("customer");
  });
  $("[data-cq-back]")!.addEventListener("click", () => setView("config"));

  accept.addEventListener("click", () => {
    sign.dataset.state = "signed";
    signName.textContent = "Jordan Okafor · Meridian Freight";
    accept.hidden = true;
    const q = price(s, custAddons());
    if (q.once > 0) {
      pay.hidden = false;
      window.setTimeout(() => pay.focus({ preventScroll: true }), 50);
      el.live.textContent = `Signed by Jordan Okafor. Pay once-off ${money(q.once)}.`;
    } else {
      paid.hidden = false;
      $("[data-cq-paid-text]")!.textContent = "Signed · nothing to pay upfront";
      el.live.textContent = "Signed by Jordan Okafor. Nothing to pay upfront.";
    }
  });
  pay.addEventListener("click", () => {
    pay.hidden = true;
    paid.hidden = false;
    $("[data-cq-paid-text]")!.textContent = "Paid by card · receipt sent";
    sign.dataset.state = "paid";
    el.live.textContent = "Paid by card. Deal closed.";
  });

  /* ── stepped controls (small screens) ── */
  const groups = $$<HTMLElement>("[data-cq-group]");
  const stepBtns = $$<HTMLButtonElement>("[data-step]");
  const prev = $<HTMLButtonElement>("[data-cq-step-prev]")!;
  const next = $<HTMLButtonElement>("[data-cq-step-next]")!;
  const nextLabel = $("[data-cq-step-next-label]")!;
  const STEP_NAMES = ["Bundle", "Seats", "Term", "Add-ons"];
  let step = 0;
  const setStep = (n: number, focus = false) => {
    step = Math.max(0, Math.min(groups.length - 1, n));
    groups.forEach((g, i) => g.classList.toggle("is-active", i === step));
    stepBtns.forEach((b, i) => {
      b.classList.toggle("is-active", i === step);
      b.classList.toggle("is-done", i < step);
      if (i === step) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    prev.disabled = step === 0;
    next.hidden = step === groups.length - 1;
    nextLabel.textContent = STEP_NAMES[step + 1] ?? "";
    if (focus) groups[step].querySelector<HTMLElement>("input:not(:disabled), button")?.focus({ preventScroll: true });
  };
  stepBtns.forEach((b, i) => b.addEventListener("click", () => setStep(i)));
  prev.addEventListener("click", () => setStep(step - 1, true));
  next.addEventListener("click", () => setStep(step + 1, true));
  $("[data-cq-controls]")!.classList.add("is-stepped");

  render();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => app.classList.toggle("is-visible", e.isIntersecting)).observe(app);
  }

  /* ── attract mode: a short scripted deal plays once, until the visitor takes over ── */
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    let stopped = false;
    let timer = 0;
    let visible = false;
    let i = 0;
    const flashOf = (k: string) => app.querySelector(`[data-flash="${k}"]`);
    const script: [number, () => void][] = [
      [1600, () => (setSeats(50), flash(flashOf("seats")))],
      [1700, () => {
        s.addons.add("wifi");
        change(applyRules(s, "wifi", true));
        flash(flashOf("addons"));
      }],
      [1800, () => {
        s.term = 36;
        change();
        flash(flashOf("term"));
      }],
      [1600, () => {
        s.region = "apac";
        change();
        flash(flashOf("region"));
      }],
      [1800, () => {
        s.discount = 18;
        render();
        flash(el.appr);
      }],
      [1800, () => routeApproval()],
    ];
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      app.classList.remove("is-auto");
    };
    const tick = () => {
      if (stopped || !visible || i >= script.length) return;
      timer = window.setTimeout(() => {
        if (stopped || !visible) return;
        // only drive the controls the visitor can see (wide layout)
        script[i++][1]();
        if (i >= script.length) return stop();
        tick();
      }, script[i][0]);
    };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
      app.addEventListener(ev, stop, { once: true, passive: true }),
    );
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        window.clearTimeout(timer);
        if (visible && !stopped) {
          app.classList.add("is-auto");
          tick();
        }
      },
      { threshold: 0.45 },
    );
    // small screens use stepped controls, so the script would change hidden steps: skip it there
    if (window.matchMedia("(min-width: 641px)").matches) io.observe(app);
  }
}

/* ════════════════════════════════════════════════════════════════════
   Feature-row visuals: play when visible, pause offscreen
   ════════════════════════════════════════════════════════════════════ */
function initRowAnims() {
  const els = document.querySelectorAll<HTMLElement>("[data-cq-anim]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    els.forEach((e) => e.classList.add("is-static"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        e.target.classList.toggle("is-playing", e.isIntersecting);
        if (e.isIntersecting) e.target.classList.add("is-seen");
      }
    },
    { threshold: 0.35 },
  );
  els.forEach((e) => io.observe(e));
}

initConfigurator();
initRowAnims();
