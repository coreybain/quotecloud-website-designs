import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Deal stage model ─────────
   Each chapter (1–5) is a list of cumulative classes on the proposal window, added over time.
   CSS reads the classes; this file only sequences them, moves the "camera" and tweens totals. */

const SUBS: Record<number, Array<[cls: string, at: number]>> = {
  1: [["s1", 0]],
  2: [["s2", 0]],
  3: [["s3", 0], ["s3b", 1100], ["s3c", 2700], ["s3d", 5400]], // s3d: approval card dismissed
  4: [["s4", 0], ["s4b", 950], ["s4c", 2200]],
  5: [["s5", 0], ["s5b", 350], ["s5c", 1950]],
};
const ALL = Object.values(SUBS).flatMap((list) => list.map(([cls]) => cls));
const CAMERA_LEAD = 380; // let the page glide to the next block before the stage plays

type Key = "mrc" | "nrc" | "term" | "margin";
type Values = Record<Key, number>;

function valuesFor(set: Set<string>): Values {
  let mrc = set.has("s1") ? 3810 : 0;
  if (set.has("s3")) mrc = 3124;
  if (set.has("s4b")) mrc = 2968;
  if (set.has("s4c")) mrc = 3208;
  return {
    mrc,
    nrc: set.has("s1") ? 3930 : 0,
    term: set.has("s4b") ? 36 : 24,
    margin: set.has("s1") ? (set.has("s3") ? 31.5 : 43.8) : 0,
  };
}

function statusFor(set: Set<string>): [string, string] {
  if (set.has("s5c")) return ["Signed", "mint"];
  if (set.has("s4")) return ["Viewed by customer", "sky"];
  if (set.has("s3c")) return ["Approved", "violet"];
  if (set.has("s3b")) return ["Awaiting approval", "amber"];
  if (set.has("s2")) return ["Draft · 3 editing", ""];
  return ["Draft", ""];
}

const format: Record<Key, (n: number) => string> = {
  mrc: (n) => (n ? "$" + Math.round(n).toLocaleString("en-US") : "—"),
  nrc: (n) => (n ? "$" + Math.round(n).toLocaleString("en-US") : "—"),
  term: (n) => String(Math.round(n)),
  margin: (n) => (n ? n.toFixed(1) + "%" : "—"),
};

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

class Deal {
  stage = 0;
  private set = new Set<string>();
  private timers: number[] = [];
  private shown: Values = { mrc: 0, nrc: 0, term: 24, margin: 0 };
  private raf = 0;
  private camStage = 0;
  private page: HTMLElement;
  private vp: HTMLElement;
  private status: HTMLElement;
  private outs: Partial<Record<Key, HTMLElement>> = {};

  constructor(private el: HTMLElement) {
    this.page = el.querySelector<HTMLElement>("[data-page]")!;
    this.vp = el.querySelector<HTMLElement>(".dd__vp")!;
    this.status = el.querySelector<HTMLElement>("[data-status]")!;
    el.querySelectorAll<HTMLElement>("[data-v]").forEach((o) => (this.outs[o.dataset.v as Key] = o));
    if ("ResizeObserver" in window) new ResizeObserver(() => this.camera(this.camStage)).observe(this.vp);
  }

  /** Jump (or glide, when !instant) to the finished state of stage n. */
  apply(n: number, instant: boolean, cam = n) {
    this.clearTimers();
    this.el.removeAttribute("data-play");
    if (instant) this.el.classList.add("instant");
    this.set = this.finalSet(n);
    this.stage = n;
    this.el.dataset.stage = String(n);
    this.render();
    this.tween(instant);
    this.camera(cam);
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove("instant")));
  }

  /** Play stage n forward from the finished state of n − 1. */
  private animate(n: number) {
    this.clearTimers();
    this.set = this.finalSet(n - 1);
    this.render();
    this.stage = n;
    this.el.dataset.stage = String(n);
    this.el.removeAttribute("data-play");
    this.camera(n);
    for (const [cls, at] of SUBS[n]) {
      this.timers.push(
        window.setTimeout(() => {
          if (at === 0) this.el.dataset.play = String(n);
          this.set.add(cls);
          this.render();
          this.tween(false);
        }, at + CAMERA_LEAD),
      );
    }
  }

  go(n: number) {
    if (n === this.stage) return;
    if (prefersReducedMotion) return this.apply(n, true);
    if (n > this.stage + 1) this.apply(n - 1, false);
    if (n === this.stage + 1) this.animate(n);
    else this.apply(n, false);
  }

  private finalSet(n: number) {
    const set = new Set<string>();
    for (let s = 1; s <= n; s++) SUBS[s].forEach(([cls]) => set.add(cls));
    return set;
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private render() {
    for (const cls of ALL) this.el.classList.toggle(cls, this.set.has(cls));
    const [text, tone] = statusFor(this.set);
    if (this.status.textContent !== text) {
      this.status.textContent = text;
      this.status.dataset.tone = tone;
      this.status.classList.remove("is-flip");
      void this.status.offsetWidth;
      this.status.classList.add("is-flip");
    }
  }

  private tween(instant: boolean) {
    const from = { ...this.shown };
    const to = valuesFor(this.set);
    cancelAnimationFrame(this.raf);
    const keys = Object.keys(to) as Key[];
    if (instant || prefersReducedMotion) {
      keys.forEach((k) => this.write(k, to[k]));
      this.shown = to;
      return;
    }
    keys.forEach((k) => {
      if (from[k] === to[k]) return;
      const kv = this.outs[k]?.closest(".kv");
      kv?.classList.remove("bump");
      void (kv as HTMLElement | undefined)?.offsetWidth;
      kv?.classList.add("bump");
    });
    const duration = from.mrc === 0 ? 2200 : 900;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      keys.forEach((k) => {
        const v = from[k] + (to[k] - from[k]) * ease(t);
        this.shown[k] = v;
        this.write(k, k === "margin" && t === 1 ? to[k] : v);
      });
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.shown = to;
    };
    this.raf = requestAnimationFrame(step);
  }

  private write(k: Key, v: number) {
    const out = this.outs[k];
    if (!out) return;
    out.textContent = k === "margin" ? format.margin(Math.round(v * 10) / 10) : format[k](v);
  }

  /** Slide the document so the block for stage k sits at the top of the viewport. */
  private camera(k: number) {
    this.camStage = k;
    let off = 0;
    const focus = k > 0 ? this.page.querySelector<HTMLElement>(`[data-focus="${k}"]`) : null;
    if (focus) {
      const vpH = this.vp.clientHeight;
      const max = Math.max(0, this.page.offsetHeight + 28 - vpH);
      const fitsFromTop = focus.offsetTop + focus.offsetHeight + 14 <= vpH;
      off = k === 1 && fitsFromTop ? 0 : Math.min(max, Math.max(0, focus.offsetTop - 6));
    }
    this.page.style.setProperty("--cam", String(Math.round(off)));
  }
}

