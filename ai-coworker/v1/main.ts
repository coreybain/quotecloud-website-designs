import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Scene clock ─────────
   Each scene runs an async loop on its own clock. The clock only advances while the scene is on screen
   (so loops pause off-screen) and runs faster while a tile is hovered or focused. */

type Waiter = { at: number; resolve: () => void };

class Scene {
  t = 0;
  speed = 1;
  active = false;
  private waiters: Waiter[] = [];

  constructor(public root: HTMLElement) {
    root.setAttribute("data-play", "");
  }

  wait = (ms: number) => new Promise<void>((resolve) => this.waiters.push({ at: this.t + ms, resolve }));

  tick(dt: number) {
    if (!this.active) return;
    this.t += dt * this.speed;
    const due = this.waiters.filter((w) => w.at <= this.t);
    if (!due.length) return;
    this.waiters = this.waiters.filter((w) => w.at > this.t);
    due.forEach((w) => w.resolve());
  }

  k<T extends Element = HTMLElement>(name: string) {
    return this.root.querySelector(`[data-k="${name}"]`) as T;
  }

  on(name: string, value = true) {
    this.k(name)?.classList.toggle("on", value);
  }

  off(...names: string[]) {
    names.forEach((n) => this.on(n, false));
  }
}

const scenes = new Set<Scene>();
let rafId = 0;
let last = 0;

function loop(now: number) {
  const dt = Math.min(64, now - last);
  last = now;
  let any = false;
  scenes.forEach((s) => {
    s.tick(dt);
    any ||= s.active;
  });
  rafId = any ? requestAnimationFrame(loop) : 0;
}

function register(s: Scene, threshold = 0.25) {
  scenes.add(s);
  new IntersectionObserver(
    ([entry]) => {
      s.active = entry.isIntersecting;
      if (s.active && !rafId) {
        last = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    },
    { threshold },
  ).observe(s.root);
  // hover/focus "deepens" the motion: the tile's clock runs faster
  const fast = () => (s.speed = 1.7);
  const slow = () => (s.speed = 1);
  s.root.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && fast());
  s.root.addEventListener("pointerleave", slow);
  s.root.addEventListener("focusin", fast);
  s.root.addEventListener("focusout", slow);
}

/* ───────── Text helpers ───────── */

function span(cls: string, text = "") {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = text;
  return el;
}

/** Wraps an element's words (mode "w") or characters (mode "ch") in spans so they can be revealed one by one. */
function split(el: HTMLElement, mode: "w" | "ch") {
  const words = (el.textContent ?? "").trim().split(/\s+/);
  const out: HTMLElement[] = [];
  el.textContent = "";
  words.forEach((word, i) => {
    if (i) el.append(" ");
    if (mode === "w") {
      const s = span("w", word);
      el.append(s);
      out.push(s);
    } else {
      const wrap = span("nw");
      for (const c of word) {
        const s = span("ch", c);
        wrap.append(s);
        out.push(s);
      }
      el.append(wrap);
    }
  });
  return out;
}

async function reveal(s: Scene, items: HTMLElement[], step: number, keepLead = false) {
  let prev: HTMLElement | undefined;
  for (const item of items) {
    prev?.classList.remove("lead");
    item.classList.add("on", "lead");
    prev = item;
    await s.wait(step);
  }
  if (!keepLead) prev?.classList.remove("lead");
}

function hide(items: HTMLElement[]) {
  items.forEach((i) => i.classList.remove("on", "lead"));
}

