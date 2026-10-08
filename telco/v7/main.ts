import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const money = (n: number) => {
  const cents = Math.abs(n % 1) > 0.004;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};
const moneyWhole = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

const current = new WeakMap<Element, number>();
const tweens = new WeakMap<Element, number>();
/** Animates the number shown in `el` to `to`. */
function tweenTo(el: Element | null, to: number, format: (n: number) => string = moneyWhole, duration = 650) {
  if (!el) return;
  const from = current.get(el) ?? to;
  current.set(el, to);
  cancelAnimationFrame(tweens.get(el) ?? 0);
  if (prefersReducedMotion || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const v = from + (to - from) * (1 - Math.pow(1 - t, 3));
    el.textContent = format(t < 1 ? Math.round(v) : to);
    if (t < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
}

/** Runs `tick` every `ms` while `el` is on screen (never under reduced motion). */
function loopWhileVisible(el: Element, tick: () => void, ms: number, onEnter?: () => void, onLeave?: () => void) {
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  let timer = 0;
  new IntersectionObserver(
    ([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting) {
        onEnter?.();
        timer = window.setInterval(tick, ms);
      } else onLeave?.();
    },
    { threshold: 0.25 },
  ).observe(el);
}

/** Toggles `cls` on `el` while it is on screen. */
function liveWhileVisible(el: Element, cls = "is-live", threshold = 0.15) {
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(([entry]) => el.classList.toggle(cls, entry.isIntersecting), { threshold }).observe(el);
}

/* ───────── Bundle builder ───────── */

type Term = 12 | 24 | 36;
type Cat = "net" | "voice" | "mob" | "cloud" | "svc";
const byTerm = (a: number, b: number, c: number) => (t: Term) => (t === 12 ? a : t === 24 ? b : c);
const flat = (n: number) => () => n;

interface Product {
  name: string;
  short: string;
  cat: Cat;
  unit: [string, string];
  addQty: number;
  step: number;
  max: number;
  mrc?: (t: Term) => number;
  meta?: (t: Term, q: number) => string;
  nrc?: { name: string; price: (t: Term) => number };
  cost: { mrc?: (t: Term) => number; nrc?: number };
}

const HANDSET = 1188;
const PRODUCTS: Record<string, Product> = {
  fibre: {
    name: "Business fibre 1000/400",
    short: "Business fibre",
    cat: "net",
    unit: ["service", "services"],
    addQty: 1,
    step: 1,
    max: 20,
    mrc: byTerm(329, 299, 279),
    nrc: { name: "Fibre connection & NTU", price: flat(350) },
    cost: { mrc: flat(180), nrc: 260 },
  },
  sdwan: {
    name: "SD-WAN, managed edge",
    short: "SD-WAN",
    cat: "net",
    unit: ["site", "sites"],
    addQty: 1,
    step: 1,
    max: 50,
    mrc: byTerm(189, 169, 149),
    nrc: { name: "SD-WAN edge appliance", price: flat(690) },
    cost: { mrc: flat(95), nrc: 520 },
  },
  pbx: {
    name: "Hosted PBX seats",
    short: "Hosted PBX",
    cat: "voice",
    unit: ["seat", "seats"],
    addQty: 12,
    step: 1,
    max: 500,
    mrc: byTerm(29, 26, 24),
    cost: { mrc: flat(12) },
  },
  sip: {
    name: "SIP trunk, 10 channels",
    short: "SIP trunk",
    cat: "voice",
    unit: ["trunk", "trunks"],
    addQty: 1,
    step: 1,
    max: 20,
    mrc: byTerm(99, 89, 79),
    cost: { mrc: flat(41) },
  },
  mobile: {
    name: "Mobile 60GB + 5G handset",
    short: "Mobile + handsets",
    cat: "mob",
    unit: ["line", "lines"],
    addQty: 4,
    step: 1,
    max: 200,
    mrc: (t) => byTerm(59, 55, 49)(t) + HANDSET / t,
    meta: (t, q) => `${money(byTerm(59, 55, 49)(t))} plan + ${money(HANDSET / t)} device × ${q}`,
    cost: { mrc: (t) => 28 + 980 / t },
  },
  m365: {
    name: "Microsoft 365 Business",
    short: "Microsoft 365",
    cat: "cloud",
    unit: ["user", "users"],
    addQty: 10,
    step: 1,
    max: 500,
    mrc: flat(22),
    cost: { mrc: flat(17) },
  },
  wifi: {
    name: "Managed Wi-Fi",
    short: "Managed Wi-Fi",
    cat: "cloud",
    unit: ["access point", "access points"],
    addQty: 4,
    step: 1,
    max: 100,
    mrc: byTerm(39, 35, 32),
    nrc: { name: "Wi-Fi 6 access points", price: flat(420) },
    cost: { mrc: flat(14), nrc: 300 },
  },
  support: {
    name: "Managed support, 24/7",
    short: "Managed support",
    cat: "svc",
    unit: ["plan", "plans"],
    addQty: 1,
    step: 1,
    max: 1,
    mrc: byTerm(450, 420, 390),
    cost: { mrc: flat(210) },
  },
  install: {
    name: "Installation & setup",
    short: "Installation",
    cat: "svc",
    unit: ["site", "sites"],
    addQty: 1,
    step: 1,
    max: 50,
    nrc: { name: "Installation & setup", price: byTerm(1450, 950, 0) },
    cost: { nrc: 700 },
  },
};

interface Line {
  key: string;
  id: string;
  group: "mrc" | "nrc";
  primary: boolean;
  name: string;
  meta: string;
  amount: number;
  zero: boolean;
}

function initBuilder() {
  const found = $("[data-builder]");
  if (!found) return;
  const bb: HTMLElement = found;
  const bundle = $("[data-bundle]", bb)!;
  const lists = { mrc: $("[data-list='mrc']", bb)!, nrc: $("[data-list='nrc']", bb)! };
  const groups = { mrc: $("[data-group='mrc']", bb)!, nrc: $("[data-group='nrc']", bb)! };
  const empty = $("[data-empty]", bb)!;
  const scroll = $("[data-scroll]", bb)!;
  const live = $("[data-live]", bb)!;
  const send = $<HTMLButtonElement>("[data-send]", bb)!;
  const termSet = $("[data-term]", bb)!;
  const proposal = $("[data-proposal]", bb)!;
  const palette = new Map($$<HTMLButtonElement>("[data-add]", bb).map((b) => [b.dataset.add!, b]));

  const order: string[] = [];
  const qty = new Map<string, number>();
  let term: Term = 24;
  let demoRunning = false;
  let demoTimers: number[] = [];

  const unitLabel = (p: Product, q: number) => (q === 1 ? p.unit[0] : p.unit[1]);
  const announce = (msg: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = msg), 30);
  };

  function lines(): Line[] {
    const out: Line[] = [];
    for (const id of order) {
      const p = PRODUCTS[id];
      const q = qty.get(id) ?? 0;
      if (p.mrc) {
        const unit = p.mrc(term);
        out.push({
          key: id + "-m",
          id,
          group: "mrc",
          primary: true,
          name: p.name,
          meta: p.meta ? p.meta(term, q) : `${money(unit)} × ${q} ${unitLabel(p, q)}`,
          amount: unit * q,
          zero: false,
        });
      }
      if (p.nrc) {
        const unit = p.nrc.price(term);
        out.push({
          key: id + "-n",
          id,
          group: "nrc",
          primary: !p.mrc,
          name: p.nrc.name,
          meta: unit === 0 ? `Waived on ${term}-month term` : `${money(unit)} × ${q} ${p.mrc ? "" : unitLabel(p, q)}`.trim(),
          amount: unit * q,
          zero: unit === 0,
        });
      }
    }
    return out;
  }

  function totals() {
    let mrc = 0;
    let nrc = 0;
    let cost = 0;
    for (const id of order) {
      const p = PRODUCTS[id];
      const q = qty.get(id) ?? 0;
      if (p.mrc) mrc += p.mrc(term) * q;
      if (p.nrc) nrc += p.nrc.price(term) * q;
      cost += ((p.cost.mrc?.(term) ?? 0) * term + (p.cost.nrc ?? 0)) * q;
    }
    const tcv = mrc * term + nrc;
    const margin = tcv > 0 ? Math.round(((tcv - cost) / tcv) * 100) : 0;
    return { mrc, nrc, tcv, margin };
  }

  function makeLine(line: Line): HTMLLIElement {
    const p = PRODUCTS[line.id];
    const li = document.createElement("li");
    li.className = "ln";
    li.dataset.key = line.key;
    li.innerHTML = `<span class="ln__dot ln__dot--${p.cat}"></span><span class="ln__txt"><strong></strong><small></small></span><span class="ln__ctl"></span><span class="ln__amt"></span>`;
    const ctl = li.querySelector(".ln__ctl")!;
    if (line.primary) {
      ctl.className = "step";
      ctl.innerHTML = `<button type="button" data-dec aria-label="Decrease ${p.short} quantity"><svg><use href="#i-minus"/></svg></button><output aria-live="off"></output><button type="button" data-inc aria-label="Increase ${p.short} quantity"><svg><use href="#i-plus"/></svg></button>`;
      ctl.querySelector("[data-dec]")!.addEventListener("click", () => change(line.id, -p.step));
      ctl.querySelector("[data-inc]")!.addEventListener("click", () => change(line.id, p.step));
    } else {
      ctl.className = "step step--fixed";
    }
    return li;
  }

  function fillLine(li: HTMLElement, line: Line) {
    const p = PRODUCTS[line.id];
    const q = qty.get(line.id) ?? 0;
    li.querySelector("strong")!.textContent = line.name;
    li.querySelector("small")!.textContent = line.meta;
    const amt = li.querySelector(".ln__amt")!;
    amt.classList.toggle("is-zero", line.zero);
    if (line.zero) {
      current.delete(amt);
      amt.textContent = "Waived";
    } else if (amt.textContent === "Waived") {
      current.set(amt, line.amount);
      amt.textContent = money(line.amount);
    } else tweenTo(amt, line.amount, money, 500);
    const out = li.querySelector("output");
    if (out) {
      out.textContent = String(q);
      const inc = li.querySelector<HTMLButtonElement>("[data-inc]")!;
      inc.disabled = q >= p.max;
    } else li.querySelector(".step--fixed")!.textContent = `× ${q}`;
  }

  /** Re-renders the bundle with FLIP so lines glide instead of jump. */
  function render(added?: string, flyFrom?: HTMLElement | null) {
    const all = lines();
    const animate = !prefersReducedMotion;
    const first = new Map<HTMLElement, number>();
    if (animate) for (const el of $$(".ln, .grp__head", scroll)) first.set(el, el.getBoundingClientRect().top);

    const entering: HTMLElement[] = [];
    for (const g of ["mrc", "nrc"] as const) {
      const list = lists[g];
      const want = all.filter((l) => l.group === g);
      const have = new Map($$(".ln", list).map((el) => [el.dataset.key ?? "", el]));
      const groupWillHide = want.length === 0;
      for (const [key, el] of have) {
        if (want.some((l) => l.key === key)) continue;
        if (animate && !groupWillHide) {
          // Freeze in place, fade out, remove.
          el.style.position = "absolute";
          el.style.top = el.offsetTop + "px";
          el.style.left = el.offsetLeft + "px";
          el.style.width = el.offsetWidth + "px";
          el.style.zIndex = "0";
          el.removeAttribute("data-key");
          el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(18px) scale(0.97)" }], { duration: 280, easing: EASE }).onfinish = () => el.remove();
        } else el.remove();
      }
      for (const line of want) {
        let el = have.get(line.key);
        if (!el) {
          el = makeLine(line);
          entering.push(el);
        }
        fillLine(el, line);
        list.appendChild(el);
      }
      groups[g].hidden = groupWillHide;
    }
    empty.hidden = all.length > 0;

    if (animate) {
      for (const [el, top] of first) {
        if (!el.isConnected || el.style.position === "absolute") continue;
        const dy = top - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 480, easing: EASE });
      }
      const delay = flyFrom ? 300 : 0;
      for (const el of entering) {
        el.animate(
          [
            { opacity: 0, transform: "translateY(-10px) scale(0.97)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 520, delay, easing: EASE, fill: "backwards" },
        );
      }
    }
    if (added) {
      for (const el of entering) {
        el.classList.add("is-new");
        window.setTimeout(() => el.classList.remove("is-new"), 60);
      }
      const target = entering[0];
      if (target && flyFrom && animate) fly(flyFrom, target);
      if (target && !prefersReducedMotion) {
        // keep the new line visible inside the bundle's own scroller (desktop)
        const s = scroll.getBoundingClientRect();
        const r = target.getBoundingClientRect();
        if (scroll.scrollHeight > scroll.clientHeight && (r.bottom > s.bottom || r.top < s.top)) {
          scroll.scrollTo({ top: target.offsetTop - 60, behavior: "smooth" });
        }
      }
    }

    // Totals, count, palette badges
    const t = totals();
    tweenTo($("[data-sub='mrc']", bb), t.mrc, (n) => moneyWhole(n) + "/mo");
    tweenTo($("[data-sub='nrc']", bb), t.nrc);
    tweenTo($("[data-tot='mrc']", bb), t.mrc);
    tweenTo($("[data-tot='nrc']", bb), t.nrc);
    tweenTo($("[data-tot='tcv']", bb), t.tcv, moneyWhole, 800);
    tweenTo($("[data-margin]", bb), t.margin, (n) => `${n}%`);
    $("[data-term-label]", bb)!.textContent = String(term);
    const items = order.length;
    $("[data-count]", bb)!.textContent = `${items} ${items === 1 ? "item" : "items"}`;
    send.disabled = items === 0;
    for (const [id, btn] of palette) {
      const q = qty.get(id) ?? 0;
      btn.classList.toggle("is-in", q > 0);
      btn.querySelector(".pal__n")!.textContent = q > 0 ? String(q) : "";
    }
  }

  function fly(from: HTMLElement, to: HTMLElement) {
    const icon = from.querySelector(".pal__ic") ?? from;
    const a = icon.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const vh = window.innerHeight;
    const ghost = document.createElement("div");
    ghost.className = "fly";
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = icon.outerHTML + `<span>${PRODUCTS[from.dataset.add!].short}</span>`;
    ghost.style.left = a.left + "px";
    ghost.style.top = a.top + "px";
    document.body.appendChild(ghost);
    const tx = b.left + 12 - a.left;
    const ty = Math.min(b.top + 4, vh - 40) - a.top;
    const offscreen = b.top > vh - 40;
    ghost.animate(
      [
        { transform: "translate(0,0) scale(0.9)", opacity: 0 },
        { transform: `translate(${tx * 0.15}px, ${ty * 0.15 - 14}px) scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.92)`, opacity: offscreen ? 0 : 0.95 },
      ],
      { duration: 560, easing: "cubic-bezier(0.5, 0, 0.2, 1)" },
    ).onfinish = () => {
      ghost.animate([{ opacity: offscreen ? 0 : 0.95 }, { opacity: 0 }], { duration: 160 }).onfinish = () => ghost.remove();
      ghost.style.opacity = "0";
      ghost.style.transform = `translate(${tx}px, ${ty}px)`;
    };
  }

  function add(id: string, from?: HTMLElement | null, quiet = false) {
    const p = PRODUCTS[id];
    if (!p) return;
    const had = qty.get(id) ?? 0;
    if (had >= p.max) {
      if (!quiet) announce(`${p.short} is already in the bundle.`);
      return;
    }
    const q = had === 0 ? p.addQty : Math.min(p.max, had + p.step);
    qty.set(id, q);
    if (!had) order.push(id);
    const btn = palette.get(id);
    if (btn && !prefersReducedMotion) {
      btn.classList.remove("is-bump");
      void btn.offsetWidth;
      btn.classList.add("is-bump");
    }
    render(had ? undefined : id, had ? null : from);
    if (had) {
      const key = p.mrc ? id + "-m" : id + "-n";
      const el = $(`[data-key='${key}']`, scroll);
      el?.animate([{ background: "#f3f0ff" }, { background: "#fff" }], { duration: 700 });
    }
    if (!quiet) {
      const t = totals();
      announce(`${p.short} ${had ? "quantity " + q : "added"}. Monthly ${moneyWhole(t.mrc)}, once-off ${moneyWhole(t.nrc)}.`);
    }
  }

  function change(id: string, delta: number) {
    stopDemo();
    const p = PRODUCTS[id];
    const q = Math.max(0, Math.min(p.max, (qty.get(id) ?? 0) + delta));
    if (q === 0) {
      qty.delete(id);
      order.splice(order.indexOf(id), 1);
      render();
      announce(`${p.short} removed. ${order.length} items in bundle.`);
      // keep keyboard focus somewhere sensible
      const next = $<HTMLButtonElement>(".ln .step button", scroll) ?? palette.get(id);
      if (document.activeElement === document.body || !document.activeElement?.isConnected) next?.focus();
      return;
    }
    qty.set(id, q);
    render();
    const t = totals();
    announce(`${p.short}: ${q} ${unitLabel(p, q)}. Monthly ${moneyWhole(t.mrc)}.`);
  }

  function stopDemo() {
    if (!demoRunning) return;
    demoRunning = false;
    demoTimers.forEach((t) => window.clearTimeout(t));
    demoTimers = [];
  }

  // Palette: click / tap / keyboard
  for (const [id, btn] of palette) {
    btn.addEventListener("click", () => {
      stopDemo();
      if (bb.dataset.view !== "build") return;
      add(id, btn);
    });
    // Optional drag for mouse users
    btn.addEventListener("dragstart", (e) => {
      stopDemo();
      e.dataTransfer?.setData("text/plain", id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      btn.classList.add("is-dragging");
    });
    btn.addEventListener("dragend", () => {
      btn.classList.remove("is-dragging");
      bundle.classList.remove("is-over");
    });
  }
  let dragDepth = 0;
  bundle.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    bundle.classList.add("is-over");
  });
  bundle.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  bundle.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) bundle.classList.remove("is-over");
  });
  bundle.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    bundle.classList.remove("is-over");
    const id = e.dataTransfer?.getData("text/plain");
    if (id && PRODUCTS[id]) add(id);
  });

  // Term selector
  const setThumb = () => termSet.style.setProperty("--ti", String([12, 24, 36].indexOf(term)));
  termSet.addEventListener("change", (e) => {
    stopDemo();
    const v = Number((e.target as HTMLInputElement).value) as Term;
    term = v;
    setThumb();
    render();
    for (const amt of $$(".ln__amt", scroll)) amt.animate([{ color: "#5b3df5" }, { color: "inherit" }], { duration: 900 });
    const t = totals();
    announce(`${term}-month term. Monthly ${moneyWhole(t.mrc)}, once-off ${moneyWhole(t.nrc)}, contract value ${moneyWhole(t.tcv)}.`);
  });
  setThumb();

  /* Send proposal → branded cover with Sign */
  const TITLES: Record<Cat, string> = { net: "Connectivity", voice: "Voice", mob: "Mobile", cloud: "Cloud", svc: "Managed Services" };
  function fillCover() {
    const cats = [...new Set(order.map((id) => PRODUCTS[id].cat))].filter((c) => c !== "svc" || order.includes("support"));
    const parts = cats.map((c) => TITLES[c]);
    let title = "Business Communications Proposal";
    if (parts.length === 1) title = `${parts[0]} Proposal`;
    else if (parts.length > 1 && parts.length <= 3) title = `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)} Proposal`;
    $("[data-cover-title]", bb)!.textContent = title;
    const chips = $("[data-cover-chips]", bb)!;
    chips.innerHTML = "";
    const shown = order.slice(0, 5);
    for (const id of shown) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ln__dot ln__dot--${PRODUCTS[id].cat}"></span>`;
      li.append(PRODUCTS[id].short);
      chips.append(li);
    }
    if (order.length > shown.length) {
      const li = document.createElement("li");
      li.textContent = `+${order.length - shown.length} more`;
      chips.append(li);
    }
    const t = totals();
    $("[data-cover-mrc]", bb)!.textContent = moneyWhole(t.mrc);
    $("[data-cover-nrc]", bb)!.textContent = moneyWhole(t.nrc);
    $("[data-cover-term]", bb)!.textContent = `${term} months`;
    return { title, ...t };
  }

  const swap = (fn: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !prefersReducedMotion) doc.startViewTransition(fn);
    else fn();
  };

  const status = $("[data-status]", bb);
  const setStatus = (t: string) => {
    if (status) status.textContent = t;
  };
  send.addEventListener("click", () => {
    stopDemo();
    if (!order.length) return;
    const info = fillCover();
    swap(() => {
      bb.dataset.view = "proposal";
      proposal.hidden = false;
      setStatus("Sent");
    });
    window.setTimeout(() => proposal.focus({ preventScroll: true }), 50);
    announce(`Proposal ready: ${info.title} for Northbank Logistics. Monthly ${moneyWhole(info.mrc)}, once-off ${moneyWhole(info.nrc)}, ${term}-month term.`);
  });

  const signBtn = $<HTMLButtonElement>("[data-sign]", bb)!;
  const done = $("[data-done]", bb)!;
  const final = $("[data-final]", bb)!;
  signBtn.addEventListener("click", () => {
    bb.classList.add("is-signed");
    signBtn.hidden = true;
    const reveal = () => {
      setStatus("Signed");
      done.hidden = false;
      final.hidden = false;
      $<HTMLAnchorElement>("a", final)?.focus({ preventScroll: true });
      announce("Proposal accepted and signed. Audit trail recorded.");
    };
    if (prefersReducedMotion) reveal();
    else window.setTimeout(reveal, 1250);
  });

  $("[data-back]", bb)!.addEventListener("click", () => {
    swap(() => {
      bb.dataset.view = "build";
      proposal.hidden = true;
      setStatus("Draft");
      bb.classList.remove("is-signed");
      signBtn.hidden = false;
      done.hidden = true;
      final.hidden = true;
    });
    send.focus({ preventScroll: true });
    announce("Back to the bundle.");
  });

  /* Initial state: clear the static (no-JS) bundle and play a short demo when visible. */
  for (const list of Object.values(lists)) list.innerHTML = "";
  const DEMO = ["fibre", "pbx", "mobile", "install"];
  if (prefersReducedMotion) {
    DEMO.forEach((id) => add(id, null, true));
  } else {
    render();
    demoRunning = true;
    onceVisible(
      bundle,
      () => {
        if (!demoRunning) return;
        DEMO.forEach((id, i) => {
          demoTimers.push(
            window.setTimeout(() => {
              if (!demoRunning || bb.dataset.view !== "build") return;
              add(id, palette.get(id), true);
              if (i === DEMO.length - 1) demoRunning = false;
            }, 450 + i * 620),
          );
        });
      },
      0.4,
    );
  }
}

