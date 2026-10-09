import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Loops run only while on screen; [data-live] wakes once ───────── */

function initLoops() {
  const loops = document.querySelectorAll<HTMLElement>("[data-loop]");
  const lives = document.querySelectorAll<HTMLElement>("[data-live]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    lives.forEach((el) => el.classList.add("is-live"));
    return;
  }
  const loopIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-playing", e.isIntersecting)),
    { rootMargin: "80px 0px" },
  );
  loops.forEach((el) => loopIO.observe(el));
  const liveIO = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-live");
        liveIO.unobserve(e.target);
      }),
    { threshold: 0.35 },
  );
  lives.forEach((el) => liveIO.observe(el));
}

/** Duplicates the logo list so the marquee can loop seamlessly. */
function initMarquee() {
  if (prefersReducedMotion) return;
  const track = document.querySelector<HTMLElement>(".logos__track");
  if (!track) return;
  [...track.children].forEach((li) => {
    const copy = li.cloneNode(true) as HTMLElement;
    copy.setAttribute("aria-hidden", "true");
    copy.querySelector("img")?.setAttribute("alt", "");
    track.append(copy);
  });
}

/* ───────── The arc: a pinned, horizontally travelling proposal ───────── */

const STEPS = 7; // 0 quote · 1 problem · 2 solution · 3 value · 4 delivery · 5 investment · 6 client view

