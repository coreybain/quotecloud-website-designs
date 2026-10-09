import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ─────────────────────────────────────────────────────────────
   The hero demo: a sample proposal with the AI Coworker open.
   Every answer below is pre-written sample text that is played
   back word by word. Nothing here calls a model or an API.
   ───────────────────────────────────────────────────────────── */

type Tone = "neutral" | "friendly" | "professional" | "concise" | "persuasive" | "technical";
type Ask = "summarize" | "selling" | "friendly" | "next" | "support" | "optional" | "qty" | "hidecost" | "tone" | "paste" | "fallback";
type Row = { id: string; name: string; qty: number; cost: number | null; price: number; optional?: boolean; on?: boolean; tag?: "catalogue" | "ai"; editable?: boolean };
type State = {
  tone: Tone;
  intro: string;
  summary: string[] | null;
  selling: string[] | null;
  next: string[] | null;
  rows: Row[];
  costHidden: boolean;
  itinerary: "none" | "review" | "accepted";
};
type Piece = { p?: string; ul?: string[]; ol?: string[]; quote?: string; note?: string };
type Plan = {
  pieces: Piece[];
  /** applied straight away (with Undo), like the app's pricing-table tools */
  apply?: () => void;
  /** a person decides: Insert / Replace */
  offer?: { label: string; run: () => void };
  /** a shortcut button, e.g. "Open Paste tab" */
  link?: { label: string; run: () => void };
  variants?: number;
};

const TONE_LABEL: Record<Tone, string> = {
  neutral: "Neutral",
  friendly: "Friendly",
  professional: "Professional",
  concise: "Concise",
  persuasive: "Persuasive",
  technical: "Technical",
};

const INTRO: Record<Tone, string> = {
  neutral:
    "This proposal outlines how Brightline will roll out the fleet platform across Northwind's three depots, including setup, data migration and team training, over six weeks.",
  friendly:
    "Thanks for the great conversation last week! Here's how we'd get your three depots up and running on the fleet platform in six weeks, with setup, data migration and training all taken care of.",
  professional:
    "Brightline Systems is pleased to present a six-week rollout of the fleet platform across Northwind Logistics' three depots. The plan covers configuration, data migration and team training, so your dispatchers are productive from day one.",
  concise: "A six-week rollout across three depots: setup, data migration and training. Dispatchers productive from day one.",
  persuasive:
    "Every week on spreadsheets is time your dispatchers could spend moving freight. In six weeks, all three Northwind depots will be live on one platform, with your data migrated and your team trained.",
  technical:
    "Scope: provision 12 platform licences, configure depot and vehicle hierarchies, migrate historical job data via CSV or API import, and run role-based training. Target go-live: week 6, three depots.",
};
const FRIENDLY_ALT =
  "Thanks again for walking us through your depots! We've put together a six-week plan to get all three sites onto the fleet platform, with setup, data migration and hands-on training handled by our team.";

const PROMPTS: Record<Ask, string> = {
  summarize: "Summarize this document",
  selling: "Highlight key selling points",
  friendly: "Rewrite in a friendlier tone",
  next: "Suggest next steps for client",
  support: "Add Premium Support from the catalogue",
  optional: "Make onboarding optional",
  qty: "Let the client change quantity",
  hidecost: "Hide the cost column",
  tone: "",
  paste: "",
  fallback: "",
};

const INITIAL_ROWS: Row[] = [
  { id: "lic", name: "Platform licences (annual)", qty: 12, cost: 310, price: 480 },
  { id: "onb", name: "Onboarding & setup", qty: 1, cost: 1900, price: 3200 },
  { id: "mig", name: "Data migration", qty: 1, cost: 1100, price: 1800 },
  { id: "trn", name: "Team training workshop", qty: 2, cost: 600, price: 950 },
];
const SUPPORT_ROW: Row = { id: "sup", name: "Premium Support (12 months)", qty: 1, cost: 1400, price: 2400, tag: "catalogue" };
const PASTED_ROWS: Row[] = [
  { id: "tel", name: "Telematics unit (per vehicle)", qty: 24, cost: null, price: 189, tag: "ai" },
  { id: "ins", name: "Install & calibration", qty: 24, cost: null, price: 65, tag: "ai" },
  { id: "app", name: "Driver app setup", qty: 1, cost: null, price: 450, tag: "ai" },
];

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, prefersReducedMotion ? 0 : ms));
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const icon = (id: string, size = 15) => `<svg class="ac-ico" width="${size}" height="${size}" aria-hidden="true"><use href="#ac-i-${id}" /></svg>`;
const plain = (s: string) => s.replace(/\*\*/g, "");

function totals(rows: Row[]) {
  const subtotal = rows.reduce((sum, r) => sum + (r.optional && r.on === false ? 0 : r.qty * r.price), 0);
  const tax = Math.round(subtotal * 0.1);
  return { subtotal, tax, total: subtotal + tax };
}

