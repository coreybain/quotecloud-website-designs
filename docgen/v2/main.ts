import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── Sample data (illustrative product UI, not customers) ───────── */

type Client = {
  company: string;
  contact: string;
  rows: [string, number][];
};

const CARE_PLAN = 2400;
const CLIENTS: Client[] = [
  {
    company: "Harbour & Co.",
    contact: "Ava Chen",
    rows: [
      ["Discovery & strategy", 6400],
      ["Website design & build", 32000],
      ["Brand guidelines", 10200],
    ],
  },
  {
    company: "Kestrel Logistics",
    contact: "Marcus Webb",
    rows: [
      ["Discovery & strategy", 4800],
      ["Customer portal build", 27500],
      ["Brand guidelines", 8900],
    ],
  },
  {
    company: "Alder Health",
    contact: "Priya Nair",
    rows: [
      ["Discovery & strategy", 5200],
      ["Patient website build", 29800],
      ["Accessibility audit", 6400],
    ],
  },
  {
    company: "Bluegum Dental",
    contact: "Tom Riley",
    rows: [
      ["Discovery & strategy", 3900],
      ["Website design & build", 18600],
      ["Brand guidelines", 7300],
    ],
  },
];

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const totalFor = (c: Client, opt: boolean) => {
  const sub = c.rows.reduce((s, [, a]) => s + a, 0) + (opt ? CARE_PLAN : 0);
  return sub + Math.round(sub * 0.1);
};

/* ───────── Helpers ───────── */

/** Toggles [data-paused] on [data-loop] elements while off screen (CSS pauses their loops). */
function pauseOffscreen() {
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.toggleAttribute("data-paused", !e.isIntersecting);
  });
  document.querySelectorAll("[data-loop]").forEach((el) => io.observe(el));
}

/** Tracks whether an element is on screen. */
function visibility(el: Element) {
  const state = { on: true };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => entries.forEach((e) => (state.on = e.isIntersecting))).observe(el);
  }
  return state;
}

/** Sleep that only counts down while `gate.on` and the tab is visible. */
function pausableSleep(gate: { on: boolean }) {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        if (gate.on && !document.hidden) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else window.setTimeout(tick, Math.min(left, 120));
      };
      window.setTimeout(tick, Math.min(left, 120));
    });
}

const counters = new WeakMap<Element, number>();
/** Counts an element's text from one money value to another. */
function countMoney(el: Element, from: number, to: number, duration = 900, delay = 0) {
  cancelAnimationFrame(counters.get(el) ?? 0);
  if (prefersReducedMotion) {
    el.textContent = money(to);
    return;
  }
  el.textContent = money(from);
  const start = performance.now() + delay;
  const tick = (now: number) => {
    const t = Math.max(0, Math.min(1, (now - start) / duration));
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) counters.set(el, requestAnimationFrame(tick));
  };
  counters.set(el, requestAnimationFrame(tick));
}

/* ───────── The document component ───────── */

type DocEl = HTMLElement & { _client?: Client; _timer?: number };

function fill(doc: DocEl, client: Client, opt = false) {
  doc._client = client;
  const set = (f: string, v: string) => doc.querySelectorAll(`[data-f="${f}"]`).forEach((el) => (el.textContent = v));
  set("company", client.company);
  set("contact", client.contact);
  set("first", client.contact.split(" ")[0]);
  client.rows.forEach(([name, amount], i) => {
    set(`r${i + 1}`, name);
    set(`a${i + 1}`, money(amount));
  });
  set("a4", money(CARE_PLAN));
  set("total", money(totalFor(client, opt)));
  doc.toggleAttribute("data-opt", opt);
}

/** Sets the cumulative step flags. `label` overrides data-step (controls which annotation shows). */
function setStep(doc: HTMLElement, n: number, label?: string) {
  doc.dataset.step = label ?? String(n);
  for (let i = 1; i <= 6; i++) doc.toggleAttribute(`data-s${i}`, i <= n);
}

/** Moves a story document to step n, with the pricing extras (count-up, client toggles the optional item). */
function go(doc: DocEl, n: number) {
  const client = doc._client ?? CLIENTS[0];
  const prev = Number(doc.dataset.step) || 0;
  window.clearTimeout(doc._timer);
  if (n < 4) fill(doc, client, false);
  setStep(doc, n);
  if (n === 4 && prev < 4) {
    const totalEl = doc.querySelector(".doc__total [data-f='total']");
    if (totalEl) countMoney(totalEl, 0, totalFor(client, false), 1000, 600);
    if (prefersReducedMotion) return;
    doc._timer = window.setTimeout(() => {
      if (doc.dataset.step !== "4") return;
      doc.setAttribute("data-opt", "");
      const from = totalFor(client, false);
      const to = totalFor(client, true);
      doc.querySelectorAll("[data-f='total']").forEach((el) => countMoney(el, from, to, 700));
    }, 2350);
  }
}

