import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Typing: split the executive summary into characters ───────── */

function splitType(el: HTMLElement) {
  let i = 0;
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/\s+/g, " ");
        const frag = document.createDocumentFragment();
        for (const ch of text) {
          const span = document.createElement("span");
          span.className = "pa-ch";
          span.style.setProperty("--i", String(i++));
          span.textContent = ch;
          frag.append(span);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  // trim the leading/trailing whitespace from the source formatting
  el.innerHTML = el.innerHTML.trim();
  walk(el);
}

/* ───────── The book: opens on first scroll ───────── */

const book = document.querySelector<HTMLElement>("[data-book]");
const canOpen = window.matchMedia("(min-width: 700px)");

function openBook() {
  if (book && canOpen.matches) book.classList.add("is-open");
}

if (book) {
  const onScroll = () => {
    if (window.scrollY > 30) {
      openBook();
      if (book.classList.contains("is-open")) window.removeEventListener("scroll", onScroll);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  canOpen.addEventListener("change", () => {
    if (!canOpen.matches) book.classList.remove("is-open");
    else if (window.scrollY > 30) openBook();
  });
}

/* ───────── Live loops: tiles animate only while on screen ───────── */

const landed = new WeakSet<Element>();
const visible = new WeakSet<Element>();
const tiles = [...document.querySelectorAll<HTMLElement>("[data-tile]")];

function sync(tile: HTMLElement) {
  if (prefersReducedMotion || !landed.has(tile)) return;
  const on = visible.has(tile);
  // Off-screen tiles drop their loops entirely and rest on the finished frame;
  // they rebuild from the start the next time they scroll in.
  if (on) tile.dataset.live = "on";
  else delete tile.dataset.live;
  if (tile.classList.contains("pa-tile--inv")) investment(tile, on);
}

if (!prefersReducedMotion) {
  document.querySelectorAll<HTMLElement>("[data-type]").forEach(splitType);

  const liveIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
        sync(e.target as HTMLElement);
      }
    },
    { threshold: 0 },
  );
  tiles.forEach((t) => liveIO.observe(t));
}

/* ───────── Investment: the total counts with the CSS clock ───────── */

const CYCLE = 10000;
const invFrames = new WeakMap<HTMLElement, number>();
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function investment(tile: HTMLElement, on: boolean) {
  const out = tile.querySelector<HTMLElement>("[data-inv-total]");
  const clock = tile.querySelector<SVGElement>(".pa-sum__seg--grow");
  if (!out || !clock) return;
  const from = 22800;
  const to = 24350;
  cancelAnimationFrame(invFrames.get(tile) ?? 0);
  if (!on) {
    out.textContent = money(to);
    return;
  }
  const frame = () => {
    const anim = clock.getAnimations()[0];
    const t = Number(anim?.currentTime ?? 0) % CYCLE;
    let v = to;
    if (t < 2700 || t > 9700) v = from;
    else if (t < 3600) v = from + (to - from) * easeOut((t - 2700) / 900);
    out.textContent = money(v);
    invFrames.set(tile, requestAnimationFrame(frame));
  };
  frame();
}

/* ───────── Explode: contents page → bento tiles (FLIP) ───────── */

const bento = document.querySelector<HTMLElement>("[data-bento]");
const contents = document.querySelector<HTMLElement>("[data-contents]");
const canExplode =
  !prefersReducedMotion &&
  window.matchMedia("(min-width: 768px)").matches &&
  typeof Element.prototype.animate === "function" &&
  "IntersectionObserver" in window;

const bentoTiles = bento ? [...bento.querySelectorAll<HTMLElement>(":scope > [data-tile]")] : [];

// Tiles outside the explode go live as soon as they are seen.
for (const t of tiles) {
  if (!canExplode || !bentoTiles.includes(t)) landed.add(t);
}

function land(tile: HTMLElement) {
  landed.add(tile);
  sync(tile);
}

