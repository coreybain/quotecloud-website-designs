import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ════════════════════════════════════════════════════════════════════
   Playable quote builder (hero)
   All money is kept in integer cents in the quote currency, so every
   displayed figure adds up exactly.
   ════════════════════════════════════════════════════════════════════ */

type Currency = "USD" | "EUR" | "GBP" | "AUD";
type Status = "draft" | "approval" | "approved" | "sent" | "signed";

interface Product {
  name: string;
  desc: string;
  price: number; // USD, whole units
  cost: number; // USD, whole units
  optional?: boolean;
  qty?: number;
}
interface Line {
  id: string;
  qty: number;
  on: boolean;
}

const PRODUCTS: Record<string, Product> = {
  licence: { name: "Enterprise software licence", desc: "annual, 50 users", price: 15000, cost: 6200 },
  impl: { name: "Implementation services", desc: "per day", price: 1300, cost: 780 },
  training: { name: "Training package", desc: "optional", price: 1200, cost: 450, optional: true },
  support: { name: "Premium support", desc: "12 months, optional", price: 3600, cost: 1400, optional: true },
  migration: { name: "Data migration", desc: "fixed fee", price: 2400, cost: 1300 },
  seats: { name: "Extra user seats", desc: "per seat, annual", price: 180, cost: 40, qty: 5 },
  crm: { name: "CRM integration setup", desc: "one-off", price: 2200, cost: 1000 },
  workshop: { name: "Onsite workshop", desc: "half day", price: 1800, cost: 900 },
};

// Illustrative fixed rates for the demo.
const RATES: Record<Currency, number> = { USD: 1, EUR: 0.92, GBP: 0.79, AUD: 1.52 };
const LOCALES: Record<Currency, string> = { USD: "en-US", EUR: "de-DE", GBP: "en-GB", AUD: "en-US" };
const TAX_RATE = 0.1;
const APPROVAL_THRESHOLD = 15; // % discount that needs a manager

const MAX_QTY = 99;

