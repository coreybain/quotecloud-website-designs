import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const money = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A pausable timeline: `wait()` resolves only once the element is on screen,
 * so looping demos freeze while scrolled away and resume where they left off.
 */
function visibilityGate(el: Element, onChange?: (visible: boolean) => void) {
  let visible = false;
  let waiting: Array<() => void> = [];
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      onChange?.(visible);
      if (visible) {
        waiting.forEach((resolve) => resolve());
        waiting = [];
      }
    },
    { threshold: 0.15 },
  ).observe(el);
  const gate = () => (visible ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)));
  return {
    gate,
    wait: async (ms: number) => {
      await sleep(ms);
      await gate();
    },
  };
}

/** Point inside `target` (fractions of its box), relative to `root`'s top-left. */
function pointIn(root: Element, target: Element, fx = 0.5, fy = 0.5) {
  const r = root.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return { x: t.left - r.left + t.width * fx, y: t.top - r.top + t.height * fy };
}

function moveCursor(cursor: HTMLElement, p: { x: number; y: number }) {
  cursor.style.setProperty("--cx", `${Math.round(p.x)}px`);
  cursor.style.setProperty("--cy", `${Math.round(p.y)}px`);
}

async function click(cursor: HTMLElement) {
  cursor.classList.remove("is-click");
  void cursor.offsetWidth;
  cursor.classList.add("is-click");
}

