import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Pausable timeline for looping demos. `wait()` only resolves while `el` is on
 * screen, so loops freeze when scrolled away. Also toggles `.is-off` so CSS
 * keyframe loops (caret, pulse, flow line) pause too.
 */
function gate(el: Element, threshold = 0.15) {
  let visible = false;
  let waiting: Array<() => void> = [];
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      el.classList.toggle("is-off", !visible);
      if (visible) {
        waiting.forEach((resolve) => resolve());
        waiting = [];
      }
    },
    { threshold },
  );
  io.observe(el);
  const whenVisible = () => (visible ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)));
  return {
    get visible() {
      return visible;
    },
    whenVisible,
    async wait(ms: number) {
      await whenVisible();
      await sleep(ms);
      await whenVisible();
    },
  };
}

/* ───────── Hero: sign in with surname + booking ref, then the branded trip opens ───────── */

function initHero() {
  const phone = $("[data-hero-phone]");
  const section = $(".hero");
  if (!phone || !section) return;
  const fields = $$(".field", phone);
  const vals = $$<HTMLElement>("[data-type]", phone);

  // Warm the destination photos after load so the trip opens with them in place.
  const warm = () => {
    for (const src of ["/assets/travel/template-paradise.jpg", "/assets/travel/template-collage.jpg"]) {
      const img = new Image();
      img.src = src;
    }
  };

  if (prefersReducedMotion) {
    phone.dataset.state = "trip";
    phone.classList.add("img-ready");
    return;
  }

  if (document.readyState === "complete") warm();
  else window.addEventListener("load", warm, { once: true });

  const g = gate(section, 0.2);
  const reset = () => {
    vals.forEach((v) => (v.textContent = ""));
    fields.forEach((f) => f.classList.remove("is-focus"));
    phone.dataset.state = "signin";
  };
  reset();

  const type = async (field: HTMLElement, el: HTMLElement, text: string, speed: number) => {
    fields.forEach((f) => f.classList.toggle("is-focus", f === field));
    await g.wait(260);
    for (let i = 1; i <= text.length; i++) {
      el.textContent = text.slice(0, i);
      await g.wait(speed + Math.random() * 50);
    }
  };

  (async () => {
    for (;;) {
      await g.wait(900);
      await type(fields[0], vals[0], vals[0].dataset.type ?? "", 105);
      await g.wait(240);
      await type(fields[1], vals[1], vals[1].dataset.type ?? "", 125);
      fields.forEach((f) => f.classList.remove("is-focus"));
      phone.dataset.state = "ready";
      await g.wait(520);
      phone.dataset.state = "press";
      await g.wait(200);
      phone.classList.add("img-ready");
      phone.dataset.state = "trip";
      await g.wait(5600);
      reset();
    }
  })();
}

/* ───────── Brand: company banner vs logo on images ───────── */

function initBrand() {
  const phone = $("[data-brand-phone]");
  const buttons = $$<HTMLButtonElement>("[data-brand-mode]");
  if (!phone || !buttons.length) return;
  let userChose = false;
  const set = (mode: string) => {
    phone.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.brandMode === mode)));
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      userChose = true;
      set(b.dataset.brandMode ?? "banner");
    }),
  );
  if (prefersReducedMotion) return;
  const g = gate(phone, 0.4);
  (async () => {
    for (;;) {
      await g.wait(3600);
      if (userChose) return;
      set(phone.dataset.mode === "banner" ? "overlay" : "banner");
    }
  })();
}

/* ───────── On the road: one sticky phone swaps screens as the steps scroll by ───────── */

function initRoad() {
  const grid = $("[data-road]");
  const screen = $("[data-road-screen]");
  const dots = $("[data-road-dots]");
  if (!grid || !screen || !dots) return;
  const steps = $$<HTMLElement>(".step", grid);
  const layers: HTMLElement[] = [];
  const dotEls: HTMLElement[] = [];

  steps.forEach((step) => {
    const src = $(".step__phone .phone__screen", step);
    const layer = document.createElement("div");
    layer.className = "road__layer";
    if (src) layer.append(...[...src.children].map((c) => c.cloneNode(true)));
    screen.append(layer);
    layers.push(layer);
    const dot = document.createElement("li");
    dots.append(dot);
    dotEls.push(dot);
  });

  let active = -1;
  const activate = (i: number) => {
    if (i === active) return;
    active = i;
    steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
    layers.forEach((l, j) => l.classList.toggle("is-active", j === i));
    dotEls.forEach((d, j) => d.classList.toggle("is-active", j === i));
  };
  activate(0);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) activate(steps.indexOf(e.target as HTMLElement));
    },
    { rootMargin: "-48% 0px -48% 0px" },
  );
  steps.forEach((s) => io.observe(s));

  const section = $(".road");
  if (section) gate(section, 0);
}

/* Currency converter: cycles a few amounts at the live rate while visible */
function initFx() {
  const section = $(".road");
  if (!section || prefersReducedMotion) return;
  const rate = 10640;
  const amounts = [150000, 85000, 420000, 150000];
  const g = gate(section, 0);
  let i = 0;
  (async () => {
    for (;;) {
      await g.wait(2600);
      i = (i + 1) % amounts.length;
      const idr = amounts[i];
      const aud = (idr / rate).toFixed(2);
      $$<HTMLElement>(".fx").forEach((fx) => {
        const a = $("[data-fx='idr']", fx);
        const b = $("[data-fx='aud']", fx);
        if (!a || !b) return;
        a.textContent = idr.toLocaleString("en-AU");
        b.textContent = aud;
        for (const el of [a, b]) {
          el.classList.remove("is-tick");
          void el.offsetWidth;
          el.classList.add("is-tick");
        }
      });
    }
  })();
}