function initBuilder(app: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

  const rowsEl = $("[data-bq-rows]");
  const emptyEl = $("[data-bq-empty]");
  const sheet = $("[data-bq-drop]");
  const discInput = $<HTMLInputElement>("[data-bq-disc]");
  const discVal = $("[data-bq-dval]");
  const dsym = $("[data-bq-dsym]");
  const ruleEl = $("[data-bq-rule]");
  const ruleText = $("[data-bq-rule-text]");
  const subEl = $("[data-bq-sub]");
  const dscEl = $("[data-bq-dsc]");
  const taxEl = $("[data-bq-tax]");
  const gmEl = $("[data-bq-gm]");
  const totalEl = $("[data-bq-total]");
  const totalSr = $("[data-bq-total-sr]");
  const curCode = $("[data-bq-curcode]");
  const internalInput = $<HTMLInputElement>("[data-bq-internal]");
  const intNote = $("[data-bq-intnote-text]");
  const live = $("[data-bq-live]");
  const pill = $("[data-bq-pill]");
  const verEl = $("[data-bq-ver]");
  const flow = $("[data-bq-flow]");
  const approvalLabel = $("[data-bq-approval-label]");
  const sendBtn = $<HTMLButtonElement>("[data-bq-send]");
  const signoff = $("[data-bq-signoff]");
  const signedTotal = $("[data-bq-signed-total]");
  const catItems = [...app.querySelectorAll<HTMLButtonElement>("[data-add]")];

  const state = {
    lines: [
      { id: "licence", qty: 1, on: true },
      { id: "impl", qty: 5, on: true },
      { id: "training", qty: 1, on: true },
    ] as Line[],
    currency: "USD" as Currency,
    discMode: "pct" as "pct" | "fixed",
    discPct: 10,
    discFixed: 1500, // USD
    internal: false,
    status: "draft" as Status,
    version: 0,
  };

  let fmt = makeFormatter(state.currency);
  const unit = (usd: number) => Math.round(usd * RATES[state.currency]) * 100; // cents

  function compute() {
    let subtotal = 0;
    let cost = 0;
    for (const l of state.lines) {
      if (!l.on) continue;
      const p = PRODUCTS[l.id];
      subtotal += unit(p.price) * l.qty;
      cost += unit(p.cost) * l.qty;
    }
    const discount =
      state.discMode === "pct"
        ? Math.round((subtotal * state.discPct) / 100)
        : Math.min(subtotal, unit(state.discFixed));
    const net = subtotal - discount;
    const tax = Math.round(net * TAX_RATE);
    const total = net + tax;
    const margin = net > 0 ? ((net - cost) / net) * 100 : 0;
    const effPct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
    return { subtotal, discount, tax, total, margin, effPct };
  }

  /* ── rows ── */

  const icon = (id: string, size = 14) =>
    `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#bq-i-${id}" /></svg>`;

  function rowTemplate(l: Line) {
    const p = PRODUCTS[l.id];
    const opt = p.optional
      ? `<label class="bq-opt"><input type="checkbox" data-act="toggle" aria-label="Include optional ${p.name}" /><span class="bq-opt__box" aria-hidden="true">${icon("check", 12)}</span></label>`
      : "";
    return `
      <div class="bq-c bq-c--item" role="cell">${opt}<span class="bq-item"><span class="bq-item__name"></span><span class="bq-item__sub"></span></span></div>
      <div class="bq-c bq-c--qty" role="cell"><span class="bq-step"><button type="button" class="bq-step__btn" data-act="dec" aria-label="Decrease quantity of ${p.name}">${icon("minus")}</button><output class="bq-step__val"></output><button type="button" class="bq-step__btn" data-act="inc" aria-label="Increase quantity of ${p.name}">${icon("plus")}</button></span></div>
      <div class="bq-c bq-c--cost bq-int" role="cell"></div>
      <div class="bq-c bq-c--margin bq-int" role="cell"></div>
      <div class="bq-c bq-c--total" role="cell"></div>
      <div class="bq-c bq-c--x" role="cell"><button type="button" class="bq-x" data-act="remove" aria-label="Remove ${p.name}">${icon("x")}</button></div>`;
  }

  const setText = (el: Element, text: string, flick = false) => {
    if (el.textContent === text) return;
    if (flick && !prefersReducedMotion) {
      const span = document.createElement("span");
      span.className = "bq-flick";
      span.textContent = text;
      el.replaceChildren(span);
    } else {
      el.textContent = text;
    }
  };

  function updateRow(row: HTMLElement, l: Line, flick: boolean) {
    const p = PRODUCTS[l.id];
    const u = unit(p.price);
    const c = unit(p.cost);
    row.classList.toggle("is-optional", !!p.optional);
    row.classList.toggle("is-off", !l.on);
    setText(row.querySelector(".bq-item__name")!, p.name);
    setText(row.querySelector(".bq-item__sub")!, `${fmt(u)} · ${p.desc}`);
    setText(row.querySelector(".bq-step__val")!, String(l.qty), flick);
    const dec = row.querySelector<HTMLButtonElement>('[data-act="dec"]')!;
    const inc = row.querySelector<HTMLButtonElement>('[data-act="inc"]')!;
    dec.disabled = l.qty <= 1;
    inc.disabled = l.qty >= MAX_QTY;
    const box = row.querySelector<HTMLInputElement>('[data-act="toggle"]');
    if (box) box.checked = l.on;
    setText(row.querySelector(".bq-c--cost")!, fmt(c * l.qty), flick);
    setText(row.querySelector(".bq-c--margin")!, `${(((u - c) / u) * 100).toFixed(1)}%`);
    const totalCell = row.querySelector(".bq-c--total")!;
    const t = fmt(u * l.qty);
    if (totalCell.textContent !== t) {
      const span = document.createElement("span");
      if (flick && !prefersReducedMotion) span.className = "bq-flick";
      span.textContent = t;
      totalCell.replaceChildren(span);
    }
  }

  function renderRows(flick = true) {
    const existing = new Map<string, HTMLElement>();
    rowsEl.querySelectorAll<HTMLElement>(".bq-row:not(.is-leaving)").forEach((r) => existing.set(r.dataset.id!, r));
    let prev: HTMLElement | null = null;
    for (const l of state.lines) {
      let row = existing.get(l.id);
      if (row) {
        existing.delete(l.id);
      } else {
        row = document.createElement("div");
        row.className = "bq-row";
        row.setAttribute("role", "row");
        row.dataset.id = l.id;
        row.innerHTML = rowTemplate(l);
        if (!prefersReducedMotion) {
          row.classList.add("is-new");
          row.addEventListener("animationend", (e) => e.target === row && row!.classList.remove("is-new"), { once: true });
        }
      }
      updateRow(row, l, flick);
      const anchor: ChildNode | null = prev ? prev.nextSibling : rowsEl.firstChild;
      if (anchor !== row) rowsEl.insertBefore(row, anchor);
      prev = row;
    }
    // remove rows that are no longer on the quote
    existing.forEach((row) => {
      if (prefersReducedMotion) return row.remove();
      row.classList.add("is-leaving");
      row.addEventListener("animationend", () => row.remove(), { once: true });
      window.setTimeout(() => row.remove(), 500);
    });
    emptyEl.hidden = state.lines.length > 0;
  }

  /* ── odometer total ── */

  function setOdo(text: string) {
    const prev = totalEl.dataset.v ?? "";
    totalEl.dataset.v = text;
    const frag = document.createDocumentFragment();
    const strips: [HTMLElement, number][] = [];
    const chars = [...text];
    const prevChars = [...prev];
    chars.forEach((ch, i) => {
      if (/\d/.test(ch)) {
        const fromRight = chars.length - i;
        const old = prevChars[prevChars.length - fromRight];
        const start = old && /\d/.test(old) ? Number(old) : 0;
        const d = document.createElement("span");
        d.className = "bq-odo__d";
        const s = document.createElement("span");
        s.className = "bq-odo__s";
        s.style.setProperty("--n", String(start));
        s.innerHTML = "<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>";
        d.append(s);
        frag.append(d);
        strips.push([s, Number(ch)]);
      } else {
        const c = document.createElement("span");
        c.className = "bq-odo__c";
        c.textContent = ch === " " || ch === " " || ch === " " ? " " : ch;
        frag.append(c);
      }
    });
    totalEl.replaceChildren(frag);
    if (prefersReducedMotion) {
      strips.forEach(([s, n]) => s.style.setProperty("--n", String(n)));
      return;
    }
    void totalEl.offsetWidth; // commit start positions
    requestAnimationFrame(() => strips.forEach(([s, n]) => s.style.setProperty("--n", String(n))));
  }

  /* ── announcements ── */

  let liveTimer = 0;
  const announce = (msg: string, delay = 450) => {
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      live.textContent = msg;
    }, delay);
  };

  /* ── summary ── */

  let lastRule = "";
  function renderSummary(animateTotal = true) {
    const r = compute();
    setText(subEl, fmt(r.subtotal), true);
    setText(dscEl, r.discount ? `−${fmt(r.discount)}` : fmt(0), true);
    setText(taxEl, fmt(r.tax), true);
    setText(gmEl, `${r.margin.toFixed(1)}%`, true);
    curCode.textContent = state.currency;
    const totalText = fmt(r.total);
    if (animateTotal) setOdo(totalText);
    totalSr.textContent = totalText;
    signedTotal.textContent = totalText;

    // discount control
    if (state.discMode === "pct") {
      discVal.textContent = `${state.discPct}%`;
      discInput.setAttribute("aria-valuetext", `${state.discPct}% discount`);
      discInput.style.setProperty("--p", `${(state.discPct / Number(discInput.max)) * 100}%`);
    } else {
      const v = fmt(unit(state.discFixed));
      discVal.textContent = v;
      discInput.setAttribute("aria-valuetext", `${v} discount`);
      discInput.style.setProperty("--p", `${(state.discFixed / Number(discInput.max)) * 100}%`);
    }
    dsym.textContent = symbolFor(state.currency);

    // pricing rule
    const warn = r.effPct > APPROVAL_THRESHOLD;
    const rule = warn ? "warn" : "ok";
    ruleEl.dataset.state = rule;
    ruleText.textContent = warn
      ? `${r.effPct.toFixed(1)}% off: needs manager approval`
      : "Within pricing rules";
    if (rule !== lastRule && lastRule && !prefersReducedMotion) {
      ruleEl.classList.remove("is-bump");
      void ruleEl.offsetWidth;
      ruleEl.classList.add("is-bump");
    }
    lastRule = rule;
    return r;
  }

  /* ── status / approval flow ── */

  let seqTimers: number[] = [];
  const clearSeq = () => {
    seqTimers.forEach((t) => window.clearTimeout(t));
    seqTimers = [];
  };

  function setPill(status: Status, label: string) {
    pill.dataset.state = status;
    pill.textContent = label;
    if (!prefersReducedMotion) {
      pill.classList.remove("is-bump");
      void pill.offsetWidth;
      pill.classList.add("is-bump");
    }
  }

  function setFlow(done: string[], active?: string) {
    flow.querySelectorAll<HTMLElement>("li").forEach((li) => {
      const s = li.dataset.step!;
      li.classList.toggle("is-done", done.includes(s));
      li.classList.toggle("is-active", s === active);
      if (s === active) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  }

  function backToDraft() {
    if (state.status === "draft") return;
    clearSeq();
    state.status = "draft";
    state.version += 1;
    verEl.textContent = `v1.${state.version}`;
    setPill("draft", "Draft");
    setFlow(["draft"]);
    approvalLabel.textContent = "Approval";
    signoff.hidden = true;
    sendBtn.textContent = "Send for approval";
    sendBtn.removeAttribute("aria-disabled");
    sendBtn.classList.remove("is-signed");
  }

  function send() {
    if (state.status === "signed") {
      backToDraft();
      announce(`New draft, version 1.${state.version}. Edit the quote and send again.`, 50);
      return;
    }
    if (state.status !== "draft") return;
    if (!state.lines.some((l) => l.on)) {
      announce("Add at least one item before sending.", 50);
      return;
    }
    const r = compute();
    const needs = r.effPct > APPROVAL_THRESHOLD;
    const speed = prefersReducedMotion ? 0.25 : 1;
    sendBtn.setAttribute("aria-disabled", "true");
    sendBtn.textContent = needs ? "Waiting for approval…" : "Checking rules…";

    state.status = "approval";
    setPill("approval", needs ? "Awaiting approval" : "Checking rules");
    approvalLabel.textContent = needs ? "Dana M. approving" : "Auto-approved";
    setFlow(["draft"], "approval");
    announce(needs ? "Sent to Dana, sales manager, for approval." : "Within pricing rules, auto-approving.", 50);

    let t = needs ? 1900 : 900;
    seqTimers.push(
      window.setTimeout(() => {
        state.status = "approved";
        approvalLabel.textContent = needs ? "Approved by Dana" : "Auto-approved";
        setPill("approved", "Approved");
        setFlow(["draft", "approval"], "sent");
        sendBtn.textContent = "Sending to customer…";
        announce("Quote approved. Sending to Jordan Lee.", 50);
      }, t * speed),
    );
    t += 1000;
    seqTimers.push(
      window.setTimeout(() => {
        state.status = "sent";
        setPill("sent", "Sent · viewed");
        setFlow(["draft", "approval", "sent"], "signed");
        sendBtn.textContent = "Customer reviewing…";
        announce("Quote sent and opened by Jordan Lee.", 50);
      }, t * speed),
    );
    t += 1500;
    seqTimers.push(
      window.setTimeout(() => {
        state.status = "signed";
        setPill("signed", "Signed");
        setFlow(["draft", "approval", "sent", "signed"]);
        signoff.hidden = false;
        sendBtn.textContent = "Start a new version";
        sendBtn.classList.add("is-signed");
        sendBtn.removeAttribute("aria-disabled");
        announce(`Accepted and signed by Jordan Lee. Total ${fmt(compute().total)}.`, 50);
      }, t * speed),
    );
  }

  /* ── updates ── */

  function update(opts: { flick?: boolean; say?: string } = {}) {
    backToDraft();
    renderRows(opts.flick ?? true);
    const r = renderSummary();
    announce(`${opts.say ? opts.say + ". " : ""}Total ${fmt(r.total)}.`);
  }

  function addItem(id: string) {
    const p = PRODUCTS[id];
    if (!p) return;
    const line = state.lines.find((l) => l.id === id);
    if (line) {
      line.qty = Math.min(MAX_QTY, line.qty + (p.qty ?? 1));
      line.on = true;
    } else {
      state.lines.push({ id, qty: p.qty ?? 1, on: true });
    }
    stopHint();
    const btn = catItems.find((b) => b.dataset.add === id);
    if (btn && !prefersReducedMotion) {
      btn.classList.remove("is-added");
      void btn.offsetWidth;
      btn.classList.add("is-added");
    }
    update({ say: line ? `${p.name} quantity ${line.qty}` : `Added ${p.name}` });
  }

  rowsEl.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    const row = btn.closest<HTMLElement>(".bq-row")!;
    const idx = state.lines.findIndex((l) => l.id === row.dataset.id);
    if (idx < 0) return;
    const line = state.lines[idx];
    const p = PRODUCTS[line.id];
    const act = btn.dataset.act;
    if (act === "inc" || act === "dec") {
      line.qty = Math.max(1, Math.min(MAX_QTY, line.qty + (act === "inc" ? 1 : -1)));
      update({ say: `${p.name} quantity ${line.qty}` });
    } else if (act === "remove") {
      state.lines.splice(idx, 1);
      // move focus somewhere sensible before the row disappears
      const next = state.lines[idx] ?? state.lines[idx - 1];
      update({ say: `Removed ${p.name}` });
      const target = next
        ? rowsEl.querySelector<HTMLElement>(`.bq-row[data-id="${next.id}"]:not(.is-leaving) [data-act="remove"]`)
        : catItems[0];
      target?.focus();
    }
  });
  rowsEl.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (box.dataset.act !== "toggle") return;
    const row = box.closest<HTMLElement>(".bq-row")!;
    const line = state.lines.find((l) => l.id === row.dataset.id);
    if (!line) return;
    line.on = box.checked;
    update({ say: `${PRODUCTS[line.id].name} ${line.on ? "included" : "excluded"}` });
  });

  catItems.forEach((btn) => {
    btn.addEventListener("click", () => addItem(btn.dataset.add!));
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", btn.dataset.add!);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      btn.classList.add("is-dragging");
    });
    btn.addEventListener("dragend", () => {
      btn.classList.remove("is-dragging");
      sheet.classList.remove("is-drop");
    });
  });
  sheet.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("text/plain")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    sheet.classList.add("is-drop");
  });
  sheet.addEventListener("dragleave", (e) => {
    if (!sheet.contains(e.relatedTarget as Node | null)) sheet.classList.remove("is-drop");
  });
  sheet.addEventListener("drop", (e) => {
    e.preventDefault();
    sheet.classList.remove("is-drop");
    const id = e.dataTransfer?.getData("text/plain");
    if (id && PRODUCTS[id]) addItem(id);
  });

  app.querySelectorAll<HTMLInputElement>('input[name="bq-cur"]').forEach((r) =>
    r.addEventListener("change", () => {
      if (!r.checked) return;
      state.currency = r.value as Currency;
      fmt = makeFormatter(state.currency);
      catItems.forEach((b) => {
        const price = b.querySelector<HTMLElement>("[data-price]");
        if (price) price.textContent = fmt(unit(Number(price.dataset.price)));
      });
      update({ say: `Currency ${state.currency}` });
    }),
  );

  app.querySelectorAll<HTMLInputElement>('input[name="bq-dmode"]').forEach((r) =>
    r.addEventListener("change", () => {
      if (!r.checked) return;
      state.discMode = r.value as "pct" | "fixed";
      if (state.discMode === "pct") {
        discInput.max = "25";
        discInput.step = "1";
        discInput.value = String(state.discPct);
      } else {
        discInput.max = "5000";
        discInput.step = "100";
        discInput.value = String(state.discFixed);
      }
      update({ flick: false, say: state.discMode === "pct" ? "Percentage discount" : "Fixed discount" });
    }),
  );

  discInput.addEventListener("input", () => {
    const v = Number(discInput.value);
    if (state.discMode === "pct") state.discPct = v;
    else state.discFixed = v;
    update({ flick: false, say: `Discount ${discVal.textContent}` });
  });

  internalInput.addEventListener("change", () => {
    state.internal = internalInput.checked;
    app.classList.toggle("is-internal", state.internal);
    app.classList.remove("is-flip");
    void app.offsetWidth;
    app.classList.add("is-flip");
    intNote.textContent = state.internal
      ? "Internal view: cost and margin columns are visible to your team only."
      : "Costs and margins are hidden from your customer.";
    announce(
      state.internal
        ? `Internal view. Cost and margin columns shown. Gross margin ${compute().margin.toFixed(1)}%.`
        : "Customer view. Costs and margins hidden.",
      50,
    );
  });

  sendBtn.addEventListener("click", () => {
    if (sendBtn.getAttribute("aria-disabled") === "true") return;
    send();
  });

  /* ── hint: first catalogue item pulses until the visitor interacts ── */

  let hintTimer = 0;
  function stopHint() {
    window.clearTimeout(hintTimer);
    catItems[0]?.classList.remove("is-hint");
  }
  app.addEventListener("pointerdown", stopHint, { once: true });

  /* ── first paint ── */

  renderRows(false);
  renderSummary(false);
  if (prefersReducedMotion) {
    setOdo(fmt(compute().total));
  } else {
    app.classList.add("is-intro");
    window.setTimeout(() => app.classList.remove("is-intro"), 1400);
    setOdo(fmt(0));
    window.setTimeout(() => setOdo(fmt(compute().total)), 450);
    hintTimer = window.setTimeout(() => catItems[0]?.classList.add("is-hint"), 2200);
  }
}

