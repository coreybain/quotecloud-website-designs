import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* Document Creation Software · v3 "Write. Design. Interact."
   One working mini document app (three tabs on one document) plus an idle ghost-cursor tour. */

type Tab = "write" | "design" | "interact";
type DocType = "report" | "proposal" | "presentation" | "plan" | "contract";
type Theme = "coral" | "violet" | "forest" | "midnight";
type Cover = "split" | "full" | "band";
type Mode = "canvas" | "grid";
type Opt = { name: string; price: number };
type Template = {
  title: string;
  sub: string;
  art: string;
  heading: string;
  body: string;
  rewrite: string;
  line: string;
  block: string;
  clientTitle: string;
  base: Opt;
  opts: Opt[];
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const money = (n: number) => "$" + n.toLocaleString("en-US");
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/* ───────── Starter templates (sample data only) ───────── */

const SIG_PATH = "M6 28c10-4 16-20 22-20s-4 22 4 22 10-14 16-14-2 12 6 12 12-10 20-12c6-1 2 10 10 10s14-8 22-12 18-6 44-6";

const ART: Record<DocType, string> = {
  report: `<rect class="dc3-art__bg" width="200" height="160"/><circle class="dc3-art__glow" cx="160" cy="28" r="58"/><g class="dc3-art__bars"><rect x="34" y="96" width="18" height="40" rx="3"/><rect x="62" y="80" width="18" height="56" rx="3"/><rect x="90" y="66" width="18" height="70" rx="3"/><rect class="dc3-art__hi" x="118" y="44" width="18" height="92" rx="3"/></g><path class="dc3-art__line" pathLength="200" d="M30 88 L70 74 L100 60 L140 34 L172 22"/>`,
  proposal: `<rect class="dc3-art__bg" width="200" height="160"/><circle class="dc3-art__glow" cx="36" cy="140" r="70"/><rect class="dc3-art__soft" x="38" y="30" width="124" height="98" rx="7"/><rect class="dc3-art__accent" x="38" y="30" width="124" height="16" rx="7"/><rect class="dc3-art__white" x="50" y="58" width="56" height="8" rx="3"/><rect class="dc3-art__soft" x="50" y="72" width="44" height="5" rx="2.5"/><rect class="dc3-art__soft" x="112" y="58" width="38" height="44" rx="4"/><rect class="dc3-art__white" x="50" y="104" width="30" height="10" rx="5"/><path class="dc3-art__line" pathLength="200" d="M118 92 L126 84 L134 88 L144 70"/>`,
  presentation: `<rect class="dc3-art__bg" width="200" height="160"/><circle class="dc3-art__accent" cx="132" cy="76" r="46"/><circle class="dc3-art__stroke" cx="82" cy="96" r="34"/><circle class="dc3-art__stroke" cx="82" cy="96" r="22"/><path class="dc3-art__white" d="M40 40 L58 70 L22 70 Z"/><rect class="dc3-art__soft" x="150" y="118" width="30" height="22" rx="4"/><path class="dc3-art__line" pathLength="200" d="M24 132 C60 112 100 140 150 104"/>`,
  plan: `<rect class="dc3-art__bg" width="200" height="160"/><circle class="dc3-art__glow" cx="178" cy="140" r="64"/><g class="dc3-art__bars"><rect x="26" y="36" width="70" height="12" rx="6"/><rect class="dc3-art__hi" x="64" y="58" width="78" height="12" rx="6"/><rect x="104" y="80" width="60" height="12" rx="6"/><rect class="dc3-art__hi" x="132" y="102" width="44" height="12" rx="6"/></g><rect class="dc3-art__white" x="171" y="121" width="10" height="10" transform="rotate(45 176 126)"/><path class="dc3-art__line" pathLength="200" d="M26 132 H120"/>`,
  contract: `<rect class="dc3-art__bg" width="200" height="160"/><circle class="dc3-art__glow" cx="170" cy="24" r="60"/><rect class="dc3-art__soft" x="52" y="22" width="96" height="124" rx="5"/><rect class="dc3-art__white" x="66" y="38" width="52" height="8" rx="3"/><rect class="dc3-art__soft" x="66" y="56" width="68" height="4" rx="2"/><rect class="dc3-art__soft" x="66" y="66" width="60" height="4" rx="2"/><rect class="dc3-art__soft" x="66" y="76" width="64" height="4" rx="2"/><rect class="dc3-art__accent" x="66" y="124" width="68" height="2" rx="1"/><path class="dc3-art__line" pathLength="200" transform="translate(66 92) scale(0.42)" d="${SIG_PATH}"/>`,
};

const TEMPLATES: Record<DocType, Template> = {
  report: {
    title: "Q3 Business Report",
    sub: "Prepared for the board · October 2026",
    art: ART.report,
    heading: "Executive summary",
    body: "Revenue grew across all three regions this quarter, and we want to take a moment to explain in some detail what drove that growth and what we think it could mean for the plans we are making for next year.",
    rewrite: "Revenue grew 16% across all three regions in Q3. Here is what drove it, and what it means for next year.",
    line: "The spreadsheet below updates live.",
    block: "",
    clientTitle: "Approve this report",
    base: { name: "Quarterly reporting retainer", price: 4500 },
    opts: [
      { name: "Board presentation session", price: 1200 },
      { name: "Q4 forecast appendix", price: 800 },
    ],
  },
  proposal: {
    title: "Website Redesign Proposal",
    sub: "Prepared for Harbour &amp; Co. · October 2026",
    art: ART.proposal,
    heading: "Our approach",
    body: "We would very much like to take this opportunity to outline the way in which we would approach the redesign of your website, which we believe will be able to help you attract more customers.",
    rewrite: "Here is how we will redesign your website to win you more customers, in three clear phases.",
    line: "Pick the extras that suit you below.",
    block: `<table class="dc3-ptable" aria-label="Price Table block"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>Discovery and UX</td><td>1</td><td>$2,400</td></tr><tr><td>Design system</td><td>1</td><td>$3,200</td></tr><tr><td>Page build</td><td>12</td><td>$4,200</td></tr></tbody><tfoot><tr><td colspan="2">Subtotal</td><td>$9,800</td></tr><tr><td colspan="2">Total incl. tax</td><td>$10,780</td></tr></tfoot></table>`,
    clientTitle: "Choose your options",
    base: { name: "Website redesign", price: 9800 },
    opts: [
      { name: "Copywriting for key pages", price: 1600 },
      { name: "SEO setup", price: 1100 },
    ],
  },
  presentation: {
    title: "Brand Launch Presentation",
    sub: "Spring campaign · Leadership review",
    art: ART.presentation,
    heading: "The big idea",
    body: "What we are basically proposing to do is to launch the new brand across a number of different channels at roughly the same time, so that it really makes a big impression on people.",
    rewrite: "One launch, every channel, the same week. A brand people can't miss.",
    line: "Drag any block anywhere in Canvas Mode.",
    block: `<div class="dc3-pres" role="img" aria-label="Shapes and Gallery blocks"><div class="dc3-pres__big">Launch week<br />at a glance</div><div class="dc3-pres__tiles"><span></span><span></span><span></span></div></div>`,
    clientTitle: "Approve the launch plan",
    base: { name: "Launch campaign", price: 14000 },
    opts: [
      { name: "Video production", price: 3500 },
      { name: "Additional market", price: 4200 },
    ],
  },
  plan: {
    title: "Project Phoenix Plan",
    sub: "Six-week delivery plan · Starts 3 November",
    art: ART.plan,
    heading: "Timeline",
    body: "The project is going to be delivered over the course of approximately six weeks, starting with a discovery phase and then moving on through design and build before we eventually go live.",
    rewrite: "Six weeks, four phases: discovery, design, build and go-live.",
    line: "Dates sync with the Gantt Chart below.",
    block: `<div class="dc3-gantt" role="img" aria-label="Gantt Chart block: six-week plan"><div class="dc3-gantt__row"><span>Phase</span><div class="dc3-gantt__weeks"><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span></div></div><div class="dc3-gantt__row"><span>Discovery</span><div class="dc3-gantt__track"><i class="dc3-gantt__bar" style="--x: 1%; --w: 24%"></i></div></div><div class="dc3-gantt__row"><span>Design</span><div class="dc3-gantt__track"><i class="dc3-gantt__bar" style="--x: 18%; --w: 32%; --d: 0.12s"></i></div></div><div class="dc3-gantt__row"><span>Build</span><div class="dc3-gantt__track"><i class="dc3-gantt__bar dc3-gantt__bar--soft" style="--x: 42%; --w: 44%; --d: 0.24s"></i></div></div><div class="dc3-gantt__row"><span>Go-live</span><div class="dc3-gantt__track"><i class="dc3-gantt__ms" style="--x: 92%"></i></div></div></div>`,
    clientTitle: "Approve the project plan",
    base: { name: "Phase 1: discovery and design", price: 22000 },
    opts: [
      { name: "Phase 2: extended build", price: 6500 },
      { name: "Team training day", price: 1800 },
    ],
  },
  contract: {
    title: "Service Agreement",
    sub: "Managed IT services · Northwind and Harbour &amp; Co.",
    art: ART.contract,
    heading: "Scope of services",
    body: "The provider agrees that it will provide the managed IT services that are described in more detail in the schedule below, for the full duration of the term of this agreement.",
    rewrite: "The provider will deliver the managed IT services in Schedule 1 for the full term.",
    line: "Every clause lives in your content library.",
    block: `<ol class="dc3-toc" aria-label="Table of Contents block"><li><b>1</b>Services<span></span><em>2</em></li><li><b>2</b>Fees and payment<span></span><em>3</em></li><li><b>3</b>Term and termination<span></span><em>4</em></li><li><b>4</b>Confidentiality<span></span><em>5</em></li></ol><div class="dc3-initials">Initials<span></span></div>`,
    clientTitle: "Review and sign",
    base: { name: "Managed services, 12 months", price: 18000 },
    opts: [
      { name: "Priority support", price: 2400 },
      { name: "Quarterly reviews", price: 1600 },
    ],
  },
};

const THEME_NAMES: Record<Theme, string> = { coral: "Coral", violet: "Violet", forest: "Forest", midnight: "Midnight" };
const TYPE_NAMES: Record<DocType, string> = { report: "Report", proposal: "Proposal", presentation: "Presentation", plan: "Project plan", contract: "Contract" };

/* ───────── The demo app ───────── */

function initApp(app: HTMLElement) {
  const stage = q<HTMLElement>("[data-stage]", app)!;
  const doc = q<HTMLElement>("[data-doc]", app)!;
  const coverEl = q<HTMLElement>("[data-cover-el]", app)!;
  const art = q<SVGSVGElement>(".dc3-art", app)!;
  const editable = q<HTMLElement>("[data-editable]", app)!;
  const aiBtn = q<HTMLButtonElement>("[data-ai]", app)!;
  const aiNote = q<HTMLElement>("[data-ai-note]", app)!;
  const block = q<HTMLElement>("[data-block]", app)!;
  const clientWrap = q<HTMLElement>(".dc3-clientwrap", app)!;
  const client = q<HTMLElement>("[data-client]", app)!;
  const optsList = q<HTMLElement>("[data-opts]", app)!;
  const totalOut = q<HTMLOutputElement>("[data-total]", app)!;
  const nameInput = q<HTMLInputElement>("[data-name]", app)!;
  const startSelect = q<HTMLSelectElement>("[data-start]", app)!;
  const signWrap = q<HTMLElement>("[data-sign]", app)!;
  const formWrap = q<HTMLElement>(".dc3-form", app)!;
  const signType = q<HTMLInputElement>("[data-sign-type]", app)!;
  const signCanvas = q<HTMLCanvasElement>("[data-sign-draw]", app)!;
  const signClear = q<HTMLButtonElement>("[data-sign-clear]", app)!;
  const acceptBtn = q<HTMLButtonElement>("[data-accept]", app)!;
  const accepted = q<HTMLElement>("[data-accepted]", app)!;
  const acceptedSig = q<HTMLElement>("[data-accepted-sig]", app)!;
  const acceptedMeta = q<HTMLElement>("[data-accepted-meta]", app)!;
  const docName = q<HTMLElement>("[data-doc-name]", app)!;
  const status = q<HTMLElement>("[data-status]", app)!;
  const live = q<HTMLElement>("[data-live]", app)!;
  const tabs = qa<HTMLButtonElement>("[data-tab-btn]", app);
  const typesBar = q<HTMLElement>(".dc3-types", app)!;

  TEMPLATES.report.block = block.innerHTML;

  const state = {
    tab: "write" as Tab,
    type: "report" as DocType,
    theme: "coral" as Theme,
    cover: "split" as Cover,
    mode: "grid" as Mode,
    signMode: "type" as "type" | "draw",
    drawn: false,
    accepted: false,
  };
  let aiRun = 0;
  let aiOriginal = "";
  let statusTimer = 0;

  const announce = (msg: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = msg), 30);
  };
  const setStatus = (text: string, ok = false) => {
    status.textContent = text;
    status.classList.toggle("is-ok", ok);
  };
  const markSaving = () => {
    if (state.accepted) return;
    setStatus("Saving…");
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => setStatus("Draft · saved"), 700);
  };

  /** Scroll the stage (never the window) so `el` sits near the top. */
  const scrollStageTo = (el: HTMLElement | null, offset = 16) => {
    const top = el ? el.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - offset : 0;
    stage.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth" });
  };
  const ensureVisibleInStage = (el: HTMLElement) => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < s.top + 8 || r.bottom > s.bottom - 48) scrollStageTo(el, Math.max(16, (s.height - r.height) / 2));
  };

  /* FLIP: text and blocks translate only; media translates and scales. */
  const flip = (mutate: () => void) => {
    if (prefersReducedMotion) return mutate();
    const els = [...qa<HTMLElement>("[data-flip]", doc), clientWrap];
    const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    for (const el of els) {
      const a = first.get(el)!;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const media = el.dataset.flip === "";
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      const sx = media ? a.width / b.width : 1;
      const sy = media ? a.height / b.height : 1;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" },
          { transform: "none", transformOrigin: "0 0" },
        ],
        { duration: 650, easing: EASE },
      );
    }
  };

  /* ── Tabs ── */
  const setTab = (tab: Tab, opts: { focus?: boolean; scroll?: boolean } = {}) => {
    state.tab = tab;
    app.dataset.tab = tab;
    for (const t of tabs) {
      const on = t.dataset.tabBtn === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && opts.focus) t.focus();
    }
    qa<HTMLElement>(".dc3-panel", app).forEach((p) => (p.hidden = p.id !== `dc3-panel-${tab}`));
    editable.contentEditable = tab === "write" ? "true" : "false";
    editable.setAttribute("aria-readonly", String(tab !== "write"));
    client.toggleAttribute("inert", tab !== "interact");
    if (opts.scroll !== false) scrollStageTo(tab === "interact" ? clientWrap : null);
    announce(tab === "write" ? "Write mode" : tab === "design" ? "Design mode" : "Previewing as your client");
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setTab(t.dataset.tabBtn as Tab));
    t.addEventListener("keydown", (e) => {
      const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const next = tabs[(keys[e.key] + tabs.length) % tabs.length];
      setTab(next.dataset.tabBtn as Tab, { focus: true });
    });
  });

  /* ── Write: toolbar ── */
  document.execCommand("defaultParagraphSeparator", false, "p");
  let savedRange: Range | null = null;
  const toolBtns = qa<HTMLButtonElement>("[data-cmd]", app);
  const pressed = (cmd: string, on: boolean) => q(`[data-cmd="${cmd}"]`, app)?.setAttribute("aria-pressed", String(on));
  const currentBlock = (): HTMLElement | null => {
    let node: Node | null = savedRange?.startContainer ?? null;
    while (node && node.parentNode !== editable) node = node.parentNode;
    return (node as HTMLElement | null) ?? null;
  };
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    savedRange = sel.getRangeAt(0).cloneRange();
    pressed("bold", document.queryCommandState("bold"));
    pressed("italic", document.queryCommandState("italic"));
    pressed("heading", !!currentBlock()?.classList.contains("dc3-h"));
  });
  const restoreSelection = () => {
    editable.focus({ preventScroll: true });
    const sel = document.getSelection();
    if (!sel) return;
    if (!savedRange || !editable.contains(savedRange.startContainer)) {
      const last = editable.lastElementChild ?? editable;
      savedRange = document.createRange();
      savedRange.selectNodeContents(last);
    }
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };
  const insertTable = () => {
    if (qa("table", editable).length >= 2) return;
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Next step</th><th>Owner</th><th>Due</th></tr></thead><tbody><tr><td>Review the draft</td><td>Priya</td><td>Fri</td></tr><tr><td>Send to the client</td><td>Tom</td><td>Mon</td></tr></tbody>";
    const after = currentBlock();
    if (after && after.parentNode === editable) after.after(table);
    else editable.append(table);
    if (!prefersReducedMotion)
      table.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: EASE });
    ensureVisibleInStage(table);
  };
  for (const btn of toolBtns) {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (state.tab !== "write") setTab("write", { scroll: false });
      const cmd = btn.dataset.cmd;
      if (cmd === "table") return void (insertTable(), markSaving());
      restoreSelection();
      if (cmd === "bold") document.execCommand("bold");
      else if (cmd === "italic") document.execCommand("italic");
      else if (cmd === "list") document.execCommand("insertUnorderedList");
      else if (cmd === "heading") {
        const b = currentBlock();
        if (b && b.tagName === "P") pressed("heading", b.classList.toggle("dc3-h"));
      }
      markSaving();
    });
  }
  editable.addEventListener("input", markSaving);
  editable.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
  });

  /* ── Write: AI tighten (clearly labelled sample rewrite) ── */
  const aiTarget = () => {
    let t = q<HTMLElement>("[data-ai-target]", editable);
    if (!t) {
      t = document.createElement("p");
      t.dataset.aiTarget = "";
      t.textContent = TEMPLATES[state.type].body;
      editable.append(t);
    }
    return t;
  };
  const resetAi = () => {
    aiRun++;
    aiNote.hidden = true;
    aiBtn.disabled = false;
    q("span", aiBtn)!.textContent = "Ask AI to tighten this";
  };
  const runAi = async () => {
    const run = ++aiRun;
    const target = aiTarget();
    aiOriginal = target.innerHTML;
    aiBtn.disabled = true;
    q("span", aiBtn)!.textContent = "Tightening…";
    ensureVisibleInStage(target);
    target.classList.remove("is-new");
    target.classList.add("is-thinking");
    await sleep(prefersReducedMotion ? 0 : 900);
    if (run !== aiRun) return;
    target.classList.remove("is-thinking");
    const words = TEMPLATES[state.type].rewrite.split(" ");
    if (prefersReducedMotion) target.textContent = words.join(" ");
    else {
      for (let i = 1; i <= words.length; i++) {
        target.textContent = words.slice(0, i).join(" ");
        await sleep(42);
        if (run !== aiRun) return;
      }
    }
    void target.offsetWidth;
    target.classList.add("is-new");
    aiNote.hidden = false;
    q("span", aiBtn)!.textContent = "Tightened";
    markSaving();
    announce("Sample AI rewrite applied. Undo is available.");
  };
  aiBtn.addEventListener("click", () => {
    if (state.tab !== "write") setTab("write", { scroll: false });
    void runAi();
  });
  q("[data-ai-undo]", app)!.addEventListener("click", () => {
    const target = aiTarget();
    target.innerHTML = aiOriginal;
    target.classList.remove("is-new");
    resetAi();
    announce("Original text restored");
  });

  /* ── Design: theme (circle wipe via View Transitions), cover layout (FLIP), canvas/grid ── */
  const setTheme = (theme: Theme, from?: HTMLElement) => {
    const apply = () => {
      state.theme = theme;
      doc.dataset.theme = theme;
      qa("[data-theme-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeBtn === theme)));
    };
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
    if (!vt || prefersReducedMotion || theme === state.theme) {
      apply();
    } else {
      const s = stage.getBoundingClientRect();
      const r = (from ?? stage).getBoundingClientRect();
      const root = document.documentElement.style;
      root.setProperty("--dc3-vt-x", `${r.left + r.width / 2 - s.left}px`);
      root.setProperty("--dc3-vt-y", `${Math.min(r.top + r.height / 2 - s.top, 0)}px`);
      stage.classList.add("is-vt");
      const t = vt.call(document, apply);
      t.finished.finally(() => stage.classList.remove("is-vt"));
    }
    markSaving();
    announce(`Theme: ${THEME_NAMES[theme]}`);
  };
  qa<HTMLButtonElement>("[data-theme-btn]", app).forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themeBtn as Theme, b)));

  const setCover = (cover: Cover) => {
    if (cover === state.cover) return;
    state.cover = cover;
    flip(() => (app.dataset.cover = cover));
    qa("[data-cover-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.coverBtn === cover)));
    scrollStageTo(null);
    markSaving();
    announce(`Cover layout: ${cover === "full" ? "full bleed" : cover}`);
  };
  qa<HTMLButtonElement>("[data-cover-btn]", app).forEach((b) => b.addEventListener("click", () => setCover(b.dataset.coverBtn as Cover)));

  const setMode = (mode: Mode) => {
    state.mode = mode;
    app.dataset.mode = mode;
    qa("[data-mode-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modeBtn === mode)));
    if (mode === "grid" && !prefersReducedMotion) {
      coverEl.classList.remove("is-guiding");
      void coverEl.offsetWidth;
      coverEl.classList.add("is-guiding");
    }
    scrollStageTo(null);
    markSaving();
    announce(mode === "canvas" ? "Canvas Mode: blocks placed freely" : "Grid Mode: blocks snapped to columns");
  };
  coverEl.addEventListener("animationend", () => coverEl.classList.remove("is-guiding"));
  qa<HTMLButtonElement>("[data-mode-btn]", app).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.modeBtn as Mode)));

  /* ── Template picker ── */
  const renderClient = (tpl: Template) => {
    q('[data-f="clientTitle"]', app)!.textContent = tpl.clientTitle;
    const lock = `<span class="dc3-opt__lock"><svg class="dc3-ic" aria-hidden="true"><use href="#dc3-i-lock" /></svg>Included</span>`;
    optsList.innerHTML =
      `<li class="dc3-opt dc3-opt--base"><span class="dc3-opt__name">${tpl.base.name}</span><span class="dc3-opt__price">${money(tpl.base.price)}</span>${lock}</li>` +
      tpl.opts
        .map(
          (o) =>
            `<li class="dc3-opt"><label class="dc3-opt__label"><span class="dc3-opt__name">${o.name}</span><span class="dc3-opt__price">${money(o.price)}</span><input class="dc3-switch" type="checkbox" data-price="${o.price}" /></label></li>`,
        )
        .join("");
    totalOut.dataset.base = String(tpl.base.price);
    updateTotal(false);
  };
  const setType = (type: DocType) => {
    if (type === state.type) return;
    const tpl = TEMPLATES[type];
    state.type = type;
    resetAi();
    unaccept();
    flip(() => {
      app.dataset.type = type;
      docName.innerHTML = tpl.title;
      q('[data-f="title"]', app)!.innerHTML = tpl.title;
      q('[data-f="sub"]', app)!.innerHTML = tpl.sub;
      art.innerHTML = tpl.art;
      editable.innerHTML = `<p class="dc3-h">${tpl.heading}</p><p data-ai-target>${tpl.body}</p>`;
      block.innerHTML = tpl.block;
      renderClient(tpl);
    });
    if (!prefersReducedMotion) {
      for (const el of [q(".dc3-cover__text-in", app), editable]) {
        el?.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: EASE });
      }
      art.animate([{ opacity: 0.2, transform: "scale(1.06)" }, { opacity: 1, transform: "none" }], { duration: 650, easing: EASE });
    }
    savedRange = null;
    qa("[data-type-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.typeBtn === type)));
    if (state.tab !== "interact") scrollStageTo(null);
    else scrollStageTo(clientWrap);
    setStatus("Draft · saved");
    announce(`Template: ${TYPE_NAMES[type]}`);
  };
  qa<HTMLButtonElement>("[data-type-btn]", app).forEach((b) => b.addEventListener("click", () => setType(b.dataset.typeBtn as DocType)));

  /* ── Interact: options + total ── */
  function updateTotal(bump = true) {
    const base = Number(totalOut.dataset.base ?? 0);
    const sum = qa<HTMLInputElement>("input[data-price]", optsList).reduce((n, i) => n + (i.checked ? Number(i.dataset.price) : 0), base);
    totalOut.textContent = money(sum);
    if (bump && !prefersReducedMotion) {
      totalOut.classList.remove("is-bump");
      void totalOut.offsetWidth;
      totalOut.classList.add("is-bump");
    }
    return sum;
  }
  optsList.addEventListener("change", () => announce(`Total ${money(updateTotal())}`));

  /* ── Interact: form + signature ── */
  const canAccept = () => nameInput.value.trim().length > 1 && (state.signMode === "type" ? signType.value.trim().length > 1 : state.drawn);
  const syncAccept = () => (acceptBtn.disabled = !canAccept());
  nameInput.addEventListener("input", syncAccept);
  signType.addEventListener("input", syncAccept);

  const ctx = signCanvas.getContext("2d");
  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = signCanvas.clientWidth;
    const h = signCanvas.clientHeight;
    if (!ctx || !w || !h) return;
    signCanvas.width = Math.round(w * dpr);
    signCanvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#1d2b6b";
  };
  const clearCanvas = () => {
    ctx?.clearRect(0, 0, signCanvas.width, signCanvas.height);
    state.drawn = false;
    syncAccept();
  };
  const setSignMode = (mode: "type" | "draw") => {
    state.signMode = mode;
    qa("[data-sign-mode]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.signMode === mode)));
    signType.hidden = mode !== "type";
    signCanvas.hidden = mode !== "draw";
    signClear.hidden = mode !== "draw";
    if (mode === "draw") {
      sizeCanvas();
      clearCanvas();
    }
    syncAccept();
  };
  qa<HTMLButtonElement>("[data-sign-mode]", app).forEach((b) => b.addEventListener("click", () => setSignMode(b.dataset.signMode as "type" | "draw")));
  signClear.addEventListener("click", clearCanvas);

  let drawing = false;
  const point = (e: PointerEvent) => {
    const r = signCanvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  signCanvas.addEventListener("pointerdown", (e) => {
    if (!ctx) return;
    drawing = true;
    signCanvas.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  signCanvas.addEventListener("pointermove", (e) => {
    if (!drawing || !ctx) return;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!state.drawn) {
      state.drawn = true;
      syncAccept();
    }
  });
  const endDraw = () => (drawing = false);
  signCanvas.addEventListener("pointerup", endDraw);
  signCanvas.addEventListener("pointercancel", endDraw);

  const accept = () => {
    if (!canAccept()) return;
    state.accepted = true;
    acceptedSig.textContent = "";
    if (state.signMode === "draw") {
      const img = new Image();
      img.src = signCanvas.toDataURL("image/png");
      img.alt = `Signature of ${nameInput.value.trim()}`;
      acceptedSig.append(img);
    } else acceptedSig.textContent = signType.value.trim();
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    acceptedMeta.textContent = `Signed by ${nameInput.value.trim()} · ${date} · ${totalOut.textContent} · Starts ${startSelect.value}`;
    signWrap.hidden = true;
    formWrap.hidden = true;
    qa<HTMLInputElement>("input[data-price]", optsList).forEach((i) => (i.disabled = true));
    accepted.hidden = false;
    setStatus("Accepted · signed", true);
    ensureVisibleInStage(accepted);
    announce(`Accepted and signed by ${nameInput.value.trim()}`);
    const badge = q("[data-close-badge]");
    if (badge) badge.textContent = "Accepted and signed";
  };
  acceptBtn.addEventListener("click", accept);
  function unaccept() {
    if (!state.accepted) return;
    state.accepted = false;
    accepted.hidden = true;
    signWrap.hidden = false;
    formWrap.hidden = false;
    setStatus("Draft · saved");
    const badge = q("[data-close-badge]");
    if (badge) badge.textContent = "Ready to send";
  }

  q("[data-veil]", app)!.addEventListener("click", () => setTab("interact"));

  /* ── Reset ── */
  const reset = (silent = false) => {
    resetAi();
    unaccept();
    const wasType = state.type;
    state.type = "contract"; // force a re-render of the report template
    if (wasType === "report") state.type = "proposal";
    setType("report");
    if (state.theme !== "coral") {
      state.theme = "coral";
      doc.dataset.theme = "coral";
      qa("[data-theme-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeBtn === "coral")));
    }
    state.cover = "split";
    app.dataset.cover = "split";
    qa("[data-cover-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.coverBtn === "split")));
    state.mode = "grid";
    app.dataset.mode = "grid";
    qa("[data-mode-btn]", app).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modeBtn === "grid")));
    nameInput.value = "";
    signType.value = "";
    startSelect.selectedIndex = 0;
    setSignMode("type");
    setTab("write", { scroll: false });
    stage.scrollTo({ top: 0 });
    typesBar.scrollTo({ left: 0 });
    setStatus("Draft · saved");
    if (!silent) announce("Demo reset");
  };
  q("[data-reset]", app)!.addEventListener("click", () => reset());

  // initial a11y state (content is fully usable without JS)
  setTab("write", { scroll: false });
  live.textContent = "";

  return {
    app,
    stage,
    typesBar,
    editable,
    nameInput,
    signType,
    acceptBtn,
    reset,
    scrollStageTo,
    ensureVisibleInStage,
    get type() {
      return state.type;
    },
  };
}

/* ───────── Ghost-cursor tour: plays while idle and on screen, stops on the first real interaction ───────── */

function initTour(api: ReturnType<typeof initApp>) {
  const { app, stage, typesBar } = api;
  const cursor = q<HTMLElement>("[data-cursor]", app)!;
  const hint = q<HTMLElement>("[data-hint]", app)!;
  const STOP = Symbol("stop");
  let stopped = false;
  let inView = false;
  let started = false;

  const visible = () => inView && document.visibilityState === "visible";
  const wait = async (ms: number) => {
    let left = ms;
    while (left > 0) {
      if (stopped) throw STOP;
      await sleep(100);
      if (visible()) left -= 100;
    }
    if (stopped) throw STOP;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cursor.classList.remove("is-on");
    hint.classList.remove("is-on");
    qa(".dc3-caret", app).forEach((c) => c.remove());
  };
  for (const type of ["click", "keydown", "input", "pointerdown"] as const) {
    app.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      if (type === "pointerdown" && !(e.target as Element).closest("canvas")) return;
      stop();
    }, true);
  }

  const moveTo = async (el: HTMLElement, fx = 0.5, fy = 0.55) => {
    if (stage.contains(el)) {
      api.ensureVisibleInStage(el);
      await wait(450);
    }
    if (typesBar.contains(el)) {
      typesBar.scrollTo({ left: el.offsetLeft - 12, behavior: "smooth" });
      await wait(300);
    }
    const a = app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    cursor.style.transform = `translate(${r.left - a.left + r.width * fx}px, ${r.top - a.top + r.height * fy}px)`;
    await wait(900);
  };
  const click = async (el: HTMLElement) => {
    await moveTo(el);
    cursor.classList.remove("is-click");
    void cursor.offsetWidth;
    cursor.classList.add("is-click");
    el.click();
    await wait(250);
  };
  const typeInput = async (input: HTMLInputElement, text: string) => {
    await moveTo(input, 0.3);
    for (let i = 1; i <= text.length; i++) {
      input.value = text.slice(0, i);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(100);
    }
  };
  const typeLine = async (text: string) => {
    const p = document.createElement("p");
    const span = document.createElement("span");
    const caret = document.createElement("i");
    caret.className = "dc3-caret";
    p.append(span, caret);
    api.editable.append(p);
    await moveTo(p, 0.1, 0.5);
    for (let i = 1; i <= text.length; i++) {
      span.textContent = text.slice(0, i);
      await wait(100);
    }
    caret.remove();
  };

  const themes: Theme[] = ["violet", "forest", "midnight"];
  const types: DocType[] = ["report", "proposal", "plan", "presentation", "contract"];
  const covers: Cover[] = ["full", "band", "full"];

  const loop = async () => {
    for (let i = 0; ; i++) {
      await wait(600);
      cursor.classList.add("is-on");
      hint.classList.add("is-on");
      const $ = (sel: string) => q<HTMLElement>(sel, app)!;
      const type = types[i % types.length];
      if (type !== api.type) {
        await click($(`[data-type-btn="${type}"]`));
        await wait(900);
      }
      await click($("[data-ai]"));
      await wait(2400);
      hint.classList.remove("is-on");
      await typeLine(TEMPLATES[type].line);
      await wait(700);
      api.scrollStageTo(null);
      await wait(500);
      await click($('[data-tab-btn="design"]'));
      await wait(500);
      await click($(`[data-theme-btn="${themes[i % themes.length]}"]`));
      await wait(1100);
      await click($(`[data-cover-btn="${covers[i % covers.length]}"]`));
      await wait(1100);
      await click($('[data-mode-btn="canvas"]'));
      await wait(1500);
      await click($('[data-tab-btn="interact"]'));
      await wait(900);
      await click($("input[data-price]"));
      await wait(700);
      await typeInput(api.nameInput, "Alex Morgan");
      await typeInput(api.signType, "Alex Morgan");
      await wait(300);
      await click(api.acceptBtn);
      await wait(3600);
      cursor.classList.remove("is-on");
      hint.classList.remove("is-on");
      await wait(500);
      api.reset(true);
      await wait(1200);
    }
  };

  const start = () => {
    if (started || stopped) return;
    started = true;
    const a = app.getBoundingClientRect();
    cursor.style.transform = `translate(${a.width * 0.62}px, ${a.height * 0.7}px)`;
    loop().catch((e) => {
      if (e !== STOP) throw e;
    });
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView && !started) window.setTimeout(start, 1400);
    },
    { threshold: 0.4 },
  );
  io.observe(app);

  return { stop };
}