/* ───────── Import: right-click → upload PDF / paste → segments + price table ───────── */

function initEditor() {
  const ed = $("[data-ed]");
  const buttons = $$<HTMLButtonElement>("[data-ed-mode]");
  const total = $("[data-ed-total]");
  if (!ed) return;

  let run = 0;
  let locked = false;
  const setMode = (mode: string) => {
    ed.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.edMode === mode)));
  };

  const count = (to: number, ms: number) => {
    if (!total) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      total.textContent = Math.round(to * eased).toLocaleString("en-AU");
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (prefersReducedMotion) {
    ed.dataset.stage = "6";
    buttons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.edMode ?? "pdf")));
    return;
  }

  const g = gate(ed, 0.3);
  const loop = async (id: number) => {
    const stage = (n: number) => {
      if (id === run) ed.dataset.stage = String(n);
    };
    const step = async (n: number, ms: number) => {
      if (id !== run) return false;
      stage(n);
      await g.wait(ms);
      return id === run;
    };
    for (;;) {
      if (!(await step(0, 900))) return;
      if (!(await step(1, 850))) return;
      if (!(await step(2, 700))) return;
      if (!(await step(3, 950))) return;
      if (!(await step(4, 1700))) return;
      if (!(await step(5, 1300))) return;
      stage(6);
      count(6240, 900);
      await g.wait(4800);
      if (id !== run) return;
      if (!locked) setMode(ed.dataset.mode === "pdf" ? "paste" : "pdf");
    }
  };

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      locked = true;
      setMode(b.dataset.edMode ?? "pdf");
      run++;
      void loop(run);
    }),
  );
  ed.dataset.stage = "0";
  void loop(run);
}

/* ───────── Personalise: segment tabs (keyboard tablist), auto-advances until touched ───────── */

function initPersonalise() {
  const root = $("[data-pz]");
  if (!root) return;
  const tabs = $$<HTMLButtonElement>("[role='tab']", root);
  const panels = $$<HTMLElement>("[role='tabpanel']", root);
  const chips = $$<HTMLElement>(".pz__palette span", root);
  // Which palette chips (Image, Video, Travel guide, Text) each segment uses
  const used = [[3], [0, 3], [0, 1, 3], [2, 3]];
  let current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  let touched = false;

  const select = (i: number, focus = false) => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, j) => {
      const on = j === current;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[j].hidden = !on;
      panels[j].classList.remove("is-in");
    });
    const panel = panels[current];
    if (!prefersReducedMotion) {
      void panel.offsetWidth;
      panel.classList.add("is-in");
    }
    chips.forEach((c, k) => c.classList.toggle("is-used", used[current].includes(k)));
    if (focus) tabs[current].focus();
  };

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      touched = true;
      select(i);
    });
    t.addEventListener("keydown", (e) => {
      const map: Record<string, number> = {
        ArrowRight: current + 1,
        ArrowDown: current + 1,
        ArrowLeft: current - 1,
        ArrowUp: current - 1,
        Home: 0,
        End: tabs.length - 1,
      };
      if (e.key in map) {
        e.preventDefault();
        touched = true;
        select(map[e.key], true);
      }
    });
  });
  root.addEventListener("focusin", () => (touched = true));
  select(current < 0 ? 0 : current);

  if (prefersReducedMotion) return;
  const g = gate(root, 0.35);
  (async () => {
    for (;;) {
      await g.wait(3800);
      if (touched) return;
      select(current + 1);
    }
  })();
}

/* ───────── Preview: edit → preview → share → link copied ───────── */

function initPreview() {
  const pv = $("[data-pv]");
  if (!pv || prefersReducedMotion) return;
  const g = gate(pv, 0.3);
  pv.dataset.stage = "0";
  (async () => {
    for (;;) {
      await g.wait(1700);
      pv.dataset.stage = "1";
      await g.wait(1800);
      pv.dataset.stage = "2";
      await g.wait(1500);
      pv.dataset.stage = "3";
      await g.wait(2600);
      pv.dataset.stage = "0";
    }
  })();
}

/* ───────── Sticky mobile CTA: after the hero CTAs scroll away, until the closing CTA ───────── */

function initSticky() {
  const bar = $("[data-sticky-cta]");
  const heroCtas = $(".hero__ctas");
  if (!bar || !heroCtas) return;
  const ends = [$("[data-closing]"), $(".qc-footer")].filter((el): el is HTMLElement => !!el);
  let pastHero = false;
  const endVisible = new Set<Element>();
  const update = () => {
    const on = pastHero && endVisible.size === 0;
    bar.classList.toggle("is-on", on);
    bar.toggleAttribute("inert", !on);
  };
  new IntersectionObserver(([e]) => {
    pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
    update();
  }).observe(heroCtas);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) endVisible.add(e.target);
      else endVisible.delete(e.target);
    }
    update();
  });
  ends.forEach((el) => io.observe(el));
  update();
}

initHero();
initBrand();
initRoad();
initFx();
initEditor();
initPersonalise();
initPreview();
initSticky();
