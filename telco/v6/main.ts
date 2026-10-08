import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* telco/v6 — "Two Ledgers": one quote, two views. */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Replace text with a short roll-in so changed numbers read as "re-flowed". */
function roll(el: HTMLElement, text: string) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (prefersReducedMotion) return;
  el.classList.remove("is-rolling");
  void el.offsetWidth;
  el.classList.add("is-rolling");
}

/** Tween a money value between two numbers. */
function countMoney(el: HTMLElement, to: number, duration = 650) {
  const from = Number(el.dataset.value ?? String(to));
  el.dataset.value = String(to);
  if (prefersReducedMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const TERM_MULTIPLIER: Record<string, number> = { "12": 1.14, "24": 1.06, "36": 1 };

/* ───────── Hero: the two-view ledger ───────── */

function initLedger() {
  const stage = $("[data-stage]");
  const ledger = $("[data-ledger]");
  const handle = $("[data-handle]");
  if (!stage || !ledger || !handle) return;

  const layerIn = $("[data-layer='internal']", ledger)!;
  const layerOut = $("[data-layer='customer']", ledger)!;
  const viewBtns = $$<HTMLButtonElement>("[data-view-btn]", stage);
  const track = $("[data-view-track]", stage);

  let split = 50;
  let raf = 0;
  let touched = false;

  const render = () => {
    stage.style.setProperty("--split", split.toFixed(2));
    const view = split >= 99.5 ? "internal" : split <= 0.5 ? "customer" : "split";
    if (ledger.dataset.view !== view) {
      ledger.dataset.view = view;
      viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewBtn === view)));
      layerIn.toggleAttribute("inert", view === "customer");
      layerOut.toggleAttribute("inert", view === "internal");
      layerIn.setAttribute("aria-hidden", String(view === "customer"));
      layerOut.setAttribute("aria-hidden", String(view === "internal"));
    }
    const v = Math.round(split);
    handle.setAttribute("aria-valuenow", String(v));
    handle.setAttribute(
      "aria-valuetext",
      view === "internal" ? "Your view only" : view === "customer" ? "Customer view only" : `${v}% your view, ${100 - v}% customer view`,
    );
  };

  const tweenTo = (target: number, duration = 1100, done?: () => void) => {
    cancelAnimationFrame(raf);
    if (prefersReducedMotion) {
      split = target;
      render();
      done?.();
      return;
    }
    const from = split;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      split = from + (target - from) * easeInOut(t);
      render();
      if (t < 1) raf = requestAnimationFrame(step);
      else done?.();
    };
    raf = requestAnimationFrame(step);
  };

  const setTarget = (target: string) => {
    ledger.dataset.target = "";
    void ledger.offsetWidth; // restart the arrival choreography
    ledger.dataset.target = target;
  };

  const go = (view: "internal" | "customer") => {
    touched = true;
    setTarget(view);
    tweenTo(view === "internal" ? 100 : 0, 1150);
  };

  viewBtns.forEach((b) => b.addEventListener("click", () => go(b.dataset.viewBtn as "internal" | "customer")));
  track?.addEventListener("click", () => go(split > 50 ? "customer" : "internal"));

  // Keyboard: the divider is a slider (value = share of "your view", left → right).
  handle.addEventListener("keydown", (e) => {
    const steps: Record<string, number> = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10, PageDown: -25, PageUp: 25 };
    let next: number | null = null;
    if (e.key in steps) next = Math.max(0, Math.min(100, Math.round(split / 5) * 5 + steps[e.key]));
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    touched = true;
    setTarget(next === 0 ? "customer" : next === 100 ? "internal" : "split");
    tweenTo(next, 380);
  });

  // Pointer: drag the handle, or scrub horizontally anywhere on the ledger.
  let drag: { id: number; x: number; active: boolean } | null = null;
  const fromX = (clientX: number) => {
    const r = ledger.getBoundingClientRect();
    split = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    render();
  };
  const startDrag = () => {
    if (!drag) return;
    drag.active = true;
    touched = true;
    cancelAnimationFrame(raf);
    ledger.setPointerCapture(drag.id);
    ledger.classList.add("is-dragging");
    if (ledger.dataset.target !== "split") ledger.dataset.target = "split";
  };
  ledger.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    drag = { id: e.pointerId, x: e.clientX, active: false };
    if ((e.target as Element).closest("[data-handle]")) {
      e.preventDefault();
      handle.focus({ preventScroll: true });
      startDrag();
    }
  });
  ledger.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.active && Math.abs(e.clientX - drag.x) > 8) startDrag();
    if (drag.active) fromX(e.clientX);
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasActive = drag.active;
    drag = null;
    ledger.classList.remove("is-dragging");
    if (!wasActive) return;
    if (split > 94) {
      setTarget("internal");
      tweenTo(100, 280);
    } else if (split < 6) {
      setTarget("customer");
      tweenTo(0, 280);
    }
  };
  ledger.addEventListener("pointerup", endDrag);
  ledger.addEventListener("pointercancel", endDrag);

  // Contract term inside the customer view re-prices the monthly column.
  const termBtns = $$<HTMLButtonElement>("[data-term]", layerOut);
  const priceCells = $$("[data-mrc]", layerOut);
  const totalEl = $("[data-total-mrc]", layerOut);
  termBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const m = TERM_MULTIPLIER[btn.dataset.term ?? "36"];
      termBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      let sum = 0;
      priceCells.forEach((cell) => {
        const v = Math.round(Number(cell.dataset.mrc) * m);
        sum += v;
        roll(cell, money(v));
      });
      if (totalEl) roll(totalEl, money(sum));
    }),
  );

  // Intro: start on your view, then open the split to reveal the customer side.
  if (prefersReducedMotion) {
    split = 50;
    render();
    return;
  }
  split = 100;
  render();
  onceVisible(
    ledger,
    () => {
      window.setTimeout(() => {
        if (touched) return;
        setTarget("split");
        tweenTo(50, 1600, () => {
          if (touched) return;
          handle.classList.add("is-hint");
          handle.addEventListener("animationend", () => handle.classList.remove("is-hint"), { once: true });
        });
      }, 900);
    },
    0.4,
  );
}

