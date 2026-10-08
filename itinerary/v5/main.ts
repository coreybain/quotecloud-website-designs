import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ─────────────────────────────────────────────────────────────
   1. The thread: one continuous line from the booking ticket
      through every stage node, drawn to the reader's scroll.
   ───────────────────────────────────────────────────────────── */

type Pt = { x: number; y: number; el: Element };

/** Position of an element's box relative to `root`, ignoring CSS transforms (reveal offsets). */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function initThread() {
  const journey = document.querySelector<HTMLElement>("[data-journey]");
  const svg = journey?.querySelector<SVGSVGElement>(".thread");
  if (!journey || !svg) return;
  const track = svg.querySelector<SVGPathElement>(".thread__track")!;
  const line = svg.querySelector<SVGPathElement>(".thread__line")!;
  const head = svg.querySelector<SVGCircleElement>(".thread__head")!;
  const halo = svg.querySelector<SVGCircleElement>(".thread__halo")!;
  const grad = svg.querySelector<SVGLinearGradientElement>("linearGradient");
  const nodes = Array.from(journey.querySelectorAll<HTMLElement>("[data-node]"));

  let total = 0;
  let lens: number[] = [];
  let ys: number[] = [];
  let pts: Pt[] = [];

  const build = () => {
    const w = journey.offsetWidth;
    const h = journey.offsetHeight;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    grad?.setAttribute("y2", String(h));

    pts = [];
    journey.querySelectorAll<HTMLElement>("[data-thread-start], [data-node]").forEach((el) => {
      if (!el.offsetParent) return; // not rendered
      const o = offsetIn(el, journey);
      const start = el.hasAttribute("data-thread-start");
      pts.push({
        x: o.x + el.offsetWidth / 2,
        y: start ? o.y + el.offsetHeight : o.y + el.offsetHeight / 2,
        el,
      });
    });
    if (pts.length < 2) return;

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(a.x - b.x) < 1) {
        d += ` L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        continue;
      }
      // Run straight down to the bottom of A's block, then ease across to B.
      const block = a.el.closest<HTMLElement>(".stage__inner, .hero__inner, .td__text");
      let y0 = block ? offsetIn(block, journey).y + block.offsetHeight : a.y;
      y0 = Math.max(a.y, Math.min(y0, b.y - 80));
      const k = (b.y - y0) * 0.55;
      if (y0 > a.y) d += ` L ${a.x.toFixed(1)} ${y0.toFixed(1)}`;
      d += ` C ${a.x.toFixed(1)} ${(y0 + k).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    track.setAttribute("d", d);
    line.setAttribute("d", d);

    total = line.getTotalLength();
    lens = [];
    ys = [];
    const step = 8;
    for (let l = 0; l <= total; l += step) {
      lens.push(l);
      ys.push(line.getPointAtLength(l).y);
    }
    lens.push(total);
    ys.push(line.getPointAtLength(total).y);
    line.style.strokeDasharray = `${total} ${total}`;
    update();
  };

  const lengthAtY = (y: number) => {
    if (!ys.length) return 0;
    if (y <= ys[0]) return 0;
    if (y >= ys[ys.length - 1]) return total;
    let lo = 0;
    let hi = ys.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ys[mid] < y) lo = mid;
      else hi = mid;
    }
    const span = ys[hi] - ys[lo] || 1;
    return lens[lo] + ((y - ys[lo]) / span) * (lens[hi] - lens[lo]);
  };

  const update = () => {
    if (!total) return;
    const top = journey.getBoundingClientRect().top;
    const target = prefersReducedMotion ? Infinity : innerHeight * 0.62 - top;
    const l = lengthAtY(target);
    line.style.strokeDashoffset = String(total - l);
    const p = line.getPointAtLength(l);
    for (const c of [head, halo]) {
      c.setAttribute("cx", p.x.toFixed(1));
      c.setAttribute("cy", p.y.toFixed(1));
    }
    const atEnd = l >= total - 1;
    head.style.opacity = halo.style.opacity = l < 2 || atEnd ? "0" : "1";
    nodes.forEach((n) => {
      const pt = pts.find((q) => q.el === n);
      n.classList.toggle("is-reached", !!pt && pt.y <= target + 1);
    });
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };

  let resizeQueued = 0;
  const rebuild = () => {
    cancelAnimationFrame(resizeQueued);
    resizeQueued = requestAnimationFrame(build);
  };

  build();
  if (!prefersReducedMotion) {
    addEventListener("scroll", onScroll, { passive: true });
  }
  addEventListener("resize", rebuild);
  addEventListener("load", rebuild);
  document.fonts?.ready.then(rebuild);
  if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(journey);
}

