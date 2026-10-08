import "../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../src/shared/site";

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/* ───────── Document windows are designed at 640×600 and scaled to their column ───────── */

function initFit() {
  const fits = $$(".dw-fit");
  if (!fits.length) return;
  const apply = (el: HTMLElement, width: number) => el.style.setProperty("--s", (width / 640).toFixed(4));
  if (!("ResizeObserver" in window)) {
    fits.forEach((el) => apply(el, el.clientWidth));
    return;
  }
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) apply(entry.target as HTMLElement, entry.contentRect.width);
  });
  fits.forEach((el) => ro.observe(el));
}

/* ───────── Counting totals ($31,086 → $34,826 when the optional row is toggled) ───────── */

const tweens = new WeakMap<HTMLElement, number>();
function tweenTotal(el: HTMLElement, from: number, to: number, delay: number, duration = 900) {
  window.clearTimeout(tweens.get(el));
  if (prefersReducedMotion) {
    el.textContent = money(to);
    return;
  }
  el.textContent = money(from);
  const id = window.setTimeout(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
  tweens.set(el, id);
}
function totalBounds(el: HTMLElement) {
  return { from: Number(el.dataset.totalFrom ?? 0), to: Number(el.dataset.totalTo ?? 0) };
}

/* ───────── Sticky story: scroll position → chapter → window state ───────── */

function initStory() {
  const story = document.querySelector<HTMLElement>("[data-story]");
  const win = document.querySelector<HTMLElement>(".dw[data-story-window]");
  if (!story || !win) return;

  const chapters = $$("[data-chapter]", story);
  const rails = $$<HTMLAnchorElement>("[data-rail]", story);
  const total = win.querySelector<HTMLElement>("[data-total]");
  const desktop = window.matchMedia("(min-width: 1024px)");
  let stage = -1;

  const setStage = (n: number) => {
    if (n === stage) return;
    const prev = stage;
    stage = n;
    for (let i = 1; i <= 6; i++) {
      win.classList.toggle(`past-${i}`, n >= i);
      win.classList.toggle(`at-${i}`, n === i);
    }
    rails.forEach((a) => {
      const k = Number(a.dataset.rail);
      a.classList.toggle("is-active", k === n);
      a.classList.toggle("is-done", k < n);
      if (k === n) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
    if (total) {
      const { from, to } = totalBounds(total);
      if (n === 2) {
        // table lands → total counts up; optional row toggles on at ~1.3s → total climbs again
        tweenTotal(total, prev < 2 ? 0 : from, from, 400, 700);
        window.setTimeout(() => stage === 2 && tweenTotal(total, from, to, 0, 800), 1350);
      } else {
        total.textContent = money(n < 2 ? from : to);
      }
    }
  };

  const update = () => {
    if (!desktop.matches) return;
    const line = window.innerHeight * 0.6;
    let n = 0;
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.top + r.height * 0.5 <= line) n = Number(ch.dataset.chapter);
    }
    setStage(n);
    const first = chapters[0].getBoundingClientRect();
    const last = chapters[chapters.length - 1].getBoundingClientRect();
    const a = first.top + first.height / 2;
    const b = last.top + last.height / 2;
    story.style.setProperty("--rail-p", clamp((line - a) / (b - a), 0, 1).toFixed(3));
  };

  let ticking = false;
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  desktop.addEventListener("change", schedule);
  update();

  // Only run cursor loops while the story is on screen.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => win.classList.toggle("is-live", e.isIntersecting)));
    io.observe(story);
  } else {
    win.classList.add("is-live");
  }
}

/* ───────── Stacked chapter cards (tablet / mobile): each mini visual plays once when seen ───────── */

function initMinis() {
  const minis = $$(".mini");
  if (!minis.length) return;
  const live = "IntersectionObserver" in window ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), { threshold: 0.2 }) : null;
  for (const mini of minis) {
    live?.observe(mini);
    onceVisible(
      mini,
      () => {
        mini.classList.add("is-on");
        const total = mini.querySelector<HTMLElement>("[data-total]");
        if (total) {
          const { from, to } = totalBounds(total);
          tweenTotal(total, 0, from, 700, 600);
          window.setTimeout(() => tweenTotal(total, from, to, 0, 800), 1300);
        }
      },
      0.45,
    );
  }
}

/* ───────── Bento: AI typewriter, integrations marquee, live gating ───────── */

function initBento() {
  const bento = document.querySelector<HTMLElement>(".bento");
  if (!bento) return;

  const typed = bento.querySelector<HTMLElement>("[data-type]");
  if (typed && !prefersReducedMotion) {
    const text = typed.dataset.type ?? typed.textContent ?? "";
    typed.textContent = "";
    onceVisible(typed, () => {
      typed.classList.add("is-typing");
      let i = 0;
      const step = () => {
        i += 1;
        typed.textContent = text.slice(0, i);
        if (i < text.length) window.setTimeout(step, text[i - 1] === "." ? 160 : 16);
        else typed.classList.remove("is-typing");
      };
      window.setTimeout(step, 400);
    }, 0.6);
  }

  if (!prefersReducedMotion) {
    for (const row of $$(".logos__row", bento)) {
      const clones = [...row.children].map((c) => c.cloneNode(true) as HTMLElement);
      clones.forEach((c) => {
        c.setAttribute("aria-hidden", "true");
        row.append(c);
      });
      row.classList.add("is-marquee");
    }
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => bento.classList.toggle("is-live", e.isIntersecting)), { threshold: 0.05 });
    io.observe(bento);
  } else {
    bento.classList.add("is-live");
  }
}

/* ───────── Slim mobile CTA: appears after the hero, hides near the closing CTA and footer ───────── */

function initMobileCta() {
  const bar = document.querySelector<HTMLElement>("[data-mcta]");
  const hero = document.querySelector<HTMLElement>(".hero");
  const close = document.querySelector<HTMLElement>(".close");
  const footer = document.querySelector<HTMLElement>(".qc-footer");
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  const mobile = window.matchMedia("(max-width: 767px)");
  let heroGone = false;
  let nearEnd = false;
  const render = () => {
    bar.hidden = !mobile.matches;
    bar.classList.toggle("is-shown", mobile.matches && heroGone && !nearEnd);
  };
  new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      heroGone = !e.isIntersecting && e.boundingClientRect.bottom < 0;
      render();
    },
    { threshold: 0 },
  ).observe(hero);
  const ends = [close, footer].filter((el): el is HTMLElement => !!el);
  const endIo = new IntersectionObserver(
    () => {
      nearEnd = ends.some((el) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      render();
    },
    { threshold: 0 },
  );
  ends.forEach((el) => endIo.observe(el));
  mobile.addEventListener("change", render);
  render();
}

initFit();
initStory();
initMinis();
initBento();
initMobileCta();