/* ───────── Loop pausing: anything with .loop stops when its host is offscreen ───────── */

const loopIO =
  "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle("paused", !e.isIntersecting);
      })
    : null;
const watchLoops = (el: Element | null) => el && loopIO?.observe(el);

/* ───────── Deal desk wiring ───────── */

function initDesk() {
  const desk = document.querySelector<HTMLElement>("[data-desk]");
  const source = desk?.querySelector<HTMLElement>(".desk__stage [data-dd]");
  if (!desk || !source) return;

  const chapters = [...desk.querySelectorAll<HTMLElement>(".ch")];
  const railBtns = [...desk.querySelectorAll<HTMLButtonElement>(".rail__btn")];
  const mrail = [...desk.querySelectorAll<HTMLElement>(".mrail li")];
  const wide = window.matchMedia("(min-width: 1024px)");
  const deal = new Deal(source);
  deal.apply(0, true);
  watchLoops(source);

  let active = 0;
  const setActive = (n: number) => {
    active = n;
    chapters.forEach((ch, i) => ch.classList.toggle("is-active", i + 1 === n));
    [railBtns, mrail].forEach((list) =>
      list.forEach((el, i) => {
        el.classList.toggle("is-active", i + 1 === n);
        el.classList.toggle("is-done", i + 1 < n);
      }),
    );
    railBtns.forEach((b, i) => (i + 1 === n ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    if (wide.matches) deal.go(n);
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(chapters.indexOf(e.target as HTMLElement) + 1);
      },
      { rootMargin: "-46% 0px -46% 0px" },
    );
    chapters.forEach((ch) => io.observe(ch));
  }
  onceVisible(source, () => wide.matches && active === 0 && setActive(1), 0.4);

  railBtns.forEach((btn, i) =>
    btn.addEventListener("click", () => {
      const ch = chapters[i];
      const y = ch.getBoundingClientRect().top + window.scrollY - (window.innerHeight - ch.offsetHeight) / 2;
      window.scrollTo({ top: y, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }),
  );

  /* Tablet & mobile: no pinning. Each chapter gets its own copy of the window that plays its stage on entry. */
  let built = false;
  const buildShots = () => {
    if (built || wide.matches) return;
    built = true;
    chapters.forEach((ch, i) => {
      const n = i + 1;
      const slot = ch.querySelector<HTMLElement>("[data-shot]");
      if (!slot) return;
      const copy = source.cloneNode(true) as HTMLElement;
      slot.append(copy);
      const mini = new Deal(copy);
      mini.apply(n - 1, true, n);
      watchLoops(copy);
      onceVisible(slot, () => mini.go(n), 0.5);
    });
  };
  buildShots();
  wide.addEventListener("change", () => {
    if (wide.matches) deal.apply(Math.max(active, 1), true);
    else buildShots();
  });
}

/* ───────── Hero: term selector cycles and the monthly total follows ───────── */

function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  watchLoops(hero);
  watchLoops(document.querySelector(".hero__bg"));
  const term = hero.querySelector<HTMLElement>("[data-hero-term]");
  const mrc = hero.querySelector<HTMLElement>("[data-hero-mrc]");
  if (!term || !mrc || prefersReducedMotion) return;

  const prices: Record<string, number> = { "12": 3676, "24": 3364, "36": 3208 };
  const order = ["36", "12", "24"];
  let idx = 0;
  let shown = prices["36"];
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);

  window.setInterval(() => {
    if (!visible || document.hidden) return;
    idx = (idx + 1) % order.length;
    const key = order[idx];
    term.dataset.heroTerm = key;
    const from = shown;
    const to = prices[key];
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      shown = from + (to - from) * ease(t);
      mrc.textContent = "$" + Math.round(shown).toLocaleString("en-US");
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, 2600);
}

/* ───────── Templates fan + ambient loops ───────── */

function initRest() {
  const fan = document.querySelector<HTMLElement>("[data-fan]");
  if (fan) prefersReducedMotion ? fan.classList.add("is-in") : onceVisible(fan, () => fan.classList.add("is-in"), 0.25);
  watchLoops(document.querySelector("[data-flow]"));
  watchLoops(document.querySelector(".closing__panel"));
}

initHero();
initDesk();
initRest();
