import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Toggles `cls` on `el` while `target` is on screen (used to pause loops offscreen). */
function whileVisible(target: Element, onChange: (visible: boolean) => void, threshold = 0.25) {
  if (!("IntersectionObserver" in window)) return onChange(true);
  new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), { threshold }).observe(target);
}

/* ───────── Hero: SYD → DPS arc draws, plane flies it once ───────── */

function initHeroArc() {
  const map = $(".hmap");
  const arc = $<SVGPathElement>(".hmap__arc");
  const plane = $(".hmap__plane");
  if (!map || !arc || !plane) return;

  whileVisible(map, (v) => map.classList.toggle("is-paused", !v), 0);

  const len = arc.getTotalLength();
  const place = (t: number) => {
    const p = arc.getPointAtLength(len * t);
    const q = arc.getPointAtLength(Math.min(len, len * t + 2));
    const r = t >= 0.999 ? arc.getPointAtLength(len * t - 2) : p;
    const angle = t >= 0.999 ? Math.atan2(p.y - r.y, p.x - r.x) : Math.atan2(q.y - p.y, q.x - p.x);
    plane.style.left = `${(p.x / 960) * 100}%`;
    plane.style.top = `${(p.y / 600) * 100}%`;
    plane.style.transform = `rotate(${(angle * 180) / Math.PI + 90}deg)`;
  };

  if (prefersReducedMotion) {
    map.classList.add("is-flying", "is-arrived");
    return;
  }

  const delay = 500;
  const duration = 2200;
  let start = 0;
  const frame = (now: number) => {
    if (!start) start = now;
    const t = Math.min(1, Math.max(0, (now - start - delay) / duration));
    if (t > 0 && !plane.classList.contains("is-on") && t < 1) {
      plane.classList.add("is-on");
      map.classList.add("is-flying");
    }
    place(easeInOut(t));
    if (t < 1) requestAnimationFrame(frame);
    else {
      map.classList.add("is-arrived");
      window.setTimeout(() => plane.classList.remove("is-on"), 250);
    }
  };
  requestAnimationFrame(frame);
}

/* ───────── The route: one path through every [data-route] anchor ───────── */

type Run = { x: number; y1: number; y2: number };

