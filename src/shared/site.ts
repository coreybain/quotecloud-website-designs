import "./base.css";

document.documentElement.classList.add("js");

export const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ───────── Header: mega menus, mobile menu, scrolled state ───────── */

function initHeader() {
  const header = document.querySelector<HTMLElement>("[data-qc-header]");
  if (!header) return;

  const items = [...header.querySelectorAll<HTMLElement>("[data-qc-menu]")];
  const canHover = window.matchMedia("(hover: hover)").matches;
  let closeTimer = 0;

  const setOpen = (item: HTMLElement, open: boolean) => {
    item.toggleAttribute("data-open", open);
    item.querySelector("button")?.setAttribute("aria-expanded", String(open));
  };
  const closeAll = (except?: HTMLElement) => items.forEach((i) => i !== except && setOpen(i, false));

  for (const item of items) {
    const button = item.querySelector("button");
    button?.addEventListener("click", () => {
      const open = !item.hasAttribute("data-open");
      closeAll(item);
      setOpen(item, open);
    });
    if (canHover) {
      item.addEventListener("pointerenter", () => {
        window.clearTimeout(closeTimer);
        closeAll(item);
        setOpen(item, true);
      });
      item.addEventListener("pointerleave", () => {
        closeTimer = window.setTimeout(() => setOpen(item, false), 160);
      });
    }
    item.addEventListener("focusout", (event) => {
      if (!item.contains(event.relatedTarget as Node | null)) setOpen(item, false);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = items.find((i) => i.hasAttribute("data-open"));
    if (open) {
      setOpen(open, false);
      open.querySelector("button")?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target as Node)) closeAll();
  });

  const burger = header.querySelector<HTMLButtonElement>(".qc-burger");
  const mobile = header.querySelector<HTMLElement>("#qc-mobile-menu");
  const setMobile = (open: boolean) => {
    if (!burger || !mobile) return;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobile.hidden = !open;
    document.body.classList.toggle("qc-menu-open", open);
  };
  burger?.addEventListener("click", () => setMobile(burger.getAttribute("aria-expanded") !== "true"));
  window.matchMedia("(min-width: 1081px)").addEventListener("change", (e) => e.matches && setMobile(false));

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ───────── Scroll reveal: [data-reveal], stagger via [data-reveal-stagger] ───────── */

export function initReveal(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-reveal-stagger]").forEach((group) => {
    const step = Number(group.dataset.revealStagger) || 80;
    [...group.querySelectorAll<HTMLElement>("[data-reveal]")].forEach((el, i) => {
      el.style.setProperty("--reveal-delay", String(i * step));
    });
  });

  const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  targets.forEach((el) => io.observe(el));
}

/* ───────── Helpers for variants ───────── */

/** Runs `callback` once when `el` first scrolls into view. */
export function onceVisible(el: Element, callback: () => void, threshold = 0.3) {
  if (!("IntersectionObserver" in window)) return callback();
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        callback();
      }
    },
    { threshold },
  );
  io.observe(el);
}

/** Counts [data-count-to] elements up from 0 when visible. Supports data-count-prefix/suffix/decimals, and data-count-format="plain" (no thousands separators, e.g. years). */
export function initCounters(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-count-to]").forEach((el) => {
    const to = Number(el.dataset.countTo);
    const decimals = Number(el.dataset.countDecimals ?? 0);
    const prefix = el.dataset.countPrefix ?? "";
    const suffix = el.dataset.countSuffix ?? "";
    const plain = el.dataset.countFormat === "plain";
    const format = (n: number) =>
      prefix +
      (plain
        ? n.toFixed(decimals)
        : n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) +
      suffix;
    if (prefersReducedMotion) {
      el.textContent = format(to);
      return;
    }
    el.textContent = format(0);
    onceVisible(el, () => {
      const duration = Number(el.dataset.countDuration ?? 1600);
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = format(to * (1 - Math.pow(1 - t, 4)));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
}

/* ───────── Campaign tracking: carry utm_* params from the landing URL onto CTAs ───────── */
export function carryCampaignParams(root: ParentNode = document) {
  const utm = [...new URLSearchParams(location.search)].filter(([key]) => key.startsWith("utm_"));
  if (!utm.length) return;
  root.querySelectorAll<HTMLAnchorElement>("a[data-qc-cta][href^='http']").forEach((link) => {
    const url = new URL(link.href);
    for (const [key, value] of utm) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    link.href = url.toString();
  });
}

initHeader();
initReveal();
initCounters();
carryCampaignParams();