/* ───────── "Try" buttons below the hero ───────── */

function initTry(api: ReturnType<typeof initApp>, tour: { stop: () => void } | null) {
  qa<HTMLButtonElement>("[data-try]").forEach((btn) =>
    btn.addEventListener("click", () => {
      tour?.stop();
      api.app.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
      const tab = q<HTMLButtonElement>(`[data-tab-btn="${btn.dataset.try}"]`, api.app)!;
      tab.click();
      tab.focus({ preventScroll: true });
    }),
  );
}

/* ───────── Gallery filters (FLIP) ───────── */

function initFilters() {
  const bar = q<HTMLElement>("[data-filters]");
  const list = q<HTMLElement>("[data-docs]");
  if (!bar || !list) return;
  bar.hidden = false;
  const items = qa<HTMLElement>(".dc3-docs__item", list);
  const btns = qa<HTMLButtonElement>("[data-filter]", bar);
  for (const btn of btns) {
    btn.addEventListener("click", () => {
      const f = btn.dataset.filter!;
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const first = new Map(items.filter((i) => !i.hidden).map((i) => [i, i.getBoundingClientRect()]));
      for (const item of items) {
        const kinds = (item.dataset.kind ?? "").split(" ");
        item.hidden = f !== "all" && !kinds.includes(f);
      }
      if (prefersReducedMotion) return;
      for (const item of items) {
        if (item.hidden) continue;
        const a = first.get(item);
        if (!a) {
          item.animate([{ opacity: 0, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: EASE });
          continue;
        }
        const b = item.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 550, easing: EASE });
      }
    });
  }
}