function initRoute() {
  const main = $("#main");
  const svg = $<SVGSVGElement>(".route");
  const track = $<SVGPathElement>(".route__track");
  const flown = $<SVGPathElement>(".route__flown");
  const plane = $(".route-plane");
  const finale = $(".finale");
  if (!main || !svg || !track || !flown || !plane) return;

  const anchors = $$("[data-route]", main);
  const stops = $$("[data-stop]", main);

  let total = 0;
  let xs = new Float32Array(0);
  let ys = new Float32Array(0);
  let step = 4;
  let mainTop = 0;
  let stopLens: number[] = [];
  let cur = 0;
  let target = 0;
  let raf = 0;
  let built = false;

  const measure = (): Run[] => {
    const m = main.getBoundingClientRect();
    return anchors.map((el) => {
      const r = el.getBoundingClientRect();
      const ref = el.querySelector("[data-route-x]");
      let x: number;
      if (ref) {
        const n = ref.getBoundingClientRect();
        x = n.left + n.width / 2 - m.left;
      } else {
        const v = getComputedStyle(el).getPropertyValue("--route-x").trim();
        const off = v.endsWith("%") ? (r.width * parseFloat(v)) / 100 : parseFloat(v) || 0;
        x = r.left - m.left + off;
      }
      const kind = el.dataset.routeKind;
      let y1 = r.top - m.top;
      let y2 = r.bottom - m.top;
      if (kind === "start") y1 = y2;
      if (kind === "end") y1 = y2 = r.top - m.top + r.height / 2;
      return { x: Math.round(x * 10) / 10, y1, y2 };
    });
  };

  const pathFrom = (runs: Run[]) => {
    let prev = runs[0];
    let d = `M${prev.x} ${prev.y1}`;
    if (prev.y2 > prev.y1) d += `L${prev.x} ${prev.y2}`;
    for (const run of runs.slice(1)) {
      const y1 = Math.max(run.y1, prev.y2);
      if (Math.abs(run.x - prev.x) < 0.5) d += `L${run.x} ${y1}`;
      else {
        const k = (y1 - prev.y2) * 0.5;
        d += `C${prev.x} ${prev.y2 + k} ${run.x} ${y1 - k} ${run.x} ${y1}`;
      }
      if (run.y2 > y1) d += `L${run.x} ${run.y2}`;
      prev = { x: run.x, y1, y2: Math.max(run.y2, y1) };
    }
    return d;
  };

  /** Path length at which the route reaches document-relative y (route is monotonic in y). */
  const lenAtY = (y: number) => {
    const n = ys.length;
    if (!n) return 0;
    if (y <= ys[0]) return 0;
    if (y >= ys[n - 1]) return total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ys[mid] < y) lo = mid + 1;
      else hi = mid;
    }
    const y0 = ys[lo - 1];
    const y1 = ys[lo];
    const f = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
    return Math.min(total, (lo - 1 + f) * step);
  };

  const pointAt = (l: number) => {
    const i = Math.max(0, Math.min(xs.length - 1, l / step));
    const a = Math.floor(i);
    const b = Math.min(xs.length - 1, a + 1);
    const f = i - a;
    return { x: xs[a] + (xs[b] - xs[a]) * f, y: ys[a] + (ys[b] - ys[a]) * f };
  };

  const build = () => {
    const w = main.offsetWidth;
    const h = main.offsetHeight;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const d = pathFrom(measure());
    track.setAttribute("d", d);
    flown.setAttribute("d", d);
    total = flown.getTotalLength();
    step = Math.max(3, total / 2500);
    const n = Math.ceil(total / step) + 1;
    xs = new Float32Array(n);
    ys = new Float32Array(n);
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = flown.getPointAtLength(Math.min(total, i * step));
      xs[i] = p.x;
      maxY = Math.max(maxY, p.y); // guard tiny float dips so binary search stays valid
      ys[i] = maxY;
    }
    flown.style.strokeDasharray = `${total} ${total + 10}`;
    mainTop = main.getBoundingClientRect().top + window.scrollY;
    stopLens = stops.map((s) => {
      const node = $(".stop__node", s);
      if (!node) return 0;
      const r = node.getBoundingClientRect();
      return lenAtY(r.top + r.height / 2 + window.scrollY - mainTop);
    });
    built = true;
    if (prefersReducedMotion) cur = target = total;
    else {
      computeTarget();
      cur = target;
    }
    render();
  };

  const computeTarget = () => {
    const y = window.scrollY + window.innerHeight * 0.58 - mainTop;
    target = lenAtY(y);
  };

  const render = () => {
    if (!built) return;
    flown.style.strokeDashoffset = String(total - cur);
    const p = pointAt(cur);
    const a = pointAt(Math.max(0, cur - 6));
    const b = pointAt(Math.min(total, cur + 6));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    plane.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg)`;
    plane.classList.add("is-on");
    const landed = cur >= total - 2;
    plane.classList.toggle("is-landed", landed);
    if (landed) finale?.classList.add("is-landed");
    stops.forEach((s, i) => s.classList.toggle("is-passed", cur >= stopLens[i] - 1));
  };

  const tick = () => {
    const delta = target - cur;
    cur = Math.abs(delta) < 0.5 ? target : cur + delta * 0.14;
    render();
    raf = cur === target ? 0 : requestAnimationFrame(tick);
  };

  const onScroll = () => {
    if (!built || prefersReducedMotion) return;
    computeTarget();
    if (!raf) raf = requestAnimationFrame(tick);
  };

  let resizeTimer = 0;
  const schedule = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 120);
  };

  build();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("load", schedule);
  document.fonts?.ready.then(schedule);
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(main);
  else addEventListener("resize", schedule);
}

/* ───────── Stop reveals: text and visuals animate when they enter view ───────── */

function initStops() {
  const stops = $$("[data-stop]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    stops.forEach((s) => s.classList.add("is-seen", "is-reached"));
    return;
  }
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.closest(".stop")?.classList.add("is-seen");
        seen.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
  );
  const reached = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const stop = e.target.closest<HTMLElement>(".stop");
        stop?.classList.add("is-reached");
        stop?.dispatchEvent(new CustomEvent("stop:reached"));
        reached.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.35 },
  );
  stops.forEach((s) => {
    const text = $(".stop__text", s);
    const vis = $(".stop__visual", s);
    if (text) seen.observe(text);
    if (vis) reached.observe(vis);
  });
}

/* ───────── 03 Brand: template switcher (radiogroup, auto-cycles while visible) ───────── */

function initBrand() {
  const wrap = $("[data-brand]");
  if (!wrap) return;
  const covers = $$("[data-brand-cover]", wrap);
  const picks = $$<HTMLButtonElement>("[data-brand-pick]", wrap);
  const name = $(".brd__name", wrap);
  const names = ["Paradise", "Travel agency", "African journey"];
  let active = 0;
  let manual = false;
  let timer = 0;

  const set = (i: number, focus = false) => {
    active = (i + covers.length) % covers.length;
    covers.forEach((c, idx) => (c.dataset.pos = String((idx - active + covers.length) % covers.length)));
    picks.forEach((p, idx) => {
      const on = idx === active;
      p.setAttribute("aria-checked", String(on));
      p.tabIndex = on ? 0 : -1;
      if (on && focus) p.focus();
    });
    const pick = picks[active];
    wrap.style.setProperty("--brand-a", pick.style.getPropertyValue("--a"));
    wrap.style.setProperty("--brand-b", pick.style.getPropertyValue("--b"));
    if (name) name.textContent = names[active];
  };

  picks.forEach((p, idx) => {
    p.addEventListener("click", () => {
      manual = true;
      set(idx);
    });
    p.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      manual = true;
      set(active + dir, true);
    });
  });
  covers.forEach((c) =>
    c.addEventListener("click", () => {
      manual = true;
      set(Number(c.dataset.brandCover));
    }),
  );

  set(0);
  if (prefersReducedMotion) return;
  whileVisible(
    wrap,
    (v) => {
      window.clearInterval(timer);
      if (v && !manual) timer = window.setInterval(() => (manual ? window.clearInterval(timer) : set(active + 1)), 3400);
    },
    0.4,
  );
}

/* ───────── 04 Price: optional upgrades update the total ───────── */

function initPrice() {
  const wrap = $("[data-price]");
  if (!wrap) return;
  const base = 4550;
  const switches = $$<HTMLButtonElement>("[data-price-add]", wrap);
  const totalEl = $("[data-price-total]", wrap);
  let shown = base;
  let anim = 0;
  let touched = false;

  const tweenTo = (to: number) => {
    cancelAnimationFrame(anim);
    if (!totalEl) return;
    if (prefersReducedMotion) {
      shown = to;
      totalEl.textContent = money(to);
      return;
    }
    const from = shown;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 700);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      totalEl.textContent = money(shown);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const update = () =>
    tweenTo(base + switches.reduce((sum, s) => sum + (s.getAttribute("aria-checked") === "true" ? Number(s.dataset.priceAdd) : 0), 0));

  switches.forEach((s) =>
    s.addEventListener("click", () => {
      touched = true;
      s.setAttribute("aria-checked", String(s.getAttribute("aria-checked") !== "true"));
      wrap.classList.remove("is-toast");
      update();
    }),
  );

  wrap.closest(".stop")?.addEventListener("stop:reached", () => {
    const demo = $<HTMLButtonElement>("[data-price-demo]", wrap);
    if (!demo) return;
    window.setTimeout(() => {
      if (touched) return;
      demo.setAttribute("aria-checked", "true");
      update();
      wrap.classList.add("is-toast");
      window.setTimeout(() => wrap.classList.remove("is-toast"), 3600);
    }, 1100);
  });
}

/* ───────── 06 Travel: live flight status cycles on the lock screen ───────── */

function initLive() {
  const wrap = $("[data-live]");
  if (!wrap) return;
  const live = $(".live", wrap);
  const bar = $("[data-live-bar]", wrap);
  const msg = $(".live__msg", wrap);
  const title = $("[data-live-title]", wrap);
  const sub = $("[data-live-sub]", wrap);
  const state = $("[data-live-state]", wrap);
  const gate = $(".live__gate", wrap);
  const times = $$("[data-live-time]", wrap);
  if (!live || !bar || !title || !sub || !state) return;

  const states = [
    { time: "9:41", state: "On time", tone: "", title: "Boarding now", sub: "Gate closes in 24m", p: 0, gate: true },
    { time: "10:24", state: "Departed", tone: "dark", title: "Departed gate", sub: "Taxiing · take-off 10:34", p: 0.03, gate: true },
    { time: "11:52", state: "In the air", tone: "air", title: "Landing 13:31", sub: "9m early · 4h 39m to go", p: 0.24, gate: false },
  ];
  let i = 0;
  let timer = 0;
  const show = (n: number) => {
    const s = states[n];
    state.textContent = s.state;
    title.textContent = s.title;
    sub.textContent = s.sub;
    bar.dataset.tone = s.tone;
    live.style.setProperty("--p", String(s.p));
    times.forEach((t) => (t.textContent = s.time));
    if (gate) gate.hidden = !s.gate;
    if (msg) {
      msg.classList.remove("is-swap");
      void msg.offsetWidth;
      msg.classList.add("is-swap");
    }
  };
  show(0);
  if (prefersReducedMotion) return;
  whileVisible(
    wrap,
    (v) => {
      window.clearInterval(timer);
      if (v)
        timer = window.setInterval(() => {
          i = (i + 1) % states.length;
          show(i);
        }, 3200);
    },
    0.35,
  );
}

initHeroArc();
initStops();
initBrand();
initPrice();
initLive();
initRoute();