/* ───────── Contract term options ───────── */

function initOptions() {
  const root = $("[data-opts]");
  if (!root) return;
  const cols = $(".opts__cols", root)!;
  const ring = $(".opts__ring", root)!;
  const opts = $$<HTMLButtonElement>(".opt", root);
  let userPicked = false;

  const place = () => {
    const sel = opts.find((o) => o.getAttribute("aria-checked") === "true") ?? opts[1];
    ring.style.width = sel.offsetWidth + "px";
    ring.style.height = sel.offsetHeight + "px";
    ring.style.transform = `translate(${sel.offsetLeft}px, ${sel.offsetTop}px)`;
  };
  const select = (o: HTMLButtonElement) => {
    opts.forEach((x) => x.setAttribute("aria-checked", String(x === o)));
    place();
  };
  opts.forEach((o, i) => {
    o.addEventListener("click", () => {
      userPicked = true;
      select(o);
    });
    o.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = opts[(i + dir + opts.length) % opts.length];
      userPicked = true;
      select(next);
      next.focus();
    });
  });
  place();
  new ResizeObserver(place).observe(cols);

  let k = 1;
  const seq = [1, 2, 0];
  loopWhileVisible(
    root,
    () => {
      if (userPicked) return;
      k = (k + 1) % seq.length;
      select(opts[seq[k]]);
    },
    2600,
  );
}