/* ───────── Comparison ledger + paused-offscreen loops ───────── */

function initLedger() {
  const ledger = q<HTMLElement>("[data-ledger]");
  if (!ledger) return;
  qa<HTMLElement>("tbody tr", ledger).forEach((tr, i) => tr.style.setProperty("--row", String(i)));
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return ledger.classList.add("is-in");
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        ledger.classList.add("is-in");
        io.disconnect();
      }
    },
    { threshold: 0.15 },
  );
  io.observe(ledger);
}

function initLoops() {
  const els = qa<HTMLElement>(".dc3-hero, .dc3-ways, .dc3-kit, .dc3-biz, .dc3-close");
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { rootMargin: "80px 0px" },
  );
  for (const el of els) {
    el.classList.add("dc3-loop");
    io.observe(el);
  }
}

/* ───────── Closing CTA mirrors the visitor's document ───────── */

function initClose(app: HTMLElement) {
  const page = q<HTMLElement>("[data-close-page]");
  const doc = q<HTMLElement>("[data-doc]", app);
  if (!page || !doc) return;
  const mirror = () => {
    const clone = doc.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
    clone.querySelectorAll(".dc3-clientwrap, .dc3-ai-note, .dc3-caret").forEach((el) => el.remove());
    clone.removeAttribute("aria-label");
    clone.removeAttribute("data-doc");
    page.dataset.cover = app.dataset.cover;
    page.dataset.mode = app.dataset.mode;
    page.replaceChildren(clone);
  };
  mirror();
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && mirror(), { rootMargin: "200px 0px" }).observe(page);
}

/* ───────── Boot ───────── */

const appEl = q<HTMLElement>("#dc3-app");
if (appEl) {
  const api = initApp(appEl);
  const tour = prefersReducedMotion || !("IntersectionObserver" in window) ? null : initTour(api);
  initTry(api, tour);
  initClose(appEl);
}
initFilters();
initLedger();
initLoops();