function press(el: Element | null) {
  if (!el) return;
  el.classList.remove("hit");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("hit");
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function tween(el: HTMLElement, from: number, to: number, ms = 700) {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Moves an absolutely positioned cursor so its tip lands on `target` (relative to `frame`). */
function pointAt(cursor: Element, frame: Element, target: Element, fx = 0.5, fy = 0.55) {
  const f = frame.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  (cursor as HTMLElement).style.transform = `translate(${r.left - f.left + r.width * fx - 4}px, ${r.top - f.top + r.height * fy - 2}px)`;
}

function sweep(el: HTMLElement, distance: number, ms: number) {
  return el.animate([{ transform: "translateY(-30px)" }, { transform: `translateY(${distance}px)` }], {
    duration: ms,
    easing: "cubic-bezier(.45,0,.35,1)",
    fill: "forwards",
  });
}

/* ───────── Tile request bar: the ask types itself, then "sends" ───────── */

function askBar(s: Scene) {
  const text = s.root.querySelector<HTMLElement>("[data-type]");
  const chars = text ? split(text, "ch") : [];
  return {
    reset: () => hide(chars),
    type: async () => {
      await reveal(s, chars, 34, true);
      await s.wait(320);
      press(s.k("send"));
      chars.at(-1)?.classList.remove("lead");
      await s.wait(380);
    },
  };
}

/* ───────── Hero: prompt → streamed draft → Insert into the document ───────── */

async function heroScene(s: Scene) {
  const stage = s.root;
  const cursor = s.k("cursor");
  const typed = split(s.k("typed"), "ch");
  const words = split(s.k("stream"), "w");
  const draft = s.k("draft");
  const slotP = s.k("slot").querySelector("p") as HTMLElement;
  const qp = s.k("qp1");

  const reset = () => {
    s.off("bubble", "lead", "draft", "acts", "slot", "glow", "toast", "typed", "cursor");
    s.on("greet");
    s.on("ph");
    s.on("ph-input");
    qp.classList.remove("is-active");
    hide(typed);
    hide(words);
  };

  const park = () => {
    const f = stage.getBoundingClientRect();
    cursor.style.transition = "none";
    cursor.style.transform = `translate(${f.width * 0.55}px, ${f.height - 30}px)`;
    void cursor.offsetWidth;
    cursor.style.transition = "";
  };

  const fly = () => {
    const f = stage.getBoundingClientRect();
    const a = draft.getBoundingClientRect();
    const b = slotP.getBoundingClientRect();
    const clone = document.createElement("p");
    clone.className = "fly";
    clone.textContent = slotP.textContent;
    Object.assign(clone.style, { left: `${a.left - f.left}px`, top: `${a.top - f.top}px`, width: `${a.width}px` });
    stage.append(clone);
    const scale = (b.width + 26) / a.width;
    clone
      .animate(
        [
          { transform: "none", opacity: 1 },
          { opacity: 1, offset: 0.75 },
          { transform: `translate(${b.left - a.left - 13 * scale}px, ${b.top - a.top - 11 * scale}px) scale(${scale})`, opacity: 0 },
        ],
        { duration: 900, easing: "cubic-bezier(.65,0,.35,1)" },
      )
      .finished.then(() => clone.remove());
  };

  reset();
  for (;;) {
    await s.wait(900);
    park();
    s.on("cursor");
    await s.wait(80);
    pointAt(cursor, stage, qp, 0.3);
    await s.wait(1000);
    cursor.classList.add("down");
    qp.classList.add("is-active");
    await s.wait(180);
    cursor.classList.remove("down");

    s.off("ph-input");
    s.on("typed");
    await reveal(s, typed, 40, true);
    await s.wait(250);
    pointAt(cursor, stage, s.k("send"));
    await s.wait(800);
    press(s.k("send"));
    s.off("typed", "greet");
    await s.wait(300);
    s.on("ph-input");
    s.on("bubble");
    await s.wait(550);
    s.on("lead");
    await s.wait(400);
    s.on("draft");
    await s.wait(250);
    await reveal(s, words, 55);
    await s.wait(250);
    s.on("acts");
    await s.wait(700);
    pointAt(cursor, stage, s.k("insert"));
    await s.wait(950);
    cursor.classList.add("down");
    press(s.k("insert"));
    await s.wait(160);
    cursor.classList.remove("down");
    fly();
    await s.wait(650);
    s.off("ph");
    s.on("slot");
    s.on("glow");
    s.on("toast");
    await s.wait(500);
    s.off("cursor");
    await s.wait(1300);
    s.off("glow");
    await s.wait(2600);
    s.off("toast");
    await s.wait(1400);
    reset();
    await s.wait(400);
  }
}

/* ───────── Bento tiles ───────── */

async function itinScene(s: Scene) {
  const ask = askBar(s);
  const vis = s.root.querySelector<HTMLElement>(".itin")!;
  const raws = ["r1", "r2", "r3"].map((k) => s.k(k));
  const reset = () => {
    ask.reset();
    raws.forEach((r) => r.classList.remove("hl", "used"));
    s.off("s1", "s2", "s3", "review", "parse", "done");
    vis.classList.remove("ok");
  };
  reset();
  for (;;) {
    await s.wait(500);
    await ask.type();
    s.on("parse");
    await s.wait(700);
    for (let i = 0; i < 3; i++) {
      raws[i].classList.add("hl");
      await s.wait(550);
      s.on(`s${i + 1}`);
      await s.wait(450);
      raws[i].classList.remove("hl");
      raws[i].classList.add("used");
      await s.wait(200);
    }
    s.off("parse");
    await s.wait(300);
    s.on("review");
    await s.wait(1200);
    press(s.k("accept"));
    await s.wait(300);
    vis.classList.add("ok");
    s.on("done");
    await s.wait(4200);
    reset();
    await s.wait(700);
  }
}

async function sumScene(s: Scene) {
  const ask = askBar(s);
  const page = s.k("page");
  const scan = s.k("scan");
  const reset = () => {
    ask.reset();
    page.classList.remove("squeeze");
    s.off("b1", "b2", "b3", "insert", "scan");
  };
  reset();
  for (;;) {
    await s.wait(600);
    await ask.type();
    s.on("scan");
    sweep(scan, page.offsetHeight, 1300 / s.speed);
    await s.wait(1300);
    s.off("scan");
    page.classList.add("squeeze");
    for (const b of ["b1", "b2", "b3"]) {
      await s.wait(320);
      s.on(b);
    }
    await s.wait(500);
    s.on("insert");
    await s.wait(800);
    press(s.k("insert"));
    await s.wait(3600);
    reset();
    await s.wait(700);
  }
}

function toneScene(s: Scene, auto: boolean) {
  const buttons = [...s.root.querySelectorAll<HTMLButtonElement>("[data-tone]")];
  const paras = [...s.root.querySelectorAll<HTMLElement>("[data-tone-p]")];
  const ctl = s.root.querySelector<HTMLElement>(".seg-ctl")!;
  const ask = askBar(s);
  let current = 0;
  let userTook = false;

  const set = (i: number, focus = false) => {
    current = i;
    buttons.forEach((b, j) => {
      b.setAttribute("aria-checked", String(i === j));
      b.tabIndex = i === j ? 0 : -1;
    });
    paras.forEach((p, j) => p.classList.toggle("is-on", i === j));
    ctl.style.setProperty("--i", String(i));
    if (focus) buttons[i].focus();
  };
  set(0);

  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      userTook = true;
      set(i);
    }),
  );
  ctl.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    userTook = true;
    set((current + dir + buttons.length) % buttons.length, true);
  });

  if (!auto) return;
  (async () => {
    ask.reset();
    await s.wait(700);
    await ask.type();
    while (!userTook) {
      await s.wait(2900);
      if (userTook) break;
      set((current + 1) % buttons.length);
    }
  })();
}