/* ───────── Bento loops ───────── */

function initBento() {
  const cat = $("[data-loop='cat']");
  if (cat) {
    if (prefersReducedMotion) cat.classList.add("is-a");
    loopWhileVisible(cat, () => cat.classList.toggle("is-a"), 2800, () => window.setTimeout(() => cat.classList.add("is-a"), 600));
  }

  const mg = $("[data-loop='margin']");
  if (mg) loopWhileVisible(mg, () => mg.classList.toggle("is-c"), 2600);

  const ap = $("[data-loop='appr']");
  if (ap) {
    const steps = $$(".ap__step", ap);
    const list = $(".ap", ap)!;
    let i = -1;
    const show = (n: number) => {
      steps.forEach((s, j) => {
        s.classList.toggle("is-on", j <= n);
        s.classList.toggle("is-now", j === n);
      });
      list.style.setProperty("--ap", String(Math.max(0, n)));
    };
    if (prefersReducedMotion) show(3);
    else show(0);
    loopWhileVisible(
      ap,
      () => {
        i = i >= 5 ? 0 : i + 1; // 0..3 build up, 4..5 hold
        show(Math.min(i, 3));
      },
      950,
    );
  }

  const tr = $("[data-loop='tier']");
  if (tr) {
    const qtyEl = $("[data-tier-qty]", tr)!;
    const curEl = $("[data-tier-cur]", tr)!;
    const totalEl = $("[data-tier-total]", tr)!;
    const rows = $$("[data-tier]", tr);
    const prices = $$("[data-tier-price]", tr);
    const rowsWrap = $(".tr__rows", tr)!;
    const curs = [
      { code: "AUD", sym: "A$", rate: 1 },
      { code: "USD", sym: "US$", rate: 0.66 },
      { code: "GBP", sym: "£", rate: 0.52 },
      { code: "NZD", sym: "NZ$", rate: 1.09 },
    ];
    const qtys = [8, 24, 64];
    let step = 0;
    let c = 0;
    const show = () => {
      const q = qtys[step];
      const tier = q >= 50 ? 2 : q >= 10 ? 1 : 0;
      const cur = curs[c];
      rowsWrap.style.setProperty("--tier", String(tier));
      rows.forEach((r, j) => r.classList.toggle("is-on", j === tier));
      curEl.textContent = cur.code;
      prices.forEach((p) => (p.textContent = cur.sym + (Number(p.dataset.tierPrice) * cur.rate).toFixed(2)));
      const unit = Number(prices[tier].dataset.tierPrice) * cur.rate;
      tweenTo(qtyEl, q, (n) => String(n), 500);
      const fmt = (n: number) => cur.sym + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      current.delete(totalEl);
      totalEl.textContent = fmt(Math.round(unit * q * 100));
    };
    show();
    loopWhileVisible(
      tr,
      () => {
        step = (step + 1) % qtys.length;
        if (step === 0) c = (c + 1) % curs.length;
        show();
      },
      2200,
    );
  }
}

