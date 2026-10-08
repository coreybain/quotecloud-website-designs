import "../src/shared/site.ts";
import { prefersReducedMotion } from "../src/shared/site";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════ Interactive proposal ═══════════════════════ */

function initDemo() {
  const root = $("[data-demo]");
  if (!root) return;

  const form = $<HTMLFormElement>("[data-demo-form]", root)!;
  const qtyOut = $<HTMLOutputElement>("[data-qty]", root)!;
  const subEl = $("[data-sub]", root)!;
  const taxEl = $("[data-tax]", root)!;
  const totalEl = $("[data-total]", root)!;
  const live = $("[data-totals-live]", root)!;
  const accept = $<HTMLButtonElement>("[data-accept]", root)!;
  const acceptLabel = $("[data-accept-label]", root)!;
  const pad = $("[data-pad]", root)!;
  const canvas = $<HTMLCanvasElement>("[data-canvas]", root)!;
  const nameInput = $<HTMLInputElement>("#sig-name", root)!;
  const typePreview = $("[data-type-preview]", root)!;
  const confirm = $<HTMLButtonElement>("[data-confirm]", root)!;
  const clear = $<HTMLButtonElement>("[data-clear]", root)!;
  const slot = $("[data-sig-slot]", root)!;
  const signer = $("[data-signer]", root)!;
  const statusText = $("[data-status-text]", root)!;
  const after = $("[data-after]", root)!;
  const reset = $<HTMLButtonElement>("[data-reset]", root)!;

  const TAX = 0.1;
  const MIN_QTY = 1;
  const MAX_QTY = 50;
  let qty = 5;
  let accepted = false;
  let mode: "draw" | "type" = "draw";
  let hasInk = false;
  const shown = { sub: 345, tax: 34.5, total: 379.5 };
  let liveTimer = 0;

  /* ---- totals ---- */
  const tween = (el: Element, key: keyof typeof shown, to: number) => {
    const from = shown[key];
    shown[key] = to;
    if (prefersReducedMotion || Math.abs(to - from) < 0.005) {
      el.textContent = money(to);
      return;
    }
    const start = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    el.classList.remove("is-bump");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("is-bump");
  };

  const compute = () => {
    const pkg = $<HTMLInputElement>('input[name="pkg"]:checked', form)!;
    const addons = $$<HTMLInputElement>('input[name="addon"]:checked', form);
    const sub = Number(pkg.value) * qty + addons.reduce((s, a) => s + Number(a.value), 0);
    const tax = sub * TAX;
    const total = sub + tax;
    tween(subEl, "sub", sub);
    tween(taxEl, "tax", tax);
    tween(totalEl, "total", total);

    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      const extras = addons.map((a) => a.dataset.addon).join(", ");
      live.textContent = `${pkg.dataset.pkg}, ${qty} seat${qty === 1 ? "" : "s"}${extras ? ", with " + extras : ""}. Total ${money(total)} per month.`;
    }, 600);
  };

  form.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "pkg" || t.name === "addon") compute();
  });

  /* ---- stepper ---- */
  const setQty = (n: number) => {
    qty = Math.min(MAX_QTY, Math.max(MIN_QTY, n));
    qtyOut.value = String(qty);
    qtyOut.classList.remove("is-bump");
    void qtyOut.offsetWidth;
    qtyOut.classList.add("is-bump");
    $$<HTMLButtonElement>("[data-step]", root).forEach((b) => {
      const d = Number(b.dataset.step);
      b.disabled = (d < 0 && qty <= MIN_QTY) || (d > 0 && qty >= MAX_QTY);
    });
    compute();
  };
  $$<HTMLButtonElement>("[data-step]", root).forEach((b) => b.addEventListener("click", () => setQty(qty + Number(b.dataset.step))));

  /* ---- signature canvas ---- */
  const ctx = canvas.getContext("2d")!;
  let drawing = false;
  let last: { x: number; y: number; t: number } | null = null;
  let width = 1.6;

  const sizeCanvas = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    // Keep existing ink when resizing
    const snapshot = hasInk ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1b1b3a";
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
  };

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };

  const setConfirmState = () => {
    confirm.disabled = mode === "draw" ? !hasInk : nameInput.value.trim().length < 2;
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (accepted) return;
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
    ctx.beginPath();
    ctx.lineWidth = 1.8;
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.1, last.y + 0.1);
    ctx.stroke();
    hasInk = true;
    setConfirmState();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing || !last) return;
    const p = pos(e);
    const dist = Math.hypot(p.x - last.x, p.y - last.y);
    const dt = Math.max(1, p.t - last.t);
    const speed = dist / dt;
    const target = Math.max(1, Math.min(3, 3 - speed * 2.2));
    width += (target - width) * 0.3;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const stop = () => {
    drawing = false;
    last = null;
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", stop);

  /** Crops the canvas to the ink's bounding box (plus padding) so the placed signature isn't tiny. */
  const croppedInk = () => {
    const { width: w, height: h } = canvas;
    const data = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) return canvas.toDataURL("image/png");
    const pad = 12;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
    const out = document.createElement("canvas");
    out.width = x1 - x0;
    out.height = y1 - y0;
    out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  const clearInk = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
  };

  /* ---- modes ---- */
  const setMode = (m: "draw" | "type") => {
    mode = m;
    $$<HTMLButtonElement>("[data-mode]", pad).forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    $$("[data-surface]", pad).forEach((s) => (s.hidden = s.dataset.surface !== m));
    if (m === "draw") sizeCanvas();
    else nameInput.focus();
    setConfirmState();
  };
  $$<HTMLButtonElement>("[data-mode]", pad).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as "draw" | "type")));

  nameInput.addEventListener("input", () => {
    typePreview.textContent = nameInput.value.trim();
    setConfirmState();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !confirm.disabled) {
      e.preventDefault();
      confirm.click();
    }
  });

  clear.addEventListener("click", () => {
    clearInk();
    nameInput.value = "";
    typePreview.textContent = "";
    setConfirmState();
    (mode === "draw" ? canvas : nameInput).focus();
  });

  /* ---- open / close pad ---- */
  const openPad = (open: boolean) => {
    pad.hidden = !open;
    accept.setAttribute("aria-expanded", String(open));
    acceptLabel.textContent = open ? "Cancel" : "Accept & sign";
    if (open) {
      sizeCanvas();
      // Focus the first control so keyboard users land inside the pad.
      $<HTMLButtonElement>("[data-mode]", pad)?.focus({ preventScroll: true });
      pad.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  };
  accept.addEventListener("click", () => {
    if (accepted) return;
    openPad(pad.hasAttribute("hidden"));
  });

  /* ---- confirm ---- */
  confirm.addEventListener("click", () => {
    if (confirm.disabled) return;
    const name = nameInput.value.trim();
    slot.querySelectorAll("img, .sign__typed").forEach((n) => n.remove());
    if (mode === "draw") {
      const img = new Image();
      img.alt = "Customer signature";
      img.src = croppedInk();
      slot.appendChild(img);
      signer.textContent = "Lena Ortiz";
    } else {
      const t = document.createElement("span");
      t.className = "sign__typed";
      t.textContent = name;
      slot.appendChild(t);
      signer.textContent = name;
    }
    accepted = true;
    openPad(false);
    root.classList.add("is-accepted");
    statusText.textContent = "Accepted";
    acceptLabel.textContent = "Accepted";
    accept.disabled = true;
    accept.setAttribute("aria-expanded", "false");
    // Lock the configuration so the signed state is honest.
    $$<HTMLInputElement>("input, [data-step]", form).forEach((el) => ((el as HTMLInputElement).disabled = true));

    window.setTimeout(() => {
      after.hidden = false;
      $<HTMLAnchorElement>("a", after)?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 650);
  });

  /* ---- reset ---- */
  reset.addEventListener("click", () => {
    accepted = false;
    root.classList.remove("is-accepted");
    after.hidden = true;
    slot.querySelectorAll("img, .sign__typed").forEach((n) => n.remove());
    signer.textContent = "—";
    statusText.textContent = "Awaiting acceptance";
    acceptLabel.textContent = "Accept & sign";
    accept.disabled = false;
    $$<HTMLInputElement>("input, [data-step]", form).forEach((el) => ((el as HTMLInputElement).disabled = false));
    clearInk();
    nameInput.value = "";
    typePreview.textContent = "";
    setMode("draw");
    setQty(qty);
    accept.focus();
  });

  window.addEventListener("resize", () => {
    if (!pad.hasAttribute("hidden") && mode === "draw") sizeCanvas();
  });

  setQty(qty);
}

/* ═══════════════════════ Feature tabs ═══════════════════════ */

function initTabs() {
  const root = $("[data-tabs]");
  if (!root) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', root);
  const panels = $$('[role="tabpanel"]', root);
  let index = 0;
  let hovered = false;
  let focused = false;
  let visible = false;

  const updatePaused = () => root.classList.toggle("is-paused", hovered || focused || !visible);

  const show = (i: number, byUser = false) => {
    index = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === index;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      // Restart progress animation on the newly selected tab.
      const fill = $(".tab__fill", t);
      if (fill && on) {
        fill.style.animation = "none";
        void fill.offsetWidth;
        fill.style.animation = "";
      }
    });
    panels.forEach((p, k) => {
      const on = k === index;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
    });
    if (!byUser) return;
    tabs[index].focus({ preventScroll: true });
    // Keep the chosen tab in view inside the horizontally scrolling list only (never move the page).
    const list = tabs[index].parentElement!;
    const r = tabs[index].getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    if (r.left < lr.left || r.right > lr.right) {
      list.scrollBy({ left: r.left - lr.left - (lr.width - r.width) / 2, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  };

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => show(i, true));
    t.addEventListener("keydown", (e) => {
      const map: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
      if (e.key in map) {
        e.preventDefault();
        show(index + map[e.key], true);
      }
    });
  });

  // Advance when the progress bar finishes (a paused animation naturally delays this).
  if (!prefersReducedMotion) {
    root.addEventListener("animationend", (e) => {
      if ((e.target as HTMLElement).classList.contains("tab__fill") && e.animationName === "v6-fill") show(index + 1);
    });
  }

  root.addEventListener("pointerenter", () => { hovered = true; updatePaused(); });
  root.addEventListener("pointerleave", () => { hovered = false; updatePaused(); });
  root.addEventListener("focusin", () => { focused = true; updatePaused(); });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget as Node | null)) { focused = false; updatePaused(); }
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => { visible = entries.some((en) => en.isIntersecting); updatePaused(); },
      { threshold: 0.25 },
    ).observe(root);
  } else {
    visible = true;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) root.classList.add("is-paused");
    else updatePaused();
  });
  updatePaused();
}

/* ═══════════════════════ Sticky mobile CTA ═══════════════════════ */

function initSticky() {
  const bar = $("[data-sticky]");
  const hero = $("#hero");
  const close = $("#start");
  const footer = $(".qc-footer");
  if (!bar || !hero || !close || !("IntersectionObserver" in window)) return;
  bar.hidden = false;
  let heroGone = false;
  const visibleEnds = new Set<Element>();
  const apply = () => bar.classList.toggle("is-on", heroGone && visibleEnds.size === 0);
  new IntersectionObserver(
    (en) => { heroGone = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; apply(); },
    { threshold: 0 },
  ).observe(hero);
  const endIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? visibleEnds.add(e.target) : visibleEnds.delete(e.target)));
      apply();
    },
    { threshold: 0.05 },
  );
  endIO.observe(close);
  if (footer) endIO.observe(footer);
}

initDemo();
initTabs();
initSticky();
