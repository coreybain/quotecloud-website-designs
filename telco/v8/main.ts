import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

const reduced = prefersReducedMotion;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const list = (el: HTMLElement, attr: string) => (el.getAttribute(attr) || "").split(",").map(Number);

/** Tween the money value shown in `el` to `to`. */
function tween(el: HTMLElement, to: number, dur = 650) {
  const from = Number(el.dataset.cur ?? to);
  el.dataset.cur = String(to);
  if (reduced || from === to) {
    el.textContent = money(to);
    return;
  }
  el.classList.remove("is-tick");
  void el.offsetWidth;
  el.classList.add("is-tick");
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = money(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const setNow = (el: HTMLElement, v: number) => {
  el.dataset.cur = String(v);
  el.textContent = money(v);
};

/** Toggles `.is-live` while an element is on screen (CSS loops only run then). */
function whileVisible(el: Element, cb: (on: boolean) => void, threshold = 0.15) {
  if (!("IntersectionObserver" in window)) return cb(true);
  new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), { threshold }).observe(el);
}

/* ═════════════════════ HERO: spreadsheet → signed ═════════════════════ */

function initHero() {
  const hero = $("[data-hero]");
  const pin = $(".hero__pin", hero ?? document);
  const wrap = $("[data-stage-wrap]");
  const stage = $("[data-stage]");
  const steps = $("[data-steps]");
  const fill = $("[data-steps-fill]");
  if (!hero || !pin || !wrap || !stage || !steps || !fill) return;

  const buttons = $$<HTMLButtonElement>("button[data-go]", steps);
  const terms = $("[data-hero-terms]", stage);
  const termLabel = $("[data-term-label]", stage);
  const cells = $$("[data-m],[data-o],[data-mt],[data-ot]", stage);
  const TERMS = [12, 24, 36];

  /* ── fit the fixed-size stage into the column ── */
  const fit = () => {
    const cs = getComputedStyle(wrap);
    const bw = parseFloat(cs.getPropertyValue("--bw")) || 640;
    const bh = parseFloat(cs.getPropertyValue("--bh")) || 600;
    const avail = wrap.parentElement!.clientWidth;
    let s = avail / bw;
    if (hero.classList.contains("is-pinned")) {
      const ph = pin.clientHeight - 40 - steps.offsetHeight - 22;
      s = Math.min(s, ph / bh);
    } else if (window.innerWidth > 640) {
      s = Math.min(s, 660 / bh);
    }
    s = Math.max(0.4, Math.min(s, 1.1));
    wrap.style.setProperty("--s", s.toFixed(4));
  };

  /* ── pricing term inside the proposal ── */
  let termIdx = 2;
  const setTerm = (i: number, animate: boolean) => {
    termIdx = i;
    terms?.style.setProperty("--ti", String(i));
    $$("i[data-t]", terms ?? stage).forEach((el, k) => {
      el.classList.toggle("is-on", k === i);
      el.textContent = k === i ? `${TERMS[k]} mo` : String(TERMS[k]);
    });
    if (termLabel) termLabel.textContent = String(TERMS[i]);
    for (const el of cells) {
      const attr = ["data-m", "data-o", "data-mt", "data-ot"].find((a) => el.hasAttribute(a))!;
      const v = list(el, attr)[i];
      if (animate) tween(el, v, 800);
      else setNow(el, v);
    }
  };

  /* ── stage classes ── */
  let stageN = 4;
  const FILL = [0, 0.22, 0.42, 0.5, 1];
  const setFill = (f: number) => {
    fill.style.setProperty("--f", f.toFixed(3));
    buttons.forEach((b) => {
      const pos = Number(b.dataset.go) === 0 ? 0 : Number(b.dataset.go) === 3 ? 0.5 : 1;
      b.classList.toggle("is-reached", f >= pos - 0.001);
    });
  };
  const setStage = (n: number, opts: { fill?: boolean } = {}) => {
    if (n === stageN) return;
    const prev = stageN;
    stageN = n;
    for (let k = 1; k <= 4; k++) stage.classList.toggle(`s${k}`, n >= k);
    // the term switch is the "refine" moment: 12 → 36 months
    const want = n >= 3 ? 2 : 0;
    if (want !== termIdx) setTerm(want, n === 3 && prev < 3 && !reduced);
    const pressed = n <= 1 ? 0 : n <= 3 ? 3 : 4;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.go) === pressed)));
    if (opts.fill !== false) setFill(FILL[n]);
  };

  setFill(1);
  fit();
  new ResizeObserver(fit).observe(wrap.parentElement!);
  window.addEventListener("resize", fit);

  if (reduced) {
    // final proposal is the default markup; steps still let people look at "before"
    buttons.forEach((b) => b.addEventListener("click", () => setStage(Number(b.dataset.go))));
    return;
  }

  // start from the "before"
  stage.classList.add("is-resetting");
  setStage(0);
  setTerm(0, false);
  void stage.offsetWidth;
  stage.classList.remove("is-resetting");

  /* ── desktop: scroll-driven ── */
  const mq = window.matchMedia("(min-width: 1081px) and (min-height: 700px)");
  const P_AT = [0.1, 0.3, 0.5, 0.78];
  const P_GO: Record<number, number> = { 0: 0, 3: 0.62, 4: 0.96 };
  const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--qc-header-h")) || 64;
  const dist = () => Math.max(1, hero.offsetHeight - pin.offsetHeight);
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = Math.min(1, Math.max(0, (headerH() - hero.getBoundingClientRect().top) / dist()));
      let n = 0;
      while (n < 4 && p >= P_AT[n]) n++;
      setStage(n, { fill: false });
      setFill(Math.min(1, p / 0.9));
    });
  };

  /* ── tablet / mobile: auto-played loop ── */
  const DUR = [2800, 1800, 1700, 3600, 3400];
  let timer = 0;
  let visible = false;
  let stopped = false;
  const clear = () => window.clearTimeout(timer);
  const schedule = () => {
    clear();
    if (!visible || stopped || mode !== "auto") return;
    timer = window.setTimeout(() => {
      if (stageN < 4) {
        setStage(stageN + 1);
        schedule();
      } else {
        stage.classList.add("is-fading");
        timer = window.setTimeout(() => {
          stage.classList.add("is-resetting");
          setStage(0);
          void stage.offsetWidth;
          stage.classList.remove("is-resetting");
          stage.classList.remove("is-fading");
          schedule();
        }, 450);
      }
    }, DUR[stageN]);
  };

  whileVisible(stage, (on) => {
    visible = on;
    stage.classList.toggle("is-paused", !on);
    if (on) schedule();
    else clear();
  });

  let mode: "scroll" | "auto" | "" = "";
  const applyMode = () => {
    const next = mq.matches ? "scroll" : "auto";
    if (next === mode) return;
    mode = next;
    clear();
    hero.classList.toggle("is-pinned", mode === "scroll");
    fit();
    if (mode === "scroll") {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    } else {
      window.removeEventListener("scroll", onScroll);
      setFill(FILL[stageN]);
      schedule();
    }
  };
  mq.addEventListener("change", applyMode);
  applyMode();

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const go = Number(b.dataset.go);
      if (mode === "scroll") {
        const top = hero.getBoundingClientRect().top + window.scrollY - headerH() + P_GO[go] * dist();
        window.scrollTo({ top, behavior: "smooth" });
      } else {
        stopped = true;
        clear();
        stage.classList.remove("is-fading");
        setStage(go);
      }
    }),
  );
}

