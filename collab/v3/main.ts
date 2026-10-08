import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ─────────────────────────────────────────────────────────────
   Collaboration v3 · "Try It Together"
   A playable proposal. The visitor is "You"; Sophie and Alex are
   simulated teammates who type, reply, approve and react.
   ───────────────────────────────────────────────────────────── */

type Mate = "sophie" | "alex";
type Role = "viewer" | "commenter" | "editor" | "approver";
type TextKey = "summary" | "approach";
type BlockKey = TextKey | "pricing";
type Who = Mate | "you" | "taylor";
type Snapshot = { summary: string; approach: string; qty: number[] };
type Version = { n: number; title: string; who: string; when: string; snap: Snapshot };

const MATES: Mate[] = ["sophie", "alex"];
const NAME: Record<Who, string> = { sophie: "Sophie", alex: "Alex", you: "You", taylor: "Taylor" };
const INITIAL: Record<Who, string> = { sophie: "S", alex: "A", you: "You", taylor: "T" };
const BLOCK_NAME: Record<BlockKey, string> = { summary: "Executive Summary", approach: "Project Approach", pricing: "Investment Summary" };
const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", commenter: "Commenter", editor: "Editor", approver: "Approver" };
const ROLE_TEXT: Record<Role, string> = {
  viewer: "Can view only. Nothing is editable.",
  commenter: "Can read and comment. Editing is locked.",
  editor: "Can edit text and quantities. Pricing is locked.",
  approver: "Can edit, change pricing and approve.",
};
const ITEMS = ["Discovery workshop", "Design and build sprints", "Team training sessions", "Support plans"];
const UNIT = [2400, 6800, 950, 3600];
const TAX = 0.1;
const MAX_QTY = 20;

const PROMPTS: Record<BlockKey, string> = {
  summary: "Can we mention the launch date up front?",
  approach: "Could we add a timeline for each phase?",
  pricing: "Is the support plan optional for the client?",
};
const ADDITIONS: Record<TextKey, string> = {
  summary: " Launch is planned for week six.",
  approach: " Timeline: discovery in week one, build in weeks two to five, launch in week six.",
};
const REPLIES: Record<BlockKey, { edit: string; comment: string }> = {
  summary: { edit: "Yes, adding it now.", comment: "Good idea. I can only comment, so someone with edit access will need to add it." },
  approach: { edit: "Good call. Adding the timeline now.", comment: "Agreed. I can only comment here, so I've flagged it for an editor." },
  pricing: { edit: "Yes, it's optional. Taylor can untick it when reviewing.", comment: "Yes, it's optional. Taylor can untick it when reviewing." },
};
const PREFERRED: Record<BlockKey, Mate> = { summary: "sophie", approach: "alex", pricing: "alex" };

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const clone = (s: Snapshot): Snapshot => ({ summary: s.summary, approach: s.approach, qty: [...s.qty] });
const nowLabel = () => new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();

function q<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
}
const qa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

function avatar(who: Who, small = true) {
  const el = document.createElement("span");
  el.className = `tt-av tt-av--${who}${small ? " tt-av--sm" : ""}`;
  el.setAttribute("aria-hidden", "true");
  el.textContent = INITIAL[who];
  return el;
}
function icon(id: string, size = 14) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "tt-ico");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#tt-i-${id}`);
  svg.append(use);
  return svg;
}

/* ───────── A clock that only runs while the demo is on screen ───────── */

let clockOn = false;
let clockTime = 0;
let clockLast = 0;
let clockTimer = 0;
const waiters: { at: number; resolve: () => void }[] = [];

function tick() {
  const now = performance.now();
  clockTime += now - clockLast;
  clockLast = now;
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].at <= clockTime) waiters.splice(i, 1)[0].resolve();
  }
}
function setClock(on: boolean) {
  if (on === clockOn) return;
  clockOn = on;
  if (on) {
    clockLast = performance.now();
    clockTimer = window.setInterval(tick, 60);
  } else {
    tick();
    window.clearInterval(clockTimer);
  }
}
/** Waits `ms` of on-screen time. With reduced motion, resolves straight away. */
function sleep(ms: number): Promise<void> {
  if (prefersReducedMotion || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => waiters.push({ at: clockTime + ms, resolve }));
}

/* ───────── The demo ───────── */