const template = document.querySelector<HTMLElement>("[data-hero-doc] [data-doc]");

function cloneDoc(step: number, label?: string): DocEl {
  const doc = template!.cloneNode(true) as DocEl;
  fill(doc, CLIENTS[0]);
  setStep(doc, step, label);
  return doc;
}

/* ───────── Hero: the page is generated top to bottom, client after client ───────── */

function initHero(pristine: DocEl) {
  const host = document.querySelector<HTMLElement>("[data-hero-doc]");
  const visual = host?.closest<HTMLElement>(".hero__visual");
  const doc = host?.querySelector<DocEl>("[data-doc]");
  const page = doc?.querySelector<HTMLElement>(".doc__page");
  if (!host || !visual || !doc || !page || prefersReducedMotion) return;

  const ghost = pristine.cloneNode(true) as DocEl;
  setStep(ghost, 1, "ghost");
  ghost.classList.add("doc--ghost");
  host.insertBefore(ghost, doc);

  const scan = document.createElement("div");
  scan.className = "hero__scan";
  scan.append(document.createElement("span"));
  host.append(scan);

  const gate = visibility(visual);
  const sleep = pausableSleep(gate);
  const ease = "cubic-bezier(.45,.05,.3,1)";
  let i = 0;

  const run = async () => {
    for (;;) {
      const client = CLIENTS[i % CLIENTS.length];
      fill(doc, client);
      setStep(doc, 5, "sweep");
      page.getAnimations().forEach((a) => a.cancel());
      const reveal = page.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }], {
        duration: 2600,
        easing: ease,
        fill: "both",
      });
      scan.animate(
        [
          { transform: "translateY(0%)", opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.92 },
          { transform: "translateY(100%)", opacity: 0 },
        ],
        { duration: 2600, easing: ease },
      );
      await reveal.finished;
      await sleep(250);
      setStep(doc, 6);
      await sleep(5200);
      setStep(doc, 5, "sweep");
      visual.classList.add("is-shuffle");
      await page.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(-2.5%) scale(0.97)" },
        ],
        { duration: 650, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" },
      ).finished;
      reveal.cancel();
      visual.classList.remove("is-shuffle");
      i++;
      await sleep(200);
    }
  };
  // Start with the first sweep once the page has painted.
  window.setTimeout(run, 500);
}

/* ───────── Story: pinned document (desktop) or a document per step (smaller screens) ───────── */

function initStory() {
  const steps = [...document.querySelectorAll<HTMLElement>(".step")];
  const stage = document.querySelector<HTMLElement>("[data-stage-doc]");
  const stageWrap = document.querySelector<HTMLElement>(".stage");
  const dots = [...document.querySelectorAll<HTMLElement>(".rail__dot")];
  if (!steps.length || !stage || !stageWrap) return;

  const stageDoc = cloneDoc(1);
  stage.append(stageDoc);

  const activate = (n: number) => {
    if (stageDoc.dataset.step === String(n)) return;
    go(stageDoc, n);
    stageWrap.style.setProperty("--rail", String((n - 1) / (steps.length - 1)));
    dots.forEach((d, i) => {
      d.classList.toggle("is-active", i === n - 1);
      d.classList.toggle("is-done", i < n - 1);
    });
  };
  activate(1);

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) activate(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    steps.forEach((s) => io.observe(s));
  }

  // Smaller screens: each step gets its own document, which plays its step when scrolled into view.
  steps.forEach((step) => {
    const n = Number(step.dataset.step);
    const slot = step.querySelector<HTMLElement>(".step__visual");
    if (!slot) return;
    const doc = cloneDoc(n - 1);
    slot.append(doc);
    if (prefersReducedMotion) go(doc, n);
    else onceVisible(slot, () => go(doc, n), 0.45);
  });
}

/* ───────── Wall: one document multiplies into many ───────── */

