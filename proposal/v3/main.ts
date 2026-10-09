import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── Proposal v3 · "Run the Review" ─────────
   The hero is a proposal workspace the visitor steers as team lead:
   shape the outline (FLIP reorder, drag, keyboard), run the approval chain
   (approve / request changes → versions, compare, restore), then open the
   client view (desktop / mobile, notifications, accept & sign). */

type Key = "summary" | "challenge" | "solution" | "timeline" | "method" | "investment" | "terms" | "accept";
type DealId = "consulting" | "technology" | "infrastructure";
type ClauseKey = "summary" | "terms" | "investment" | "timeline";
type Snap = Record<ClauseKey, string>;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const LOCKED: Key = "terms";

const DEALS: Record<DealId, { title: string; total: string; order: Key[]; names: Partial<Record<Key, string>>; issues: string[]; method: string }> = {
  consulting: {
    title: "Operating Model Review",
    total: "$18,600",
    order: ["summary", "challenge", "method", "solution", "timeline", "investment", "terms", "accept"],
    names: { challenge: "The challenge", method: "Our methodology", solution: "Recommendations", timeline: "Engagement timeline" },
    issues: ["Unclear decision rights", "Duplicated effort across teams", "Slow monthly reporting"],
    method: "Interviews, workshops and a clear roadmap your leadership team signs off.",
  },
  technology: {
    title: "Digital Transformation Proposal",
    total: "$24,350",
    order: ["summary", "challenge", "solution", "timeline", "method", "investment", "terms", "accept"],
    names: { challenge: "Current state", solution: "Solution design", timeline: "Implementation plan", method: "Delivery approach" },
    issues: ["Three disconnected systems", "Manual hand-offs between teams", "Slow, error-prone reporting"],
    method: "Discover, design, deliver: one accountable team from kickoff to go-live.",
  },
  infrastructure: {
    title: "Network Upgrade Proposal",
    total: "$86,400",
    order: ["summary", "challenge", "timeline", "solution", "method", "investment", "terms", "accept"],
    names: { challenge: "Site & scope", timeline: "Milestones", solution: "Engineering solution", method: "Safety & delivery" },
    issues: ["Ageing network across four sites", "Unplanned outages", "No capacity for growth"],
    method: "Staged cut-overs out of hours, with a site safety plan for every location.",
  },
};
const BASE_NAMES: Record<Key, string> = {
  summary: "Executive summary",
  challenge: "Challenge",
  solution: "Solution",
  timeline: "Timeline",
  method: "Methodology",
  investment: "Investment",
  terms: "Terms & conditions",
  accept: "Acceptance",
};
const nameOf = (deal: DealId, key: Key) => DEALS[deal].names[key] ?? BASE_NAMES[key];

const APPROVERS = [
  { name: "Emily", role: "Manager", clause: "summary" as ClauseKey, ask: "Lead with the outcome for Northwind, not the plan.", next: "Northwind gets a faster, simpler way of working, in three phases." },
  { name: "Liam", role: "Legal", clause: "terms" as ClauseKey, ask: "Cap liability at the contract value.", next: "Liability is capped at the total contract value." },
  { name: "Sophia", role: "Finance", clause: "investment" as ClauseKey, ask: "Split payment across milestones.", next: "50% due on signing, 50% at go-live." },
  { name: "Ava", role: "Final", clause: "timeline" as ClauseKey, ask: "Add a support buffer after go-live.", next: "Go-live in week 12, then two weeks of hypercare." },
];
const CLAUSE_LABEL: Record<ClauseKey, string> = { summary: "Summary", terms: "Terms", investment: "Payment", timeline: "Timeline" };
const FIRST_SNAP: Snap = {
  summary: "We will deliver this project for Northwind in three phases.",
  terms: "Liability is capped at twice the annual fees.",
  investment: "100% of fees due on signing.",
  timeline: "Go-live in week 12.",
};
const STAGES = ["Draft", "Review", "Approval", "Sent", "Accepted"];

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, prefersReducedMotion ? 0 : ms));

/** Animate elements from where they were to where `mutate` puts them. */
function flip(els: HTMLElement[], mutate: () => void, duration = 460) {
  const before = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  if (prefersReducedMotion) return;
  for (const el of els) {
    if (el.hidden || el.classList.contains("is-dragging")) continue;
    const a = before.get(el)!;
    const b = el.getBoundingClientRect();
    if (a.width === 0 && a.height === 0) {
      el.animate([{ opacity: 0, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }], { duration, easing: EASE });
      continue;
    }
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration, easing: EASE });
  }
}