function tween(el: HTMLElement, to: number, duration: number, format: (n: number) => string, from = 0) {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ───────── Hero: right-click → upload PDF → segments + price table ───────── */

function initHeroDemo() {
  const demo = $("[data-demo]");
  if (!demo || prefersReducedMotion) return;

  const cursor = $("[data-demo-cursor]", demo)!;
  const block = $("[data-demo-block]", demo)!;
  const menu = $("[data-demo-menu]", demo)!;
  const upload = $("[data-demo-upload]", demo)!;
  const status = $("[data-demo-status]", demo)!;
  const fileState = $("[data-demo-file-state]", demo)!;
  const total = $("[data-demo-total]", demo)!;
  const shareBtn = $$(".demo__btn", demo).at(-1)!;
  const segs = $$("[data-demo-seg]", demo);
  const prices = $$("[data-demo-price]", demo);
  const { wait } = visibilityGate(demo);

  const setStatus = (text: string, mode: "draft" | "busy" | "ok") => {
    status.textContent = text;
    status.classList.toggle("is-draft", mode === "draft");
    status.classList.toggle("is-busy", mode === "busy");
  };
  const stage = (name: string) => (demo.dataset.stage = name);

  const reset = () => {
    stage("empty");
    segs.concat(prices).forEach((el) => el.classList.remove("is-in"));
    upload.classList.remove("is-hover");
    cursor.classList.remove("is-on");
    setStatus("Draft", "draft");
    total.textContent = "0";
    const w = demo.clientWidth;
    const h = demo.clientHeight;
    cursor.style.transition = "none";
    moveCursor(cursor, { x: w * 0.82, y: h * 0.96 });
    void cursor.offsetWidth;
    cursor.style.transition = "";
  };

  const placeMenu = (p: { x: number; y: number }) => {
    const maxX = demo.clientWidth - menu.offsetWidth - 8;
    const maxY = demo.clientHeight - menu.offsetHeight - 8;
    menu.style.setProperty("--mx", `${Math.round(Math.max(8, Math.min(p.x + 6, maxX)))}px`);
    menu.style.setProperty("--my", `${Math.round(Math.max(8, Math.min(p.y + 6, maxY)))}px`);
  };

  demo.classList.add("is-anim");

  const run = async () => {
    for (;;) {
      reset();
      await wait(700);
      cursor.classList.add("is-on");
      const target = pointIn(demo, block, 0.2, 0.5);
      moveCursor(cursor, target);
      await wait(1050);

      // Right-click opens the block's context menu
      click(cursor);
      placeMenu(target);
      stage("menu");
      await wait(750);
      moveCursor(cursor, pointIn(demo, upload, 0.4, 0.55));
      await wait(800);
      upload.classList.add("is-hover");
      await wait(450);
      click(cursor);
      await wait(250);

      // The trip PDF drops in and is read
      fileState.textContent = "Uploading…";
      setStatus("Importing…", "busy");
      stage("file");
      upload.classList.remove("is-hover");
      moveCursor(cursor, pointIn(demo, block, 0.86, 0.9));
      await wait(950);
      fileState.textContent = "Extracting segments and pricing…";
      stage("scan");
      await wait(1450);

      // Segments and the price table assemble
      stage("built");
      for (const seg of segs) {
        seg.classList.add("is-in");
        await wait(150);
      }
      await wait(150);
      for (const row of prices) {
        row.classList.add("is-in");
        await wait(110);
      }
      tween(total, 6240, 900, money);
      setStatus("Imported", "ok");
      await wait(1100);
      moveCursor(cursor, pointIn(demo, shareBtn, 0.5, 0.6));
      await wait(3600);

      demo.classList.add("is-out");
      cursor.classList.remove("is-on");
      await wait(600);
      reset();
      demo.classList.remove("is-out");
    }
  };
  // Start after layout settles so cursor maths uses final sizes.
  requestAnimationFrame(() => void run());
}

/* ───────── 01: GDS packet flow + paste → structured rows ───────── */

function initImport() {
  const gds = $(".gds");
  if (gds && !prefersReducedMotion) visibilityGate(gds, (v) => gds.classList.toggle("is-live", v));

  const paste = $(".paste");
  if (!paste || prefersReducedMotion) return;
  const lines = $$("[data-paste-line]", paste);
  const rows = $$("[data-paste-row]", paste);
  const { wait } = visibilityGate(paste);
  paste.classList.add("is-anim");

  void (async () => {
    for (;;) {
      await wait(500);
      for (let i = 0; i < lines.length; i++) {
        lines[i].classList.add("is-hot");
        await wait(480);
        rows[i]?.classList.add("is-in");
        await wait(320);
        lines[i].classList.remove("is-hot");
      }
      await wait(3800);
      rows.forEach((r) => r.classList.remove("is-in"));
      await wait(700);
    }
  })();
}

/* ───────── 02: enrich the hotel segment ───────── */

function initEnrich() {
  const card = $("[data-enrich]");
  if (!card) return;
  const { wait } = visibilityGate(card, (v) => card.classList.toggle("is-live", v && !prefersReducedMotion));
  if (prefersReducedMotion) return;

  const cursor = $("[data-enrich-cursor]", card)!;
  const tools = $$("[data-tool]", card);
  const tiles = $$("[data-add]", card);
  card.classList.add("is-anim");

  void (async () => {
    for (;;) {
      cursor.style.transition = "none";
      moveCursor(cursor, { x: card.clientWidth * 0.7, y: card.clientHeight * 0.95 });
      void cursor.offsetWidth;
      cursor.style.transition = "";
      await wait(700);
      cursor.classList.add("is-on");
      for (let i = 0; i < tools.length; i++) {
        moveCursor(cursor, pointIn(card, tools[i], 0.55, 0.6));
        await wait(800);
        tools[i].classList.add("is-on");
        click(cursor);
        tiles[i]?.classList.add("is-in");
        await wait(420);
        tools[i].classList.remove("is-on");
        await wait(200);
      }
      cursor.classList.remove("is-on");
      await wait(6500);
      tiles.forEach((t) => t.classList.remove("is-in"));
      await wait(800);
    }
  })();
}

/* ───────── 03: preview toggle + share ───────── */

function initPreview() {
  const card = $("[data-preview]");
  if (!card) return;
  const stageEl = $("[data-view-stage]", card)!;
  const buttons = $$<HTMLButtonElement>("[data-view]", card);
  const checks = $$("[data-check]", card);
  const sent = $("[data-sent]", card)!;
  const share = $(".preview__share", card)!;
  let userTookOver = false;

  const setView = (view: string) => {
    stageEl.dataset.viewStage = view;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      userTookOver = true;
      card.classList.remove("is-anim");
      setView(b.dataset.view!);
    }),
  );

  if (prefersReducedMotion) return;
  const { wait } = visibilityGate(card);
  card.classList.add("is-anim");

  void (async () => {
    while (!userTookOver) {
      checks.forEach((c) => c.classList.remove("is-in"));
      sent.classList.remove("is-in");
      setView("desktop");
      await wait(900);
      for (const c of checks) {
        if (userTookOver) return;
        c.classList.add("is-in");
        await wait(650);
      }
      await wait(900);
      if (userTookOver) return;
      setView("phone");
      await wait(2200);
      if (userTookOver) return;
      share.classList.add("is-press");
      await wait(180);
      share.classList.remove("is-press");
      sent.classList.add("is-in");
      await wait(2600);
      if (userTookOver) return;
      setView("desktop");
      await wait(2200);
    }
  })();
}