const NAMES = [
  "Kestrel", "Alder", "Bluegum", "Ironbark", "Saltwater", "Copperleaf", "Fernhill", "Lumen", "Mason Rowe", "Quill",
  "Riverbend", "Summit", "Tidewater", "Vantage", "Willow", "Yarra", "Zenith", "Oakline", "Pinecrest", "Brightside",
  "Cobalt", "Driftwood", "Evergreen", "Foxglove", "Granite", "Halcyon", "Juniper", "Keystone", "Larkspur", "Meridian",
  "Nimbus", "Orchard", "Peregrine", "Redgum", "Sable", "Thornbury", "Upland", "Verity", "Wattle", "Arden",
  "Birchwood", "Calder", "Dunmore", "Easton", "Fairlight", "Glenrowan", "Hartley", "Ivy Lane", "Jasper", "Kingfisher",
  "Linden", "Moorland", "Northgate", "Ondine",
];
const SUFFIX = [
  "Health", "Dental", "Build", "Travel", "Legal", "Studio", "Solar", "Partners", "Analytics", "Realty",
  "Freight", "Fitness", "Plumbing", "Events", "Interiors", "Motors", "Labs", "Security", "Landscapes", "Engineering",
  "Finance", "Electrical", "Media", "Logistics", "Telecom", "Hotels", "Group",
];
const TYPES: [string, string, string][] = [
  ["Proposal", "Signed", ""],
  ["Invoice", "Paid", ""],
  ["Quote", "Sent", "wc__st--sent"],
  ["Contract", "Signed", ""],
  ["Renewal", "Sent", "wc__st--sent"],
];

function initWall() {
  const wall = document.querySelector<HTMLElement>(".wall");
  const grid = document.querySelector<HTMLElement>("[data-wall-grid]");
  if (!wall || !grid) return;
  const COLS = 11;
  const ROWS = 5;
  const cx0 = (COLS - 1) / 2;
  const cy0 = (ROWS - 1) / 2;
  const frag = document.createDocumentFragment();
  let k = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = c - cx0;
      const cy = r - cy0;
      const front = cx === 0 && cy === 0;
      const card = document.createElement("div");
      card.className = "wall__card" + (front ? " wall__card--front" : "");
      const dist = Math.hypot(cx, cy * 1.3);
      const rot = front ? 0 : ((k * 37) % 13) - 6;
      card.style.cssText = `--cx:${cx};--cy:${cy};--r:${rot}deg;--dist:${dist.toFixed(2)};z-index:${front ? 30 : 20 - Math.round(dist)}`;
      let name: string;
      let type: [string, string, string];
      let amount: number;
      if (front) {
        name = CLIENTS[0].company;
        type = TYPES[0];
        amount = totalFor(CLIENTS[0], false);
      } else {
        name = `${NAMES[k % NAMES.length]} ${SUFFIX[(k * 7) % SUFFIX.length]}`;
        type = TYPES[(k * 3) % TYPES.length];
        amount = 1200 + ((k * 7919) % 58) * 870;
        k++;
      }
      const band = document.createElement("span");
      band.className = "wc__band";
      const t = document.createElement("span");
      t.className = "wc__type";
      t.textContent = type[0];
      const n = document.createElement("b");
      n.className = "wc__name";
      n.textContent = name;
      const lines = document.createElement("span");
      lines.className = "wc__lines";
      lines.innerHTML = "<i></i><i></i><i></i>";
      const foot = document.createElement("span");
      foot.className = "wc__foot";
      const amt = document.createElement("span");
      amt.className = "wc__amt";
      amt.textContent = money(amount);
      const st = document.createElement("span");
      st.className = `wc__st ${type[2]}`;
      st.textContent = type[1];
      foot.append(amt, st);
      card.append(band, t, n, lines, foot);
      frag.append(card);
    }
  }
  grid.append(frag);

  const scrub =
    CSS.supports("animation-timeline: view()") &&
    window.matchMedia("(min-width: 1000px) and (prefers-reduced-motion: no-preference)").matches;
  if (prefersReducedMotion) wall.classList.add("is-fanned");
  else if (!scrub) onceVisible(grid.parentElement ?? grid, () => wall.classList.add("is-fanned"), 0.35);
}

/* ───────── Marquee + closing document ───────── */

function initMarquee() {
  document.querySelectorAll<HTMLElement>(".marquee__row").forEach((row) => {
    const track = row.querySelector("ul");
    if (!track) return;
    const copy = track.cloneNode(true) as HTMLElement;
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("a").forEach((a) => (a.tabIndex = -1));
    row.append(copy);
  });
}

function initClose() {
  const host = document.querySelector<HTMLElement>("[data-close-doc]");
  if (!host) return;
  const doc = cloneDoc(5, "close");
  host.append(doc);
  onceVisible(
    host,
    () => {
      host.classList.add("is-in");
      window.setTimeout(() => setStep(doc, 6, "close"), prefersReducedMotion ? 0 : 700);
    },
    0.25,
  );
}

if (template) {
  const pristine = template.cloneNode(true) as DocEl;
  initStory();
  initClose();
  initHero(pristine);
}
initWall();
initMarquee();
pauseOffscreen();