async function consScene(s: Scene) {
  const ask = askBar(s);
  const reset = () => {
    ask.reset();
    s.off("reps");
  };
  reset();
  for (;;) {
    await s.wait(700);
    await ask.type();
    await s.wait(300);
    press(s.k("save"));
    await s.wait(350);
    s.on("reps");
    await s.wait(4200);
    reset();
    await s.wait(900);
  }
}

async function priceScene(s: Scene) {
  const ask = askBar(s);
  const vis = s.root.querySelector<HTMLElement>(".price")!;
  const total = s.k("sum");
  const reset = () => {
    ask.reset();
    s.off("newrow", "undo");
    s.k("hit").classList.remove("is-active", "added");
    vis.classList.remove("added");
    total.textContent = money(48600);
  };
  reset();
  for (;;) {
    await s.wait(600);
    await ask.type();
    await s.wait(200);
    s.k("hit").classList.add("is-active");
    await s.wait(900);
    vis.classList.add("added");
    s.k("hit").classList.add("added");
    s.on("newrow");
    await s.wait(250);
    tween(total, 48600, 55800);
    await s.wait(700);
    s.on("undo");
    await s.wait(4200);
    reset();
    await s.wait(800);
  }
}

async function optScene(s: Scene) {
  const ask = askBar(s);
  const row = s.k("row");
  const reset = () => {
    ask.reset();
    row.classList.remove("has-sw");
    s.off("sw", "tag", "undo");
  };
  reset();
  for (;;) {
    await s.wait(900);
    await ask.type();
    row.classList.add("has-sw");
    s.on("sw");
    await s.wait(450);
    s.on("tag");
    await s.wait(600);
    s.on("undo");
    await s.wait(4000);
    reset();
    await s.wait(800);
  }
}

