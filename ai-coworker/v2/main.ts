import "../../src/shared/site.ts";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* All "AI" output on this page is pre-written sample text played back. No model or API is called. */

/* ───────── Helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Tracks whether an element is on screen. */
function visibility(el: Element) {
  const state = { on: false };
  if (!("IntersectionObserver" in window)) state.on = true;
  else new IntersectionObserver((entries) => entries.forEach((e) => (state.on = e.isIntersecting))).observe(el);
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

/** Splits an element's text into word spans for streaming. */
function wrapWords(el: HTMLElement, text = el.textContent?.trim() ?? "") {
  el.textContent = "";
  const parts = text.split(/\s+/);
  return parts.map((word, i) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = word + (i < parts.length - 1 ? " " : "");
    el.append(span);
    return span;
  });
}

/** Streams word spans in with a short violet leading edge. Returns false if cancelled. */
async function stream(words: HTMLElement[], sleep: (ms: number) => Promise<void>, ms = 45, alive = () => true) {
  for (const w of words) {
    if (!alive()) return false;
    w.classList.add("on", "fresh");
    window.setTimeout(() => w.classList.remove("fresh"), 450);
    await sleep(ms);
  }
  return true;
}

/** Writes a sentence into `el` (instantly when motion is reduced). */
async function streamText(el: HTMLElement, text: string, alive = () => true, ms = 32) {
  const words = wrapWords(el, text);
  if (prefersReducedMotion) {
    words.forEach((w) => w.classList.add("on"));
    return;
  }
  await stream(words, wait, ms, alive);
}