/* ───────── Bundle: contract-term pricing ───────── */

function initTerms() {
  const group = $("[data-terms]");
  const card = $("[data-proposal]");
  if (!group || !card) return;
  const btns = $$<HTMLButtonElement>("[data-term]", group);
  const lines = $$("[data-base]", card);
  const sumM = $("[data-sum-mrc]", card)!;
  const sumT = $("[data-sum-tcv]", card)!;
  const tcvLabel = $("[data-tcv-label]", card)!;
  const termLabel = $("[data-term-label]", card)!;
  const once = 6798;
  sumM.dataset.value = "5500";
  sumT.dataset.value = String(5500 * 36 + once);

  btns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const term = btn.dataset.term ?? "36";
      const m = TERM_MULTIPLIER[term];
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      let sum = 0;
      lines.forEach((el) => {
        const v = Math.round(Number(el.dataset.base) * m);
        sum += v;
        roll(el, money(v));
      });
      countMoney(sumM, sum);
      countMoney(sumT, sum * Number(term) + once, 800);
      tcvLabel.textContent = `${term}-month contract value`;
      roll(termLabel, `${term}-month term`);
    }),
  );
}

/* ───────── Live regions: run loops only while on screen ───────── */

const liveHooks = new Map<Element, (live: boolean) => void>();

