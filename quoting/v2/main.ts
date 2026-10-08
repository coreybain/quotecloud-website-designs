import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────────────────────── Pricing model (sample UI, always computed) ───────────────────────── */

type ItemKey = "a" | "b" | "c" | "d";
const ITEMS: { k: ItemKey; qty: number; unit: number; cost: number; optional?: boolean }[] = [
  { k: "a", qty: 10, unit: 1500, cost: 900 },
  { k: "b", qty: 40, unit: 165, cost: 95 },
  { k: "c", qty: 1, unit: 3600, cost: 1800 },
  { k: "d", qty: 1, unit: 1200, cost: 500, optional: true },
];

type Pricing = { disc: [number, number, number, number]; opt: boolean; tax: boolean; zero?: boolean };
const PRICING = {
  zero: { disc: [0, 0, 0, 0], opt: false, tax: false, zero: true },
  s1: { disc: [0, 0, 0, 0], opt: false, tax: false },
  s2: { disc: [10, 10, 10, 10], opt: false, tax: true },
  s4: { disc: [18, 10, 10, 10], opt: false, tax: true },
  fin: { disc: [18, 10, 10, 10], opt: true, tax: true },
} satisfies Record<string, Pricing>;
type PricingKey = keyof typeof PRICING;

const money = (n: number, cents = false) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

function compute(p: Pricing) {
  const lines = ITEMS.map((item, i) => {
    const sell = Math.round(item.qty * item.unit * (1 - p.disc[i] / 100) * 100) / 100;
    const cost = item.qty * item.cost;
    const included = !item.optional || p.opt;
    return { ...item, disc: p.disc[i], sell, cost, included, margin: sell ? ((sell - cost) / sell) * 100 : 0 };
  });
  const inc = lines.filter((l) => l.included);
  const sub = p.zero ? 0 : inc.reduce((s, l) => s + l.sell, 0);
  const tax = p.tax && !p.zero ? Math.round(sub * 10) / 100 : 0;
  const costSum = inc.reduce((s, l) => s + l.cost, 0);
  return { lines, sub, tax, total: sub + tax, margin: sub ? ((sub - costSum) / sub) * 100 : 0 };
}

/* ───────────────────────── Story states ─────────────────────────
   Each step is a short timed sequence of phases. A phase sets the visible
   "flags" (CSS hooks via [data-f~="flag"]) and, optionally, pricing, status,
   version and view label; omitted fields carry over from the previous phase. */

type Tone = "ink" | "amber" | "violet" | "sky" | "mint";
type Phase = { at: number; f: string; p?: PricingKey; status?: [string, Tone]; ver?: string; view?: string };
type Step = { phases: Phase[]; loopFrom?: number; loopAt?: number };