/* ───────── Collaboration editor: cursors, failover, comment ───────── */

function initTeam() {
  const ed = $<HTMLElement>("[data-loop='team']");
  if (!ed) return;
  if (prefersReducedMotion) {
    ed.classList.add("is-fo", "is-cmt", "is-price");
    return;
  }
  liveWhileVisible(ed);
  const cur = { s: $(".cur--s", ed)!, p: $(".cur--p", ed)!, e: $(".cur--e", ed)! };
  const at = (el: Element | null, fx = 0.5, fy = 0.5) => {
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const b = ed.getBoundingClientRect();
    return { x: r.left - b.left + r.width * fx, y: r.top - b.top + r.height * fy };
  };
  const move = (c: HTMLElement, p: { x: number; y: number }) => (c.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`);

  const svg = $(".net__svg", ed)!;
  const scenes: Array<() => void> = [
    () => {
      ed.classList.remove("is-fo", "is-cmt", "is-price");
      move(cur.s, at($(".sites li", ed), 0.7, 0.4));
      move(cur.p, at(svg, 0.5, 0.42));
      move(cur.e, at($(".gantt", ed), 0.55, 0.5));
    },
    () => {
      move(cur.e, at($(".net__node--new", ed), 0.4, 0.6));
      move(cur.p, at(svg, 0.3, 0.2));
    },
    () => ed.classList.add("is-fo"),
    () => {
      ed.classList.add("is-cmt");
      move(cur.e, at($(".cmt", ed), 0.85, 0.75));
      move(cur.s, at($(".sla", ed), 0.6, 0.3));
    },
    () => move(cur.s, at($(".sites__b", ed), 0.75, 0.35)),
    () => ed.classList.add("is-price"),
    () => move(cur.p, at($(".gantt__row:nth-child(3)", ed), 0.55, 0.5)),
    () => {},
  ];
  let i = 0;
  const run = () => {
    scenes[i]();
    i = (i + 1) % scenes.length;
  };
  loopWhileVisible(ed, run, 1300, () => {
    i = 0;
    run();
  });
}

/* ───────── Customer options ───────── */

function initCustomer() {
  const cv = $("[data-cv]");
  if (!cv) return;
  const boxes = $$<HTMLInputElement>("input[type='checkbox']", cv);
  const BASE = { mrc: 2864, nrc: 5970 };
  const update = () => {
    let mrc = BASE.mrc;
    let nrc = BASE.nrc;
    for (const b of boxes) {
      if (!b.checked) continue;
      mrc += Number(b.dataset.mrc ?? 0);
      nrc += Number(b.dataset.nrc ?? 0);
    }
    tweenTo($("[data-cv='mrc']", cv), mrc);
    tweenTo($("[data-cv='nrc']", cv), nrc);
  };
  boxes.forEach((b) => b.addEventListener("change", update));
  update();
}

/* ───────── Integrations + closing pulses ───────── */

function addPulses(svgSel: string, cls: string, outFrom = 99) {
  const svg = $<SVGSVGElement>(svgSel);
  if (!svg || prefersReducedMotion) return;
  $$<SVGPathElement>("path", svg).forEach((p, i) => {
    const c = p.cloneNode() as SVGPathElement;
    c.classList.add(cls);
    if (i >= outFrom) c.classList.add(cls + "--out");
    c.style.animationDelay = `${-(i * 0.73) % 3.2}s`;
    svg.appendChild(c);
  });
}

function initIntegrations() {
  addPulses(".hub__wires", "hub__pulse", 4);
  const hub = $("[data-loop='hub']");
  if (hub) liveWhileVisible(hub);
  addPulses(".final__lines", "final__pulse");
  const fin = $(".final");
  if (fin) liveWhileVisible(fin);
}

/* ───────── Mobile sticky CTA ───────── */

function initSticky() {
  const bar = $("[data-sticky]");
  const hero = $(".hero");
  const fin = $(".final");
  const foot = $(".qc-footer");
  if (!bar || !hero || !fin || !("IntersectionObserver" in window)) return;
  const seen = new Map<Element, boolean>([
    [hero, true],
    [fin, false],
  ]);
  if (foot) seen.set(foot, false);
  const link = $("a", bar)!;
  new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target, e.isIntersecting));
    const on = ![...seen.values()].some(Boolean);
    bar.classList.toggle("is-on", on);
    bar.setAttribute("aria-hidden", String(!on));
    link.tabIndex = on ? 0 : -1;
  }).observe(hero);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target, e.isIntersecting));
    const on = ![...seen.values()].some(Boolean);
    bar.classList.toggle("is-on", on);
    bar.setAttribute("aria-hidden", String(!on));
    link.tabIndex = on ? 0 : -1;
  });
  io.observe(fin);
  if (foot) io.observe(foot);
}

initBuilder();
initOptions();
initBento();
initTeam();
initCustomer();
initIntegrations();
initSticky();