function makeFormatter(cur: Currency) {
  const nf = new Intl.NumberFormat(LOCALES[cur], {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (cents: number) => nf.format(cents / 100);
}

function symbolFor(cur: Currency) {
  const part = new Intl.NumberFormat(LOCALES[cur], { style: "currency", currency: cur })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? cur;
}

/* ════════════════════════════════════════════════════════════════════
   Feature-row loops: step through [data-s] items while on screen
   ════════════════════════════════════════════════════════════════════ */

function initSequences() {
  document.querySelectorAll<HTMLElement>("[data-bq-seq]").forEach((root) => {
    const ms = Number(root.dataset.bqSeq) || 1100;
    const max = Number(root.dataset.bqMax) || 4;
    const hold = Number(root.dataset.bqHold) || 2;
    const items = [...root.querySelectorAll<HTMLElement>("[data-s]")];
    let step = 0;
    let timer = 0;
    const apply = () => {
      root.dataset.step = String(Math.min(step, max));
      items.forEach((el) => el.classList.toggle("is-on", Number(el.dataset.s) <= step));
    };
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      step = max;
      apply();
      return;
    }
    apply();
    const tick = () => {
      step = step >= max + hold ? 0 : step + 1;
      apply();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        window.clearInterval(timer);
        if (entry.isIntersecting) {
          if (step === 0) window.setTimeout(tick, 250);
          timer = window.setInterval(tick, ms);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(root);
  });
}

/* Sections with CSS loops only run them while visible. */
function initLiveSections() {
  const sections = document.querySelectorAll<HTMLElement>("[data-bq-loop]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { threshold: 0.15 },
  );
  sections.forEach((s) => io.observe(s));
}

const app = document.querySelector<HTMLElement>("[data-bq-app]");
if (app) initBuilder(app);
initSequences();
initLiveSections();