function countMoney(el: Element, from: number, to: number, duration = 800) {
  if (prefersReducedMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ───────── Hero: pasted notes → prompt → streamed draft → Insert ───────── */

function initHero() {
  const vis = $(".hero__visual");
  const ed = $("[data-hero]");
  const paste = $("[data-hero-paste]");
  const typed = $("[data-hero-typed]");
  const draft = $("[data-hero-draft]");
  const insert = $("[data-hero-insert]");
  const cursor = $("[data-hero-cursor]");
  const input = $(".ai__input");
  if (!vis || !ed || !paste || !typed || !draft || !insert || !cursor || !input || prefersReducedMotion) return;

  const words = wrapWords(draft);
  const gate = visibility(vis);
  const sleep = pausableSleep(gate);
  const prompt = "Write the introduction from my call notes";
  const set = (h: number) => (vis.dataset.h = String(h));

  const aimPaste = () => {
    const a = paste.getBoundingClientRect();
    const b = input.getBoundingClientRect();
    paste.style.setProperty("--px", `${b.left - a.left + 10}px`);
    paste.style.setProperty("--py", `${b.top - a.top + 8}px`);
  };
  const aimCursor = (el: Element, dx = 0.5, dy = 0.55) => {
    const a = ed.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    cursor.style.setProperty("--cx", `${b.left - a.left + b.width * dx}px`);
    cursor.style.setProperty("--cy", `${b.top - a.top + b.height * dy}px`);
  };

  const loop = async () => {
    for (;;) {
      words.forEach((w) => w.classList.remove("on", "fresh"));
      typed.textContent = "";
      set(0);
      await sleep(1700);

      aimPaste();
      set(1);
      await sleep(650);
      for (let i = 1; i <= prompt.length; i++) {
        typed.textContent = prompt.slice(0, i);
        await sleep(28);
      }
      await sleep(550);

      typed.textContent = "";
      set(2);
      await sleep(450);
      await stream(words, sleep, 42);
      await sleep(350);

      const page = $(".ed__page", ed);
      if (page) aimCursor(page, 0.5, 0.3);
      set(3);
      await sleep(120);
      aimCursor(insert);
      await sleep(950);
      insert.classList.add("is-press");
      await sleep(180);
      insert.classList.remove("is-press");

      set(4);
      await sleep(5200);
    }
  };
  set(0);
  onceVisible(vis, () => void loop(), 0.2);
}

/* ───────── Story: the pinned mess → document transformation ───────── */

const ASK: Record<number, { prompt: string; busy?: string; done: string; note?: boolean }> = {
  1: { prompt: "Turn this airfare search into an itinerary", busy: "Parsing itinerary from clipboard...", done: "Itinerary added" },
  2: { prompt: "Make a pricing table from these group rates", busy: "Building pricing table...", done: "Pricing table added" },
  3: { prompt: "Write the introduction from my call notes", busy: "Writing in a professional tone...", done: "Introduction added" },
  4: { prompt: "Use our brand font for all headings", busy: "Restyling headings...", done: "Headings updated" },
  5: { prompt: "Review each AI block: Accept, Edit or Reject", done: "AI Coworker can make mistakes. Check important info.", note: true },
  6: { prompt: "Send to Priya Shah for signature", busy: "Sending...", done: "Signed by Priya Shah" },
};

function initStory() {
  const track = $("[data-track]");
  const stage = $("[data-stage]");
  const sticky = $(".story__sticky");
  if (!track || !stage || !sticky) return;

  const rail = $$<HTMLButtonElement>("[data-go]");
  const caps = $$("[data-cap]");
  const fill = $("[data-rail-fill]");
  const ask = $("[data-ask]")!;
  const status = $("[data-ask-status]")!;
  const count = $("[data-clip-count]");
  const clipWin = $('[data-win="clip"]')!;
  const docWin = $('[data-win="doc"]')!;
  const clipIn = $('[data-pan="clip"]')!;
  const docIn = $('[data-pan="doc"]')!;
  const wires = $<SVGSVGElement>("[data-wires]")!;
  const cursor = $<SVGSVGElement>("[data-cursor]")!;
  const scan = $("[data-scan]")!;
  const desktop = window.matchMedia("(min-width: 1000px)");

  buildPairs(stage);

  let current = -1;
  let token = 0;

  const setFlags = (n: number) => {
    stage.dataset.step = String(n);
    for (let i = 1; i <= 6; i++) stage.toggleAttribute(`data-s${i}`, i <= n);
    if (count) count.textContent = n >= 3 ? "Empty" : `${3 - Math.min(n, 3)} paste${3 - n === 1 ? "" : "s"}`;
  };

  const setStatus = (kind: "" | "busy" | "done" | "note", text = "") => {
    status.className = "ask__status" + (kind === "done" ? " is-done" : kind === "note" ? " is-note" : "");
    status.innerHTML = "";
    if (!kind) return;
    if (kind === "busy") status.append(Object.assign(document.createElement("span"), { className: "spin" }));
    if (kind === "done") status.insertAdjacentHTML("beforeend", '<svg class="ac-i" width="14" height="14"><use href="#ac-check" /></svg>');
    status.append(text);
  };

  const setAsk = (n: number) => {
    ask.classList.remove("is-typing");
    if (n === 0) {
      ask.textContent = "Ask AI Coworker";
      ask.classList.add("is-ph");
      setStatus("");
      return;
    }
    ask.classList.remove("is-ph");
    ask.textContent = ASK[n].prompt;
    setStatus(ASK[n].note ? "note" : "done", ASK[n].done);
  };

  const panEl = (win: HTMLElement, inner: HTMLElement, el: HTMLElement | null, mode: "top" | "center" | "end" = "top") => {
    const max = Math.max(0, win.scrollHeight - win.clientHeight);
    let y = 0;
    if (mode === "end") y = max;
    else if (el) y = mode === "center" ? el.offsetTop - (win.clientHeight - el.offsetHeight) / 2 : el.offsetTop - 26;
    inner.style.setProperty("--pan", `${-Math.round(Math.min(max, Math.max(0, y)))}px`);
  };
  const block = (n: number) => $(`[data-block="${n}"]`, docIn);
  const chunk = (n: number) => $(`[data-chunk="${n}"]`, clipIn);
  const panFor = (n: number) => {
    panEl(clipWin, clipIn, n >= 1 && n <= 3 ? chunk(n) : null, "center");
    if (n === 6) panEl(docWin, docIn, null, "end");
    else panEl(docWin, docIn, n >= 1 && n <= 3 ? block(n) : null);
  };

  const clearTransient = () => {
    $$(".chunk.is-reading", stage).forEach((c) => c.classList.remove("is-reading"));
    $$(".frag", stage).forEach((f) => f.remove());
    $$(".is-landed", stage).forEach((f) => f.classList.remove("is-landed"));
    wires.replaceChildren();
    cursor.classList.remove("is-on");
    $$(".blk.is-accepted", stage).forEach((b) => b.classList.remove("is-accepted"));
    scan.getAnimations().forEach((a) => a.cancel());
  };

  const settle = (n: number) => {
    clearTransient();
    setFlags(n);
    setAsk(n);
    panFor(n);
  };

  const typeAsk = async (text: string, alive: () => boolean) => {
    ask.classList.remove("is-ph");
    ask.classList.add("is-typing");
    setStatus("");
    for (let i = 1; i <= text.length; i++) {
      if (!alive()) return false;
      ask.textContent = text.slice(0, i);
      await wait(22);
    }
    ask.classList.remove("is-typing");
    return alive();
  };

  const drawWire = (from: HTMLElement, to: HTMLElement) => {
    const s = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x0 = a.right - s.left - 4;
    const y0 = a.top - s.top + a.height / 2;
    const x1 = b.left - s.left - 14;
    const y1 = b.top - s.top + Math.min(40, b.height / 2);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const k = Math.max(40, (x1 - x0) * 0.6);
    path.setAttribute("d", `M${x0} ${y0} C${x0 + k} ${y0}, ${x1 - k} ${y1}, ${x1} ${y1}`);
    path.setAttribute("pathLength", "1");
    path.style.strokeDasharray = "1";
    wires.append(path);
    path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, easing: "cubic-bezier(.6,0,.2,1)", fill: "both" });
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(x1));
    dot.setAttribute("cy", String(y1));
    dot.setAttribute("r", "3.5");
    wires.append(dot);
    dot.animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300, delay: 600, fill: "both" });
    dot.style.transformOrigin = `${x1}px ${y1}px`;
  };

  const fly = (from: HTMLElement, to: HTMLElement | null, i: number) => {
    if (!to) return;
    const s = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const frag = document.createElement("span");
    frag.className = "frag";
    frag.textContent = from.textContent;
    stage.append(frag);
    const x0 = a.left - s.left - 5;
    const y0 = a.top - s.top - 1;
    const x1 = b.left - s.left - 5;
    const y1 = b.top - s.top - 1;
    const lift = Math.min(y0, y1) - 36;
    frag
      .animate(
        [
          { transform: `translate(${x0}px, ${y0}px)`, opacity: 0 },
          { transform: `translate(${x0 + 8}px, ${y0 - 10}px) scale(1.06)`, opacity: 1, offset: 0.18 },
          { transform: `translate(${(x0 + x1) / 2}px, ${lift}px) scale(1.06)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${x1}px, ${y1}px)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${x1}px, ${y1}px)`, opacity: 0 },
        ],
        { duration: 1150, delay: i * 90, easing: "cubic-bezier(.55,0,.25,1)", fill: "both" },
      )
      .finished.then(() => frag.remove())
      .catch(() => frag.remove());
  };

  const moveCursor = (el: HTMLElement) => {
    const w = docWin.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    cursor.style.setProperty("--cx", `${b.left - w.left + b.width * 0.5}px`);
    cursor.style.setProperty("--cy", `${b.top - w.top + b.height * 0.55}px`);
  };

  const play = async (n: number, t: number) => {
    const alive = () => t === token;
    clearTransient();
    setFlags(n - 1);
    panFor(n);
    const a = ASK[n];

    if (n <= 3) {
      const src = chunk(n)!;
      const dst = block(n)!;
      if (!(await typeAsk(a.prompt, alive))) return;
      setStatus("busy", a.busy);
      const frags = $$("b[data-frag]", src);
      frags.forEach((f, i) => f.style.setProperty("--i", String(i)));
      src.classList.add("is-reading");
      await wait(750);
      if (!alive()) return;
      drawWire(src, dst);
      frags.forEach((f, i) => fly(f, $(`[data-land="${f.dataset.frag}"]`, dst), i));
      await wait(1000);
      if (!alive()) return;
      src.classList.remove("is-reading");
      setFlags(n);
      $$("[data-land]", dst).forEach((l) => l.classList.add("is-landed"));
      setStatus("done", a.done);
      await wait(1300);
      if (!alive()) return;
      wires.replaceChildren();
      $$(".is-landed", dst).forEach((l) => l.classList.remove("is-landed"));
      return;
    }

    if (n === 4) {
      if (!(await typeAsk(a.prompt, alive))) return;
      setStatus("busy", a.busy);
      scan.animate(
        [
          { transform: "translateY(-70px)", opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.85 },
          { transform: `translateY(${docWin.clientHeight}px)`, opacity: 0 },
        ],
        { duration: 1300, easing: "cubic-bezier(.45,0,.3,1)" },
      );
      await wait(250);
      if (!alive()) return;
      setFlags(4);
      await wait(900);
      if (alive()) setStatus("done", a.done);
      return;
    }

    if (n === 5) {
      ask.classList.remove("is-ph");
      ask.textContent = a.prompt;
      setStatus("note", a.done);
      const w = docWin.getBoundingClientRect();
      cursor.style.setProperty("--cx", `${w.width * 0.7}px`);
      cursor.style.setProperty("--cy", `${w.height * 0.75}px`);
      for (const id of [3, 1, 2]) {
        const b = block(id)!;
        panEl(docWin, docIn, b);
        await wait(750);
        if (!alive()) return;
        const btn = $("[data-accept]", b)!;
        cursor.classList.add("is-on");
        moveCursor(btn);
        await wait(750);
        if (!alive()) return;
        btn.classList.add("is-press");
        await wait(180);
        btn.classList.remove("is-press");
        b.classList.add("is-accepted");
        await wait(450);
        if (!alive()) return;
      }
      cursor.classList.remove("is-on");
      setFlags(5);
      $$(".blk.is-accepted", stage).forEach((b) => b.classList.remove("is-accepted"));
      return;
    }

    if (n === 6) {
      if (!(await typeAsk(a.prompt, alive))) return;
      setStatus("busy", a.busy);
      await wait(500);
      if (!alive()) return;
      setFlags(6);
      await wait(1900);
      if (alive()) setStatus("done", a.done);
    }
  };

  const go = (n: number) => {
    const prev = current;
    current = n;
    token++;
    rail.forEach((b) => {
      const s = Number(b.dataset.go);
      b.classList.toggle("is-on", s === n);
      b.classList.toggle("is-done", s < n);
      if (s === n) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    caps.forEach((c) => c.classList.toggle("is-on", Number(c.dataset.cap) === Math.max(1, n)));
    if (prefersReducedMotion || prev < 0 || n !== prev + 1 || !desktop.matches) settle(n);
    else void play(n, token);
  };

  const geometry = () => {
    const r = track.getBoundingClientRect();
    const head = sticky.getBoundingClientRect().top - r.top; // offset when pinned (header height)
    const range = Math.max(1, r.height - sticky.offsetHeight);
    return { r, range, head: Math.max(0, head) };
  };
  const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--qc-header-h")) || 64;

  let raf = 0;
  const onScroll = () => {
    raf = 0;
    if (!desktop.matches) return;
    const { r, range } = geometry();
    const p = Math.min(1, Math.max(0, (headerH() - r.top) / range));
    fill?.style.setProperty("--p", p.toFixed(4));
    const n = p < 0.05 ? 0 : Math.min(6, 1 + Math.floor(((p - 0.05) / 0.93) * 6));
    if (n !== current) go(n);
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(onScroll);
  };

  rail.forEach((b) =>
    b.addEventListener("click", () => {
      const n = Number(b.dataset.go);
      const { r, range } = geometry();
      const p = 0.05 + ((n - 1 + 0.3) / 6) * 0.93;
      window.scrollTo({ top: window.scrollY + r.top - headerH() + p * range, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }),
  );

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", () => {
    if (desktop.matches && current >= 0) settle(current);
    queue();
  });
  desktop.addEventListener("change", () => {
    current = -1;
    queue();
  });

  if (desktop.matches) {
    setFlags(0);
    setAsk(0);
    onScroll();
  }
}

/** Builds the small before → after pairs used by the stacked (tablet/mobile) story. */
function buildPairs(stage: HTMLElement) {
  const docIn = $('[data-pan="doc"]', stage);
  if (!docIn) return;
  const flags = (el: HTMLElement, n: number) => {
    for (let i = 1; i <= 6; i++) el.toggleAttribute(`data-s${i}`, i <= n);
  };
  const doc = (n: number, ...nodes: (Element | null)[]) => {
    const d = document.createElement("div");
    d.className = "doc";
    flags(d, n);
    nodes.forEach((node) => node && d.append(node.cloneNode(true)));
    return d;
  };
  const wrap = (cls: string, child: Element) => {
    const w = document.createElement("div");
    w.className = cls;
    w.append(child);
    return w;
  };
  const arrow = () => {
    const a = document.createElement("div");
    a.className = "pair__arrow";
    a.innerHTML = '<svg width="18" height="18"><use href="#ac-spark" /></svg>';
    return a;
  };
  const band = $(".doc__band", docIn);
  const cover = $('[data-block="0"]', docIn);
  const blk = (n: number) => $(`[data-block="${n}"]`, docIn);

  for (let n = 1; n <= 6; n++) {
    const slot = $(`[data-pair="${n}"]`);
    if (!slot) continue;
    let before: HTMLElement;
    let after: HTMLElement;
    if (n <= 3) {
      const src = $(`[data-chunk="${n}"]`, stage)!.cloneNode(true) as HTMLElement;
      before = wrap("pair__before", src);
      after = wrap("pair__after", doc(n - 1, blk(n)));
    } else if (n === 4) {
      before = wrap("pair__after", doc(3, band, cover));
      after = wrap("pair__after", doc(3, band, cover));
    } else if (n === 5) {
      before = wrap("pair__after", doc(4, blk(3)));
      after = wrap("pair__after", doc(4, blk(3)));
    } else {
      before = wrap("pair__after", doc(5, $(".sign", docIn)));
      after = wrap("pair__after", doc(5, $(".sign", docIn)));
    }
    slot.setAttribute("aria-hidden", "true");
    slot.append(before, arrow(), after);
    const target = after.firstElementChild as HTMLElement;
    const finish = () => flags(target, n);
    if (prefersReducedMotion) finish();
    else onceVisible(slot, () => window.setTimeout(finish, 350), 0.45);
  }
}

/* ───────── Human + AI review bar ───────── */

function initReview() {
  const review = $("[data-review]");
  const ok = review && $(".review__b--ok", review);
  if (!review || !ok) return;
  if (prefersReducedMotion) return;
  const gate = visibility(review);
  const sleep = pausableSleep(gate);
  onceVisible(review, async () => {
    for (;;) {
      await sleep(3400);
      ok.classList.add("is-press");
      await sleep(180);
      ok.classList.remove("is-press");
      review.classList.add("is-accepted");
      await sleep(1900);
      review.classList.remove("is-accepted");
    }
  });
}

/* ───────── Settings: Tone re-voices the preview ───────── */

const TONES: Record<string, string> = {
  neutral:
    "This proposal covers a five-night leadership offsite in Singapore for 12 people, including return flights, hotel, transfers and a private garden tour. Prices are held for 30 days.",
  friendly:
    "Great news, Priya! We've planned five relaxed nights in Singapore for your team of 12, with easy direct flights, a lovely harbourfront hotel and a garden tour. Prices are held for 30 days.",
  professional:
    "Please find our proposal for a five-night leadership offsite in Singapore for 12 attendees, covering return flights, harbourfront accommodation, transfers and a private garden tour. Prices are held for 30 days.",
  concise: "Singapore offsite: 5 nights, 12 people. Flights, hotel, transfers and a garden tour. Prices held for 30 days.",
  persuasive:
    "Give your leadership team five nights that reset the year: direct flights, a harbourfront hotel and room to think, all confirmed with one signature. Prices are held for 30 days.",
  technical:
    "Scope: 12 pax, SYD–SIN return (QC 214 / QC 215), 5 nights Deluxe King, return coach transfers, 1 private garden tour. Rates held for 30 days.",
};

function initSettings() {
  const card = $("[data-settings]");
  const out = $("[data-tone-out]");
  if (!card || !out) return;
  const radios = $$<HTMLInputElement>('input[name="ac-tone"]', card);
  let token = 0;
  let touched = false;
  const show = (tone: string) => {
    const t = ++token;
    void streamText(out, TONES[tone], () => t === token, 26);
  };
  radios.forEach((r) =>
    r.addEventListener("change", () => {
      touched = true;
      show(r.value);
    }),
  );

  // Gentle auto-cycle while in view, until the visitor picks a tone.
  if (prefersReducedMotion) return;
  const gate = visibility(card);
  const sleep = pausableSleep(gate);
  const order = ["friendly", "concise", "technical", "persuasive", "professional"];
  onceVisible(card, async () => {
    for (let i = 0; !touched; i = (i + 1) % order.length) {
      await sleep(4200);
      if (touched) return;
      const r = radios.find((x) => x.value === order[i]);
      if (!r) return;
      r.checked = true;
      show(r.value);
    }
  });
}

/* ───────── Pricing requests with undo ───────── */

type Cmd = "ins" | "opt" | "qty";
const CMDS: Record<Cmd, { reply: string; label: string }> = {
  ins: { reply: "Added Travel insurance, comprehensive from your product catalogue: 12 × $95.", label: "travel insurance added" },
  opt: { reply: "Done. Private garden tour is now optional, so Priya can untick it.", label: "garden tour optional" },
  qty: { reply: "Done. Priya can now change the quantity on every row.", label: "editable quantities" },
};
const BASE_TOTAL = 36476;
const INSURANCE = 1140;

function initPricing() {
  const card = $("[data-pricing]");
  const table = $("[data-mt]");
  const total = $("[data-mt-total]");
  const reply = $("[data-reply]");
  const undo = $<HTMLButtonElement>("[data-undo]");
  if (!card || !table || !total || !reply || !undo) return;
  const chips = $$<HTMLButtonElement>("[data-cmd]", card);
  const stack: Cmd[] = [];
  let token = 0;
  let touched = false;

  const totalFor = () => BASE_TOTAL + (table.hasAttribute("data-ins") ? Math.round(INSURANCE * 1.1) : 0);
  const say = (text: string) => {
    const t = ++token;
    void streamText(reply, text, () => t === token, 38);
  };
  const flash = (sel: string) => {
    const row = $(sel, table);
    if (!row || prefersReducedMotion) return;
    row.classList.remove("is-flash");
    void row.offsetWidth;
    row.classList.add("is-flash");
  };
  const apply = (cmd: Cmd, on: boolean) => {
    const before = totalFor();
    table.toggleAttribute(`data-${cmd}`, on);
    countMoney(total, before, totalFor());
    chips.find((c) => c.dataset.cmd === cmd)!.disabled = on;
    if (on && cmd === "opt") flash('[data-row="tour"]');
  };
  const run = (cmd: Cmd) => {
    if (table.hasAttribute(`data-${cmd}`)) return;
    apply(cmd, true);
    stack.push(cmd);
    undo.hidden = false;
    say(CMDS[cmd].reply);
  };

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      touched = true;
      run(c.dataset.cmd as Cmd);
    }),
  );
  undo.addEventListener("click", () => {
    touched = true;
    const cmd = stack.pop();
    if (!cmd) return;
    apply(cmd, false);
    undo.hidden = stack.length === 0;
    say(`Undone: ${CMDS[cmd].label}.`);
    if (undo.hidden) chips[0]?.focus();
  });

  // Play one request on first view so the card shows what it does.
  onceVisible(
    card,
    () =>
      window.setTimeout(
        () => {
          if (!touched) run("ins");
        },
        prefersReducedMotion ? 0 : 1100,
      ),
    0.5,
  );
}

/* ───────── Closing panel drift pauses off screen ───────── */

function pauseOffscreen() {
  const close = $(".close");
  if (!close || !("IntersectionObserver" in window)) return;
  new IntersectionObserver((entries) => entries.forEach((e) => close.toggleAttribute("data-paused", !e.isIntersecting))).observe(close);
}

initHero();
initStory();
initReview();
initSettings();
initPricing();
pauseOffscreen();