/* ───────── TravelDocs: sign in with surname + booking reference ───────── */

function initSignIn() {
  const phone = $("[data-signin]");
  if (!phone || prefersReducedMotion) return;
  const fields = $$("[data-type]", phone);
  const values = fields.map((f) => f.dataset.type ?? "");
  const go = $(".app__go", phone)!;
  const { wait } = visibilityGate(phone);

  void (async () => {
    for (;;) {
      phone.classList.remove("is-trip");
      fields.forEach((f) => (f.dataset.type = ""));
      await wait(900);
      for (let i = 0; i < fields.length; i++) {
        fields[i].classList.add("is-typing");
        for (let c = 1; c <= values[i].length; c++) {
          fields[i].dataset.type = values[i].slice(0, c);
          await wait(110);
        }
        await wait(250);
        fields[i].classList.remove("is-typing");
      }
      await wait(400);
      go.classList.add("is-press");
      await wait(200);
      go.classList.remove("is-press");
      phone.classList.add("is-trip");
      await wait(4800);
    }
  })();
}

/* ───────── On the road: currency converter ───────── */

function initFx() {
  const tile = $("[data-fx]");
  if (!tile || prefersReducedMotion) return;
  const idr = $("[data-fx-idr]", tile)!;
  const aud = $("[data-fx-aud]", tile)!;
  const rate = 10460; // illustrative IDR per AUD
  const prices = [250000, 85000, 1200000, 450000];
  const { wait } = visibilityGate(tile);
  let current = prices[0];

  void (async () => {
    for (let i = 1; ; i = (i + 1) % prices.length) {
      await wait(2600);
      const next = prices[i];
      tween(idr, next, 700, money, current);
      tween(aud, next / rate, 700, (n) => n.toFixed(2), current / rate);
      current = next;
    }
  })();
}

/* ───────── Sticky mobile CTA: after the hero, hidden near the closing CTA and footer ───────── */

function initSticky() {
  const bar = $("[data-sticky]");
  const heroCtas = $(".hero__ctas");
  if (!bar || !heroCtas) return;
  bar.hidden = false;
  const ends = [$("[data-close]"), $(".qc-footer")].filter(Boolean) as Element[];
  let pastHero = false;
  const nearEnd = new Set<Element>();
  const update = () => bar.classList.toggle("is-on", pastHero && nearEnd.size === 0);

  new IntersectionObserver(([e]) => {
    pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
    update();
  }).observe(heroCtas);
  const endIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? nearEnd.add(e.target) : nearEnd.delete(e.target)));
    update();
  });
  ends.forEach((el) => endIo.observe(el));
}

initHeroDemo();
initImport();
initEnrich();
initPreview();
initSignIn();
initFx();
initSticky();
