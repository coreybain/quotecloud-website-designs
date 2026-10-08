import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const motion = !prefersReducedMotion;

const NAMES: Record<string, string> = {
  price: "Price Table",
  sheet: "Spreadsheet",
  form: "Forms",
  sign: "eSignature",
  text: "Text",
  pdf: "PDF",
  toc: "Table of Contents",
  gantt: "Gantt Chart",
  diagram: "Diagram",
  itin: "Itinerary",
  image: "Image",
  gallery: "Gallery",
  video: "Video",
  button: "Button",
  qr: "QR Code",
  barcode: "Barcode",
  shapes: "Shapes",
  space: "Empty Space",
};

const RATE = 0.069;
const pmt = (principal: number, months: number) => {
  const r = RATE / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
};

/** Pressed state within a segmented group. */
function press(btn: HTMLElement) {
  btn.parentElement?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
}

/** Restart a CSS animation class on an element. */
function retrigger(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** Tween a number shown in `el` (keeps the target in data-v). */
const tweens = new WeakMap<Element, number>();
function setNum(el: HTMLElement | null, to: number, fmt: (n: number) => string = money) {
  if (!el) return;
  const from = el.dataset.v === undefined ? to : Number(el.dataset.v);
  el.dataset.v = String(to);
  if (!motion || Math.round(from) === Math.round(to)) {
    el.textContent = fmt(to);
    return;
  }
  cancelAnimationFrame(tweens.get(el) ?? 0);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 520);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
  retrigger(el, "is-tick");
}

/* ───────── Editor demo ───────── */