/* ─────────────────────────────────────────────────────────────
   2. Hero ticket: the booking steps through its five stops.
      Loops only while visible; static (all lit) for reduced motion.
   ───────────────────────────────────────────────────────────── */

function initTicket() {
  const ticket = document.querySelector<HTMLElement>(".ticket");
  const list = ticket?.querySelector<HTMLElement>(".ticket__stops");
  if (!ticket || !list || prefersReducedMotion) return;
  const stops = Array.from(list.children) as HTMLElement[];
  const last = stops.length - 1;
  let at = 0;
  let hold = 0;
  let timer = 0;

  const paint = () => {
    ticket.dataset.at = String(at);
    list.style.setProperty("--p", String(at / last));
    stops.forEach((li, i) => {
      li.classList.toggle("is-lit", i <= at);
      li.classList.toggle("is-now", i === at);
    });
  };
  const tick = () => {
    if (at < last) at++;
    else if (++hold > 2) {
      hold = 0;
      at = 0;
    }
    paint();
  };
  paint();

  const io = new IntersectionObserver(([e]) => {
    clearInterval(timer);
    if (e.isIntersecting) timer = window.setInterval(tick, 1100);
  });
  io.observe(ticket);
}

/* ─────────────────────────────────────────────────────────────
   3. One-shot scenes: add .is-on when a visual enters view.
   ───────────────────────────────────────────────────────────── */

function initPlay() {
  document.querySelectorAll<HTMLElement>("[data-play]").forEach((el) => {
    if (prefersReducedMotion) el.classList.add("is-on");
    else onceVisible(el, () => el.classList.add("is-on"), 0.35);
  });
}

/* ─────────────────────────────────────────────────────────────
   4. Stage 2 import demo: right-click → upload → segments + prices.
      Markup is the finished state; JS rewinds it and plays it through.
   ───────────────────────────────────────────────────────────── */

function initImportDemo() {
  const demo = document.querySelector<HTMLElement>("[data-import-demo]");
  if (!demo || prefersReducedMotion) return;
  const replay = demo.querySelector<HTMLButtonElement>("[data-replay]");
  const totalEl = demo.querySelector<HTMLElement>("[data-total]");
  const finalTotal = 6240;
  const timers: number[] = [];
  const steps: [string, number][] = [
    ["s1", 350],
    ["s2", 1250],
    ["s3", 1850],
    ["s4", 2600],
    ["s5", 4200],
    ["s6", 4900],
    ["s7", 5800],
    ["s8", 7000],
  ];
  const fmt = (n: number) => Math.round(n).toLocaleString("en-AU");

  const countTotal = () => {
    if (!totalEl) return;
    const start = performance.now();
    const dur = 1000;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      totalEl.textContent = fmt(finalTotal * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  const run = () => {
    timers.splice(0).forEach(clearTimeout);
    demo.classList.remove(...steps.map(([s]) => s));
    demo.classList.add("armed");
    if (replay) replay.hidden = true;
    if (totalEl) totalEl.textContent = "0";
    steps.forEach(([cls, t]) => {
      timers.push(
        window.setTimeout(() => {
          demo.classList.add(cls);
          if (cls === "s7") countTotal();
          if (cls === "s8" && replay) replay.hidden = false;
        }, t),
      );
    });
  };

  replay?.addEventListener("click", run);
  onceVisible(demo, run, 0.45);
}

/* ─────────────────────────────────────────────────────────────
   5. Sticky mobile CTA: only while the hero CTAs, the closing CTA
      and the footer are all out of view.
   ───────────────────────────────────────────────────────────── */

function initStickyCta() {
  const bar = document.querySelector<HTMLElement>("[data-sticky-cta]");
  if (!bar || !("IntersectionObserver" in window)) return;
  const watched = [
    document.querySelector("[data-hero-ctas]"),
    document.querySelector("[data-closing]"),
    document.querySelector(".qc-footer"),
  ].filter((n): n is Element => !!n);
  const visible = new Set<Element>();
  const links = Array.from(bar.querySelectorAll<HTMLElement>("a"));

  const set = (show: boolean) => {
    bar.classList.toggle("is-shown", show);
    bar.setAttribute("aria-hidden", String(!show));
    links.forEach((a) => (a.tabIndex = show ? 0 : -1));
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    set(visible.size === 0 && scrollY > 200);
  });
  watched.forEach((n) => io.observe(n));
}

initThread();
initTicket();
initPlay();
initImportDemo();
initStickyCta();