function shake(el: HTMLElement) {
  if (prefersReducedMotion) return;
  el.animate(
    [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "none" }],
    { duration: 380, easing: "ease-out" },
  );
}

function initWorkspace() {
  const ws = $("[data-ws]");
  if (!ws) return;

  const live = $("[data-live]", ws)!;
  const say = (msg: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = msg), 30);
  };

  /* ── State ── */
  const state = {
    deal: "technology" as DealId,
    order: [...DEALS.technology.order],
    off: new Set<Key>(),
    stage: 0,
    step: -1, // index of the approver currently reviewing; -1 = not submitted; 4 = all approved
    changed: new Set<number>(),
    versions: [{ v: "1.0", note: "First draft · You", snap: { ...FIRST_SNAP } }] as { v: string; note: string; snap: Snap }[],
    comparing: -1,
    tab: "shape",
    dev: "desktop",
    pinged: false,
    busy: false,
  };
  const current = () => state.versions[state.versions.length - 1];

  /* ── Elements ── */
  const outline = $("[data-outline]", ws)!;
  const preview = $("[data-preview]", ws)!;
  const cdoc = $("[data-cdoc]", ws)!;
  const cnav = $("[data-cnav]", ws)!;
  const rows = new Map($$("[data-key]", outline).map((el) => [el.dataset.key as Key, el]));
  const blocks = new Map($$("[data-key]", preview).map((el) => [el.dataset.key as Key, el]));
  const csecs = new Map($$("[data-key]", cdoc).map((el) => [el.dataset.key as Key, el]));

  /* ── Tabs ── */
  const tabs = $$<HTMLButtonElement>("[data-tab]", ws);
  const panels = $$("[data-panel]", ws);
  const tabInk = $("[data-tab-ink]", ws)!;
  const placeInk = (ink: HTMLElement, el: HTMLElement) => {
    const parent = ink.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    ink.style.transform = `translateX(${r.left - parent.left}px)`;
    ink.style.width = `${r.width}px`;
  };
  const showTab = (id: string, focus = false) => {
    state.tab = id;
    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) {
        placeInk(tabInk, t);
        if (focus) t.focus();
      }
    });
    panels.forEach((p) => {
      const on = p.dataset.panel === id;
      if (on && p.hidden) {
        p.hidden = false;
        if (!prefersReducedMotion) p.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: EASE });
      } else if (!on) p.hidden = true;
    });
    if (id === "client") onClientShown();
    updateNext();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showTab(t.dataset.tab!));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        showTab(tabs[e.key === "Home" ? 0 : tabs.length - 1].dataset.tab!, true);
      }
      if (!d) return;
      e.preventDefault();
      showTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab!, true);
    });
  });

  /* ── Radio groups (deal type, device) ── */
  function radioGroup(opts: HTMLButtonElement[], pick: (btn: HTMLButtonElement) => void) {
    opts.forEach((o, i) => {
      o.addEventListener("click", () => pick(o));
      o.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = opts[(i + d + opts.length) % opts.length];
        next.focus();
        pick(next);
      });
    });
  }
  const setChecked = (opts: HTMLButtonElement[], on: HTMLButtonElement) =>
    opts.forEach((o) => {
      o.setAttribute("aria-checked", String(o === on));
      o.tabIndex = o === on ? 0 : -1;
    });

  /* ── Shape the story ── */
  const dealOpts = $$<HTMLButtonElement>("[data-deal]", ws);
  const dealInk = $("[data-deal-ink]", ws)!;

  const renderNames = () => {
    const d = DEALS[state.deal];
    $$("[data-title]", ws).forEach((el) => (el.textContent = d.title));
    $$("[data-total]", ws).forEach((el) => (el.textContent = d.total));
    for (const map of [rows, blocks, csecs])
      map.forEach((el, key) => {
        const n = $("[data-name]", el);
        if (n) n.textContent = nameOf(state.deal, key);
      });
    const lis = $$("li", csecs.get("challenge")!);
    lis.forEach((li, i) => (li.textContent = d.issues[i]));
    $("p:not(.rv-cs__h)", csecs.get("method")!)!.textContent = d.method;
  };

  const animatedEls = () => [...rows.values(), ...blocks.values()];
  const applyOrder = (animate = true) => {
    const run = () => {
      for (const key of state.order) {
        outline.append(rows.get(key)!);
        preview.append(blocks.get(key)!);
        cdoc.append(csecs.get(key)!);
      }
      rows.forEach((row, key) => {
        const off = state.off.has(key);
        row.classList.toggle("is-off", off);
        blocks.get(key)!.hidden = off;
        csecs.get(key)!.hidden = off;
      });
      updateMoves();
    };
    if (animate) flip(animatedEls(), run);
    else run();
    renderNav();
  };

  const updateMoves = () => {
    const movable = state.order.filter((k) => k !== LOCKED);
    rows.forEach((row, key) => {
      const i = movable.indexOf(key);
      const [up, down] = $$<HTMLButtonElement>("[data-move]", row);
      if (!up) return;
      up.disabled = i === 0;
      down.disabled = i === movable.length - 1;
      const name = nameOf(state.deal, key);
      up.setAttribute("aria-label", `Move ${name} up`);
      down.setAttribute("aria-label", `Move ${name} down`);
      $("[data-toggle]", row)?.setAttribute("aria-label", `Include ${name}`);
    });
  };

  /** Reorder keeping the template-locked section at its fixed index. */
  const withLock = (movable: Key[]) => {
    const lockAt = state.order.indexOf(LOCKED);
    const next = [...movable];
    next.splice(lockAt, 0, LOCKED);
    return next;
  };

  const refuseLocked = () => {
    const row = rows.get(LOCKED)!;
    shake(row);
    row.classList.remove("is-nudged");
    void row.offsetWidth;
    row.classList.add("is-nudged");
    say("Terms & conditions is locked by your template and stays in place.");
  };

  const move = (key: Key, dir: number, focusSel?: string) => {
    if (key === LOCKED) return refuseLocked();
    const movable = state.order.filter((k) => k !== LOCKED);
    const i = movable.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= movable.length) return shake(rows.get(key)!);
    [movable[i], movable[j]] = [movable[j], movable[i]];
    state.order = withLock(movable);
    applyOrder();
    if (focusSel) $<HTMLElement>(focusSel, rows.get(key)!)?.focus();
    const pos = state.order.indexOf(key) + 1;
    say(`${nameOf(state.deal, key)} moved to position ${pos} of ${state.order.length}.`);
    touched();
  };

  rows.forEach((row, key) => {
    const grip = $<HTMLButtonElement>("[data-grip]", row)!;
    $$<HTMLButtonElement>("[data-move]", row).forEach((b) =>
      b.addEventListener("click", () => move(key, Number(b.dataset.move), `[data-move="${b.dataset.move}"]`)),
    );
    $("[data-toggle]", row)?.addEventListener("click", (e) => {
      const sw = e.currentTarget as HTMLButtonElement;
      const on = state.off.has(key);
      if (on) state.off.delete(key);
      else state.off.add(key);
      sw.setAttribute("aria-checked", String(on));
      applyOrder();
      say(`${nameOf(state.deal, key)} ${on ? "included" : "left out"}.`);
      touched();
    });
    grip.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      if (e.altKey) return move(key, dir, "[data-grip]");
      const i = state.order.indexOf(key);
      const next = rows.get(state.order[i + dir]);
      next && $<HTMLElement>("[data-grip]", next)?.focus();
    });
    if (key === LOCKED) grip.addEventListener("click", refuseLocked);
    initDrag(row, grip, key);
  });

  function initDrag(row: HTMLElement, grip: HTMLButtonElement, key: Key) {
    let startY = 0;
    let baseTop = 0;
    let id = -1;
    let moved = false;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || key === LOCKED) return;
      if (e.pointerType !== "mouse" && !(e.target as Element).closest(".rv-row__gi")) return;
      id = e.pointerId;
      startY = e.clientY;
      baseTop = row.offsetTop;
      moved = false;
      grip.setPointerCapture(id);
    });
    grip.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 5) return;
      if (!moved) {
        moved = true;
        row.classList.add("is-dragging");
      }
      const listTop = outline.getBoundingClientRect().top;
      const y = e.clientY - listTop;
      const movable = state.order.filter((k) => k !== LOCKED && k !== key);
      let at = movable.findIndex((k) => {
        const r = rows.get(k)!;
        return y < r.offsetTop + r.offsetHeight / 2;
      });
      if (at < 0) at = movable.length;
      movable.splice(at, 0, key);
      const next = withLock(movable);
      if (next.join() !== state.order.join()) {
        state.order = next;
        applyOrder();
      }
      row.style.transform = `translateY(${dy - (row.offsetTop - baseTop)}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!moved) return;
      const t = row.style.transform;
      row.style.transform = "";
      row.classList.remove("is-dragging");
      if (!prefersReducedMotion && t) row.animate([{ transform: t }, { transform: "none" }], { duration: 300, easing: EASE });
      say(`${nameOf(state.deal, key)} moved to position ${state.order.indexOf(key) + 1} of ${state.order.length}.`);
      touched();
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    grip.addEventListener("click", (e) => moved && e.preventDefault());
  }

  const setDeal = (id: DealId, animate = true) => {
    state.deal = id;
    const opt = dealOpts.find((o) => o.dataset.deal === id)!;
    setChecked(dealOpts, opt);
    placeInk(dealInk, opt);
    state.order = [...DEALS[id].order];
    const titleEls = $$("[data-title], [data-total]", ws);
    renderNames();
    applyOrder(animate);
    if (animate && !prefersReducedMotion)
      titleEls.forEach((el) => el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 420, easing: EASE }));
  };
  radioGroup(dealOpts, (o) => {
    if (o.dataset.deal === state.deal) return;
    setDeal(o.dataset.deal as DealId);
    say(`Deal type ${o.textContent}. Outline re-ordered for this template.`);
    touched();
  });

  /* ── Stage bar ── */
  const stageEls = $$("[data-stage]", ws);
  const stageFill = $("[data-stage-fill]", ws)!;
  const setStage = (n: number, announce = true) => {
    const changed = n !== state.stage;
    state.stage = n;
    stageEls.forEach((el, i) => {
      el.classList.toggle("is-done", i < n || n === 4);
      el.classList.toggle("is-current", i === n && n !== 4);
      if (i === n) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    stageFill.style.transform = `scaleX(${n / 4})`;
    if (changed && announce) say(`Stage: ${STAGES[n]}.`);
    renderClient();
    updateNext();
  };

  /* ── Approvals ── */
  const chainItems = $$("[data-ap]", ws);
  const chainFill = $("[data-chain-fill]", ws)!;
  const actMsg = $("[data-act-msg]", ws)!;
  const actBtns = $("[data-act-btns]", ws)!;
  const clauseList = $("[data-clauses]", ws)!;
  const clauseVer = $("[data-clause-ver]", ws)!;
  const history = $("[data-history]", ws)!;
  const verEl = $("[data-ver]", ws)!;
  const status: string[] = ["Waiting", "Waiting", "Waiting", "Waiting"];

  const renderChain = () => {
    chainItems.forEach((li, i) => {
      const st = status[i];
      li.dataset.state = st === "Approved" ? "ok" : st === "Changes requested" ? "ask" : st === "Reviewing" ? "now" : "wait";
      $("[data-ap-st]", li)!.textContent = st;
    });
    const done = status.filter((s) => s === "Approved").length;
    chainFill.style.transform = `scaleX(${Math.min(done, 3) / 3})`;
  };

  const btn = (label: string, icon: string, kind: string, action: () => void, extra = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `rv-btn rv-btn--${kind} ${extra}`.trim();
    b.innerHTML = `<svg class="rv-ico" width="16" height="16" aria-hidden="true"><use href="#rv-i-${icon}" /></svg>${label}`;
    b.addEventListener("click", action);
    return b;
  };

  const renderAction = () => {
    actBtns.replaceChildren();
    const s = state.step;
    if (state.busy) return;
    if (s === -1) {
      actMsg.textContent = "Your draft is ready. Send it through the approval chain before anything reaches the client.";
      actBtns.append(btn("Submit for review", "send", "primary", submit, "is-next-target"));
    } else if (s < 4) {
      const a = APPROVERS[s];
      actMsg.innerHTML = `<b>You are ${a.name}</b> (${a.role} review). Approve this version or ask for a change.`;
      actBtns.append(btn("Approve", "check", "primary", approve, "is-next-target"));
      if (!state.changed.has(s)) actBtns.append(btn("Request changes", "comment", "ghost", requestChanges));
    } else if (state.stage < 3) {
      actMsg.innerHTML = "<b>Approved by everyone.</b> Only now can it go to the client.";
      actBtns.append(btn("Send to client", "send", "primary", send, "is-next-target"));
    } else {
      actMsg.innerHTML = state.stage === 4 ? "<b>Accepted and signed.</b> The full audit trail is on the proposal." : "<b>Sent to Northwind.</b> Watch it in the client view.";
      actBtns.append(btn("Open client view", "eye", "ghost", () => showTab("client", true)));
    }
    updateNext();
  };

  const renderClauses = (flash?: ClauseKey) => {
    const snap = current().snap;
    clauseVer.textContent = `v${current().v}`;
    verEl.textContent = `v${current().v}`;
    $$("[data-cl]", clauseList).forEach((li) => {
      const k = li.dataset.cl as ClauseKey;
      const v = $("[data-cl-v]", li)!;
      li.classList.remove("is-diff");
      v.textContent = snap[k];
      if (k === flash && !prefersReducedMotion) li.animate([{ backgroundColor: "rgb(31 191 143 / 0.18)" }, { backgroundColor: "rgb(31 191 143 / 0)" }], { duration: 1400, easing: "ease-out" });
    });
    $$<HTMLElement>("[data-cl-v]", cdoc).forEach((el) => (el.textContent = snap[el.dataset.clV as ClauseKey]));
    if (state.comparing > 0) showDiff(state.comparing);
  };

  const showDiff = (i: number) => {
    const a = state.versions[i - 1].snap;
    const b = state.versions[i].snap;
    clauseVer.textContent = `v${state.versions[i - 1].v} → v${state.versions[i].v}`;
    $$("[data-cl]", clauseList).forEach((li) => {
      const k = li.dataset.cl as ClauseKey;
      const v = $("[data-cl-v]", li)!;
      if (a[k] !== b[k]) {
        li.classList.add("is-diff");
        v.innerHTML = "";
        const del = document.createElement("del");
        del.textContent = a[k];
        const ins = document.createElement("ins");
        ins.textContent = b[k];
        v.append(del, ins);
      } else {
        li.classList.remove("is-diff");
        v.textContent = b[k];
      }
    });
  };

  const renderHistory = () => {
    history.replaceChildren();
    const last = state.versions.length - 1;
    for (let i = last; i >= 0; i--) {
      const ver = state.versions[i];
      const li = document.createElement("li");
      li.className = "rv-h";
      li.classList.toggle("is-current", i === last);
      li.classList.toggle("is-comparing", i === state.comparing);
      li.innerHTML = `<span class="rv-h__v">v${ver.v}</span><span class="rv-h__note"></span>`;
      $(".rv-h__note", li)!.textContent = ver.note;
      const tools = document.createElement("span");
      tools.className = "rv-h__tools";
      if (i > 0) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "rv-h__btn";
        c.textContent = i === state.comparing ? "Done" : "Compare";
        c.setAttribute("aria-pressed", String(i === state.comparing));
        c.setAttribute("aria-label", i === state.comparing ? "Stop comparing" : `Compare v${ver.v} with v${state.versions[i - 1].v}`);
        c.addEventListener("click", () => {
          state.comparing = state.comparing === i ? -1 : i;
          renderHistory();
          renderClauses();
          if (state.comparing === i) say(`Comparing v${state.versions[i - 1].v} with v${ver.v}. Changed line highlighted.`);
          history.querySelector<HTMLElement>(`[data-hi="${i}"] .rv-h__btn`)?.focus();
        });
        tools.append(c);
      }
      if (i < last) {
        const r = document.createElement("button");
        r.type = "button";
        r.className = "rv-h__btn";
        r.textContent = "Restore";
        r.setAttribute("aria-label", `Restore v${ver.v}`);
        r.addEventListener("click", () => restore(i));
        tools.append(r);
      } else {
        const tag = document.createElement("span");
        tag.className = "rv-h__tag";
        tag.textContent = "Current";
        tools.append(tag);
      }
      li.dataset.hi = String(i);
      li.append(tools);
      history.append(li);
    }
    const top = history.firstElementChild as HTMLElement | null;
    if (top && state.versions.length > 1 && !prefersReducedMotion && state.comparing < 0)
      top.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
  };

  const nextVersion = () => {
    const [maj, min] = current().v.split(".").map(Number);
    return `${maj}.${min + 1}`;
  };
  const pushVersion = (note: string, snap: Snap, flash?: ClauseKey) => {
    state.versions.push({ v: nextVersion(), note, snap });
    state.comparing = -1;
    renderHistory();
    renderClauses(flash);
    say(`Version v${current().v} saved: ${note}.`);
  };

  const restore = (i: number) => {
    const from = state.versions[i];
    pushVersion(`Restored v${from.v} · You`, { ...from.snap });
    const diffKey = (Object.keys(FIRST_SNAP) as ClauseKey[]).find((k) => state.versions[state.versions.length - 2].snap[k] !== from.snap[k]);
    if (diffKey) renderClauses(diffKey);
    touched();
  };

  const clearPins = () => $$(".rv-pin", clauseList).forEach((p) => p.remove());

  const submit = () => {
    state.step = 0;
    status[0] = "Reviewing";
    renderChain();
    setStage(1);
    renderAction();
    say("Submitted for review. Emily, the manager, is reviewing.");
    focusPrimary();
    touched();
  };

  const advance = () => {
    status[state.step] = "Approved";
    state.step += 1;
    if (state.step < 4) status[state.step] = "Reviewing";
    renderChain();
    if (state.step >= 2 && state.stage < 2) setStage(2);
  };

  const approve = () => {
    const a = APPROVERS[state.step];
    clearPins();
    advance();
    renderAction();
    say(state.step < 4 ? `${a.name} approved. ${APPROVERS[state.step].name} (${APPROVERS[state.step].role}) is reviewing next.` : `${a.name} approved. Every approver has signed off.`);
    focusPrimary();
    touched();
  };

  const requestChanges = async () => {
    const s = state.step;
    const a = APPROVERS[s];
    state.busy = true;
    status[s] = "Changes requested";
    renderChain();
    actBtns.replaceChildren();
    actMsg.innerHTML = `<b>${a.name}</b> pinned a comment on ${CLAUSE_LABEL[a.clause]}. You are updating it…`;
    clearPins();
    const li = $(`[data-cl="${a.clause}"]`, clauseList)!;
    const pin = document.createElement("span");
    pin.className = "rv-pin";
    pin.innerHTML = `<span class="rv-av rv-av--${a.name.toLowerCase()}" aria-hidden="true">${a.name[0]}</span><span class="rv-pin__t"></span>`;
    $(".rv-pin__t", pin)!.textContent = a.ask;
    li.append(pin);
    say(`${a.name} requested changes on ${CLAUSE_LABEL[a.clause]}: ${a.ask}`);
    await wait(1500);
    state.changed.add(s);
    pin.classList.add("is-resolved");
    pushVersion(`${CLAUSE_LABEL[a.clause]} updated for ${a.name} · You`, { ...current().snap, [a.clause]: a.next }, a.clause);
    status[s] = "Reviewing";
    renderChain();
    state.busy = false;
    renderAction();
    actMsg.innerHTML = `<b>v${current().v} is back with ${a.name}.</b> Approve it, or compare it with the last version first.`;
    focusPrimary();
  };

  const focusPrimary = () => {
    if (ws.contains(document.activeElement) && state.tab === "approve") $<HTMLElement>(".rv-btn", actBtns)?.focus();
  };

  const send = () => {
    setStage(3);
    renderAction();
    say("Sent to Northwind.");
    showTab("client");
    touched();
  };

  /* ── Client view ── */
  const frame = $("[data-frame]", ws)!;
  const gate = $("[data-gate]", ws)!;
  const signBtn = $<HTMLButtonElement>('[data-do="sign"]', ws)!;
  const signed = $("[data-signed]", ws)!;
  const clientState = $("[data-client-state]", ws)!;
  const pings = $("[data-pings]", ws)!;
  const devOpts = $$<HTMLButtonElement>("[data-dev]", ws).filter((el) => el.tagName === "BUTTON");

  const renderNav = () => {
    cnav.replaceChildren();
    for (const key of state.order) {
      if (state.off.has(key)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rv-cnav__item";
      b.dataset.go = key;
      b.textContent = nameOf(state.deal, key);
      b.addEventListener("click", () => {
        const sec = csecs.get(key)!;
        cdoc.scrollTo({ top: sec.offsetTop - (state.dev === "mobile" ? 8 : 12), behavior: prefersReducedMotion ? "auto" : "smooth" });
        setActiveNav(key);
      });
      cnav.append(b);
    }
    syncNav();
  };
  const setActiveNav = (key: Key) =>
    $$("[data-go]", cnav).forEach((b) => {
      const on = b.dataset.go === key;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
      if (on && state.dev === "mobile") cnav.scrollTo({ left: b.offsetLeft - 12, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  const syncNav = () => {
    const top = cdoc.scrollTop + 24;
    let active: Key = state.order.find((k) => !state.off.has(k)) ?? "summary";
    for (const key of state.order) {
      const sec = csecs.get(key)!;
      if (sec.hidden) continue;
      if (sec.offsetTop <= top) active = key;
    }
    if (cdoc.scrollTop + cdoc.clientHeight >= cdoc.scrollHeight - 4) active = [...state.order].reverse().find((k) => !state.off.has(k)) ?? active;
    setActiveNav(active);
  };
  let navRaf = 0;
  cdoc.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(navRaf);
      navRaf = requestAnimationFrame(syncNav);
    },
    { passive: true },
  );

  radioGroup(devOpts, (o) => {
    const dev = o.dataset.dev!;
    if (dev === state.dev) return;
    setChecked(devOpts, o);
    const swap = () => {
      state.dev = dev;
      frame.dataset.dev = dev;
      syncNav();
    };
    if (prefersReducedMotion) swap();
    else {
      frame
        .animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: 180, easing: "ease-in" })
        .finished.then(() => {
          swap();
          frame.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
        });
    }
    say(`Showing the client's ${dev} view.`);
    touched();
  });

  const renderClient = () => {
    const sent = state.stage >= 3;
    gate.hidden = sent;
    signBtn.disabled = !sent || state.stage === 4;
    signBtn.innerHTML =
      state.stage === 4
        ? `<svg class="rv-ico" width="16" height="16" aria-hidden="true"><use href="#rv-i-check" /></svg>Signed`
        : `<svg class="rv-ico" width="16" height="16" aria-hidden="true"><use href="#rv-i-pen" /></svg>Accept &amp; sign`;
    clientState.textContent = state.stage === 4 ? "Accepted · signed by Daniel Reyes" : sent ? "Sent · Northwind has the link" : "Preview · not sent yet";
    clientState.classList.toggle("is-live", sent);
  };

  const ping = (icon: string, text: string, time: string, tone = "") => {
    const li = document.createElement("li");
    li.className = `rv-ping ${tone}`.trim();
    li.innerHTML = `<span class="rv-ping__ic" aria-hidden="true"><svg class="rv-ico" width="15" height="15"><use href="#rv-i-${icon}" /></svg></span><span class="rv-ping__t"></span><time></time>`;
    $(".rv-ping__t", li)!.textContent = text;
    $("time", li)!.textContent = time;
    pings.prepend(li);
    while (pings.children.length > 3) pings.lastElementChild!.remove();
    if (!prefersReducedMotion) li.animate([{ opacity: 0, transform: "translateY(-10px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 460, easing: EASE });
  };

  let pingRun = 0;
  const onClientShown = async () => {
    syncNav();
    if (state.stage < 3 || state.pinged) return;
    state.pinged = true;
    const run = ++pingRun;
    const steps: [string, string, string][] = [
      ["eye", "Northwind opened your proposal", "just now"],
      ["bell", `Viewed ${nameOf(state.deal, "timeline")}`, "just now"],
      ["comment", `Daniel commented on ${nameOf(state.deal, "investment")}`, "just now"],
    ];
    for (const [icon, text, time] of steps) {
      await wait(900);
      if (run !== pingRun) return;
      ping(icon, text, time);
      say(text);
    }
    updateNext();
  };

  const sign = async () => {
    if (state.stage !== 3) return;
    signed.hidden = false;
    signBtn.disabled = true;
    signed.classList.remove("is-drawn");
    void signed.offsetWidth;
    signed.classList.add("is-drawn");
    await wait(1300);
    setStage(4);
    ping("pen", "Daniel Reyes accepted & signed", "just now", "is-ok");
    renderAction();
    say("Accepted and signed by Daniel Reyes. Stage: Accepted.");
    touched();
  };
  signBtn.addEventListener("click", sign);

  $('[data-do="forward"]', ws)!.addEventListener("click", async () => {
    if (state.busy) return;
    state.busy = true;
    if (state.step === -1) {
      state.step = 0;
      status[0] = "Reviewing";
      setStage(1);
      renderChain();
      await wait(320);
    }
    while (state.step < 4) {
      advance();
      await wait(320);
    }
    state.busy = false;
    setStage(3);
    renderAction();
    say("Every approver signed off. Sent to Northwind.");
    onClientShown();
    signBtn.focus();
    touched();
  });

  /* ── Next-action pulse (one gentle hint at a time) ── */
  const updateNext = () => {
    $$(".is-next", ws).forEach((el) => el.classList.remove("is-next"));
    let target: HTMLElement | null = null;
    if (state.tab === "shape") target = state.stage === 0 && interacted ? tabs[1] : null;
    else if (state.tab === "approve") target = state.stage < 3 ? $(".is-next-target", actBtns) : state.stage === 3 ? tabs[2] : null;
    else if (state.tab === "client") target = state.stage === 3 ? signBtn : null;
    target?.classList.add("is-next");
  };
  let interacted = false;
  const touched = () => {
    if (!interacted) {
      interacted = true;
      updateNext();
    }
  };

  /* ── Reset ── */
  $("[data-reset]", ws)!.addEventListener("click", () => {
    pingRun++;
    state.off.clear();
    state.step = -1;
    state.changed.clear();
    state.versions = [{ v: "1.0", note: "First draft · You", snap: { ...FIRST_SNAP } }];
    state.comparing = -1;
    state.pinged = false;
    state.busy = false;
    status.fill("Waiting");
    $$<HTMLElement>("[data-toggle]", ws).forEach((s) => s.setAttribute("aria-checked", "true"));
    signed.hidden = true;
    signed.classList.remove("is-drawn");
    pings.replaceChildren();
    clearPins();
    setDeal("technology");
    renderChain();
    renderHistory();
    renderClauses();
    setStage(0, false);
    renderAction();
    showTab("shape");
    cdoc.scrollTop = 0;
    say("Demo reset to a fresh draft.");
  });

  /* ── Init ── */
  setDeal("technology", false);
  renderChain();
  renderHistory();
  renderClauses();
  setStage(0, false);
  renderAction();
  showTab("shape");
  // One-time build-in; drop the class so re-ordered rows don't replay it.
  ws.classList.add("is-ready");
  const built = () => ws.classList.remove("is-ready");
  window.setTimeout(built, 1800);
  ws.addEventListener("pointerdown", built, { once: true });
  ws.addEventListener("keydown", built, { once: true });
  window.addEventListener("resize", () => {
    placeInk(tabInk, tabs.find((t) => t.getAttribute("aria-selected") === "true")!);
    placeInk(dealInk, dealOpts.find((o) => o.getAttribute("aria-checked") === "true")!);
  });
  document.fonts?.ready.then(() => window.dispatchEvent(new Event("resize")));

  // Pause the hint pulse when the workspace scrolls away.
  new IntersectionObserver(([e]) => ws.classList.toggle("is-live", e.isIntersecting)).observe(ws);
}

/* ───────── Looping feature visuals: run only while on screen ───────── */
function initLoops() {
  const loops = $$("[data-loop]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    loops.forEach((el) => el.classList.add("is-static"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-on", e.isIntersecting)),
    { threshold: 0.25 },
  );
  loops.forEach((el) => io.observe(el));
}

/* ───────── Mobile sticky CTA (after the hero, hidden near the end) ───────── */
function initSticky() {
  const bar = $("[data-sticky]");
  const heroCta = $('[data-qc-cta="hero"]');
  const final = $("[data-final]");
  const footer = $(".qc-footer");
  if (!bar || !heroCta || !("IntersectionObserver" in window)) return;
  const link = $("a", bar)!;
  const seen = new Map<Element, boolean>();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) =>
      seen.set(e.target, e.target === heroCta ? e.isIntersecting || e.boundingClientRect.top > window.innerHeight : e.isIntersecting),
    );
    const heroGone = !seen.get(heroCta);
    const endNear = (final && seen.get(final)) || (footer && seen.get(footer));
    const show = heroGone && !endNear;
    bar.classList.toggle("is-shown", show);
    bar.setAttribute("aria-hidden", String(!show));
    link.tabIndex = show ? 0 : -1;
  });
  [heroCta, final, footer].forEach((el) => el && io.observe(el));
}

initWorkspace();
initLoops();
initSticky();