function initDemo() {
  const demo = $("[data-demo]");
  const doc = demo && $("[data-doc]", demo);
  const canvas = demo && $("[data-canvas]", demo);
  if (!demo || !doc || !canvas) return;

  const announcer = $("[data-announce]", demo);
  const say = (msg: string) => {
    if (announcer) announcer.textContent = msg;
  };

  // Block markup: seeded blocks (captured before enhancement) + <template>s.
  const tpl = new Map<string, string>();
  $$<HTMLTemplateElement>("template[id^='bk3-tpl-']").forEach((t) => tpl.set(t.id.replace("bk3-tpl-", ""), t.innerHTML.trim()));
  $$(".bk3-blk", doc).forEach((b) => tpl.set(b.dataset.block!, b.outerHTML));
  const initialHTML = doc.innerHTML;

  let interacted = false;
  const blocks = () => $$(".bk3-blk:not(.is-leaving)", doc);
  const blk = (key: string) => $(`.bk3-blk[data-block="${key}"]:not(.is-leaving)`, doc);
  const palBtn = (key: string) => $(`[data-add="${key}"]`, demo);

  const fromHTML = (html: string) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap.firstElementChild as HTMLElement;
  };

  /* ── Mounting: chrome + per-block setup ── */

  function mount(b: HTMLElement) {
    const key = b.dataset.block!;
    if (!$(".bk3-blk__chrome", b)) {
      const chrome = document.createElement("div");
      chrome.className = "bk3-blk__chrome";
      chrome.innerHTML =
        `<span class="bk3-blk__tag"><svg class="bk3-ic" aria-hidden="true"><use href="#bk3-i-${key}"/></svg>${NAMES[key]}</span>` +
        `<button class="bk3-blk__rm" type="button" data-rm aria-label="Remove ${NAMES[key]} block"><svg class="bk3-ic" aria-hidden="true"><use href="#bk3-i-x"/></svg></button>`;
      b.prepend(chrome);
    }
    if (key === "sign") mountSign(b);
    if (key === "qr") renderQR(b, false);
    if (key === "barcode") renderBarcode(b);
    if (key === "gantt") updateGoLive(b);
  }

  /* ── Live maths: price table ⇄ spreadsheet ⇄ signature ── */

  function recalc() {
    const price = blk("price");
    const sheet = blk("sheet");
    let total = 30470;
    if (price) {
      let sub = 0;
      $$("[data-row]", price).forEach((row) => {
        const on = row.dataset.on !== "false";
        const amt = Number(row.dataset.qty) * Number(row.dataset.price);
        row.classList.toggle("is-off", !on);
        setNum($("[data-amt]", row), amt);
        if (on) sub += amt;
      });
      const tax = sub * 0.1;
      total = sub + tax;
      setNum($("[data-sub]", price), sub);
      setNum($("[data-tax]", price), tax);
      setNum($("[data-total]", price), total);
      const fin = $("[data-fin]", price);
      if (fin) fin.hidden = !sheet;
    }
    if (sheet) {
      const term = Number(sheet.dataset.term) || 36;
      const mo = pmt(total, term);
      sheet.classList.toggle("is-unlinked", !price);
      const totalCell = $("[data-ss-total] b", sheet);
      if (price) setNum(totalCell, total);
      else if (totalCell) {
        totalCell.textContent = "#REF!";
        delete totalCell.dataset.v;
      }
      const termCell = $("[data-ss-term]", sheet);
      if (termCell) termCell.textContent = String(term);
      setNum($("[data-ss-mo]", sheet), price ? mo : 0, (n) => (price ? money(n) : "—"));
      if (price) {
        const finTerm = $("[data-fin-term]", price);
        if (finTerm) finTerm.textContent = String(term);
        setNum($("[data-fin-mo]", price), mo, (n) => money(n) + "/mo");
      }
    }
    const sign = blk("sign");
    if (sign) setNum($("[data-sign-total]", sign), total);
    setNum($("[data-client-total]", demo!), total);
  }

  /* ── Table of contents ── */

  function buildToc() {
    const toc = $("[data-toc]", doc!);
    if (!toc) return;
    const items = blocks().filter((b) => b.dataset.title && b.dataset.block !== "toc");
    toc.replaceChildren(
      ...items.map((b, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.tocGo = b.dataset.block;
        btn.innerHTML = `<span class="bk3-toc__n">${String(i + 1).padStart(2, "0")}</span><span class="bk3-toc__t"></span><span class="bk3-toc__dots"></span><span class="bk3-toc__p">${1 + Math.floor(i / 2)}</span>`;
        $(".bk3-toc__t", btn)!.textContent = b.dataset.title!;
        li.append(btn);
        return li;
      }),
    );
    if (!items.length) toc.innerHTML = `<li class="bk3-note">Add blocks with headings and they appear here.</li>`;
  }

  /* ── Palette + counters ── */

  const countEl = $("[data-added]", demo);
  const closeLine = $("[data-close-line]");
  function syncPalette() {
    const present = new Set(blocks().map((b) => b.dataset.block));
    $$("[data-add]", demo!).forEach((btn) => {
      const key = btn.dataset.add!;
      const on = present.has(key);
      btn.classList.toggle("is-added", on);
      btn.setAttribute("aria-label", on ? `${NAMES[key]}: in the document. Go to block` : `Add ${NAMES[key]} block`);
    });
    if (countEl) countEl.textContent = String(present.size);
    if (closeLine && interacted) {
      closeLine.textContent = `Your demo proposal used ${present.size} of 18 content blocks. All 18 are included in your free 14-day trial.`;
    }
  }

  const refresh = () => {
    recalc();
    buildToc();
    syncPalette();
  };

  /* ── Motion helpers ── */

  function flip(mutate: () => void) {
    const before = new Map(blocks().map((b) => [b, b.getBoundingClientRect().top]));
    mutate();
    if (!motion) return;
    before.forEach((top, b) => {
      if (!b.isConnected) return;
      const dy = top - b.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) b.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 480, easing: EASE });
    });
  }

  /** Scrolls the document pane (never the page) so `b` sits near the top; returns the final scrollTop. */
  function scrollToBlock(b: HTMLElement, smooth = true) {
    const desired = b.getBoundingClientRect().top - canvas!.getBoundingClientRect().top + canvas!.scrollTop - 24;
    const top = clamp(desired, 0, canvas!.scrollHeight - canvas!.clientHeight);
    canvas!.scrollTo({ top, behavior: smooth && motion ? "smooth" : "auto" });
    return top;
  }

  function flash(b: HTMLElement) {
    retrigger(b, "is-flash");
    window.setTimeout(() => b.classList.remove("is-flash"), 1600);
  }

  function flyGhost(from: HTMLElement, to: HTMLElement, finalScroll: number) {
    const a = from.getBoundingClientRect();
    if (!a.width) return;
    const c = canvas!.getBoundingClientRect();
    const targetTop = to.getBoundingClientRect().top - c.top + canvas!.scrollTop - finalScroll + c.top;
    const tr = to.getBoundingClientRect();
    const g = document.createElement("div");
    g.className = "bk3-ghost";
    g.setAttribute("aria-hidden", "true");
    g.innerHTML = from.innerHTML;
    Object.assign(g.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.append(g);
    const dx = tr.left + 16 - a.left;
    const dy = targetTop + 8 - a.top;
    g.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 30}px) scale(1.04)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0 },
      ],
      { duration: 620, easing: EASE },
    ).finished.then(
      () => g.remove(),
      () => g.remove(),
    );
  }

  /* ── Add / remove ── */

  function insertBefore(key: string): Element | null {
    const list = blocks();
    if (key === "text") return list[0] ?? null;
    if (key === "toc") {
      const text = blk("text");
      return text ? text.nextElementSibling : (list[0] ?? null);
    }
    if (key === "sign") return null;
    return blk("sign");
  }

  function addBlock(key: string, opts: { from?: HTMLElement | null; quick?: boolean; user?: boolean } = {}) {
    if (opts.user) interacted = true;
    const existing = blk(key);
    if (existing) {
      scrollToBlock(existing);
      flash(existing);
      say(`${NAMES[key]} is already in the document`);
      return;
    }
    const html = tpl.get(key);
    if (!html) return;
    const node = fromHTML(html);
    flip(() => doc!.insertBefore(node, insertBefore(key)));
    mount(node);
    refresh();
    const finalScroll = scrollToBlock(node);
    say(`${NAMES[key]} block added`);
    if (!motion) return;
    const fly = !!opts.from && !opts.quick;
    if (fly) flyGhost(opts.from!, node, finalScroll);
    node.animate(
      [
        { opacity: 0, transform: "translateY(16px) scale(0.985)", clipPath: "inset(0 0 100% 0 round 14px)" },
        { opacity: 1, transform: "none", clipPath: "inset(0 0 0% 0 round 14px)" },
      ],
      { duration: 640, delay: fly ? 300 : 0, easing: EASE, fill: "backwards" },
    );
    window.setTimeout(() => flash(node), fly ? 520 : 200);
    if (key === "diagram") retrigger($(".bk3-dg", node)!, "is-drawing");
  }

  function removeBlock(b: HTMLElement) {
    interacted = true;
    const key = b.dataset.block!;
    b.classList.add("is-leaving");
    const done = () => {
      flip(() => b.remove());
      refresh();
    };
    say(`${NAMES[key]} block removed`);
    palBtn(key)?.focus({ preventScroll: true });
    if (!motion) return done();
    b.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.97)" }], { duration: 240, easing: "ease-in", fill: "forwards" }).finished.then(done, done);
  }

  /* ── Signature ── */

  function setSignState(b: HTMLElement, state: "empty" | "ready" | "signed") {
    const sg = $(".bk3-sg", b)!;
    sg.dataset.state = state;
    const accept = $<HTMLButtonElement>("[data-sign-accept]", b);
    if (accept) accept.disabled = state !== "ready";
    const done = $("[data-sign-done]", b);
    if (done) done.hidden = state !== "signed";
    const clientBtn = $<HTMLButtonElement>("[data-client-sign]", demo!);
    if (clientBtn) {
      clientBtn.textContent = state === "signed" ? "Accepted ✓" : "Sign & accept";
      clientBtn.classList.toggle("is-done", state === "signed");
    }
  }

  function mountSign(b: HTMLElement) {
    const svg = $<SVGSVGElement>("[data-sign-pad]", b);
    const path = svg && $<SVGPathElement>("[data-sign-path]", svg);
    if (!svg || !path) return;
    svg.setAttribute("preserveAspectRatio", "none");
    let d = path.getAttribute("d") ?? "";
    let drawing = false;
    let box = { w: 400, h: 120 };
    const pt = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return `${(((e.clientX - r.left) / r.width) * box.w).toFixed(1)} ${(((e.clientY - r.top) / r.height) * box.h).toFixed(1)}`;
    };
    svg.addEventListener("pointerdown", (e) => {
      if ($(".bk3-sg", b)?.dataset.state === "signed") return;
      if (!d) {
        const r = svg.getBoundingClientRect();
        box = { w: Math.round(r.width) || 400, h: Math.round(r.height) || 120 };
        svg.setAttribute("viewBox", `0 0 ${box.w} ${box.h}`);
      }
      drawing = true;
      svg.setPointerCapture(e.pointerId);
      d += `M${pt(e)}`;
      path.setAttribute("d", d);
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      d += `L${pt(e)}`;
      path.setAttribute("d", d);
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      if (d.length > 24) setSignState(b, "ready");
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    (b as HTMLElement & { clearSig?: () => void }).clearSig = () => {
      d = "";
      path.setAttribute("d", "");
    };
  }

  function signMode(b: HTMLElement, mode: string) {
    const sg = $(".bk3-sg", b)!;
    sg.dataset.mode = mode;
    const wrap = $("[data-sign-type-wrap]", b);
    if (wrap) wrap.hidden = mode !== "type";
    if (mode === "type") $<HTMLInputElement>("[data-sign-input]", b)?.focus();
  }

  function clearSign(b: HTMLElement) {
    (b as HTMLElement & { clearSig?: () => void }).clearSig?.();
    const input = $<HTMLInputElement>("[data-sign-input]", b);
    if (input) input.value = "";
    const typed = $("[data-sign-typed]", b);
    if (typed) typed.textContent = "";
    setSignState(b, "empty");
  }

  /* ── QR + barcode generators (illustrative, deterministic) ── */

  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function renderQR(b: HTMLElement, animate = true) {
    const svg = $("[data-qr]", b);
    const input = $<HTMLInputElement>("[data-qr-in]", b);
    if (!svg || !input) return;
    const N = 25;
    const rand = rng(hash(input.value || "quote.cloud"));
    const finder = (x: number, y: number, ox: number, oy: number) => {
      const dx = x - ox;
      const dy = y - oy;
      if (dx < -1 || dy < -1 || dx > 7 || dy > 7) return null;
      if (dx === -1 || dy === -1 || dx === 7 || dy === 7) return false;
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      return ring !== 2;
    };
    let out = "";
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let on: boolean | null = finder(x, y, 0, 0) ?? finder(x, y, N - 7, 0) ?? finder(x, y, 0, N - 7);
        if (on === null && x >= N - 9 && x <= N - 5 && y >= N - 9 && y <= N - 5) {
          const r = Math.max(Math.abs(x - (N - 7)), Math.abs(y - (N - 7)));
          on = r !== 1;
        }
        if (on === null && (x === 6 || y === 6)) on = (x + y) % 2 === 0;
        if (on === null) on = rand() > 0.52;
        if (on) out += `<rect x="${x}" y="${y}" width="1.02" height="1.02" style="--d:${(x + y) * 11}ms"/>`;
      }
    }
    svg.setAttribute("viewBox", "-2 -2 29 29");
    svg.innerHTML = out;
    svg.setAttribute("aria-label", `Sample QR code for ${input.value || "a link"}`);
    if (animate && motion) retrigger(svg, "is-new");
  }

  function renderBarcode(b: HTMLElement) {
    const svg = $("[data-bc]", b);
    const input = $<HTMLInputElement>("[data-bc-in]", b);
    const txt = $("[data-bc-txt]", b);
    if (!svg || !input) return;
    const value = (input.value || "QC").toUpperCase();
    const widths: number[] = [2, 1, 1, 2];
    for (const ch of value) {
      const c = ch.charCodeAt(0);
      widths.push(1 + (c % 3), 1 + ((c >> 2) % 2), 1 + ((c >> 3) % 3), 1 + ((c >> 1) % 2));
    }
    widths.push(2, 1, 1, 2);
    const total = widths.reduce((a, n) => a + n, 0);
    const unit = 200 / total;
    let x = 0;
    let out = "";
    widths.forEach((w, i) => {
      if (i % 2 === 0) out += `<rect x="${(x * unit).toFixed(2)}" y="0" width="${(w * unit).toFixed(2)}" height="60"/>`;
      x += w;
    });
    svg.innerHTML = out;
    svg.setAttribute("aria-label", `Sample barcode for ${value}`);
    if (txt) txt.textContent = value;
  }

  /* ── Gantt ── */

  const WEEKS = 10;
  function updateGoLive(g: HTMLElement) {
    const end = Math.max(...$$(".bk3-gt__bar", g).map((bar) => Number(bar.dataset.s) + Number(bar.dataset.l)));
    const el = $("[data-golive]", g);
    if (el) el.textContent = `week ${end}`;
  }
  function setBar(bar: HTMLElement, s: number) {
    const l = Number(bar.dataset.l);
    const next = clamp(s, 0, WEEKS - l);
    if (String(next) === bar.dataset.s) return;
    bar.dataset.s = String(next);
    bar.style.setProperty("--s", String(next));
    bar.setAttribute("aria-valuenow", String(next + 1));
    bar.setAttribute("aria-valuetext", `Weeks ${next + 1} to ${next + l}`);
    const g = bar.closest<HTMLElement>(".bk3-blk");
    if (g) updateGoLive(g);
  }

  /* ── Itinerary import ── */

  const IMPORTED = [
    { ic: "car", t: "Private transfer, CDG → hotel", s: "Thu 15 Oct · 08:30", tag: "Transfer" },
    { ic: "hotel", t: "Hotel, Le Marais", s: "Thu 15 Oct · 3 nights · breakfast", tag: "Hotel" },
    { ic: "cal", t: "Kickoff workshop", s: "Fri 16 Oct · 10:00 – 13:00", tag: "Meeting" },
  ];
  async function importItin(b: HTMLElement, btn: HTMLButtonElement) {
    const list = $("[data-it-list]", b);
    const src = $<HTMLSelectElement>("[data-it-src]", b)?.value ?? "Sabre GDS";
    if (!list) return;
    btn.disabled = true;
    btn.textContent = "Importing…";
    await wait(motion ? 420 : 0);
    for (const item of IMPORTED) {
      const li = document.createElement("li");
      li.className = "bk3-it__row";
      li.innerHTML = `<span class="bk3-it__ic"><svg class="bk3-ic" aria-hidden="true"><use href="#bk3-i-${item.ic}"/></svg></span><span class="bk3-it__txt"><b></b><span></span></span><span class="bk3-it__tag"></span>`;
      $("b", li)!.textContent = item.t;
      $(".bk3-it__txt span", li)!.textContent = item.s;
      $(".bk3-it__tag", li)!.textContent = item.tag;
      list.append(li);
      if (motion) li.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
      await wait(motion ? 170 : 0);
    }
    btn.textContent = `Imported from ${src.replace(" document", "")}`;
    btn.classList.add("is-done");
    buildToc();
    say(`Three bookings imported from ${src}`);
  }

  /* ── Gallery layouts (FLIP) ── */

  function setLayout(b: HTMLElement, layout: string) {
    const gl = $(".bk3-gl", b);
    if (!gl) return;
    const tiles = $$(".bk3-gl__t", gl);
    const first = tiles.map((t) => t.getBoundingClientRect());
    gl.dataset.layout = layout;
    if (!motion) return;
    tiles.forEach((t, i) => {
      const last = t.getBoundingClientRect();
      const f = first[i];
      if (!last.width || !last.height) return;
      t.animate(
        [
          { transform: `translate(${f.left - last.left}px, ${f.top - last.top}px) scale(${f.width / last.width}, ${f.height / last.height})` },
          { transform: "none" },
        ],
        { duration: 560, easing: EASE },
      );
    });
  }

  /* ── Client preview ── */

  const previewBtn = $("[data-preview]", demo);
  const previewLabel = $("[data-preview-label]", demo);
  function setClient(on: boolean) {
    if (demo!.classList.contains("is-client") === on) return;
    demo!.classList.toggle("is-client", on);
    previewBtn?.setAttribute("aria-pressed", String(on));
    if (previewLabel) previewLabel.textContent = on ? "Back to editor" : "Preview as client";
    if (motion) doc!.animate([{ opacity: 0.4, transform: "scale(0.985)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
    say(on ? "Showing the client view" : "Back in the editor");
  }

  /* ── Reset + presets ── */

  function reset() {
    setClient(false);
    doc!.innerHTML = initialHTML;
    blocks().forEach(mount);
    refresh();
    canvas!.scrollTo({ top: 0 });
    say("Demo reset to three blocks");
  }

  let presetRun = 0;
  async function loadPreset(keys: string[]) {
    const run = ++presetRun;
    stopAuto();
    interacted = true;
    setClient(false);
    $("#editor")?.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "start" });
    doc!.innerHTML = "";
    refresh();
    await wait(motion ? 520 : 0);
    for (const k of keys) {
      if (run !== presetRun) return;
      addBlock(k, { quick: true });
      await wait(motion ? 240 : 0);
    }
    await wait(motion ? 500 : 0);
    if (run === presetRun) canvas!.scrollTo({ top: 0, behavior: motion ? "smooth" : "auto" });
  }

  /* ── Auto-demo: two blocks drop in on first view, until the visitor takes over ── */

  let autoTimer = 0;
  let autoOn = motion;
  function stopAuto() {
    autoOn = false;
    window.clearTimeout(autoTimer);
  }
  if (autoOn) {
    const seq = ["sheet", "gantt"];
    const step = (i: number) => {
      if (!autoOn || i >= seq.length) return;
      const btn = palBtn(seq[i]);
      if (!btn || blk(seq[i])) return step(i + 1);
      btn.classList.add("is-press");
      autoTimer = window.setTimeout(() => {
        btn.classList.remove("is-press");
        if (!autoOn) return;
        addBlock(seq[i], { from: btn });
        autoTimer = window.setTimeout(() => step(i + 1), 2600);
      }, 420);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        autoTimer = window.setTimeout(() => step(0), 1300);
      },
      { threshold: 0.35 },
    );
    io.observe(demo);
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) demo.addEventListener(ev, stopAuto, { passive: true });
  }

  /* ── Events (delegated, so blocks added later just work) ── */

  demo.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!btn || !demo.contains(btn)) return;
    const b = btn.closest<HTMLElement>(".bk3-blk");
    const ds = btn.dataset;

    if (ds.add) return addBlock(ds.add, { from: btn, user: true });
    if (btn.hasAttribute("data-reset")) {
      interacted = true;
      return reset();
    }
    if (btn.hasAttribute("data-preview")) return setClient(!demo.classList.contains("is-client"));
    if (btn.hasAttribute("data-client-sign")) {
      const sign = blk("sign");
      if (!sign) return addBlock("sign", { user: true });
      scrollToBlock(sign);
      flash(sign);
      $<HTMLButtonElement>("[data-sign-mode='type']", sign)?.focus({ preventScroll: true });
      return;
    }
    if (ds.tocGo) {
      const target = blk(ds.tocGo);
      if (target) {
        scrollToBlock(target);
        flash(target);
      }
      return;
    }
    if (!b) return;

    if (btn.hasAttribute("data-rm")) return removeBlock(b);

    if (btn.hasAttribute("data-opt")) {
      const row = btn.closest<HTMLElement>("[data-row]")!;
      const on = row.dataset.on !== "true";
      row.dataset.on = String(on);
      btn.setAttribute("aria-checked", String(on));
      return recalc();
    }
    if (ds.step) {
      const row = btn.closest<HTMLElement>("[data-row]")!;
      const qty = clamp(Number(row.dataset.qty) + Number(ds.step), 1, 9);
      row.dataset.qty = String(qty);
      const out = $("[data-qty-out]", row);
      if (out) out.textContent = String(qty);
      return recalc();
    }
    if (ds.term) {
      b.dataset.term = ds.term;
      press(btn);
      recalc();
      $$(".bk3-ss__v.is-linked, .bk3-ss__v.is-out", b).forEach((c) => retrigger(c, "is-pulse"));
      const fin = blk("price") && $("[data-fin]", blk("price")!);
      if (fin) retrigger(fin, "is-pulse");
      return;
    }
    if (ds.dg) {
      const dg = $(".bk3-dg", b)!;
      dg.dataset.mode = ds.dg;
      press(btn);
      if (motion) retrigger(dg, "is-drawing");
      return;
    }
    if (ds.pdf) {
      const pdf = $(".bk3-pdf", b)!;
      const page = clamp(Number(pdf.dataset.page) + Number(ds.pdf), 0, 3);
      pdf.dataset.page = String(page);
      $("[data-pdf-strip]", pdf)!.style.setProperty("--p", String(page));
      $("[data-pdf-n]", pdf)!.textContent = `${page + 1} / 4`;
      return;
    }
    if (btn.hasAttribute("data-play")) {
      const video = $<HTMLVideoElement>("video", b);
      if (!video) return;
      if (!video.src && video.dataset.src) video.src = video.dataset.src;
      video.controls = true;
      b.querySelector(".bk3-vd")?.classList.add("is-playing");
      video.play().catch(() => undefined);
      video.focus({ preventScroll: true });
      return;
    }
    if (ds.aspect) {
      $(".bk3-im", b)!.dataset.aspect = ds.aspect;
      return press(btn);
    }
    if (ds.layout) {
      setLayout(b, ds.layout);
      return press(btn);
    }
    if (ds.bt) {
      const labels: Record<string, string> = { book: "Book your kickoff call", pay: "Pay the deposit online", file: "Download the brand guide" };
      $(".bk3-bt", b)!.dataset.kind = ds.bt;
      const label = $("[data-bt-label]", b);
      if (label) label.textContent = labels[ds.bt];
      retrigger($(".bk3-bt__cta", b)!, "is-tick");
      return press(btn);
    }
    if (ds.shape) {
      $(".bk3-sh", b)!.dataset.shape = ds.shape;
      return press(btn);
    }
    if (ds.tone) {
      $(".bk3-sh", b)!.dataset.tone = ds.tone;
      return press(btn);
    }
    if (ds.space) {
      const es = $(".bk3-es", b)!;
      es.dataset.size = ds.space;
      const px = $("[data-es-px]", es);
      if (px) px.textContent = ({ s: "24", m: "48", l: "96" } as Record<string, string>)[ds.space];
      return press(btn);
    }
    if (btn.hasAttribute("data-import")) return void importItin(b, btn);
    if (ds.signMode) {
      press(btn);
      return signMode(b, ds.signMode);
    }
    if (btn.hasAttribute("data-sign-clear")) return clearSign(b);
    if (btn.hasAttribute("data-sign-accept")) {
      const when = $("[data-sign-when]", b);
      if (when) {
        when.textContent = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      }
      setSignState(b, "signed");
      say("Proposal signed and accepted");
      if (motion) $("[data-sign-done]", b)?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
      return;
    }
  });

  let qrTimer = 0;
  demo.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    const b = t.closest<HTMLElement>(".bk3-blk");
    if (!b) return;
    if (t.matches("[data-qr-in]")) {
      window.clearTimeout(qrTimer);
      qrTimer = window.setTimeout(() => renderQR(b), 180);
    } else if (t.matches("[data-bc-in]")) {
      renderBarcode(b);
    } else if (t.matches("[data-sign-input]")) {
      const typed = $("[data-sign-typed]", b);
      if (typed) typed.textContent = t.value;
      (b as HTMLElement & { clearSig?: () => void }).clearSig?.();
      setSignState(b, t.value.trim().length > 1 ? "ready" : "empty");
    }
  });

  demo.addEventListener("submit", (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>("[data-form]");
    if (!form) return;
    e.preventDefault();
    const name = (new FormData(form).get("company") as string | null)?.trim() || "your team";
    const msg = $("[data-form-msg]", form);
    if (msg) msg.textContent = `Thanks, ${name}. Your answers are saved to the proposal.`;
    const ok = $("[data-form-ok]", form);
    if (ok) {
      ok.hidden = false;
      if (motion) ok.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: EASE });
    }
    const go = $(".bk3-fm__go", form);
    if (go) go.textContent = "Update answers";
    say("Form answers saved");
  });

  // Gantt: drag (pointer) and nudge (keyboard).
  demo.addEventListener("pointerdown", (e) => {
    const bar = (e.target as HTMLElement).closest<HTMLElement>(".bk3-gt__bar");
    if (!bar) return;
    const track = bar.parentElement!;
    const week = track.getBoundingClientRect().width / WEEKS;
    const startX = e.clientX;
    const s0 = Number(bar.dataset.s);
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("is-drag");
    const move = (ev: PointerEvent) => setBar(bar, s0 + Math.round((ev.clientX - startX) / week));
    const up = () => {
      bar.classList.remove("is-drag");
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  });
  demo.addEventListener("keydown", (e) => {
    const bar = (e.target as HTMLElement).closest?.<HTMLElement>(".bk3-gt__bar");
    if (!bar) return;
    const s = Number(bar.dataset.s);
    const map: Record<string, number> = { ArrowLeft: s - 1, ArrowDown: s - 1, ArrowRight: s + 1, ArrowUp: s + 1, Home: 0, End: WEEKS };
    if (!(e.key in map)) return;
    e.preventDefault();
    setBar(bar, map[e.key]);
  });

  // Outside the demo: "try" buttons in the index and document-type presets.
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-try], [data-preset]");
    if (!btn) return;
    if (btn.dataset.preset) return void loadPreset(btn.dataset.preset.split(","));
    const key = btn.dataset.try!;
    stopAuto();
    setClient(false);
    $("#editor")?.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "start" });
    window.setTimeout(() => addBlock(key, { from: palBtn(key), user: true }), motion ? 650 : 0);
  });

  // Enhance the seeded document.
  blocks().forEach(mount);
  refresh();
}

/* ───────── Pause looping showcase animations off-screen ───────── */

function initLoops() {
  const loops = $$(".bk3-loop");
  if (!motion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle("is-playing", entry.isIntersecting);
    },
    { threshold: 0.2 },
  );
  loops.forEach((el) => io.observe(el));
}

initDemo();
initLoops();