function initDemo(demo: HTMLElement) {
  const page = q("[data-page]", demo);
  const canvas = q("[data-canvas]", demo);
  const rail = q("[data-rail]", demo);
  const panels = q("[data-panels]", demo);
  const live = q("[data-live]", demo);
  const toast = q("[data-toast]", demo);
  const badge = q("[data-badge]", demo);
  const bell = q("[data-bell]", demo);
  const saved = q("[data-saved]", demo);
  const approval = q("[data-approval]", demo);
  const approvalText = q("[data-approval-text]", demo);
  const permLayer = q("[data-perm-layer]", demo);
  const composer = q<HTMLFormElement>("[data-composer]", demo);
  const composerInput = q<HTMLTextAreaElement>("[data-composer-input]", demo);
  const composerTarget = q("[data-composer-target]", demo);
  const threads = q("[data-threads]", demo);
  const commentsHint = q("[data-comments-hint]", demo);
  const versionsList = q("[data-versions]", demo);
  const activity = q("[data-activity]", demo);
  const preview = q("[data-preview]", demo);
  const previewLabel = q("[data-preview-label]", demo);
  const tabs = qa<HTMLButtonElement>("[data-tab]", demo);
  const panelEls = qa("[data-panel]", demo);
  const rows = qa<HTMLTableRowElement>("tr[data-row]", demo);
  const textEls: Record<TextKey, HTMLElement> = {
    summary: q("[data-text=summary]", demo),
    approach: q("[data-text=approach]", demo),
  };
  const blocks: Record<BlockKey, HTMLElement> = {
    summary: q("[data-block=summary]", demo),
    approach: q("[data-block=approach]", demo),
    pricing: q("[data-block=pricing]", demo),
  };
  const cursors: Record<Mate, HTMLElement> = {
    sophie: q("[data-cursor=sophie]", demo),
    alex: q("[data-cursor=alex]", demo),
  };
  const sheetQuery = window.matchMedia("(max-width: 999px)");

  /* State */
  const doc: Snapshot = {
    summary: textEls.summary.textContent ?? "",
    approach: textEls.approach.textContent ?? "",
    qty: rows.map((r) => Number(q("[data-qty]", r).textContent)),
  };
  const roles: Record<Mate, Role> = { sophie: "editor", alex: "approver" };
  const typing: Partial<Record<TextKey, { mate: Mate; from: number; to: number; done: boolean }>> = {};
  let approvalState: "approved" | "pending" | "waiting" = "approved";
  let approvedBy: Mate = "alex";
  let previewing: Version | null = null;
  let previewRelease: (() => void) | null = null;
  let previewGate: Promise<void> = Promise.resolve();
  let epoch = 0; // bumps when the document is replaced (restore), cancelling any typing
  let unseen = 0;
  let activeTab = "comments";
  const displayedTotal = { value: total(doc.qty) };

  const versions: Version[] = [
    {
      n: 1,
      title: "Created from template",
      who: "You",
      when: "Monday 4:05 pm",
      snap: { summary: "Northwind needs a faster website.", approach: "We'll work in two-week sprints.", qty: [1, 2, 2, 0] },
    },
    {
      n: 2,
      title: "Rewrote Executive Summary",
      who: "Sophie",
      when: "Yesterday 11:20 am",
      snap: {
        summary: "Northwind needs a faster website that turns visitors into enquiries.",
        approach: "We'll work in two-week sprints, starting with a discovery workshop.",
        qty: [1, 2, 2, 1],
      },
    },
    {
      n: 3,
      title: "Updated pricing",
      who: "Alex",
      when: "Today 9:12 am",
      snap: {
        summary: "Northwind needs a faster website that turns visitors into enquiries.",
        approach: "We'll work in two-week sprints, starting with a discovery workshop.",
        qty: [1, 3, 2, 1],
      },
    },
  ];

  function total(qty: number[]) {
    const sub = qty.reduce((s, n, i) => s + n * UNIT[i], 0);
    return sub + sub * TAX;
  }
  const can = {
    comment: (m: Mate) => roles[m] !== "viewer",
    edit: (m: Mate) => roles[m] === "editor" || roles[m] === "approver",
    price: (m: Mate) => roles[m] === "approver",
  };

  /* ───── Announcements, activity, toast ───── */

  let liveTimer = 0;
  function announce(text: string) {
    window.clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = window.setTimeout(() => (live.textContent = text), 60);
  }

  function activityVisible() {
    return activeTab === "activity" && (!sheetQuery.matches || panels.hasAttribute("data-open"));
  }
  function setBadge() {
    badge.hidden = unseen === 0;
    badge.textContent = String(unseen);
    bell.setAttribute("aria-label", unseen ? `Activity, ${unseen} new` : "Activity");
  }

  let lastAct: { key: string; at: number; el: HTMLElement } | null = null;
  function log(who: Who, text: string, opts: { toast?: boolean; announce?: boolean; key?: string } = {}) {
    const time = nowLabel();
    // Coalesce rapid repeats of the same action (e.g. clicking + several times)
    if (opts.key && lastAct && lastAct.key === opts.key && Date.now() - lastAct.at < 5000) {
      const p = lastAct.el.querySelector("p");
      if (p) fillAct(p, who, text, time);
      lastAct.at = Date.now();
    } else {
      const li = document.createElement("li");
      li.className = "tt-act is-new";
      const p = document.createElement("p");
      fillAct(p, who, text, time);
      li.append(avatar(who), p);
      activity.prepend(li);
      lastAct = opts.key ? { key: opts.key, at: Date.now(), el: li } : null;
      if (!activityVisible()) {
        unseen++;
        setBadge();
      }
    }
    if (opts.toast) showToast(who, `${NAME[who]} ${text}`);
    if (opts.announce !== false) announce(`${NAME[who]} ${text}.`);
  }
  function fillAct(p: HTMLElement, who: Who, text: string, time: string) {
    const b = document.createElement("b");
    b.textContent = NAME[who];
    const span = document.createElement("span");
    span.textContent = time;
    p.replaceChildren(b, ` ${text} `, span);
  }

  let toastTimer = 0;
  function showToast(who: Who, text: string) {
    const p = document.createElement("span");
    p.textContent = text;
    toast.replaceChildren(avatar(who), p);
    requestAnimationFrame(() => toast.classList.add("is-on"));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 3200);
  }

  let saveTimer = 0;
  function markSaving() {
    saved.textContent = "Saving…";
    saved.classList.add("is-saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saved.textContent = "Saved";
      saved.classList.remove("is-saving");
    }, 800);
  }

  /* ───── Rendering ───── */

  function renderText(key: TextKey, snap: Snapshot = doc) {
    const el = textEls[key];
    const text = snap[key];
    const t = snap === doc ? typing[key] : undefined;
    if (!t) {
      el.textContent = text;
      return;
    }
    const mark = document.createElement("span");
    mark.className = "tt-typed";
    mark.style.setProperty("--c", `var(--tt-${t.mate})`);
    mark.textContent = text.slice(t.from, t.to);
    const nodes: (Node | string)[] = [text.slice(0, t.from), mark];
    if (!t.done) {
      const caret = document.createElement("span");
      caret.className = "tt-caret";
      caret.setAttribute("data-caret", t.mate);
      caret.style.setProperty("--c", `var(--tt-${t.mate})`);
      nodes.push(caret);
    }
    nodes.push(text.slice(t.to));
    el.replaceChildren(...nodes);
  }

  function renderTable(snap: Snapshot = doc, tween = false) {
    snap.qty.forEach((n, i) => {
      const row = rows[i];
      q("[data-qty]", row).textContent = String(n);
      q("[data-amount]", row).textContent = money(n * UNIT[i]);
      row.classList.toggle("is-zero", n === 0);
      const [minus, plus] = qa<HTMLButtonElement>("[data-step]", row);
      minus.disabled = !!previewing || n <= 0;
      plus.disabled = !!previewing || n >= MAX_QTY;
    });
    const sub = snap.qty.reduce((s, n, i) => s + n * UNIT[i], 0);
    q("[data-subtotal]", demo).textContent = money(sub);
    q("[data-tax]", demo).textContent = money(sub * TAX);
    setTotal(sub + sub * TAX, tween);
  }

  let totalRaf = 0;
  function setTotal(to: number, tween: boolean) {
    const el = q("[data-total]", demo);
    cancelAnimationFrame(totalRaf);
    const from = displayedTotal.value;
    if (!tween || prefersReducedMotion || from === to) {
      displayedTotal.value = to;
      el.textContent = money(to);
      return;
    }
    el.classList.remove("is-bump");
    void el.offsetWidth;
    el.classList.add("is-bump");
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      displayedTotal.value = from + (to - from) * (1 - Math.pow(1 - t, 3));
      el.textContent = money(displayedTotal.value);
      if (t < 1) totalRaf = requestAnimationFrame(step);
    };
    totalRaf = requestAnimationFrame(step);
  }

  function renderApproval() {
    approval.dataset.state = approvalState;
    approvalText.textContent =
      approvalState === "approved" ? `Approved by ${NAME[approvedBy]}` : approvalState === "pending" ? "Re-approval needed" : "Waiting for an approver";
  }
  function bumpApproval() {
    approval.classList.remove("is-bump");
    void approval.offsetWidth;
    approval.classList.add("is-bump");
  }

  function renderPins() {
    (Object.keys(BLOCK_NAME) as BlockKey[]).forEach((k) => {
      const n = qa(`.tt-thread[data-thread-block=${k}]:not(.tt-thread--resolved)`, threads).length;
      const pin = q(`[data-pin=${k}]`, demo);
      pin.textContent = String(n);
      pin.hidden = n === 0;
      blocks[k].classList.toggle("has-thread", n > 0);
      q<HTMLButtonElement>(`[data-comment=${k}]`, demo).setAttribute(
        "aria-label",
        `Comment on ${BLOCK_NAME[k]}${n ? ` (${n} open thread${n > 1 ? "s" : ""})` : ""}`,
      );
    });
    commentsHint.hidden = qa(".tt-thread", threads).length > 2;
  }

  function renderAll() {
    renderText("summary");
    renderText("approach");
    renderTable(doc, true);
    renderApproval();
  }

  /* ───── Cursors ───── */

  type Point = { x: number; y: number };
  const cursorTarget: Record<Mate, () => Point> = { sophie: () => ({ x: 0, y: 0 }), alex: () => ({ x: 0, y: 0 }) };

  function relRect(el: Element) {
    const r = el.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  }
  function visibleEl(...els: (Element | null)[]) {
    return els.find((el) => el && el.getBoundingClientRect().width > 0) ?? null;
  }
  function placeCursor(m: Mate, mode: "move" | "type" | "jump" = "move") {
    const c = cursors[m];
    const flag = q(".tt-cursor__flag", c);
    const pt = cursorTarget[m]();
    const maxX = page.clientWidth - flag.offsetWidth - 18;
    const x = Math.max(4, Math.min(pt.x - 2, maxX));
    const y = Math.max(4, Math.min(pt.y - 2, page.clientHeight - 44));
    c.classList.toggle("is-typing", mode === "type");
    if (mode === "jump") c.style.transition = "none";
    c.style.transform = `translate(${x}px, ${y}px)`;
    if (mode === "jump") {
      void c.offsetWidth;
      c.style.transition = "";
    }
  }
  async function moveTo(m: Mate, target: () => Point, wait = 1000) {
    cursorTarget[m] = target;
    placeCursor(m);
    await sleep(wait);
  }
  const at =
    (el: Element, ax = 0.5, ay = 0.5) =>
    (): Point => {
      const r = relRect(el);
      return { x: r.x + r.w * ax, y: r.y + r.h * ay };
    };
  const textEnd = (key: TextKey) => (): Point => {
    const range = document.createRange();
    range.selectNodeContents(textEls[key]);
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    const p = page.getBoundingClientRect();
    if (!last) return at(textEls[key], 0.6, 0.5)();
    return { x: last.right - p.left + 2, y: last.top - p.top + last.height * 0.55 };
  };
  const caretAt = (m: Mate, key: TextKey) => (): Point => {
    const caret = textEls[key].querySelector(`[data-caret=${m}]`);
    if (!caret) return textEnd(key)();
    const r = relRect(caret);
    return { x: r.x + 2, y: r.y + r.h * 0.55 };
  };
  const unitCell = (row: number) => visibleEl(rows[row].querySelector("[data-unit]"), rows[row].querySelector(".tt-price__each")) ?? rows[row];

  function setFlagRole(m: Mate) {
    q("[data-flag-role]", cursors[m]).textContent = ROLE_LABEL[roles[m]];
  }
  function blockedFlag(m: Mate) {
    const c = cursors[m];
    c.classList.remove("is-blocked");
    void c.offsetWidth;
    c.classList.add("is-blocked");
    window.setTimeout(() => c.classList.remove("is-blocked"), 1400);
  }

  /* Highlights drawn over the page (permissions, locks) */
  function flash(el: Element | Element[], label: string, opts: { mate?: Mate; locked?: boolean; ms?: number; pad?: number } = {}) {
    const list = Array.isArray(el) ? el : [el];
    const rects = list.map(relRect).filter((r) => r.w > 0);
    if (!rects.length) return;
    const pad = opts.pad ?? 6;
    const x = Math.min(...rects.map((r) => r.x)) - pad;
    const y = Math.min(...rects.map((r) => r.y)) - pad;
    const w = Math.max(...rects.map((r) => r.x + r.w)) - x + pad;
    const h = Math.max(...rects.map((r) => r.y + r.h)) - y + pad;
    const box = document.createElement("div");
    box.className = `tt-flash is-hold${opts.locked ? " is-locked" : ""}`;
    if (opts.mate) box.style.setProperty("--c", `var(--tt-${opts.mate})`);
    Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const tag = document.createElement("span");
    tag.className = "tt-flash__tag";
    tag.append(icon(opts.locked ? "lock" : "check", 12), label);
    box.append(tag);
    permLayer.append(box);
    window.setTimeout(() => box.remove(), opts.ms ?? 3000);
  }

  /* ───── Each teammate has a simple action queue ───── */

  const queue: Record<Mate, Promise<void>> = { sophie: Promise.resolve(), alex: Promise.resolve() };
  const pending: Record<Mate, number> = { sophie: 0, alex: 0 };
  function enqueue(m: Mate, job: () => Promise<void>) {
    pending[m]++;
    queue[m] = queue[m]
      .then(() => previewGate)
      .then(job)
      .catch(() => {})
      .finally(() => pending[m]--);
    return queue[m];
  }

  async function typeInto(m: Mate, key: TextKey, addition: string) {
    if (!can.edit(m)) return false;
    await moveTo(m, textEnd(key), 900);
    const myEpoch = epoch;
    const from = doc[key].length;
    typing[key] = { mate: m, from, to: from, done: false };
    for (const ch of prefersReducedMotion ? [addition] : addition) {
      await previewGate;
      if (epoch !== myEpoch) return false;
      if (!can.edit(m)) {
        const t = typing[key];
        if (t) t.done = true;
        renderText(key);
        blockedFlag(m);
        flash(textEls[key], `Editing locked for ${NAME[m]}`, { mate: m, locked: true, ms: 2200 });
        window.setTimeout(() => {
          if (typing[key]?.mate === m) delete typing[key];
          renderText(key);
        }, 1200);
        return false;
      }
      doc[key] += ch;
      const t = typing[key];
      if (t) t.to = doc[key].length;
      renderText(key);
      cursorTarget[m] = caretAt(m, key);
      placeCursor(m, "type");
      await sleep(ch === " " ? rand(40, 90) : ch === "," || ch === "." ? rand(180, 260) : rand(28, 70));
    }
    const t = typing[key];
    if (t) t.done = true;
    renderText(key);
    markSaving();
    window.setTimeout(() => {
      if (typing[key]?.mate === m && typing[key]?.done) {
        delete typing[key];
        if (!previewing) renderText(key);
      }
    }, 1600);
    cursors[m].classList.remove("is-typing");
    return true;
  }

  /* ───── Comments ───── */

  let composerBlock: BlockKey = "summary";

  function openComposer(block: BlockKey) {
    if (previewing) return;
    composerBlock = block;
    (Object.keys(blocks) as BlockKey[]).forEach((k) => blocks[k].classList.toggle("is-commenting", k === block));
    composerTarget.textContent = BLOCK_NAME[block];
    composerInput.value = PROMPTS[block];
    composer.hidden = false;
    selectTab("comments", { open: true });
    requestAnimationFrame(() => {
      composerInput.focus({ preventScroll: sheetQuery.matches });
      composerInput.select();
    });
  }
  function closeComposer(returnFocus = true) {
    composer.hidden = true;
    Object.values(blocks).forEach((b) => b.classList.remove("is-commenting"));
    if (returnFocus) q<HTMLButtonElement>(`[data-comment=${composerBlock}]`, demo).focus({ preventScroll: true });
  }

  function message(who: Who, text: string, opts: { mention?: Who; system?: boolean } = {}) {
    const msg = document.createElement("div");
    msg.className = `tt-msg is-new${opts.system ? " tt-msg--system" : ""}`;
    const body = document.createElement("div");
    body.className = "tt-msg__body";
    const meta = document.createElement("p");
    meta.className = "tt-msg__meta";
    const b = document.createElement("b");
    b.textContent = opts.system ? "QuoteCloud" : NAME[who];
    const time = document.createElement("span");
    time.textContent = "Just now";
    meta.append(b, " ", time);
    const p = document.createElement("p");
    p.className = "tt-msg__text";
    if (opts.mention) {
      const at = document.createElement("span");
      at.className = "tt-mention";
      at.textContent = `@${NAME[opts.mention]}`;
      p.append(at, " ");
    }
    p.append(text);
    body.append(meta, p);
    if (!opts.system) msg.append(avatar(who));
    else {
      const dot = document.createElement("span");
      dot.className = "tt-av tt-av--sm";
      dot.setAttribute("aria-hidden", "true");
      dot.append(icon("lock", 12));
      msg.append(dot);
    }
    msg.append(body);
    return msg;
  }
  function resolveButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tt-thread__resolve";
    btn.setAttribute("data-resolve", "");
    btn.append(icon("check"), " Resolve");
    return btn;
  }

  function postComment(block: BlockKey, text: string) {
    const li = document.createElement("li");
    li.className = "tt-thread is-new";
    li.dataset.threadBlock = block;
    const on = document.createElement("p");
    on.className = "tt-thread__on";
    const b = document.createElement("b");
    b.textContent = BLOCK_NAME[block];
    on.append("On ", b);
    li.append(on, message("you", text), resolveButton());
    threads.prepend(li);
    renderPins();
    log("you", `commented on ${BLOCK_NAME[block]}`, { announce: false });
    announce(`Comment posted on ${BLOCK_NAME[block]}.`);
    replyTo(li, block);
  }

  function replyTo(li: HTMLElement, block: BlockKey) {
    const first = PREFERRED[block];
    const other: Mate = first === "sophie" ? "alex" : "sophie";
    const mate = can.comment(first) ? first : can.comment(other) ? other : null;
    const resolve = li.querySelector("[data-resolve]");
    if (!mate) {
      const msg = message("you", "Sophie and Alex are both viewers, so neither can reply. Give one of them comment access.", { system: true });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tt-btn";
      btn.textContent = "Open People";
      btn.addEventListener("click", () => selectTab("people", { open: true, focus: true }));
      q(".tt-msg__body", msg).append(btn);
      li.insertBefore(msg, resolve);
      announce("Nobody can reply: Sophie and Alex are both viewers.");
      return;
    }
    enqueue(mate, async () => {
      await moveTo(mate, at(q(`[data-comment=${block}]`, demo), 0.3, 0.7), 900);
      const dots = document.createElement("div");
      dots.className = "tt-typing";
      const i = document.createElement("i");
      i.append(document.createElement("b"), document.createElement("b"), document.createElement("b"));
      dots.append(i, `${NAME[mate]} is typing`);
      li.insertBefore(dots, resolve);
      await sleep(1500);
      dots.remove();
      if (!li.isConnected || li.classList.contains("tt-thread--resolved")) return;
      const willEdit = block !== "pricing" && can.edit(mate) && !doc[block].includes(ADDITIONS[block].trim());
      const text = block === "pricing" || willEdit ? REPLIES[block].edit : can.edit(mate) ? "That's already in there now." : REPLIES[block].comment;
      li.insertBefore(message(mate, text, { mention: "you" }), resolve);
      log(mate, `replied to your comment on ${BLOCK_NAME[block]}`, { toast: true });
      if (willEdit) {
        await sleep(500);
        const ok = await typeInto(mate, block, ADDITIONS[block]);
        if (ok) log(mate, `edited ${BLOCK_NAME[block]}`, { announce: false });
      } else if (block === "pricing") {
        await moveTo(mate, at(unitCell(3), 0.5, 0.5), 800);
      }
    });
  }

  function resolveThread(li: HTMLElement) {
    const block = (li.dataset.threadBlock ?? "summary") as BlockKey;
    li.classList.add("is-leaving");
    window.setTimeout(
      () => {
        const done = document.createElement("li");
        done.className = "tt-thread tt-thread--resolved";
        done.dataset.threadBlock = block;
        done.tabIndex = -1;
        done.append(icon("check"), `Resolved · ${BLOCK_NAME[block]}`);
        li.replaceWith(done);
        renderPins();
        done.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 280,
    );
    log("you", `resolved a comment on ${BLOCK_NAME[block]}`);
  }

  /* ───── Quantities and approval ───── */

  let approveTimer = 0;
  const isApproved = () => approvalState === "approved";
  function changeQty(row: number, delta: number) {
    if (previewing) return;
    const next = Math.max(0, Math.min(MAX_QTY, doc.qty[row] + delta));
    if (next === doc.qty[row]) return;
    doc.qty[row] = next;
    renderTable(doc, true);
    const out = q("[data-qty]", rows[row]);
    out.classList.remove("tt-qtybump");
    void out.offsetWidth;
    out.classList.add("tt-qtybump");
    markSaving();
    log("you", `set ${ITEMS[row]} to ${next}`, { key: `qty${row}`, announce: false });
    announce(`${ITEMS[row]}: ${next}. Total ${money(total(doc.qty))}, updated for everyone.`);
    needsApproval();
  }

  function needsApproval() {
    if (approvalState === "approved") {
      approvalState = "pending";
      renderApproval();
      bumpApproval();
    }
    window.clearTimeout(approveTimer);
    approveTimer = window.setTimeout(seekApprover, prefersReducedMotion ? 400 : 1400);
  }

  function seekApprover() {
    if (approvalState === "approved") return;
    const mate = MATES.find((m) => roles[m] === "approver");
    if (!mate) {
      if (approvalState !== "waiting") {
        approvalState = "waiting";
        renderApproval();
        bumpApproval();
        announce("The new total is waiting for an approver. Make Sophie or Alex an Approver.");
      }
      return;
    }
    const other: Mate = mate === "sophie" ? "alex" : "sophie";
    const approve = () => {
      if (previewing || isApproved() || roles[mate] !== "approver") return;
      approvalState = "approved";
      approvedBy = mate;
      renderApproval();
      bumpApproval();
      log(mate, `approved the new total of ${money(total(doc.qty))}`, { toast: true });
    };
    if (pending[other] === 0) enqueue(other, () => moveTo(other, at(q("[data-total]", demo), 0.2, 0.5), 600));
    // A busy approver (mid-sentence) still approves promptly, without walking over
    if (pending[mate] > 0) {
      approveTimer = window.setTimeout(() => (previewing ? needsApproval() : approve()), prefersReducedMotion ? 200 : 1600);
      return;
    }
    enqueue(mate, async () => {
      await moveTo(mate, at(q("[data-total]", demo), 0.3, 0.6), 1100);
      await sleep(500);
      if (previewing || isApproved() || roles[mate] !== "approver") return;
      await moveTo(mate, at(approval, 0.5, 0.75), 1000);
      approve();
    });
  }

  /* ───── Roles ───── */

  function setRole(m: Mate, role: Role) {
    const before = roles[m];
    if (before === role) return;
    roles[m] = role;
    setFlagRole(m);
    const perm = q(`[data-perm-text=${m}]`, demo);
    perm.textContent = ROLE_TEXT[role];
    perm.classList.remove("is-new");
    void perm.offsetWidth;
    perm.classList.add("is-new");
    log("you", `made ${NAME[m]} ${role === "approver" || role === "editor" ? "an" : "a"} ${ROLE_LABEL[role]}`, { announce: false });
    announce(`${NAME[m]} is now ${ROLE_LABEL[role]}. ${ROLE_TEXT[role]}`);
    showPermissions(m);
    reactToRole(m, role);
  }

  function showPermissions(m: Mate) {
    if (previewing) return;
    const role = roles[m];
    const textOk = role === "editor" || role === "approver";
    const label = (ok: boolean, verb: string) => (ok ? `${NAME[m]} can ${verb}` : `Locked for ${NAME[m]}`);
    // If the panel is a sheet covering the page, close it so the effect is visible
    if (sheetQuery.matches) closeSheet(false);
    const delay = sheetQuery.matches ? 260 : 0;
    window.setTimeout(() => {
      const textLabel = textOk ? `${NAME[m]} can edit` : role === "commenter" ? `${NAME[m]} can comment` : `Locked for ${NAME[m]}`;
      flash([textEls.summary], textLabel, { mate: m, locked: role === "viewer" });
      flash([textEls.approach], textLabel, { mate: m, locked: role === "viewer" });
      flash(qa(".tt-step", demo), label(textOk, "change quantities"), { mate: m, locked: !textOk, pad: 4 });
      const units = qa("[data-unit]", demo).filter((el) => el.getBoundingClientRect().width > 0);
      if (units.length) flash(units, role === "approver" ? `${NAME[m]} can edit prices` : "Prices locked", { mate: m, locked: role !== "approver", pad: 4 });
      flash(approval, role === "approver" ? "Can approve" : "Can't approve", { mate: m, locked: role !== "approver", pad: 4 });
    }, delay);
  }

  function reactToRole(m: Mate, role: Role) {
    if (role === "approver" && approvalState !== "approved") {
      window.clearTimeout(approveTimer);
      approveTimer = window.setTimeout(seekApprover, 700);
      return;
    }
    enqueue(m, async () => {
      if (role === "viewer") {
        await moveTo(m, at(q(".tt-page__title", page), 0.85, 0.6), 900);
      } else if (role === "commenter") {
        await moveTo(m, at(textEls.approach, 0.55, 0.4), 900);
        blockedFlag(m);
      } else if (role === "editor") {
        await moveTo(m, at(unitCell(1), 0.5, 0.6), 1100);
        blockedFlag(m);
        await moveTo(m, at(q("[data-step='1']", rows[1]), 0.5, 0.6), 900);
      } else {
        await moveTo(m, at(unitCell(1), 0.5, 0.6), 1100);
      }
    });
  }

  /* ───── Version history ───── */

  function renderVersions() {
    const items: HTMLElement[] = [];
    const cur = document.createElement("li");
    const curDiv = document.createElement("div");
    curDiv.className = "tt-ver is-current";
    curDiv.append(span("tt-ver__dot"), span("tt-ver__title", "Current draft"), span("tt-ver__meta", "Sophie, Alex and you"));
    cur.append(curDiv);
    items.push(cur);
    [...versions].reverse().forEach((v) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tt-ver";
      btn.dataset.ver = String(v.n);
      btn.setAttribute("aria-pressed", String(previewing?.n === v.n));
      btn.append(span("tt-ver__dot"), span("tt-ver__title", `v${v.n} · ${v.title}`), span("tt-ver__meta", `${v.who} · ${v.when}`));
      li.append(btn);
      items.push(li);
    });
    versionsList.replaceChildren(...items);
  }
  function span(cls: string, text = "") {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function differs(a: Snapshot, b: Snapshot): Record<BlockKey, boolean> {
    return {
      summary: a.summary !== b.summary,
      approach: a.approach !== b.approach,
      pricing: a.qty.some((n, i) => n !== b.qty[i]),
    };
  }

  function setPreviewing(v: Version | null) {
    if (v && !previewing) {
      previewGate = new Promise((r) => (previewRelease = r));
    }
    if (!v && previewing) {
      previewRelease?.();
      previewRelease = null;
      previewGate = Promise.resolve();
    }
    previewing = v;
  }

  function startPreview(v: Version, focusBanner = true) {
    if (!composer.hidden) closeComposer(false);
    setPreviewing(v);
    canvas.classList.add("is-preview");
    const diff = differs(v.snap, doc);
    (Object.keys(blocks) as BlockKey[]).forEach((k) => blocks[k].classList.toggle("is-diff", diff[k]));
    renderText("summary", v.snap);
    renderText("approach", v.snap);
    renderTable(v.snap, true);
    qa<HTMLButtonElement>("[data-comment]", demo).forEach((b) => (b.disabled = true));
    preview.hidden = false;
    previewLabel.textContent = `v${v.n}`;
    renderVersions();
    const changed = (Object.keys(diff) as BlockKey[]).filter((k) => diff[k]).map((k) => BLOCK_NAME[k]);
    announce(
      `Previewing version ${v.n} by ${v.who}. ${changed.length ? `Changed: ${changed.join(", ")}.` : "No differences from the current draft."}`,
    );
    if (sheetQuery.matches) {
      closeSheet(false);
      if (focusBanner) {
        window.setTimeout(() => {
          const r = preview.getBoundingClientRect();
          if (r.top < 70 || r.bottom > window.innerHeight)
            preview.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
          q<HTMLButtonElement>("[data-restore]", demo).focus({ preventScroll: true });
        }, 120);
      }
    }
  }

  function exitPreview(returnFocusTo?: HTMLElement | null) {
    if (!previewing) return;
    const n = previewing.n;
    setPreviewing(null);
    canvas.classList.remove("is-preview");
    Object.values(blocks).forEach((b) => b.classList.remove("is-diff"));
    qa<HTMLButtonElement>("[data-comment]", demo).forEach((b) => (b.disabled = false));
    preview.hidden = true;
    renderAll();
    renderVersions();
    announce("Back to the current draft.");
    const target = returnFocusTo ?? (sheetQuery.matches ? null : versionsList.querySelector<HTMLElement>(`[data-ver="${n}"]`));
    target?.focus({ preventScroll: true });
    MATES.forEach((m) => placeCursor(m, "jump"));
  }

  function restore() {
    if (!previewing) return;
    const v = previewing;
    const before = clone(doc);
    const qtyChanged = differs(v.snap, before).pricing;
    versions.push({ n: versions.length + 1, title: `Saved before restoring v${v.n}`, who: "You", when: `Today ${nowLabel()}`, snap: before });
    epoch++;
    (Object.keys(typing) as TextKey[]).forEach((k) => delete typing[k]);
    Object.assign(doc, clone(v.snap));
    exitPreview(q<HTMLElement>("[data-tab=history]", demo));
    markSaving();
    log("you", `restored v${v.n}. Your previous draft is saved as v${versions.length}`, { toast: true });
    if (qtyChanged) needsApproval();
    const reader: Mate = pick(MATES);
    enqueue(reader, () => moveTo(reader, at(textEls.summary, 0.4, 0.5), 900));
  }

  /* ───── Tabs and the mobile sheet ───── */

  function openSheet() {
    panels.setAttribute("data-open", "");
    if (activeTab === "activity") clearUnseen();
  }
  function closeSheet(returnFocus = true) {
    if (!panels.hasAttribute("data-open")) return;
    panels.removeAttribute("data-open");
    if (returnFocus) q<HTMLButtonElement>(`[data-tab=${activeTab}]`, demo).focus({ preventScroll: true });
  }
  function clearUnseen() {
    unseen = 0;
    setBadge();
  }

  function selectTab(name: string, opts: { open?: boolean; focus?: boolean; focusTab?: boolean } = {}) {
    activeTab = name;
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panelEls.forEach((p) => (p.hidden = p.dataset.panel !== name));
    if (opts.open && sheetQuery.matches) openSheet();
    if (name === "activity" && activityVisible()) clearUnseen();
    if (opts.focusTab) q<HTMLButtonElement>(`[data-tab=${name}]`, demo).focus({ preventScroll: true });
    if (opts.focus) {
      const panel = q(`[data-panel=${name}]`, demo);
      const first = panel.querySelector<HTMLElement>("input:checked, button, textarea");
      requestAnimationFrame(() => (first ?? panel).focus({ preventScroll: sheetQuery.matches }));
    }
  }

  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab ?? "comments";
      if (sheetQuery.matches && name === activeTab && panels.hasAttribute("data-open")) closeSheet();
      else selectTab(name, { open: true });
    }),
  );
  q("[role=tablist]", demo).addEventListener("keydown", (e) => {
    const i = tabs.findIndex((t) => t.dataset.tab === activeTab);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(tabs[next].dataset.tab ?? "comments", { open: panels.hasAttribute("data-open"), focusTab: true });
  });
  qa<HTMLButtonElement>("[data-open-tab]", demo).forEach((btn) =>
    btn.addEventListener("click", () => {
      const name = btn.dataset.openTab ?? "comments";
      selectTab(name, { open: true, focus: sheetQuery.matches });
    }),
  );
  q("[data-sheet-close]", demo).addEventListener("click", () => closeSheet());
  rail.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetQuery.matches && panels.hasAttribute("data-open")) {
      e.stopPropagation();
      closeSheet();
    }
  });
  canvas.addEventListener("pointerdown", () => {
    if (sheetQuery.matches) closeSheet(false);
  });

  /* ───── Wiring the controls ───── */

  qa<HTMLButtonElement>("[data-comment]", demo).forEach((btn) =>
    btn.addEventListener("click", () => openComposer((btn.dataset.comment ?? "summary") as BlockKey)),
  );
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = composerInput.value.trim();
    if (!text) {
      composerInput.focus();
      return;
    }
    closeComposer(false);
    postComment(composerBlock, text);
    threads.querySelector<HTMLElement>(".tt-thread [data-resolve]")?.focus({ preventScroll: true });
  });
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeComposer();
    }
  });
  q("[data-composer-cancel]", demo).addEventListener("click", () => closeComposer());
  threads.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("[data-resolve]");
    const li = btn?.closest<HTMLElement>(".tt-thread");
    if (li) resolveThread(li);
  });

  rows.forEach((row, i) =>
    qa<HTMLButtonElement>("[data-step]", row).forEach((btn) =>
      btn.addEventListener("click", () => changeQty(i, Number(btn.dataset.step))),
    ),
  );

  MATES.forEach((m) =>
    q(`[data-roles=${m}]`, demo).addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      if (input.checked) setRole(m, input.value as Role);
    }),
  );

  versionsList.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>("[data-ver]");
    if (!btn) return;
    const v = versions.find((x) => String(x.n) === btn.dataset.ver);
    if (!v) return;
    if (previewing?.n === v.n) exitPreview(btn);
    else startPreview(v);
  });
  q("[data-restore]", demo).addEventListener("click", restore);
  q("[data-preview-exit]", demo).addEventListener("click", () => exitPreview(sheetQuery.matches ? null : undefined));

  /* ───── "Try it" links on the page ───── */

  const tryTargets: Record<string, () => { el: HTMLElement; ring?: HTMLElement } | null> = {
    comment: () => ({ el: q("[data-comment=summary]", demo) }),
    qty: () => ({ el: q("[data-step='1']", rows[1]) }),
    role: () => {
      if (previewing) exitPreview(null);
      selectTab("people", { open: true });
      const set = q("[data-roles=alex]", demo);
      return { el: q("input:checked", set), ring: set };
    },
    history: () => {
      selectTab("history", { open: true });
      const btn = versionsList.querySelector<HTMLElement>('[data-ver="2"]');
      return btn ? { el: btn } : null;
    },
    activity: () => {
      selectTab("activity", { open: true });
      return { el: q("[data-tab=activity]", demo) };
    },
  };

  document.querySelectorAll<HTMLButtonElement>("[data-try]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.try ?? "";
      if ((key === "comment" || key === "qty") && previewing) exitPreview(null);
      const target = tryTargets[key]?.();
      if (!target) return;
      const ring = target.ring ?? target.el;
      requestAnimationFrame(() => {
        const inSheet = sheetQuery.matches && panels.contains(target.el);
        // In the bottom sheet, bring the whole demo bottom into view; otherwise centre the control.
        (inSheet ? rail : target.el).scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: inSheet ? "end" : "center",
        });
        target.el.focus({ preventScroll: true });
        ring.classList.remove("tt-pulse");
        void ring.offsetWidth;
        ring.classList.add("tt-pulse");
        window.setTimeout(() => ring.classList.remove("tt-pulse"), 2600);
      });
    }),
  );

  /* ───── Ambient life ───── */

  let lockShows = 0;
  async function ambientStep(m: Mate) {
    const role = roles[m];
    const options: (() => Promise<void>)[] = [
      () => moveTo(m, at(textEls.summary, rand(0.15, 0.8), rand(0.2, 0.8)), 1200),
      () => moveTo(m, at(textEls.approach, rand(0.15, 0.8), rand(0.2, 0.8)), 1200),
      () => moveTo(m, at(rows[Math.floor(rand(0, 4))].querySelector("th") ?? rows[0], rand(0.3, 0.8), 0.5), 1200),
    ];
    if (role !== "approver" && role !== "viewer" && lockShows < 3 && Math.random() < 0.4) {
      lockShows++;
      const row = Math.floor(rand(0, 4));
      const cell = unitCell(row);
      await moveTo(m, at(cell, 0.4, 0.55), 1100);
      blockedFlag(m);
      flash(cell, `Pricing locked for ${NAME[m]}`, { mate: m, locked: true, ms: 2200, pad: 3 });
      await sleep(1200);
      return;
    }
    await pick(options)();
  }

  async function ambient(m: Mate) {
    await sleep(rand(2000, 4000));
    for (;;) {
      await sleep(rand(4000, 7000));
      if (pending[m] > 0 || previewing) continue;
      await enqueue(m, () => ambientStep(m));
    }
  }

  /* ───── Intro: Sophie and Alex finish their sentences ───── */

  const introSophie = " We'll rebuild it in six weeks, with your team involved at every step.";
  const introAlex = " Each sprint ends with a live review.";
  const seededReply = threads.querySelector(".tt-thread .tt-msg:nth-of-type(2)");
  const seededThread = threads.querySelector<HTMLElement>(".tt-thread");

  async function intro() {
    await sleep(900);
    enqueue("alex", async () => {
      await sleep(600);
      await typeInto("alex", "approach", introAlex);
    });
    await enqueue("sophie", async () => {
      await moveTo("sophie", at(q("[data-comment=summary]", demo), 0.3, 0.7), 900);
      if (seededThread && seededReply) {
        const dots = document.createElement("div");
        dots.className = "tt-typing";
        const i = document.createElement("i");
        i.append(document.createElement("b"), document.createElement("b"), document.createElement("b"));
        dots.append(i, "Sophie is typing");
        seededThread.insertBefore(dots, seededThread.querySelector("[data-resolve]"));
        await sleep(1300);
        dots.remove();
        seededReply.classList.add("is-new");
        seededThread.insertBefore(seededReply, seededThread.querySelector("[data-resolve]"));
        log("sophie", "replied to Alex on Executive Summary", { announce: false });
      }
      await sleep(500);
      const ok = await typeInto("sophie", "summary", introSophie);
      if (ok) log("sophie", "edited Executive Summary", { announce: false, toast: true });
    });
  }

  /* ───── Boot ───── */

  MATES.forEach(setFlagRole);
  if (!prefersReducedMotion) {
    // Start from a slightly earlier moment so the visitor sees the team at work.
    doc.summary = doc.summary.replace(introSophie, "");
    doc.approach = doc.approach.replace(introAlex, "");
    seededReply?.remove();
  }
  renderText("summary");
  renderText("approach");
  renderVersions();
  renderPins();
  commentsHint.hidden = false;

  MATES.forEach((m) => cursors[m].classList.add("is-live"));
  cursorTarget.sophie = textEnd("summary");
  cursorTarget.alex = at(unitCell(1), 0.45, 0.6);
  const placeAll = () => MATES.forEach((m) => placeCursor(m, "jump"));
  placeAll();
  document.fonts?.ready.then(placeAll);

  let resizeRaf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(placeAll);
  }).observe(page);
  // On small screens the Unit price column is folded into the item cell, so the footer spans one fewer column.
  const narrowQuery = window.matchMedia("(max-width: 640px)");
  const syncColspan = () => qa<HTMLTableCellElement>("tfoot th", demo).forEach((th) => (th.colSpan = narrowQuery.matches ? 2 : 3));
  syncColspan();
  narrowQuery.addEventListener("change", syncColspan);
  sheetQuery.addEventListener("change", () => {
    if (!sheetQuery.matches) panels.removeAttribute("data-open");
  });

  // The clock (typing, replies, ambient moves) only runs while the demo is on screen and the tab is visible.
  let onScreen = false;
  const sync = () => setClock(onScreen && !document.hidden);
  new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      sync();
    },
    { threshold: 0.12 },
  ).observe(demo);
  document.addEventListener("visibilitychange", sync);

  if (!prefersReducedMotion) {
    onceVisible(
      demo,
      () => {
        intro();
        MATES.forEach((m) => ambient(m));
      },
      0.25,
    );
  }
}

/* ───────── Sections below the demo ───────── */

function initSections() {
  const inbox = document.querySelector("[data-inbox]");
  if (inbox) onceVisible(inbox, () => inbox.classList.add("is-on"), 0.35);

  const sign = document.querySelector("[data-sign]");
  if (sign) onceVisible(sign, () => sign.classList.add("is-on"), 0.35);

  // Capability loops only run while they're on screen.
  const loops = document.querySelectorAll("[data-loop]");
  if (!prefersReducedMotion && loops.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), {
      rootMargin: "-5% 0px",
    });
    loops.forEach((el) => io.observe(el));
  }
}

const demoEl = document.querySelector<HTMLElement>("[data-demo]");
if (demoEl) initDemo(demoEl);
initSections();
