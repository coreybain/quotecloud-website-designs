import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";
import { initHero, money, tweenMoney } from "./hero.ts";

const reduced = prefersReducedMotion;

initHero(reduced);

/* ── Liveness: loops only run while their block is on screen ── */

type LiveHook = (live: boolean) => void;
const hooks = new Map<Element, LiveHook[]>();
const liveIO = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      const live = en.isIntersecting;
      en.target.classList.toggle("is-live", live);
      hooks.get(en.target)?.forEach((h) => h(live));
    }),
  { threshold: 0.2 },
);
function watch(el: Element, hook?: LiveHook) {
  if (hook) hooks.set(el, [...(hooks.get(el) ?? []), hook]);
  liveIO.observe(el);
}
document.querySelectorAll(".card, [data-sync], .hub, .close__panel").forEach((el) => watch(el));

/* ── Step sequencer for the bento visuals ── */

function initSeq(el: HTMLElement) {
  const n = Number(el.dataset.seq);
  const ms = Number(el.dataset.seqMs ?? 1200);
  const hold = Number(el.dataset.seqHold ?? 2400);
  const cycle = el.dataset.seqMode === "cur";
  const items = [...el.querySelectorAll<HTMLElement>("[data-at]")];
  const srcTabs = [...el.querySelectorAll<HTMLElement>("[data-src]")];
  let step = cycle ? 1 : 0;
  let loops = 0;
  let timer = 0;

  const typed = items.filter((it) => it.hasAttribute("data-type"));
  const full = new Map(typed.map((it) => [it, it.textContent ?? ""]));
  let typeTimer = 0;
  const type = (it: HTMLElement, text: string, i = 0) => {
    it.textContent = text.slice(0, i);
    if (i < text.length) typeTimer = window.setTimeout(() => type(it, text, i + 1), 26);
  };

  const apply = () =>
    items.forEach((it) => {
      const k = Number(it.dataset.at);
      const wasOn = it.classList.contains("is-on");
      it.classList.toggle("is-on", k <= step);
      it.classList.toggle("is-cur", k === step);
      if (full.has(it)) {
        if (k === step && !wasOn) {
          clearTimeout(typeTimer);
          type(it, full.get(it)!);
        } else if (k > step) it.textContent = "";
      }
    });

  const tick = () => {
    if (cycle) step = (step % n) + 1;
    else if (step >= n) {
      step = 0;
      loops++;
      srcTabs.forEach((s, i) => s.classList.toggle("is-on", i === loops % srcTabs.length));
    } else step++;
    apply();
    const delay = !cycle && step === n ? ms + hold : !cycle && step === 0 ? 500 : ms;
    timer = window.setTimeout(tick, delay);
  };

  const card = el.closest(".card") ?? el;
  watch(card, (live) => {
    clearTimeout(timer);
    if (!live) return;
    if (!el.classList.contains("seq-run")) {
      el.classList.add("seq-run");
      apply();
    }
    timer = window.setTimeout(tick, cycle ? ms : 350);
  });
}
if (!reduced) document.querySelectorAll<HTMLElement>("[data-seq]").forEach(initSeq);

/* ── Live trip cost (real checkboxes) ── */

function initCost(root: HTMLElement) {
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const out = root.querySelector<HTMLOutputElement>("[data-cost-total]");
  if (!out) return;
  const BASE = 8240;
  let shown = BASE;
  const total = () => boxes.reduce((s, b) => s + (b.checked ? Number(b.value) : 0), BASE);

  const update = () => {
    const next = total();
    if (reduced) out.textContent = money(next);
    else {
      tweenMoney([out], shown, next, 550);
      out.classList.remove("is-bump");
      void out.offsetWidth;
      out.classList.add("is-bump");
    }
    shown = next;
  };
  boxes.forEach((b) => b.addEventListener("change", update));

  if (reduced) return;
  // A gentle demo until the visitor takes over
  const script = [0, 1, 0, 2, 1, 2];
  let i = 0;
  let timer = 0;
  let owned = false;
  const takeOver = () => {
    owned = true;
    clearTimeout(timer);
  };
  root.addEventListener("pointerdown", takeOver);
  root.addEventListener("keydown", takeOver);
  root.addEventListener("focusin", takeOver);

  const demo = () => {
    if (owned) return;
    const b = boxes[script[i % script.length]];
    i++;
    b.checked = !b.checked;
    update();
    timer = window.setTimeout(demo, 1900);
  };
  watch(root.closest(".card") ?? root, (live) => {
    clearTimeout(timer);
    if (live && !owned) timer = window.setTimeout(demo, 1200);
  });
}
document.querySelectorAll<HTMLElement>("[data-cost]").forEach(initCost);

/* ── Slim sticky CTA on small screens ── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>(".sticky-cta");
  const heroCtas = document.querySelector(".hero__ctas");
  if (!bar || !heroCtas) return;
  bar.hidden = false;
  let pastHero = false;
  let nearEnd = false;
  const sync = () => bar.classList.toggle("is-on", pastHero && !nearEnd);
  new IntersectionObserver(([en]) => {
    pastHero = !en.isIntersecting && en.boundingClientRect.top < 0;
    sync();
  }).observe(heroCtas);
  const ends = [document.querySelector(".close__panel"), document.querySelector("footer")].filter(Boolean) as Element[];
  const seen = new Set<Element>();
  const endIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
    nearEnd = seen.size > 0;
    sync();
  });
  ends.forEach((e) => endIO.observe(e));
}
initSticky();