function initLive() {
  const els = $$("[data-live], [data-final]");
  if (!("IntersectionObserver" in window) || prefersReducedMotion) {
    els.forEach((el) => el.classList.add("is-live"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("is-live", entry.isIntersecting);
        liveHooks.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { threshold: 0.2 },
  );
  els.forEach((el) => io.observe(el));
}

/* ───────── Inside: margin guard ───────── */

function initMarginGuard() {
  const tile = $("[data-margin]");
  if (!tile) return;
  const guard = $(".tl-guard", tile)!;
  const disc = $("[data-g-disc]", tile)!;
  const sell = $("[data-g-sell]", tile)!;
  const margin = $("[data-g-margin]", tile)!;
  const status = $("[data-g-status]", tile)!;
  const knob = $("[data-g-knob]", tile)!;
  const bar = $("[data-g-bar]", tile)!;
  const BUY = 47;
  const LIST = 67;
  const steps = [0, 4, 8, 12, 12];
  let i = 0;
  let timer = 0;

  const show = (d: number) => {
    const s = LIST * (1 - d / 100);
    const m = ((s - BUY) / s) * 100;
    disc.textContent = `${d}%`;
    sell.textContent = `$${s.toFixed(2)}`;
    margin.textContent = `${m.toFixed(1)}%`;
    knob.style.setProperty("--k", `${(d / 12) * 100}%`);
    bar.style.setProperty("--g", String(Math.min(1, m / 50)));
    const low = m < 25;
    guard.classList.toggle("is-low", low);
    status.textContent = low ? "Needs approval" : "Within floor";
  };
  show(0);
  if (prefersReducedMotion) {
    show(12);
    return;
  }
  liveHooks.set(tile, (live) => {
    window.clearInterval(timer);
    if (!live) return;
    timer = window.setInterval(() => {
      i = (i + 1) % steps.length;
      show(steps[i]);
    }, 1500);
  });
}

/* ───────── Outside: sites on the network diagram ───────── */

const SITES: Record<string, { text: string; price: number }> = {
  all: { text: "3 fibre services, SD-WAN, 48 voice seats, 20 mobiles", price: 4000 },
  hq: { text: "Fibre 500/500, SD-WAN edge, 30 voice seats, 14 mobiles", price: 2074 },
  wh: { text: "Fibre 500/500, SD-WAN edge, 10 voice seats, 4 mobiles", price: 1044 },
  br: { text: "Fibre 500/500, SD-WAN edge, 8 voice seats, 2 mobiles", price: 882 },
};

function initNetwork() {
  const tile = $("[data-net]");
  if (!tile) return;
  const btns = $$<HTMLButtonElement>("[data-site]", tile);
  const text = $("[data-site-text]", tile)!;
  const price = $("[data-site-price]", tile)!;
  const nodes = $$("[data-site-node]", tile);
  price.dataset.value = "4000";
  btns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.site ?? "all";
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      nodes.forEach((n) => n.classList.toggle("is-on", n.getAttribute("data-site-node") === key));
      roll(text, SITES[key].text);
      countMoney(price, SITES[key].price, 500);
    }),
  );

  // SMIL pulses: pause offscreen and for reduced motion.
  const svgs = $$<SVGSVGElement>("svg", tile).filter((s) => "pauseAnimations" in s);
  svgs.forEach((s) => s.pauseAnimations());
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(
    (entries) => entries.forEach((e) => svgs.forEach((s) => (e.isIntersecting ? s.unpauseAnimations() : s.pauseAnimations()))),
    { threshold: 0.15 },
  ).observe(tile);
}

/* ───────── Close: options, totals, accept & sign ───────── */

function initAccept() {
  const form = $<HTMLFormElement>("[data-accept]");
  if (!form) return;
  form.addEventListener("submit", (e) => e.preventDefault());
  const mrcEl = $("[data-acc-mrc]", form)!;
  const nrcEl = $("[data-acc-nrc]", form)!;
  const sig = $("[data-sig]", form)!;
  const sigStatus = $("[data-sig-status]", form)!;
  const signBtn = $<HTMLButtonElement>("[data-sign]", form)!;
  const BASE_M = 4000;
  const BASE_O = 6798;
  mrcEl.dataset.value = String(BASE_M);
  nrcEl.dataset.value = String(BASE_O);

  const recalc = () => {
    let m = BASE_M;
    let o = BASE_O;
    const support = $<HTMLInputElement>("input[name='tl-support']:checked", form);
    m += Number(support?.value ?? 0);
    $$<HTMLInputElement>("input[type='checkbox']:checked", form).forEach((c) => {
      if (c.dataset.kind === "nrc") o += Number(c.value);
      else m += Number(c.value);
    });
    countMoney(mrcEl, m, 500);
    countMoney(nrcEl, o, 500);
  };
  form.addEventListener("change", () => {
    recalc();
    if (sig.classList.contains("is-signed")) setSigned(false);
  });

  const setSigned = (signed: boolean) => {
    sig.classList.toggle("is-signed", signed);
    signBtn.classList.toggle("is-done", signed);
    signBtn.textContent = signed ? "Signed" : "Accept & sign";
    sigStatus.textContent = signed ? "Signed · audit trail recorded" : "";
  };
  signBtn.addEventListener("click", () => {
    demoCancelled = true;
    setSigned(!sig.classList.contains("is-signed"));
  });

  // A short, cancellable demo the first time the card is seen.
  let demoCancelled = false;
  const cancel = () => (demoCancelled = true);
  form.addEventListener("pointerdown", cancel);
  form.addEventListener("keydown", cancel);
  if (prefersReducedMotion) return;
  onceVisible(
    form,
    () => {
      const picks = $$<HTMLInputElement>("[data-demo-pick]", form);
      const queue: Array<() => void> = [
        ...picks.map((input) => () => {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }),
        () => setSigned(true),
      ];
      queue.forEach((fn, idx) =>
        window.setTimeout(
          () => {
            if (!demoCancelled) fn();
          },
          1100 + idx * 1100,
        ),
      );
    },
    0.5,
  );
}

initLedger();
initTerms();
initMarginGuard();
initNetwork();
initAccept();
initLive();
