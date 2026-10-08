import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Resolves once `isActive()` returns true (polls on visibility changes). */
function waitUntil(isActive: () => boolean) {
  return new Promise<void>((resolve) => {
    const tick = () => (isActive() ? resolve() : window.setTimeout(tick, 250));
    tick();
  });
}

/* ───────── Fit fixed-size mockups to their container (scale + height) ───────── */

function initFit() {
  document.querySelectorAll<HTMLElement>("[data-fit]").forEach((wrap) => {
    const inner = wrap.querySelector<HTMLElement>(".fit__inner");
    const base = Number(wrap.dataset.fit) || 620;
    if (!inner) return;
    const apply = () => {
      const s = Math.min(1, wrap.clientWidth / base);
      wrap.style.setProperty("--s", s.toFixed(4));
      wrap.style.height = `${Math.round(inner.offsetHeight * s)}px`;
    };
    apply();
    new ResizeObserver(apply).observe(wrap);
  });
}

/* ───────── Hero: blocks stream from the palette into the page ───────── */

function initCompose() {
  const root = document.querySelector<HTMLElement>("[data-compose]");
  if (!root) return;
  const body = root.querySelector<HTMLElement>(".ed__body")!;
  const scroll = root.querySelector<HTMLElement>(".ed__scroll")!;
  const page = root.querySelector<HTMLElement>(".ed__page")!;
  const slots = [...root.querySelectorAll<HTMLElement>("[data-slot]")];
  const palette = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-pal]")].map((el) => [el.dataset.pal!, el] as const),
  );

  if (prefersReducedMotion) {
    slots.forEach((s) => s.classList.add("is-in"));
    palette.forEach((p) => p.classList.add("is-done"));
    return;
  }

  let active = false;
  const io = new IntersectionObserver((entries) => (active = entries.some((e) => e.isIntersecting)), {
    threshold: 0.2,
  });
  io.observe(root);

  let pageShift = 0;
  const shiftPage = (y: number) => {
    if (y === pageShift) return;
    page.animate([{ transform: `translateY(-${pageShift}px)` }, { transform: `translateY(-${y}px)` }], {
      duration: 700,
      easing: EASE,
      fill: "forwards",
    });
    pageShift = y;
  };

  const run = async () => {
    for (;;) {
      await waitUntil(() => active);
      for (const slot of slots) {
        if (!active) await waitUntil(() => active);
        const key = slot.dataset.slot!;
        const pal = palette.get(key);
        if (!pal) continue;

        // keep the landing zone visible inside the editor window
        const viewH = scroll.clientHeight;
        const slotBottom = page.offsetTop + slot.offsetTop + slot.offsetHeight + 24;
        shiftPage(Math.max(0, slotBottom - viewH + 18));

        slot.classList.add("is-next");
        pal.classList.add("is-sending");

        const from = { x: pal.offsetLeft + 8, y: pal.offsetTop + 10 };
        const to = {
          x: scroll.offsetLeft + page.offsetLeft + slot.offsetLeft,
          y: scroll.offsetTop + page.offsetTop + slot.offsetTop - pageShift,
        };
        const fly = document.createElement("span");
        fly.className = "fly";
        fly.innerHTML = pal.innerHTML;
        body.append(fly);
        const anim = fly.animate(
          [
            { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1 },
            { transform: `translate(${to.x}px, ${to.y}px) scale(0.9)`, opacity: 1, offset: 0.8 },
            { transform: `translate(${to.x}px, ${to.y}px) scale(0.55)`, opacity: 0 },
          ],
          { duration: 720, easing: EASE, fill: "forwards" },
        );
        await anim.finished.catch(() => {});
        fly.remove();
        pal.classList.remove("is-sending");
        pal.classList.add("is-done");
        slot.classList.remove("is-next");
        slot.classList.add("is-in");
        await sleep(560);
      }
      await sleep(3400);
      // reset: fade the page out, clear, scroll back, fade in
      await page.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: "ease", fill: "forwards" })
        .finished.catch(() => {});
      slots.forEach((s) => s.classList.remove("is-in"));
      palette.forEach((p) => p.classList.remove("is-done"));
      shiftPage(0);
      await sleep(300);
      await page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease", fill: "forwards" })
        .finished.catch(() => {});
      await sleep(400);
    }
  };
  run();
}

/* ───────── Block gallery: tabs + FLIP ring + icon flight ───────── */