function explode() {
  if (!bento) return;
  openBook();
  const rows = contents ? [...contents.querySelectorAll("li")] : [];
  const src = contents?.getBoundingClientRect();
  const fromPage = !!src && src.bottom > -100 && src.width > 0;
  bento.classList.remove("is-pending");

  bentoTiles.forEach((tile, i) => {
    const delay = 120 + i * 85;
    const parts = tile.querySelectorAll(":scope > *");

    if (!fromPage || !src) {
      tile.animate(
        [
          { opacity: 0, transform: "translateY(36px) scale(0.97)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 800, delay: i * 70, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      );
      window.setTimeout(() => land(tile), i * 70 + 300);
      return;
    }

    const r = tile.getBoundingClientRect();
    const dx = src.left + src.width / 2 - (r.left + r.width / 2);
    const dy = src.top + src.height / 2 - (r.top + r.height / 2);
    const sx = (src.width * 0.92) / r.width;
    const sy = (src.height * 0.92) / r.height;
    const rot = (i % 2 ? 1 : -1) * (3 + (i % 3) * 2);

    tile.animate(
      [
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sx}, ${sy})` },
        { opacity: 1, offset: 0.18 },
        { opacity: 1, transform: "none" },
      ],
      { duration: 1150, delay, easing: "cubic-bezier(0.65, 0, 0.2, 1)", fill: "backwards" },
    );
    parts.forEach((p) =>
      p.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 420,
        delay: delay + 760,
        easing: "ease-out",
        fill: "backwards",
      }),
    );
    window.setTimeout(() => rows[i]?.classList.add("is-out"), delay);
    window.setTimeout(() => land(tile), delay + 760);
  });
}

if (bento && canExplode) {
  bento.classList.add("is-pending");
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        explode();
      }
    },
    { rootMargin: "0px 0px -4% 0px", threshold: 0 },
  );
  io.observe(bento);
}

/* ───────── Sample proposals: pick a cover, see all nine pages ───────── */

const SAMPLES = [
  {
    img: "/assets/proposal/sample-proposal-architectural-design.png",
    title: "Architectural Design Proposal",
    desc: "Journey stages, scope of services, professional fees and acceptance.",
    alt: "All nine pages of the Architectural Design Proposal template: cover, your journey with us, scope of services, professional fees, terms, thank you and acceptance pages",
  },
  {
    img: "/assets/proposal/sample-proposal-hosted-services.png",
    title: "Hosted Services Proposal",
    desc: "Connected journey, scope, plan options, comparison and investment summary.",
    alt: "All nine pages of the Hosted Services Proposal template: cover, connected journey, scope, plan options, comparison and investment summary pages",
  },
  {
    img: "/assets/proposal/sample-proposal-medical-devices.png",
    title: "Medical Device Proposal",
    desc: "Device packages, investment options and acceptance.",
    alt: "All nine pages of the Medical Device Proposal template: cover, device packages, investment and acceptance pages",
  },
  {
    img: "/assets/proposal/sample-proposal-new-home-build.png",
    title: "Your New Home Proposal",
    desc: "Floor plans, inclusion packages and acceptance.",
    alt: "All nine pages of the Your New Home Proposal template: cover, floor plans, inclusion packages and acceptance pages",
  },
];

const samples = document.querySelector<HTMLElement>("[data-samples]");
if (samples) {
  const cards = [...samples.querySelectorAll<HTMLButtonElement>("[data-sample]")];
  const img = samples.querySelector<HTMLImageElement>("[data-spread-img]");
  const title = samples.querySelector<HTMLElement>("[data-spread-title]");
  const desc = samples.querySelector<HTMLElement>("[data-spread-desc]");
  let current = 0;

  const select = (n: number) => {
    const s = SAMPLES[n];
    if (!s || n === current || !img || !title || !desc) return;
    current = n;
    cards.forEach((c, i) => c.setAttribute("aria-pressed", String(i === n)));
    const swap = () => {
      img.src = s.img;
      img.alt = s.alt;
      title.textContent = s.title;
      desc.textContent = s.desc;
    };
    if (prefersReducedMotion) return swap();
    const out = img.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.985)" }], {
      duration: 180,
      easing: "ease-in",
      fill: "forwards",
    });
    out.onfinish = () => {
      swap();
      const show = () => {
        out.cancel();
        img.animate([{ opacity: 0, transform: "scale(0.985)" }, { opacity: 1, transform: "none" }], {
          duration: 380,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      };
      if (img.complete) show();
      else img.addEventListener("load", show, { once: true });
    };
  };

  cards.forEach((c, i) => c.addEventListener("click", () => select(i)));

  // warm the other sheets once the section is near
  if ("IntersectionObserver" in window) {
    const warm = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        warm.disconnect();
        SAMPLES.slice(1).forEach((s) => {
          const pre = new Image();
          pre.src = s.img;
        });
      },
      { rootMargin: "400px 0px" },
    );
    warm.observe(samples);
  }
}