const CORE = "brand rows disc tax";
const STEPS: Record<number, Step> = {
  0: {
    phases: [
      { at: 0, f: "brand", p: "zero", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" },
      { at: 350, f: `${CORE} opt`, p: "fin", status: ["Approved", "violet"], ver: "v1.2" },
      { at: 1500, f: `${CORE} opt toast1`, status: ["Viewed", "sky"] },
      { at: 2500, f: `${CORE} opt sign`, status: ["Signed", "mint"] },
      { at: 3700, f: `${CORE} opt sign paid toast3`, status: ["Signed & paid", "mint"] },
    ],
  },
  1: {
    phases: [
      { at: 0, f: "blank", p: "zero", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" },
      { at: 500, f: "brand" },
      { at: 1100, f: "brand cat rows", p: "s1" },
    ],
  },
  2: {
    phases: [
      { at: 0, f: "brand rows", p: "s1", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" },
      { at: 380, f: `${CORE} formula cur`, p: "s2" },
      { at: 2800, f: `${CORE} formula` },
    ],
  },
  3: {
    phases: [
      { at: 0, f: CORE, p: "s2", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" },
      { at: 260, f: `${CORE} internal`, view: "Internal view" },
      { at: 4400, f: CORE, view: "Customer view" },
    ],
    loopFrom: 1,
    loopAt: 6600,
  },
  4: {
    phases: [
      { at: 0, f: `${CORE} hot`, p: "s2", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" },
      { at: 320, f: `${CORE} hot`, p: "s4", ver: "v1.1" },
      { at: 1050, f: `${CORE} hot rule`, status: ["Pending approval", "amber"] },
      { at: 2050, f: `${CORE} hot rule approver` },
      { at: 3200, f: `${CORE} approver ok stamp hist`, status: ["Approved", "violet"], ver: "v1.2" },
    ],
  },
  5: {
    phases: [
      { at: 0, f: `${CORE} frame`, p: "s4", status: ["Sent", "sky"], ver: "v1.2", view: "Customer view" },
      { at: 1150, f: `${CORE} frame toast1`, status: ["Viewed", "sky"] },
      { at: 2250, f: `${CORE} frame toast1 opt toast2`, p: "fin" },
    ],
  },
  6: {
    phases: [
      { at: 0, f: `${CORE} opt frame`, p: "fin", status: ["Viewed", "sky"], ver: "v1.2", view: "Customer view" },
      { at: 250, f: `${CORE} opt frame sign` },
      { at: 1750, f: `${CORE} opt frame sign paid toast3`, status: ["Signed & paid", "mint"] },
    ],
  },
};

/** Phase with every field resolved from the phases before it. */
function resolved(step: number, index: number): Required<Phase> {
  const out = { at: 0, f: "", p: "fin", status: ["Draft", "ink"], ver: "v1.0", view: "Customer view" } as Required<Phase>;
  STEPS[step].phases.slice(0, index + 1).forEach((ph) => Object.assign(out, ph));
  return out;
}

/* ───────────────────────── Quote document player ───────────────────────── */

class QuotePlayer {
  private timers: number[] = [];
  private tweens = new Map<HTMLElement, number>();
  private keys = new Map<string, HTMLElement[]>();
  step = -1;

  constructor(private root: HTMLElement) {
    root.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      const k = el.dataset.k!;
      this.keys.set(k, [...(this.keys.get(k) ?? []), el]);
    });
  }

  play(step: number, opts: { instant?: boolean; from?: number; loop?: boolean } = {}) {
    this.stop();
    this.step = step;
    this.root.dataset.step = String(step);
    const { phases, loopFrom, loopAt } = STEPS[step];
    if (opts.instant || prefersReducedMotion) {
      this.apply(step, phases.length - 1, false);
      return;
    }
    const from = opts.from ?? 0;
    const base = phases[from].at;
    phases.slice(from).forEach((_, i) => {
      const index = from + i;
      const delay = phases[index].at - base;
      if (delay === 0) this.apply(step, index, index !== 0);
      else this.timers.push(window.setTimeout(() => this.apply(step, index, true), delay));
    });
    if (opts.loop && loopFrom !== undefined && loopAt !== undefined) {
      this.timers.push(window.setTimeout(() => this.play(step, { from: loopFrom, loop: true }), loopAt - base));
    }
  }

  stop() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  private set(key: string, text: string) {
    this.keys.get(key)?.forEach((el) => {
      if (el.textContent === text) return;
      el.textContent = text;
      el.classList.remove("is-tick");
      void el.offsetWidth;
      el.classList.add("is-tick");
    });
  }

  private roll(key: string, to: number, animate: boolean) {
    this.keys.get(key)?.forEach((el) => {
      const from = Number(el.dataset.v ?? to);
      el.dataset.v = String(to);
      cancelAnimationFrame(this.tweens.get(el) ?? 0);
      if (!animate || from === to) {
        el.textContent = money(to, true);
        return;
      }
      const start = performance.now();
      const dur = 900;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        el.textContent = money(Math.round((from + (to - from) * e) * 100) / 100, true);
        if (t < 1) this.tweens.set(el, requestAnimationFrame(tick));
      };
      this.tweens.set(el, requestAnimationFrame(tick));
    });
  }

  private apply(step: number, index: number, animate: boolean) {
    const ph = resolved(step, index);
    this.root.dataset.f = ph.f;
    const pricing: Pricing = PRICING[ph.p];
    const m = compute(pricing);
    for (const l of m.lines) {
      this.set(`${l.k}-disc`, `${l.disc}%`);
      this.set(`${l.k}-tot`, money(l.sell));
      this.set(`${l.k}-sell`, money(l.sell));
      this.set(`${l.k}-cost`, money(l.cost));
      this.set(`${l.k}-mgn`, `${l.margin.toFixed(1)}%`);
    }
    this.set("mgn", `${m.margin.toFixed(1)}%`);
    this.roll("sub", m.sub, animate);
    this.roll("total", m.total, animate);
    if (pricing.tax) this.roll("tax", m.tax, animate);
    else this.keys.get("tax")?.forEach((el) => ((el.textContent = "–"), (el.dataset.v = "0")));
    this.set("ver", ph.ver);
    this.set("view", ph.view);
    const [label, tone] = ph.status;
    this.keys.get("status")?.forEach((el) => {
      if (el.textContent !== label) {
        el.textContent = label;
        el.classList.remove("is-tick");
        void el.offsetWidth;
        el.classList.add("is-tick");
      }
      el.dataset.tone = tone;
    });
  }
}

/* ───────────────────────── Pinned story (desktop) / stacked snapshots (mobile, reduced motion) ───────────────────────── */

const life = document.querySelector<HTMLElement>(".q2-life");
const stageQd = document.querySelector<HTMLElement>("[data-qd]");
const stage = document.querySelector<HTMLElement>(".q2-stage");
const scene = document.querySelector<HTMLElement>(".q2-stage__scene");
const pin = document.querySelector<HTMLElement>(".q2-stage__pin");
const rail = document.querySelector<HTMLElement>(".q2-rail");

if (life && stageQd && stage && scene && pin) {
  const stageQdEl = stageQd;
  const player = new QuotePlayer(stageQd);
  const stackedMQ = window.matchMedia("(max-width: 960px), (prefers-reduced-motion: reduce)");
  const chapters = [...document.querySelectorAll<HTMLElement>(".q2-ch")];
  const railLinks = [...document.querySelectorAll<HTMLAnchorElement>("[data-rail]")];

  // Hero: the quote builds itself once on load, ending signed & paid.
  player.play(0);

  /* Fit the document into the pinned viewport (pinned mode only). */
  const fit = () => {
    if (stackedMQ.matches) {
      scene.style.removeProperty("--qd-scale");
      scene.style.removeProperty("height");
      return;
    }
    const natural = stageQdEl.offsetHeight;
    const railH = rail?.offsetHeight ?? 0;
    const avail = pin.clientHeight - railH - 56;
    const s = Math.min(1, Math.max(0.6, avail / natural));
    scene.style.setProperty("--qd-scale", s.toFixed(3));
    scene.style.height = `${Math.round(natural * s)}px`;
  };

  /* Active chapter = the block crossing the middle of the viewport. */
  let current = 0;
  const setStep = (step: number) => {
    if (step === current) return;
    current = step;
    stage.classList.toggle("is-intro", step === 0);
    stage.style.setProperty("--rail-p", String(step / 6));
    railLinks.forEach((a) => {
      const on = Number(a.dataset.rail) === step;
      if (on) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
      a.classList.toggle("is-done", Number(a.dataset.rail) < step);
    });
    chapters.forEach((ch) => ch.classList.toggle("is-active", Number(ch.dataset.step) === step));
    if (step === 0) player.play(0, { from: STEPS[0].phases.length - 1 });
    else player.play(step, { loop: true });
  };
  stage.classList.add("is-intro");

  const watched = [
    document.querySelector<HTMLElement>(".q2-hero"),
    document.querySelector<HTMLElement>(".q2-story__intro"),
    ...document.querySelectorAll<HTMLElement>(".q2-ch"),
  ].filter((el): el is HTMLElement => !!el);

  const chapterIO = new IntersectionObserver(
    (entries) => {
      if (stackedMQ.matches) return;
      for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step ?? 0));
    },
    { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
  );

  /* Stop timers while the whole story is off-screen. */
  const lifeIO = new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    if (!visible) player.stop();
    else if (!stackedMQ.matches && current > 0) player.play(current, { loop: true, from: STEPS[current].phases.length - 1 });
  });
  lifeIO.observe(life);

  /* Stacked mode: each chapter gets its own snapshot of the quote at that stage. */
  let shotsBuilt = false;
  const buildShots = () => {
    if (shotsBuilt) return;
    shotsBuilt = true;
    document.querySelectorAll<HTMLElement>("[data-shot]").forEach((slot) => {
      const step = Number(slot.dataset.shot);
      const clone = stageQdEl.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-qd");
      clone.classList.add("qd--shot");
      slot.append(clone);
      const p = new QuotePlayer(clone);
      p.play(step, { instant: true });
      if (prefersReducedMotion) return;
      // Lightly animated: replay the stage's sequence each time it comes into view.
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) p.play(step);
            else p.stop();
          }
        },
        { threshold: 0.45 },
      );
      io.observe(slot);
    });
  };

  const applyMode = () => {
    if (stackedMQ.matches) {
      watched.forEach((el) => chapterIO.unobserve(el));
      buildShots();
      if (current !== 0) {
        current = 0;
        player.play(0, { from: STEPS[0].phases.length - 1 });
      }
    } else {
      watched.forEach((el) => chapterIO.observe(el));
    }
    fit();
  };
  applyMode();
  stackedMQ.addEventListener("change", applyMode);
  window.addEventListener("resize", fit, { passive: true });
  document.fonts?.ready.then(fit);
}

/* ───────────────────────── Quote activity feed (integrations) ───────────────────────── */

const feed = document.querySelector<HTMLElement>(".q2-board__feed");
if (feed && !prefersReducedMotion) {
  const items = [...feed.children] as HTMLElement[];
  let i = 0;
  let timer = 0;
  const tick = () => {
    items[i].classList.remove("is-on");
    i = (i + 1) % items.length;
    items[i].classList.add("is-on");
  };
  new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting);
    window.clearInterval(timer);
    if (vis) timer = window.setInterval(tick, 2600);
  }).observe(feed);
}

/* Hub pulses and closing signature only animate while visible. */
const toggleVisible = (selector: string, threshold = 0.2) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => el.classList.toggle("is-live", e.isIntersecting)),
      { threshold },
    ).observe(el);
  });
};
toggleVisible("[data-hub]");
toggleVisible(".q2-final__panel", 0.35);