/* ═════════════════════ Segmented controls ═════════════════════ */

function segThumb(group: HTMLElement, i: number) {
  group.style.setProperty("--i", String(i));
  group.style.setProperty("--n", String($$("button", group).length));
}

/** Runs `tick` every `ms` while `el` is visible, until the user touches `el`. */
function autoCycle(el: HTMLElement, ms: number, tick: () => void) {
  if (reduced) return;
  let id = 0;
  let touched = false;
  const stop = () => {
    touched = true;
    window.clearInterval(id);
  };
  el.addEventListener("pointerdown", stop);
  el.addEventListener("keydown", stop);
  whileVisible(
    el,
    (on) => {
      window.clearInterval(id);
      if (on && !touched) id = window.setInterval(tick, ms);
    },
    0.4,
  );
}

function initPricing() {
  const root = $("[data-pricing]");
  const group = $("[data-term-group]");
  if (!root || !group) return;
  const btns = $$<HTMLButtonElement>("button[data-term]", group);
  const vals = $$("[data-v]", root);
  vals.forEach((el) => (el.dataset.cur = String(list(el, "data-v")[2])));
  let cur = 2;
  const set = (i: number) => {
    cur = i;
    btns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    segThumb(group, i);
    vals.forEach((el) => tween(el, list(el, "data-v")[i]));
  };
  segThumb(group, 2);
  btns.forEach((b, k) => b.addEventListener("click", () => set(k)));
  onceVisible(root, () => root.classList.add("is-in"), 0.25);
  autoCycle(root, 3000, () => set((cur + 1) % 3));
}

