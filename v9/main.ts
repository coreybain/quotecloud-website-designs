import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/* Toggle a class while an element is on screen (pauses loops offscreen). */
function whileVisible(els: Element[], className: string, invert = false, threshold = 0) {
  if (!("IntersectionObserver" in window) || !els.length) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle(className, invert ? !e.isIntersecting : e.isIntersecting)),
    { threshold, rootMargin: "80px 0px" },
  );
  els.forEach((el) => io.observe(el));
}

/* ───────── Aurora + looping visuals: pause offscreen ───────── */

whileVisible($$("[data-aurora]"), "is-paused", true);
whileVisible($$("[data-marquee]"), "is-paused", true);
whileVisible($$("[data-stage]"), "is-paused", true);
whileVisible($$("[data-viz]"), "is-visible", false, 0.2);

/* One-shot enter sequences */
{
  const vizs = $$("[data-viz]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    vizs.forEach((v) => v.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.35 },
    );
    vizs.forEach((v) => io.observe(v));
  }
}

/* ───────── Hero parallax (pointer on fine devices, scroll everywhere) ───────── */

function initHeroParallax() {
  const hero = $("[data-hero]");
  const stage = $("[data-stage]");
  if (!hero || !stage || prefersReducedMotion) return;

  let heroVisible = true;
  let mx = 0, my = 0, tx = 0, ty = 0, sy = 0, raf = 0;

  const apply = () => {
    raf = 0;
    mx += (tx - mx) * 0.12;
    my += (ty - my) * 0.12;
    stage.style.setProperty("--mx", mx.toFixed(3));
    stage.style.setProperty("--my", my.toFixed(3));
    stage.style.setProperty("--sy", sy.toFixed(1));
    if (Math.abs(tx - mx) > 0.002 || Math.abs(ty - my) > 0.002) raf = requestAnimationFrame(apply);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

  const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
  hero.addEventListener("pointermove", (e) => {
    if (!fine.matches) return;
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    schedule();
  });
  hero.addEventListener("pointerleave", () => { tx = 0; ty = 0; schedule(); });

  const onScroll = () => {
    if (!heroVisible) return;
    sy = Math.min(window.scrollY, 1200);
    schedule();
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { heroVisible = entries.some((e) => e.isIntersecting); }).observe(hero);
  }
  onScroll();
}
initHeroParallax();

/* ───────── Integrations marquee: duplicate tracks for a seamless loop ───────── */

if (!prefersReducedMotion) {
  $$("[data-row] .marquee__track").forEach((track) => {
    const items = [...track.children];
    items.forEach((li) => {
      const clone = li.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
  });
}

/* ───────── Interactive pricing table ───────── */

function initPricing() {
  const form = $<HTMLFormElement>("[data-price]");
  if (!form) return;

  const qtyOut = $<HTMLOutputElement>("[data-qty]", form)!;
  const unit = Number(qtyOut.dataset.qty);
  const qtyAmt = qtyOut.closest(".pt__row")!.querySelector<HTMLElement>("[data-amt]")!;
  const fixed = $$<HTMLElement>("[data-fixed]", form).reduce((s, el) => s + Number(el.dataset.fixed), 0);
  const opts = $$<HTMLInputElement>("[data-opt]", form);
  const out = {
    sub: $("[data-sub]", form)!,
    disc: $("[data-disc]", form)!,
    tax: $("[data-tax]", form)!,
    total: $("[data-total]", form)!,
  };
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const shown = new Map<HTMLElement, number>();
  const timers = new Map<HTMLElement, number>();

  const setNumber = (el: HTMLElement, value: number, prefix = "") => {
    const from = shown.get(el) ?? value;
    shown.set(el, value);
    if (prefersReducedMotion || from === value) {
      el.textContent = prefix + fmt(value);
      return;
    }
    window.cancelAnimationFrame(timers.get(el) ?? 0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + fmt(from + (value - from) * eased);
      if (t < 1) timers.set(el, requestAnimationFrame(tick));
    };
    timers.set(el, requestAnimationFrame(tick));
  };

  let qty = Number(qtyOut.textContent);
  const update = () => {
    qtyOut.textContent = String(qty);
    const line = qty * unit;
    setNumber(qtyAmt, line);
    opts.forEach((o) => o.closest(".pt__row")?.classList.toggle("is-on", o.checked));
    const optTotal = opts.reduce((s, o) => s + (o.checked ? Number(o.dataset.opt) : 0), 0);
    const sub = line + fixed + optTotal;
    const disc = sub * 0.05;
    const tax = (sub - disc) * 0.1;
    setNumber(out.sub, sub);
    setNumber(out.disc, disc, "−");
    setNumber(out.tax, tax);
    setNumber(out.total, sub - disc + tax);
    [qtyAmt, out.total].forEach((el) => {
      el.classList.remove("is-bump");
      void el.offsetWidth;
      el.classList.add("is-bump");
    });
  };

  let touched = false;
  $$<HTMLButtonElement>("[data-step]", form).forEach((b) =>
    b.addEventListener("click", () => {
      touched = true;
      qty = Math.max(1, Math.min(99, qty + Number(b.dataset.step)));
      update();
    }),
  );
  opts.forEach((o) => o.addEventListener("change", () => { touched = true; update(); }));
  update();
  [qtyAmt, out.sub, out.disc, out.tax, out.total].forEach((el) => el.classList.remove("is-bump"));

  // Gentle auto-demo once in view, unless the visitor is already playing.
  if (prefersReducedMotion) return;
  const demo = (fn: () => void, ms: number) => window.setTimeout(() => { if (!touched) fn(); }, ms);
  const start = () => {
    demo(() => { opts[0].checked = true; update(); }, 1100);
    demo(() => { qty += 2; update(); }, 2300);
    demo(() => { opts[1].checked = true; update(); }, 3400);
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        start();
      },
      { threshold: 0.5 },
    );
    io.observe(form);
  }
}
initPricing();

/* ───────── Sticky mobile CTA ───────── */

function initSticky() {
  const bar = $("[data-sticky]");
  const hero = $("[data-hero]");
  const close = $("[data-close]");
  const footer = $(".qc-footer");
  if (!bar || !hero || !close || !footer || !("IntersectionObserver" in window)) return;
  bar.hidden = false;
  let heroOut = false, endIn = false;
  const sync = () => bar.classList.toggle("is-on", heroOut && !endIn);
  new IntersectionObserver((e) => { heroOut = !e[0].isIntersecting; sync(); }, { rootMargin: "-120px 0px 0px" }).observe(hero);
  const endIo = new IntersectionObserver((entries) => {
    endIn = entries.some((e) => e.isIntersecting) || [close, footer].some((el) => el.getBoundingClientRect().top < window.innerHeight);
    sync();
  }, { threshold: 0 });
  endIo.observe(close);
  endIo.observe(footer);
}
initSticky();