function initGallery() {
  const root = document.querySelector<HTMLElement>("[data-gallery]");
  if (!root) return;
  const tiles = [...root.querySelectorAll<HTMLButtonElement>(".tile")];
  const ring = root.querySelector<HTMLElement>(".gal__ring")!;
  const tilesWrap = root.querySelector<HTMLElement>(".gal__tiles")!;
  const icon = root.querySelector<HTMLElement>("[data-gallery-icon]")!;
  const nameEl = root.querySelector<HTMLElement>("[data-gallery-name]")!;
  const descEl = root.querySelector<HTMLElement>("[data-gallery-desc]")!;
  const panels = new Map(
    [...root.querySelectorAll<HTMLElement>(".demo")].map((p) => [p.id.replace("panel-", ""), p] as const),
  );
  let current = "text";
  let hoverTimer = 0;
  let flying: HTMLElement | null = null;

  const placeRing = (tile: HTMLElement, animate: boolean) => {
    const first = { x: ring.offsetLeft, y: ring.offsetTop, w: ring.offsetWidth, h: ring.offsetHeight };
    const last = { x: tile.offsetLeft, y: tile.offsetTop, w: tile.offsetWidth, h: tile.offsetHeight };
    Object.assign(ring.style, { left: `${last.x}px`, top: `${last.y}px`, width: `${last.w}px`, height: `${last.h}px` });
    const wasOn = ring.classList.contains("is-on");
    ring.classList.add("is-on");
    if (!animate || prefersReducedMotion || !wasOn) return;
    ring.animate(
      [
        { transform: `translate(${first.x - last.x}px, ${first.y - last.y}px)`, width: `${first.w}px`, height: `${first.h}px` },
        { transform: "none", width: `${last.w}px`, height: `${last.h}px` },
      ],
      { duration: 480, easing: EASE },
    );
  };

  const flyIcon = (tile: HTMLElement) => {
    if (prefersReducedMotion) return;
    const src = tile.querySelector("svg");
    if (!src) return;
    flying?.remove();
    const a = src.getBoundingClientRect();
    const b = icon.getBoundingClientRect();
    if (b.bottom < 0 || b.top > window.innerHeight) return;
    const el = document.createElement("span");
    el.className = "gal__flyicon";
    el.innerHTML = src.outerHTML;
    document.body.append(el);
    flying = el;
    const sx = a.width / 44;
    el.animate(
      [
        { transform: `translate(${a.left - (44 - a.width) / 2}px, ${a.top - (44 - a.height) / 2}px) scale(${sx})`, opacity: 0.9 },
        { transform: `translate(${b.left}px, ${b.top}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${b.left}px, ${b.top}px) scale(1)`, opacity: 0 },
      ],
      { duration: 460, easing: EASE, fill: "forwards" },
    ).finished.then(() => el.remove()).catch(() => {});
    icon.classList.remove("is-swap");
    void icon.offsetWidth;
    icon.classList.add("is-swap");
  };

  const select = (key: string, opts: { focus?: boolean; animate?: boolean } = {}) => {
    const tile = tiles.find((t) => t.dataset.block === key);
    const next = panels.get(key);
    if (!tile || !next) return;
    const prevKey = current;
    const changed = prevKey !== key;
    current = key;

    tiles.forEach((t) => {
      const on = t === tile;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (opts.focus) tile.focus({ preventScroll: true });
    placeRing(tile, opts.animate !== false);
    if (!changed) return;

    nameEl.textContent = tile.dataset.name ?? "";
    descEl.textContent = tile.dataset.desc ?? "";
    icon.innerHTML = tile.querySelector("svg")?.outerHTML ?? "";
    flyIcon(tile);

    const prev = panels.get(prevKey);
    if (prev && prev !== next) {
      prev.classList.remove("is-active");
      if (prefersReducedMotion) prev.hidden = true;
      else {
        prev.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.985)" }], {
          duration: 160,
          easing: "ease-out",
          fill: "forwards",
        }).finished.then(() => {
          if (current !== prevKey) prev.hidden = true;
        }).catch(() => {});
      }
    }
    next.hidden = false;
    next.classList.add("is-active");
    if (!prefersReducedMotion) {
      next.animate(
        [{ opacity: 0, transform: "translateY(10px) scale(0.985)" }, { opacity: 1, transform: "none" }],
        { duration: 420, easing: EASE, delay: 60, fill: "both" },
      );
    }
  };

  tiles.forEach((tile, i) => {
    const key = tile.dataset.block!;
    tile.addEventListener("click", () => select(key, { focus: true }));
    tile.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => select(key), 70);
    });
    tile.addEventListener("pointerleave", () => window.clearTimeout(hoverTimer));
    tile.addEventListener("focus", () => select(key));
    tile.addEventListener("keydown", (e) => {
      const cols = window.matchMedia("(max-width: 900px)").matches ? 2 : 3;
      const map: Record<string, number> = {
        ArrowRight: i + (cols === 2 ? 2 : 1),
        ArrowLeft: i - (cols === 2 ? 2 : 1),
        ArrowDown: i + (cols === 2 ? 1 : 3),
        ArrowUp: i - (cols === 2 ? 1 : 3),
        Home: 0,
        End: tiles.length - 1,
      };
      if (!(e.key in map)) return;
      e.preventDefault();
      const n = Math.max(0, Math.min(tiles.length - 1, map[e.key]));
      select(tiles[n].dataset.block!, { focus: true });
    });
  });

  // initial ring (no animation) + keep it aligned on resize
  const first = tiles.find((t) => t.getAttribute("aria-selected") === "true") ?? tiles[0];
  placeRing(first, false);
  new ResizeObserver(() => {
    const t = tiles.find((x) => x.dataset.block === current);
    if (t) placeRing(t, false);
  }).observe(tilesWrap);
}