async function headScene(s: Scene) {
  const ask = askBar(s);
  const sweepEl = s.k("sweep");
  const page = s.root.querySelector<HTMLElement>(".hd__page")!;
  const reset = () => {
    ask.reset();
    s.off("h1", "h2", "h3", "sweep", "undo");
  };
  reset();
  for (;;) {
    await s.wait(1100);
    await ask.type();
    s.on("sweep");
    sweep(sweepEl, page.offsetHeight, 1400 / s.speed);
    for (const h of ["h1", "h2", "h3"]) {
      await s.wait(380);
      s.on(h);
    }
    await s.wait(400);
    s.off("sweep");
    await s.wait(300);
    s.on("undo");
    await s.wait(4000);
    reset();
    await s.wait(800);
  }
}

/* ───────── Human + AI review card (interactive) ───────── */

function initReview(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>(".rv__ai")!;
  const text = root.querySelector<HTMLElement>(".rv__text")!;
  const status = root.querySelector<HTMLElement>(".rv__status")!;
  const cursor = root.querySelector<HTMLElement>(".rv__cursor")!;
  const accept = root.querySelector<HTMLElement>("[data-act='accept']")!;
  let touched = false;

  const set = (state: "pending" | "accepted" | "editing" | "rejected", fromKeyboard = false) => {
    box.dataset.state = state;
    text.contentEditable = state === "editing" ? "true" : "false";
    const check = '<svg class="ico" aria-hidden="true"><use href="#i-check" /></svg>';
    status.innerHTML =
      state === "accepted"
        ? `<span class="ok">${check}Accepted. It's now part of the proposal.</span><button type="button" data-act="reset">Review again</button>`
        : state === "rejected"
          ? `<span>AI segment removed.</span><button type="button" data-act="reset">Undo</button>`
          : state === "editing"
            ? "<span>Editing. Accept when it reads right.</span>"
            : "";
    if (state === "editing") {
      text.focus();
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (fromKeyboard) {
      (status.querySelector("button") ?? accept).focus();
    }
  };

  root.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!btn) return;
    touched = true;
    const act = btn.dataset.act;
    const kb = (e as PointerEvent).detail === 0;
    if (act === "accept") set("accepted", kb);
    else if (act === "edit") set("editing", kb);
    else if (act === "reject") set("rejected", kb);
    else set("pending", kb);
  });

  if (prefersReducedMotion) return;
  onceVisible(
    root,
    async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await wait(1100);
      if (touched) return;
      const f = root.getBoundingClientRect();
      cursor.style.transition = "none";
      cursor.style.transform = `translate(${f.width * 0.8}px, ${f.height + 10}px)`;
      void cursor.offsetWidth;
      cursor.style.transition = "";
      cursor.classList.add("on");
      await wait(60);
      pointAt(cursor, root, accept, 0.4);
      await wait(1100);
      if (touched) return cursor.classList.remove("on");
      cursor.classList.add("down");
      accept.classList.add("is-pressed");
      await wait(200);
      cursor.classList.remove("down");
      accept.classList.remove("is-pressed");
      set("accepted");
      await wait(900);
      cursor.classList.remove("on");
    },
    0.6,
  );
}

/* ───────── Boot ───────── */

const sceneFns: Record<string, (s: Scene) => Promise<void> | void> = {
  hero: heroScene,
  itin: itinScene,
  sum: sumScene,
  cons: consScene,
  price: priceScene,
  opt: optScene,
  head: headScene,
};

const toneRoot = document.querySelector<HTMLElement>("[data-scene='tone']");

if (prefersReducedMotion) {
  if (toneRoot) {
    toneRoot.removeAttribute("data-play");
    toneScene(new Scene(toneRoot), false);
    toneRoot.removeAttribute("data-play");
  }
} else {
  document.querySelectorAll<HTMLElement>("[data-scene]").forEach((root) => {
    const name = root.dataset.scene!;
    if (name === "review" || name === "loop") return;
    const s = new Scene(root);
    register(s, name === "hero" ? 0.2 : 0.3);
    if (name === "tone") toneScene(s, true);
    else sceneFns[name]?.(s);
  });
}

const review = document.querySelector<HTMLElement>("[data-scene='review']");
if (review) initReview(review);

const loopEl = document.querySelector<HTMLElement>("[data-scene='loop']");
if (loopEl && "IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => loopEl.classList.toggle("in-view", e.isIntersecting)).observe(loopEl);
}