function initArc(arc: HTMLElement) {
  const stage = arc.querySelector<HTMLElement>("[data-arc-stage]")!;
  const rail = arc.querySelector<HTMLElement>(".arc__rail")!;
  const railFill = arc.querySelector<HTMLElement>(".arc__rail-fill")!;
  const links = [...arc.querySelectorAll<HTMLAnchorElement>("[data-go]")];
  const browser = arc.querySelector<HTMLElement>("[data-browser]")!;
  const thread = arc.querySelector<SVGSVGElement>("[data-arc-thread]")!;
  const threadBase = thread.querySelector<SVGPathElement>("[data-thread-base]")!;
  const threadLine = thread.querySelector<SVGPathElement>("[data-thread-line]")!;
  const threadNodes = thread.querySelector<SVGGElement>("[data-thread-nodes]")!;
  const chapters = [...arc.querySelectorAll<HTMLElement>(".ch[data-step]")];
  const chapter = (n: number) => chapters.find((c) => Number(c.dataset.step) === n)!;
  const pageOf = (n: number) => chapter(n).querySelector<HTMLElement>(":scope > .pgw, :scope > .ch__visual > .pgw")!;

  // Slot order of the finished proposal; the quote (step 5's page) starts alone in slot 0 and is pushed right.
  const story = [1, 2, 3, 4].map(pageOf);
  const quote = pageOf(5);
  const accept = pageOf(6);
  const all = [...story, quote, accept];

  const mq = window.matchMedia("(min-width: 901px) and (min-height: 640px)");
  let pinned = false;
  let step = 0;
  let stepLen = 0;
  let liveIO: IntersectionObserver | null = null;
  let g = { W: 0, H: 0, left: 0, deskTop: 0, deskH: 0, availH: 0, pw: 0, ph: 0, gap: 0, y: 0 };

  const header = () => document.querySelector<HTMLElement>("[data-qc-header]")?.offsetHeight ?? 64;

  function measure() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const copies = chapters.map((c) => c.querySelector<HTMLElement>(".ch__copy")!);
    const left = copies[0].offsetLeft;
    const copyBottom = Math.max(...copies.map((c) => c.offsetTop + c.offsetHeight));
    const railLow = rail.offsetTop > H / 2;
    const deskTop = copyBottom + 20;
    const deskBottom = railLow ? H - rail.offsetTop + 40 : 60;
    const deskH = Math.max(160, H - deskTop - deskBottom);
    const ph = Math.min(deskH - 8, 500);
    const pw = Math.min(ph / 1.414, W * 0.3, 340);
    const availH = H - deskTop - (railLow ? H - rail.offsetTop + 8 : 20);
    g = { W, H, left, deskTop, deskH, availH, pw, ph: pw * 1.414, gap: pw * 0.16, y: deskTop + (deskH - pw * 1.414) / 2 };
    stage.style.setProperty("--pw", `${pw}px`);
    stage.style.setProperty("--desk-top", `${deskTop}px`);
    stage.style.setProperty("--desk-bottom", `${deskBottom}px`);
    drawThread();
  }

  function drawThread() {
    const { pw, ph, gap, y } = g;
    const ty = y + ph + 30;
    const pts = Array.from({ length: 6 }, (_, i) => ({ x: i * (pw + gap) + pw / 2, y: ty }));
    let d = `M${pts[0].x} ${ty}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dy = i % 2 ? 12 : -12;
      d += ` C${a.x + (b.x - a.x) / 3} ${ty + dy} ${a.x + ((b.x - a.x) * 2) / 3} ${ty + dy} ${b.x} ${ty}`;
    }
    threadBase.setAttribute("d", d);
    threadLine.setAttribute("d", d);
    threadNodes.innerHTML = pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5"></circle>`).join("");
    thread.setAttribute("width", String(pts[5].x + pw));
    thread.setAttribute("height", String(ty + 20));
  }

  const place = (el: HTMLElement, x: number, y: number, s: number, opacity: number, pending = false) => {
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    el.style.opacity = String(opacity);
    el.classList.toggle("is-pending", pending);
  };

  function layout() {
    const { W, pw, ph, gap, y } = g;
    const slot = (i: number) => i * (pw + gap);

    if (step < 6) {
      const c = step === 0 ? 0 : step <= 4 ? step - 0.5 : 4;
      const off = W / 2 - (slot(c) + pw / 2);
      story.forEach((page, i) => {
        const added = step >= i + 1;
        const x = off + slot(i);
        if (added) place(page, x, y, 1, Math.abs(i - c) <= 0.6 ? 1 : 0.4);
        else place(page, x, y - ph * 0.16, 1.04, 0, true);
      });
      const q = Math.min(step, 4);
      place(quote, off + slot(q), y, 1, 1);
      place(accept, off + slot(5), y - ph * 0.16, 1.04, 0, true);

      thread.style.transform = `translate3d(${off.toFixed(1)}px, 0, 0)`;
      thread.style.opacity = "1";
      threadLine.style.strokeDashoffset = String(100 - (q / 5) * 100);
      [...threadNodes.children].forEach((n, i) => n.classList.toggle("is-on", i <= q));
      return;
    }

    // Step 6: the finished six pages zoom out into the client's browser.
    const navW = Math.round(Math.min(200, Math.max(160, W * 0.14)));
    const bar = 38;
    const pad = 22;
    const gg = 14;
    const availW = Math.min(W - 2 * g.left, 1080);
    const s = Math.min((g.availH - bar - 2 * pad - gg) / (2 * ph), (availW - navW - 2 * pad - 2 * gg) / (3 * pw));
    const gw = 3 * pw * s + 2 * gg;
    const gh = 2 * ph * s + gg;
    const bw = navW + 2 * pad + gw;
    const bh = bar + 2 * pad + gh;
    const bx = (W - bw) / 2;
    const by = g.deskTop + Math.max(0, (g.availH - bh) / 2);
    Object.assign(browser.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
    browser.style.setProperty("--nav-w", `${navW}px`);
    const gx = bx + navW + pad;
    const gy = by + bar + pad;
    all.forEach((page, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      place(page, gx + col * (pw * s + gg), gy + row * (ph * s + gg), s, 1);
    });
    thread.style.opacity = "0";
  }

  function setStep(n: number, force = false) {
    n = Math.max(0, Math.min(STEPS - 1, n));
    if (n === step && !force) return;
    step = n;
    chapters.forEach((c) => {
      const k = Number(c.dataset.step);
      c.classList.toggle("is-current", k === step);
      c.classList.toggle("is-live", k <= step && k > 0);
    });
    const chap = step >= 5 ? 4 : step - 1; // rail index
    links.forEach((a, i) => {
      if (i === chap) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
      a.classList.toggle("is-done", i < chap);
    });
    railFill.style.setProperty("--fill", String(step / (STEPS - 1)));
    layout();
  }

  // The step is read straight from scroll position, so jumping (anchor links, restored scroll,
  // a full-page capture) always lands on the right state rather than the last one seen.
  function sync() {
    if (!pinned || !stepLen) return;
    const s = header() - arc.getBoundingClientRect().top;
    setStep(Math.floor(s / stepLen));
  }

  function buildSteps() {
    stepLen = Math.round(window.innerHeight * 0.72);
    arc.style.height = `${stage.offsetHeight + STEPS * stepLen}px`;
  }

  function enterPinned() {
    pinned = true;
    liveIO?.disconnect();
    arc.classList.add("is-pinned");
    chapters.forEach((c) => c.classList.remove("is-live"));
    buildSteps();
    measure();
    setStep(step, true);
    sync();
  }

  function enterStacked() {
    pinned = false;
    arc.classList.remove("is-pinned");
    arc.style.height = "";
    [...all, browser].forEach((el) => el.removeAttribute("style"));
    thread.removeAttribute("style");
    chapters.forEach((c) => c.classList.remove("is-current"));
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      chapters.forEach((c) => c.classList.add("is-live"));
      return;
    }
    liveIO = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-live");
          liveIO?.unobserve(e.target);
        }),
      { threshold: 0.3 },
    );
    chapters.forEach((c) => liveIO!.observe(c));
  }

  const decide = () => {
    const want = mq.matches && !prefersReducedMotion && "IntersectionObserver" in window;
    if (want && !pinned) enterPinned();
    else if (!want && pinned) enterStacked();
    else if (want) {
      buildSteps();
      measure();
      setStep(step, true);
      sync();
    }
  };

  links.forEach((a) =>
    a.addEventListener("click", (event) => {
      if (!pinned) return;
      event.preventDefault();
      const k = Number(a.dataset.go);
      const top = arc.getBoundingClientRect().top + window.scrollY - header() + k * stepLen + stepLen * 0.35;
      window.scrollTo({ top, behavior: "smooth" });
    }),
  );

  enterStacked();
  decide();
  let raf = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (!pinned || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    },
    { passive: true },
  );
  let t = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(t);
    t = window.setTimeout(decide, 150);
  });
  document.fonts?.ready.then(() => pinned && (measure(), layout()));
}

initLoops();
initMarquee();
const arcEl = document.querySelector<HTMLElement>("[data-arc]");
if (arcEl) initArc(arcEl);