/* ───────── Canvas vs Grid: FLIP between layouts ───────── */

function initModes() {
  const doc = document.querySelector<HTMLElement>("[data-modes]");
  const seg = document.querySelector<HTMLElement>("[data-modes-toggle]");
  if (!doc || !seg) return;
  const blocks = [...doc.querySelectorAll<HTMLElement>(".mb")];
  const buttons = [...seg.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  let mode = doc.dataset.mode ?? "grid";
  let userTouched = false;
  let visible = false;
  let busy = false;

  const measure = () =>
    blocks.map((b) => ({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }));

  const setMode = (next: string) => {
    if (next === mode || busy) return;
    const first = measure();
    mode = next;
    doc.dataset.mode = next;
    seg.dataset.active = next;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === next)));
    if (prefersReducedMotion) return;
    busy = true;
    const last = measure();
    const anims = blocks.map((b, i) => {
      const f = first[i];
      const l = last[i];
      return b.animate(
        [
          { transform: `translate(${f.x - l.x}px, ${f.y - l.y}px)`, width: `${f.w}px`, height: `${f.h}px` },
          { transform: "none", width: `${l.w}px`, height: `${l.h}px` },
        ],
        { duration: 760, easing: EASE, delay: i * 28 },
      );
    });
    Promise.all(anims.map((a) => a.finished)).catch(() => {}).finally(() => (busy = false));
  };

  seg.dataset.active = mode;
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      userTouched = true;
      setMode(b.dataset.mode!);
    }),
  );

  new IntersectionObserver((entries) => (visible = entries.some((e) => e.isIntersecting)), { threshold: 0.35 }).observe(doc);

  if (!prefersReducedMotion) {
    window.setInterval(() => {
      if (userTouched || !visible || document.hidden) return;
      setMode(mode === "grid" ? "canvas" : "grid");
    }, 4200);
  }
}

/* ───────── Pause looping demos when offscreen ───────── */

function initLive() {
  const els = document.querySelectorAll<HTMLElement>("[data-live]");
  if (!els.length) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { threshold: 0.25 },
  );
  els.forEach((el) => io.observe(el));
}

/* ───────── Mobile sticky CTA ───────── */

function initSticky() {
  const bar = document.querySelector<HTMLElement>("[data-sticky-cta]");
  const hero = document.querySelector<HTMLElement>(".hero");
  const closing = document.querySelector<HTMLElement>("[data-close-cta]");
  if (!bar || !hero || !closing) return;
  let heroGone = false;
  let closingVisible = false;
  let footerVisible = false;
  const update = () => {
    const show = heroGone && !closingVisible && !footerVisible;
    bar.hidden = false;
    bar.classList.toggle("is-shown", show);
    document.body.classList.toggle("v7-has-sticky", show);
  };
  new IntersectionObserver(
    (e) => {
      heroGone = !e[0].isIntersecting && e[0].boundingClientRect.bottom < 0;
      update();
    },
    { threshold: 0 },
  ).observe(hero);
  new IntersectionObserver(
    (e) => {
      closingVisible = e[0].isIntersecting;
      update();
    },
    { rootMargin: "0px 0px 120px 0px", threshold: 0 },
  ).observe(closing);
  const footer = document.querySelector(".qc-footer");
  if (footer) {
    new IntersectionObserver(
      (e) => {
        footerVisible = e[0].isIntersecting;
        update();
      },
      { threshold: 0 },
    ).observe(footer);
  }
}

initFit();
initCompose();
initGallery();
initModes();
initLive();
initSticky();