function initMargins() {
  const card = $("[data-margin]");
  const group = $("[data-view-group]", card ?? document);
  const mg = $(".mg", card ?? document);
  if (!card || !group || !mg) return;
  const btns = $$<HTMLButtonElement>("button[data-view]", group);
  const set = (i: number) => {
    btns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    segThumb(group, i);
    mg.dataset.view = btns[i].dataset.view;
  };
  segThumb(group, 0);
  btns.forEach((b, k) => b.addEventListener("click", () => set(k)));
  onceVisible(card, () => card.classList.add("is-in"), 0.35);
  let i = 0;
  autoCycle(card, 3200, () => set((i = (i + 1) % 2)));
}

/* ═════════════════════ Reveal-once cards + live loops ═════════════════════ */

function initCards() {
  $$("[data-approve], .card--net, .card--time, .card--lib").forEach((el) => {
    if (reduced) el.classList.add("is-in");
    else onceVisible(el, () => el.classList.add("is-in"), 0.35);
  });
  if (reduced) return;
  $$("[data-loop]").forEach((el) => whileVisible(el, (on) => el.classList.toggle("is-live", on)));
}

/* ═════════════════════ Options + e-sign ═════════════════════ */

function initClose() {
  const root = $("[data-close]");
  if (!root) return;
  const moEl = $("[data-close-mo]", root);
  const ooEl = $("[data-close-oo]", root);
  const sign = $<HTMLButtonElement>("[data-sign]", root);
  const auto = $<HTMLInputElement>("input[data-auto]", root);
  const BASE: Record<string, number> = { "24": 4635, "36": 4347 };
  const ONCE = 7230;
  if (!moEl || !ooEl || !sign) return;
  moEl.dataset.cur = "4347";
  ooEl.dataset.cur = String(ONCE);

  const recalc = () => {
    const term = $<HTMLInputElement>('input[name="t8-term"]:checked', root)?.value ?? "36";
    let mo = BASE[term] ?? 4347;
    let oo = ONCE;
    $$<HTMLInputElement>("input[type=checkbox]:checked", root).forEach((c) => {
      mo += Number(c.dataset.mo || 0);
      oo += Number(c.dataset.oo || 0);
    });
    tween(moEl, mo);
    tween(ooEl, oo);
  };
  root.addEventListener("change", recalc);

  const setSigned = (on: boolean) => {
    root.classList.toggle("is-signed", on);
    sign.setAttribute("aria-pressed", String(on));
  };
  sign.setAttribute("aria-pressed", "false");

  let touched = false;
  root.addEventListener("pointerdown", () => (touched = true));
  root.addEventListener("keydown", () => (touched = true));
  sign.addEventListener("click", () => setSigned(!root.classList.contains("is-signed")));

  if (reduced) {
    if (auto) auto.checked = true;
    recalc();
    setSigned(true);
    return;
  }
  onceVisible(
    root,
    () => {
      window.setTimeout(() => {
        if (touched || !auto) return;
        auto.checked = true;
        recalc();
      }, 1100);
      window.setTimeout(() => !touched && setSigned(true), 2700);
    },
    0.45,
  );
}

initHero();
initPricing();
initMargins();
initCards();
initClose();