export function initDemo() {
  const frame = $("#ac-frame");
  const body = $(".ac-body", frame ?? document);
  const canvas = $("#ac-canvas");
  const log = $("#ac-log");
  const side = $("#ac-side");
  const composer = $(".ac-composer");
  const table = $("#ac-table");
  const intro = $("#ac-intro");
  const form = $<HTMLFormElement>("#ac-form");
  const input = $<HTMLInputElement>("#ac-q");
  const sendBtn = $<HTMLButtonElement>("#ac-send");
  const toneSelect = $<HTMLSelectElement>("#ac-tone");
  const undoPill = $("#ac-undo");
  const undoLabel = $("#ac-undo-label");
  const cursor = $<SVGElement>("#ac-cursor");
  if (!frame || !body || !canvas || !log || !side || !composer || !table || !intro || !form || !input || !sendBtn || !toneSelect || !undoPill || !undoLabel || !cursor) return;

  const block = (key: string) => $(`[data-blk="${key}"]`, canvas)!;
  const sheetMq = window.matchMedia("(max-width: 759px)");
  const isSheet = () => sheetMq.matches;

  let state: State = {
    tone: "professional",
    intro: INTRO.professional,
    summary: null,
    selling: null,
    next: null,
    rows: structuredClone(INITIAL_ROWS),
    costHidden: false,
    itinerary: "none",
  };
  const history: { label: string; snap: State }[] = [];

  /* ───────── Mobile bottom sheet ───────── */

  const grab = $<HTMLButtonElement>("#ac-grab");
  const aiToggle = $<HTMLButtonElement>("#ac-ai-toggle");
  const setSheet = (open: boolean) => {
    side.classList.toggle("is-open", open);
    grab?.setAttribute("aria-expanded", String(open));
    if (isSheet()) aiToggle?.setAttribute("aria-expanded", String(open));
  };
  grab?.addEventListener("click", () => setSheet(!side.classList.contains("is-open")));
  aiToggle?.addEventListener("click", () => {
    if (isSheet()) setSheet(!side.classList.contains("is-open"));
    else input.focus({ preventScroll: true });
  });
  side.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSheet() && side.classList.contains("is-open")) setSheet(false);
  });
  const syncMq = () => {
    aiToggle?.setAttribute("aria-expanded", String(isSheet() ? side.classList.contains("is-open") : true));
    setChipSet(isSheet() ? "write" : "pricing");
  };
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => side.style.setProperty("--ac-comp-h", `${composer.offsetHeight}px`)).observe(composer);
  }

  /* ───────── Chips + tabs ───────── */

  const switchBtns = $$<HTMLButtonElement>("[data-set]", composer);
  function setChipSet(set: string) {
    switchBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === set)));
    $$("[data-chips]", composer!).forEach((row) => (row.hidden = row.dataset.chips !== set));
  }
  switchBtns.forEach((b) => b.addEventListener("click", () => setChipSet(b.dataset.set!)));
  sheetMq.addEventListener("change", syncMq);
  syncMq();

  const tabs = $$<HTMLButtonElement>("[role=tab]", side);
  function selectTab(id: string, focus = false) {
    tabs.forEach((t) => {
      const on = t.id === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls")!);
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus({ preventScroll: true });
    });
    if (isSheet()) setSheet(true);
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t.id));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      selectTab(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].id, true);
    });
  });

  /* ───────── Document rendering ───────── */

  function scrollDocTo(el: Element | null) {
    if (!el) return;
    const top = el.getBoundingClientRect().top - canvas!.getBoundingClientRect().top + canvas!.scrollTop - (isSheet() && !undoPill!.hidden ? 66 : 18);
    canvas!.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  function aiBlock(heading: string, items: string[], ordered = false) {
    const tag = ordered ? "ol" : "ul";
    return (
      `<span class="ac-blk__tag">${icon("spark", 12)}AI Coworker</span>` +
      `<p class="ac-doc-h">${heading}</p><${tag} class="ac-doc-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</${tag}>`
    );
  }

  function showNew(el: HTMLElement) {
    el.hidden = false;
    el.classList.remove("is-new");
    void el.offsetWidth;
    el.classList.add("is-new");
    const tag = $(".ac-blk__tag", el);
    if (tag) window.setTimeout(() => (tag.style.opacity = "0"), 5200);
  }

  function writeIntro(text: string, animate: boolean) {
    if (!animate || prefersReducedMotion) {
      intro!.textContent = text;
      return;
    }
    intro!.textContent = "";
    text.split(" ").forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "ac-w";
      s.style.animationDelay = `${i * 22}ms`;
      s.textContent = w;
      intro!.append(s, " ");
    });
    const blk = block("intro");
    blk.classList.remove("is-flash");
    void blk.offsetWidth;
    blk.classList.add("is-flash");
  }

  function tableHtml(s: State) {
    const cols = s.costHidden ? ["item", "qty", "price", "total"] : ["item", "qty", "cost", "price", "total"];
    const head: Record<string, string> = { item: "Item", qty: "Qty", cost: "Cost", price: "Price", total: "Total" };
    const th = cols.map((c) => `<th scope="col" data-k="h:${c}"${c === "item" ? "" : ' class="ac-num"'}>${head[c]}</th>`).join("");
    const rows = s.rows
      .map((r) => {
        const off = r.optional && r.on === false;
        const cells = cols.map((c) => {
          const k = `data-k="${r.id}:${c}"`;
          if (c === "item") {
            const tag =
              r.tag === "catalogue"
                ? `<span class="ac-tagc">${icon("box", 11)}Catalogue</span>`
                : r.tag === "ai"
                  ? `<span class="ac-tagc ac-tagc--ai">${icon("spark", 10)}AI</span>`
                  : "";
            const opt = r.optional
              ? `<label class="ac-opt"><input type="checkbox" data-opt="${r.id}"${r.on === false ? "" : " checked"} aria-label="Include ${esc(r.name)} (optional item)" /><span class="ac-opt__sw"></span>Optional</label>`
              : "";
            return `<td ${k}><div class="ac-item"><span>${esc(r.name)}</span>${tag}${opt}</div></td>`;
          }
          if (c === "qty") {
            if (r.editable)
              return `<td ${k} class="ac-num"><span class="ac-step-q"><button type="button" data-qty="-1" data-row="${r.id}" aria-label="Fewer ${esc(r.name)}"${r.qty <= 1 ? " disabled" : ""}>${icon("minus", 12)}</button><output data-qty-out="${r.id}" aria-live="polite">${r.qty}</output><button type="button" data-qty="1" data-row="${r.id}" aria-label="More ${esc(r.name)}"${r.qty >= 50 ? " disabled" : ""}>${icon("plus", 12)}</button></span></td>`;
            return `<td ${k} class="ac-num">${r.qty}</td>`;
          }
          if (c === "cost") return `<td ${k} class="ac-num ac-cost">${r.cost == null ? "—" : money(r.cost)}</td>`;
          if (c === "price") return `<td ${k} class="ac-num">${money(r.price)}</td>`;
          return `<td ${k} class="ac-num ac-total" data-total="${r.id}">${money(r.qty * r.price)}</td>`;
        });
        return `<tr class="${off ? "ac-row--off" : ""}${r.tag ? " ac-row--new" : ""}">${cells.join("")}</tr>`;
      })
      .join("");
    const t = totals(s.rows);
    return (
      `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>` +
      `<dl class="ac-sum" data-k="sum"><div><dt>Subtotal</dt><dd data-sum="subtotal">${money(t.subtotal)}</dd></div>` +
      `<div><dt>Tax (10%)</dt><dd data-sum="tax">${money(t.tax)}</dd></div>` +
      `<div class="ac-sum__total"><dt>Total</dt><dd data-sum="total">${money(t.total)}</dd></div></dl>`
    );
  }

  function tween(el: HTMLElement, from: number, to: number) {
    if (from === to || prefersReducedMotion) {
      el.textContent = money(to);
      return;
    }
    const start = performance.now();
    el.classList.add("is-ticking");
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
      else el.classList.remove("is-ticking");
    };
    requestAnimationFrame(tick);
  }

  function renderTable(prev: State | null) {
    const before = new Map<string, DOMRect>();
    if (prev && !prefersReducedMotion) $$("[data-k]", table!).forEach((el) => before.set(el.dataset.k!, el.getBoundingClientRect()));
    table!.innerHTML = tableHtml(state);
    $("#ac-hidden-note")!.hidden = !state.costHidden;
    if (!prev) return;
    const a = totals(prev.rows);
    const b = totals(state.rows);
    (["subtotal", "tax", "total"] as const).forEach((k) => tween($(`[data-sum="${k}"]`, table!)!, a[k], b[k]));
    if (prefersReducedMotion) return;
    $$("[data-k]", table!).forEach((el) => {
      const old = before.get(el.dataset.k!);
      const now = el.getBoundingClientRect();
      if (!old) {
        el.animate(
          [
            { opacity: 0, transform: "translateY(-8px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 520, delay: 140, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
        );
        return;
      }
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 560,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
    });
  }

  /** client-side edits (stepper, optional switch) update numbers in place so focus stays put */
  function refreshNumbers(prevRows: Row[]) {
    state.rows.forEach((r) => {
      const out = $(`[data-qty-out="${r.id}"]`, table!);
      if (out) out.textContent = String(r.qty);
      const cell = $(`[data-total="${r.id}"]`, table!);
      if (cell) cell.textContent = money(r.qty * r.price);
      const tr = cell?.closest("tr");
      tr?.classList.toggle("ac-row--off", !!(r.optional && r.on === false));
      $$<HTMLButtonElement>(`[data-row="${r.id}"]`, table!).forEach((b) => {
        b.disabled = b.dataset.qty === "-1" ? r.qty <= 1 : r.qty >= 50;
      });
    });
    const a = totals(prevRows);
    const b = totals(state.rows);
    (["subtotal", "tax", "total"] as const).forEach((k) => tween($(`[data-sum="${k}"]`, table!)!, a[k], b[k]));
  }

  table.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-qty]");
    if (!btn) return;
    const prev = structuredClone(state.rows);
    const row = state.rows.find((r) => r.id === btn.dataset.row);
    if (!row) return;
    row.qty = Math.min(50, Math.max(1, row.qty + Number(btn.dataset.qty)));
    refreshNumbers(prev);
  });
  table.addEventListener("change", (e) => {
    const box = (e.target as Element).closest<HTMLInputElement>("[data-opt]");
    if (!box) return;
    const prev = structuredClone(state.rows);
    const row = state.rows.find((r) => r.id === box.dataset.opt);
    if (row) row.on = box.checked;
    refreshNumbers(prev);
  });

  function itinHtml(s: State) {
    const review =
      s.itinerary === "review"
        ? `<div class="ac-itin__review"><p>${icon("spark", 13)}Generated by AI Coworker from your pasted airfare search</p><div class="ac-itin__btns">` +
          `<button type="button" class="ac-mini ac-mini--violet" data-itin="accept" aria-label="Accept AI Itinerary content">${icon("check", 13)}Accept</button>` +
          `<button type="button" class="ac-mini" data-itin="reject" aria-label="Reject and remove AI content">${icon("close", 12)}Reject</button></div></div>`
        : "";
    const flight = (d: string, day: string, mon: string, from: string, to: string, no: string, t1: string, t2: string, dur: string, i: number) =>
      `<div class="ac-flight${s.itinerary === "review" ? " is-in" : ""}" style="animation-delay:${300 + i * 260}ms">` +
      `<p class="ac-flight__date"><span>${d}</span><strong>${day}</strong><span>${mon}</span></p>` +
      `<div><p class="ac-flight__route">${from} ${icon("plane", 15)} ${to}</p><p class="ac-flight__meta">Flight ${no} · Economy · 2 travellers</p></div>` +
      `<p class="ac-flight__time">${t1} – ${t2}<span>${dur}</span></p></div>`;
    return (
      `<p class="ac-doc-h">Kickoff travel</p><div class="ac-itin${s.itinerary === "review" ? " is-review" : ""}">${review}` +
      flight("MON", "09", "MAR", "SYD", "SIN", "QC 214", "09:40", "15:55", "8h 15m", 0) +
      flight("FRI", "13", "MAR", "SIN", "SYD", "QC 215", "21:10", "07:05 +1", "7h 55m", 1) +
      `<p class="ac-itin__foot">Total fare AUD 2,486.40 incl. tax · 30 kg baggage · seats at check-in</p></div>`
    );
  }

  canvas.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-itin]");
    if (!btn) return;
    if (btn.dataset.itin === "accept") commit("Itinerary accepted", (s) => (s.itinerary = "accepted"), "itinerary");
    else commit("AI itinerary removed", (s) => (s.itinerary = "none"), "pricing");
  });

  function render(prev: State, focus: string | null) {
    if (prev.intro !== state.intro) writeIntro(state.intro, true);
    toneSelect!.value = state.tone;

    (
      [
        ["summary", "At a glance", false],
        ["selling", "Why Brightline", false],
        ["next", "Next steps", true],
      ] as const
    ).forEach(([key, heading, ordered]) => {
      const el = block(key);
      const now = state[key];
      if (JSON.stringify(now) === JSON.stringify(prev[key])) return;
      if (!now) {
        el.hidden = true;
        return;
      }
      el.innerHTML = aiBlock(heading, now, ordered);
      showNew(el);
    });

    if (JSON.stringify(prev.rows) !== JSON.stringify(state.rows) || prev.costHidden !== state.costHidden) renderTable(prev);

    if (prev.itinerary !== state.itinerary) {
      const el = block("itinerary");
      if (state.itinerary === "none") el.hidden = true;
      else {
        el.innerHTML = itinHtml(state);
        if (prev.itinerary === "none") showNew(el);
        else el.hidden = false;
      }
    }
    updatePasteButton();
    if (focus) {
      if (isSheet()) setSheet(false);
      window.setTimeout(() => scrollDocTo(block(focus)), isSheet() ? 260 : 40);
    }
  }

  function commit(label: string, mutate: (s: State) => void, focus: string | null) {
    history.push({ label, snap: structuredClone(state) });
    const prev = structuredClone(state);
    mutate(state);
    render(prev, focus);
    showUndo(label);
  }

  function showUndo(label: string) {
    undoLabel!.textContent = label;
    undoPill!.hidden = false;
    undoPill!.style.animation = "none";
    void undoPill!.offsetWidth;
    undoPill!.style.animation = "";
  }

  $("#ac-undo-btn")?.addEventListener("click", () => {
    const last = history.pop();
    if (!last) return;
    const prev = structuredClone(state);
    state = last.snap;
    render(prev, null);
    const next = history[history.length - 1];
    if (next) showUndo(next.label);
    else undoPill.hidden = true;
  });

  /* ───────── Streaming ───────── */

  type Run = { stopped: boolean };
  let current: Run | null = null;

  function setBusy(on: boolean) {
    sendBtn!.classList.toggle("is-busy", on);
    sendBtn!.setAttribute("aria-label", on ? "Stop generating" : "Send");
    log!.setAttribute("aria-busy", String(on));
  }

  function tokens(text: string) {
    const out: { w: string; b: boolean }[] = [];
    text.split("**").forEach((part, i) => part.split(/\s+/).filter(Boolean).forEach((w) => out.push({ w, b: i % 2 === 1 })));
    return out;
  }

  async function typeInto(target: HTMLElement, text: string, run: Run, caret: HTMLElement) {
    if (prefersReducedMotion) {
      target.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return true;
    }
    target.append(caret);
    for (const t of tokens(text)) {
      if (run.stopped) return false;
      const span = document.createElement(t.b ? "strong" : "span");
      span.className = "ac-w";
      span.textContent = t.w;
      target.insertBefore(span, caret);
      target.insertBefore(document.createTextNode(" "), caret);
      log!.scrollTop = log!.scrollHeight;
      await new Promise((r) => window.setTimeout(r, 22 + Math.min(40, t.w.length * 4)));
    }
    return true;
  }

  async function stream(host: HTMLElement, pieces: Piece[], run: Run) {
    const caret = document.createElement("span");
    caret.className = "ac-caret";
    caret.setAttribute("aria-hidden", "true");
    try {
      for (const piece of pieces) {
        const items = piece.ul ?? piece.ol;
        if (items) {
          const list = document.createElement(piece.ul ? "ul" : "ol");
          host.append(list);
          for (const item of items) {
            const li = document.createElement("li");
            list.append(li);
            if (!(await typeInto(li, item, run, caret))) return false;
          }
        } else {
          const p = document.createElement("p");
          if (piece.quote) p.className = "ac-quote";
          if (piece.note) p.className = "ac-msg__note";
          host.append(p);
          if (!(await typeInto(p, piece.p ?? piece.quote ?? piece.note ?? "", run, caret))) return false;
        }
      }
      return true;
    } finally {
      caret.remove();
    }
  }

  function piecesText(pieces: Piece[]) {
    return pieces
      .map((p) => (p.ul ? p.ul.map((i) => `• ${i}`).join("\n") : p.ol ? p.ol.map((i, n) => `${n + 1}. ${i}`).join("\n") : plain(p.p ?? p.quote ?? p.note ?? "")))
      .join("\n");
  }

  /* ───────── Scripted answers ───────── */

  function plan(ask: Ask, variant: number, extra?: Tone): Plan {
    const t = totals(state.rows);
    const lic = state.rows.find((r) => r.id === "lic")?.qty ?? 12;
    switch (ask) {
      case "summarize": {
        const items = [
          [
            "Six-week rollout of the fleet platform across Northwind's three depots.",
            `Covers ${lic} platform licences, onboarding and setup, data migration and team training.`,
            `Total investment of ${money(t.total)} including tax.`,
          ],
          [
            "Brightline takes all three Northwind depots live on one fleet platform in six weeks.",
            "Setup, migration of historical job data and on-site training are included.",
            `${money(t.total)} including tax, ready to sign online.`,
          ],
        ][variant % 2];
        return {
          variants: 2,
          pieces: [{ p: "Here's a short summary you can place at the top:" }, { ul: items }],
          offer: { label: "Insert", run: () => commit("Summary inserted", (s) => (s.summary = items), "summary") },
        };
      }
      case "selling": {
        const items = [
          [
            "Live in six weeks, across all three depots at once.",
            "Your historical job data comes with you, so nothing starts from zero.",
            "Dispatchers are trained on-site, inside their own daily workflows.",
          ],
          [
            "One platform for every depot, replacing scattered spreadsheets.",
            "A fixed six-week plan with a named rollout lead.",
            "Hands-on training, so your team is confident from the first day.",
          ],
        ][variant % 2];
        return {
          variants: 2,
          pieces: [{ p: "Three selling points that matter most to Northwind:" }, { ul: items }],
          offer: { label: "Insert", run: () => commit("Selling points inserted", (s) => (s.selling = items), "selling") },
        };
      }
      case "friendly": {
        const text = variant % 2 ? FRIENDLY_ALT : INTRO.friendly;
        return {
          variants: 2,
          pieces: [{ p: "Here's your introduction in a friendlier tone:" }, { quote: text }],
          offer: {
            label: "Replace intro",
            run: () =>
              commit(
                "Introduction replaced",
                (s) => {
                  s.intro = text;
                  s.tone = "friendly";
                },
                "intro",
              ),
          },
        };
      }
      case "next": {
        const items = [
          ["Confirm which depot goes live first.", "Share a sample job export so we can plan the data migration.", "Sign the proposal to lock in a March kickoff."],
          ["Book a short scoping call with your depot managers.", "Send a sample of your current job data.", "Approve and e-sign the proposal to reserve the rollout team."],
        ][variant % 2];
        return {
          variants: 2,
          pieces: [{ p: "Suggested next steps for Jordan at Northwind:" }, { ol: items }],
          offer: { label: "Insert", run: () => commit("Next steps inserted", (s) => (s.next = items), "next") },
        };
      }
      case "support": {
        if (state.rows.some((r) => r.id === "sup")) return { pieces: [{ p: "**Premium Support** is already in the pricing table." }] };
        const after = totals([...state.rows, SUPPORT_ROW]);
        return {
          pieces: [{ p: "Added **Premium Support (12 months)** from your product catalogue to the pricing table." }, { note: `New total: ${money(after.total)} incl. tax.` }],
          apply: () => commit("Premium Support added", (s) => s.rows.push(structuredClone(SUPPORT_ROW)), "pricing"),
        };
      }
      case "optional": {
        const onb = state.rows.find((r) => r.id === "onb");
        if (onb?.optional) return { pieces: [{ p: "**Onboarding & setup** is already optional." }] };
        return {
          pieces: [{ p: "**Onboarding & setup** is now an optional item. Your client can switch it on or off, and their total updates as they choose." }],
          apply: () =>
            commit(
              "Onboarding made optional",
              (s) => {
                const r = s.rows.find((x) => x.id === "onb");
                if (r) {
                  r.optional = true;
                  r.on = true;
                }
              },
              "pricing",
            ),
        };
      }
      case "qty": {
        const licRow = state.rows.find((r) => r.id === "lic");
        if (licRow?.editable) return { pieces: [{ p: "Your client can already change the quantity of **Platform licences**." }] };
        return {
          pieces: [{ p: "Your client can now change the quantity of **Platform licences** when they open the proposal. Try the stepper in the table." }],
          apply: () =>
            commit(
              "Quantity made editable",
              (s) => {
                const r = s.rows.find((x) => x.id === "lic");
                if (r) r.editable = true;
              },
              "pricing",
            ),
        };
      }
      case "hidecost": {
        if (state.costHidden) return { pieces: [{ p: "The **Cost** column is already hidden from your client." }] };
        return {
          pieces: [{ p: "Hid the **Cost** column. Your client sees the item, quantity, price and total only." }],
          apply: () => commit("Cost column hidden", (s) => (s.costHidden = true), "pricing"),
        };
      }
      case "tone": {
        const tone = extra ?? "professional";
        return {
          pieces: [{ p: `Rewrote the introduction in a **${TONE_LABEL[tone]}** tone.` }],
          apply: () =>
            commit(
              `Intro rewritten: ${TONE_LABEL[tone]}`,
              (s) => {
                s.tone = tone;
                s.intro = INTRO[tone];
              },
              "intro",
            ),
        };
      }
      case "paste":
        return {
          pieces: [{ p: "Use the **Paste** tab to turn an airfare search or a supplier price list into ready-made Content Blocks." }],
          link: { label: "Open Paste tab", run: () => selectTab("ac-tab-paste", true) },
        };
      default:
        return {
          pieces: [
            {
              p: "This is a demo, so I can only run the sample requests on this page. Try a suggestion below. In QuoteCloud, you can ask me about anything in your own documents.",
            },
          ],
        };
    }
  }

  function addUser(text: string) {
    const wrap = document.createElement("div");
    wrap.className = "ac-msg ac-msg--user";
    const p = document.createElement("p");
    p.textContent = text;
    wrap.append(p);
    log!.append(wrap);
  }

  async function ask(key: Ask, prompt?: string, extra?: Tone): Promise<HTMLButtonElement | null> {
    if (current) current.stopped = true;
    selectTab("ac-tab-chat");
    addUser(prompt ?? PROMPTS[key]);
    if (isSheet()) setSheet(true);

    const msg = document.createElement("div");
    msg.className = "ac-msg ac-msg--ai";
    msg.innerHTML = `<span class="ac-mark" aria-hidden="true">${icon("spark", 14)}</span><div><div class="ac-msg__body"><span class="ac-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>`;
    log!.append(msg);
    log!.scrollTop = log!.scrollHeight;
    const bodyEl = $(".ac-msg__body", msg)!;
    return play(key, 0, msg, bodyEl, extra);
  }

  async function play(key: Ask, variant: number, msg: HTMLElement, bodyEl: HTMLElement, extra?: Tone): Promise<HTMLButtonElement | null> {
    const run: Run = { stopped: false };
    current = run;
    setBusy(true);
    $(".ac-msg__actions", msg)?.remove();
    await wait(variant ? 250 : 560);
    if (run.stopped) {
      bodyEl.innerHTML = `<p class="ac-msg__note">Stopped.</p>`;
      if (current === run) setBusy(false);
      return null;
    }
    bodyEl.innerHTML = "";
    const p = plan(key, variant, extra);
    const done = await stream(bodyEl, p.pieces, run);
    if (current === run) {
      current = null;
      setBusy(false);
    }
    const actions = document.createElement("div");
    actions.className = "ac-msg__actions";
    let primary: HTMLButtonElement | null = null;

    if (!done) {
      const note = document.createElement("p");
      note.className = "ac-msg__note";
      note.textContent = "Stopped generating.";
      bodyEl.append(note);
    } else if (p.apply) {
      p.apply();
    }

    if (done && p.offer) {
      const offer = p.offer;
      primary = document.createElement("button");
      primary.type = "button";
      primary.className = "ac-mini ac-mini--violet";
      primary.innerHTML = `${icon("plus", 13)}<span>${offer.label}</span>`;
      primary.addEventListener("click", () => {
        offer.run();
        primary!.innerHTML = `${icon("check", 13)}<span>${offer.label === "Insert" ? "Inserted" : "Replaced"}</span>`;
        primary!.classList.remove("is-pulsing");
      });
      actions.append(primary);
    }
    if (done && p.link) {
      const link = p.link;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ac-mini";
      b.textContent = link.label;
      b.addEventListener("click", () => link.run());
      actions.append(b);
    }
    if (done && (p.offer || p.variants)) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "ac-iconbtn";
      copy.setAttribute("aria-label", "Copy");
      copy.innerHTML = icon("copy", 15);
      copy.addEventListener("click", () => {
        navigator.clipboard?.writeText(piecesText(p.pieces)).catch(() => {});
        copy.classList.add("is-done");
        copy.innerHTML = icon("check", 15);
        window.setTimeout(() => {
          copy.classList.remove("is-done");
          copy.innerHTML = icon("copy", 15);
        }, 1600);
      });
      actions.append(copy);
    }
    if (p.variants || !done) {
      const regen = document.createElement("button");
      regen.type = "button";
      regen.className = "ac-iconbtn";
      regen.setAttribute("aria-label", "Regenerate");
      regen.innerHTML = icon("redo", 15);
      regen.addEventListener("click", () => {
        bodyEl.innerHTML = "";
        void play(key, done ? variant + 1 : variant, msg, bodyEl, extra);
      });
      actions.append(regen);
    }
    if (actions.childElementCount) {
      $("div", msg)!.append(actions);
      log!.scrollTop = log!.scrollHeight;
    }
    return primary;
  }

  /* ───────── Inputs ───────── */

  side.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-ask]");
    if (!btn) return;
    btn.classList.add("is-used");
    void ask(btn.dataset.ask as Ask, btn.textContent?.trim());
  });

  toneSelect.addEventListener("change", () => {
    const tone = toneSelect.value as Tone;
    if (tone === state.tone) return;
    void ask("tone", `Rewrite the introduction in a ${TONE_LABEL[tone].toLowerCase()} tone`, tone);
  });

  function match(text: string): { key: Ask; tone?: Tone } {
    const t = text.toLowerCase();
    const tone = (Object.keys(TONE_LABEL) as Tone[]).find((k) => t.includes(k) && k !== "friendly");
    if (/summar|overview|tl;?dr/.test(t)) return { key: "summarize" };
    if (/sell|highlight|benefit|value|why/.test(t)) return { key: "selling" };
    if (/friend|warm|casual/.test(t)) return { key: "friendly" };
    if (/next|follow|step/.test(t)) return { key: "next" };
    if (tone) return { key: "tone", tone };
    if (/support|catalog/.test(t)) return { key: "support" };
    if (/option/.test(t)) return { key: "optional" };
    if (/quantit|qty|seats|licen/.test(t)) return { key: "qty" };
    if (/hide|cost|margin/.test(t)) return { key: "hidecost" };
    if (/itiner|flight|airfare|paste|travel|price list|rates/.test(t)) return { key: "paste" };
    return { key: "fallback" };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    // while streaming, the send button is a Stop button; Enter with new text asks the new question instead
    if (current && (!text || e.submitter === sendBtn)) {
      current.stopped = true;
      return;
    }
    if (!text) {
      input.focus();
      return;
    }
    input.value = "";
    const m = match(text);
    if (m.key === "tone" && m.tone === state.tone) {
      void ask("fallback", text);
      return;
    }
    void ask(m.key, text, m.tone);
  });

  /* ───────── Paste tab ───────── */

  const pasteBtn = $<HTMLButtonElement>("#ac-paste-go");
  const pasteLabel = $("#ac-paste-label");
  const pasteStatus = $("#ac-paste-status");
  const srcRadios = $$<HTMLInputElement>('input[name="ac-src"]', side);
  const src = () => (srcRadios.find((r) => r.checked)?.value ?? "itinerary") as "itinerary" | "prices";
  let pasting = false;

  function resetClip() {
    $$("#ac-clip span", side!).forEach((s) => s.classList.remove("is-reading", "is-used"));
  }
  function updatePasteButton() {
    if (!pasteBtn || !pasteLabel || pasting) return;
    const done = src() === "itinerary" ? state.itinerary !== "none" : state.rows.some((r) => r.id === "tel");
    pasteBtn.disabled = done;
    pasteLabel.textContent = done ? "Already in the document" : src() === "itinerary" ? "Paste Itinerary Data" : "Paste Price Table Data";
    if (!done) resetClip();
  }
  srcRadios.forEach((r) =>
    r.addEventListener("change", () => {
      $$<HTMLElement>("#ac-clip pre", side).forEach((pre) => (pre.hidden = pre.dataset.src !== src()));
      if (pasteStatus) pasteStatus.textContent = "";
      updatePasteButton();
    }),
  );

  async function runPaste() {
    if (!pasteBtn || !pasteStatus || pasting || pasteBtn.disabled) return;
    const kind = src();
    pasting = true;
    pasteBtn.disabled = true;
    pasteStatus.innerHTML = `<span class="ac-spin" aria-hidden="true"></span>${kind === "itinerary" ? "Parsing itinerary from clipboard..." : "Parsing price table from clipboard..."}`;
    const lines = $$(`#ac-clip pre[data-src="${kind}"] span`, side!);
    for (const line of lines) {
      line.classList.add("is-reading");
      await wait(420);
      line.classList.remove("is-reading");
      line.classList.add("is-used");
    }
    await wait(200);
    pasting = false;
    if (kind === "itinerary") {
      commit("Itinerary added for review", (s) => (s.itinerary = "review"), "itinerary");
      pasteStatus.innerHTML = `${icon("check", 14)}Added 2 flight segments. Review them in the document.`;
    } else {
      commit("3 rows added from your paste", (s) => s.rows.push(...structuredClone(PASTED_ROWS)), "pricing");
      pasteStatus.innerHTML = `${icon("check", 14)}Added 3 rows to the pricing table. Check them in the document.`;
    }
  }
  pasteBtn?.addEventListener("click", () => void runPaste());

  /* ───────── "Try it" shortcuts under the frame ───────── */

  const toneCycle: Tone[] = ["persuasive", "concise", "technical", "friendly", "neutral", "professional"];
  $$<HTMLButtonElement>("[data-try]").forEach((b) =>
    b.addEventListener("click", () => {
      takeOver();
      const what = b.dataset.try;
      if (what === "summarize") void ask("summarize");
      else if (what === "support") void ask("support");
      else if (what === "tone") {
        const next = toneCycle[(toneCycle.indexOf(state.tone) + 1) % toneCycle.length];
        toneSelect.value = next;
        void ask("tone", `Rewrite the introduction in a ${TONE_LABEL[next].toLowerCase()} tone`, next);
      } else if (what === "paste") {
        selectTab("ac-tab-paste");
        const radio = srcRadios.find((r) => r.value === "itinerary");
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change"));
        }
        void runPaste();
      }
    }),
  );

  /* ───────── Autoplay: one exchange, then hand over ───────── */

  let tookOver = false;
  function takeOver() {
    tookOver = true;
    cursor!.classList.remove("is-on");
  }
  frame.addEventListener("pointerdown", (e) => e.isTrusted && takeOver());
  frame.addEventListener("keydown", (e) => e.isTrusted && takeOver());

  function cursorTo(target: Element) {
    const b = body!.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = r.left - b.left + Math.min(r.width * 0.35, 46);
    const y = r.top - b.top + r.height * 0.55;
    cursor!.style.transform = `translate(${x}px, ${y}px)`;
  }
  async function tap() {
    cursor!.classList.remove("is-click");
    void cursor!.getBoundingClientRect();
    cursor!.classList.add("is-click");
    await wait(220);
  }
  const visible = (sel: string) =>
    $$(sel, frame).find((el) => {
      const r = el.getBoundingClientRect();
      const b = body!.getBoundingClientRect();
      return r.width > 0 && r.top >= b.top && r.bottom <= b.bottom && r.left >= b.left && r.right <= b.right;
    });

  async function autoplay() {
    if (tookOver) return;
    if (prefersReducedMotion) {
      await ask("summarize");
      return;
    }
    const target = visible('[data-ask="summarize"]');
    if (!target) return;
    const b = body!.getBoundingClientRect();
    cursor!.style.transition = "none";
    cursor!.style.transform = `translate(${b.width * 0.42}px, ${b.height * 0.55}px)`;
    void cursor!.getBoundingClientRect();
    cursor!.style.transition = "";
    cursor!.classList.add("is-on");
    await wait(300);
    cursorTo(target);
    await wait(1000);
    if (tookOver) return;
    await tap();
    target.classList.add("is-used");
    const insert = await ask("summarize");
    if (tookOver || !insert) {
      cursor!.classList.remove("is-on");
      insert?.classList.add("is-pulsing");
      return;
    }
    await wait(500);
    cursorTo(insert);
    await wait(1000);
    if (tookOver) {
      insert.classList.add("is-pulsing");
      return;
    }
    await tap();
    insert.click();
    await wait(700);
    cursor!.classList.remove("is-on");
  }

  renderTable(null);
  updatePasteButton();
  onceVisible(frame, () => window.setTimeout(() => void autoplay(), 500), isSheet() ? 0.3 : 0.45);
}
