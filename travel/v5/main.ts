import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Seeded randomness for barcodes, QR codes and flaps ───────── */

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(viewBox: string, d: string, extra: Record<string, string> = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("shape-rendering", "crispEdges");
  for (const [k, v] of Object.entries(extra)) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function drawBarcodes() {
  document.querySelectorAll<HTMLElement>("[data-barcode]").forEach((el) => {
    const r = rng(el.dataset.barcode || "qc");
    let x = 0;
    let d = "M0 0h1.4v40h-1.4zM2.8 0h1.4v40h-1.4z";
    x = 6;
    while (x < 150) {
      const w = [0.9, 0.9, 1.4, 2.2, 3][Math.floor(r() * 5)];
      d += `M${x.toFixed(1)} 0h${w}v40h-${w}z`;
      x += w + [1, 1.4, 2.2][Math.floor(r() * 3)];
    }
    d += `M${x.toFixed(1)} 0h1.4v40h-1.4zM${(x + 2.8).toFixed(1)} 0h1.4v40h-1.4z`;
    el.append(svgEl(`0 0 ${(x + 4.2).toFixed(1)} 40`, d, { preserveAspectRatio: "none" }));
  });
}

function drawQRs() {
  const N = 25;
  document.querySelectorAll<HTMLElement>("[data-qr]").forEach((el) => {
    const r = rng(el.dataset.qr || "qc");
    const finders = [
      [0, 0],
      [N - 7, 0],
      [0, N - 7],
    ];
    const inFinderZone = (x: number, y: number) => finders.some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
    let d = "";
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (inFinderZone(x, y)) continue;
        const timing = (x === 6 || y === 6) && (x + y) % 2 === 0;
        if (timing || r() < 0.46) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    for (const [fx, fy] of finders) {
      d += `M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5z`; // ring (even-odd)
      d += `M${fx + 2} ${fy + 2}h3v3h-3z`;
    }
    const svg = svgEl(`0 0 ${N} ${N}`, d);
    svg.querySelector("path")?.setAttribute("fill-rule", "evenodd");
    el.append(svg);
  });
}

/* ───────── Cancellable loops that only run while visible ───────── */

const CANCEL = Symbol("cancel");
type Wait = (ms: number) => Promise<void>;

class Loop {
  private gen = 0;
  private live = false;
  private running = false;
  private done = false;
  constructor(
    private cycle: (wait: Wait) => Promise<void>,
    private once = false,
  ) {}
  setLive(live: boolean) {
    this.live = live;
    if (live) this.kick();
  }
  restart() {
    this.gen++;
    this.running = false;
    this.done = false;
    this.kick();
  }
  private kick() {
    if (this.running || !this.live || this.done) return;
    this.running = true;
    const g = this.gen;
    const wait: Wait = (ms) =>
      new Promise((resolve, reject) => window.setTimeout(() => (g === this.gen ? resolve() : reject(CANCEL)), ms));
    void (async () => {
      try {
        while (this.live && g === this.gen && !this.done) {
          await this.cycle(wait);
          if (this.once) this.done = true;
        }
      } catch (e) {
        if (e !== CANCEL) throw e;
      }
      if (g === this.gen) this.running = false;
    })();
  }
}

/* ───────── Hero: print, fly, unfold ───────── */

function initHero() {
  const plane = document.querySelector<SVGGElement>(".route__plane");
  const motion = document.querySelector<SVGAnimationElement>(".route__motion");
  if (!plane || !motion) return;
  const fly = () => {
    plane.classList.add("is-on");
    try {
      motion.beginElement();
    } catch {
      /* SMIL unsupported: the plane simply stays hidden */
    }
  };
  const stage = document.querySelector<HTMLElement>(".hero__stage");
  if (prefersReducedMotion) {
    stage?.classList.add("is-go");
    motion.setAttribute("dur", "0.01s");
    fly();
    return;
  }
  const go = () => {
    stage?.classList.add("is-go");
    window.setTimeout(fly, 2050);
  };
  if (stage) onceVisible(stage, go, 0.2);
  else go();
}

/* ───────── Ticket starters ───────── */

function gdsTicket(tk: HTMLElement) {
  const root = tk.querySelector<HTMLElement>(".gds");
  if (!root) return null;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".gds__tab")];
  const src = root.querySelector<HTMLElement>(".term__src");
  const lines = [...root.querySelectorAll<HTMLElement>(".term__lines li")];
  const cards = [...root.querySelectorAll<HTMLElement>(".gds__out .seg--card")];
  let current = 0;
  let manual = false;

  const select = (i: number) => {
    current = i;
    tabs.forEach((t, j) => t.setAttribute("aria-pressed", String(j === i)));
    if (src) src.textContent = tabs[i].dataset.src ?? "";
  };

  if (prefersReducedMotion) {
    cards.forEach((c) => c.classList.add("is-in"));
    tabs.forEach((t, i) => t.addEventListener("click", () => select(i)));
    return null;
  }

  const loop = new Loop(async (wait) => {
    lines.forEach((l) => l.classList.remove("is-active", "is-done"));
    cards.forEach((c) => c.classList.remove("is-in"));
    await wait(450);
    for (let i = 0; i < lines.length; i++) {
      lines[i - 1]?.classList.replace("is-active", "is-done");
      lines[i].classList.add("is-active");
      root.classList.remove("is-pulse");
      void root.offsetWidth;
      root.classList.add("is-pulse");
      await wait(360);
      cards[i]?.classList.add("is-in");
      await wait(300);
    }
    lines.at(-1)?.classList.replace("is-active", "is-done");
    await wait(3400);
    if (!manual) select((current + 1) % tabs.length);
  });

  tabs.forEach((t, i) =>
    t.addEventListener("click", () => {
      manual = true;
      select(i);
      loop.restart();
    }),
  );
  return loop;
}

function libTicket(tk: HTMLElement) {
  const root = tk.querySelector<HTMLElement>(".lib");
  if (!root) return null;
  const slots = [...root.querySelectorAll<HTMLElement>(".lib__slot")];
  const ghost = root.querySelector<HTMLElement>(".lib__ghost");
  const ghostText = ghost?.querySelector("span");
  const ghostUse = ghost?.querySelector("use");
  const cursor = root.querySelector<SVGSVGElement>(".lib__cursor");
  if (prefersReducedMotion || !ghost || !cursor || !("animate" in ghost)) {
    slots.forEach((s) => s.classList.add("is-filled"));
    return null;
  }

  return new Loop(async (wait) => {
    slots.forEach((s) => s.classList.remove("is-filled"));
    await wait(700);
    for (const slot of slots) {
      const li = root.querySelector<HTMLElement>(`.lib__list [data-lib="${slot.dataset.slot}"]`);
      const base = root.getBoundingClientRect();
      const from = li?.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      if (!li || !from || from.width === 0) {
        slot.classList.add("is-filled");
        await wait(500);
        continue;
      }
      li.classList.add("is-active");
      if (ghostText) ghostText.textContent = li.textContent?.trim() ?? "";
      const icon = li.querySelector("use")?.getAttribute("href");
      if (ghostUse && icon) ghostUse.setAttribute("href", icon);
      const fx = from.left - base.left;
      const fy = from.top - base.top;
      const tx = to.left - base.left;
      const ty = to.top - base.top;
      const opts: KeyframeAnimationOptions = { duration: 1100, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" };
      cursor.animate(
        [
          { opacity: 0, transform: `translate(${fx + 40}px, ${fy + 30}px)` },
          { opacity: 1, transform: `translate(${fx + 30}px, ${fy + 20}px)`, offset: 0.18 },
          { opacity: 1, transform: `translate(${tx + 30}px, ${ty + 20}px)`, offset: 0.85 },
          { opacity: 0, transform: `translate(${tx + 30}px, ${ty + 20}px)` },
        ],
        opts,
      );
      await ghost.animate(
        [
          { opacity: 0, transform: `translate(${fx}px, ${fy}px) scale(1)` },
          { opacity: 1, transform: `translate(${fx + 6}px, ${fy - 4}px) rotate(-2deg) scale(1.03)`, offset: 0.18 },
          { opacity: 1, transform: `translate(${tx}px, ${ty}px) rotate(0deg) scale(1)`, offset: 0.85 },
          { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(1)` },
        ],
        opts,
      ).finished;
      slot.classList.add("is-filled");
      li.classList.remove("is-active");
      await wait(420);
    }
    await wait(3000);
  });
}

function brandTicket(tk: HTMLElement) {
  const root = tk.querySelector<HTMLElement>(".brand");
  if (!root) return null;
  const covers = [...root.querySelectorAll<HTMLElement>(".brand__cover")];
  const swatches = [...root.querySelectorAll<HTMLButtonElement>(".brand__swatches button")];
  const sample = root.querySelector<HTMLElement>(".brand__sample");
  let current = 0;
  let manual = false;
  const select = (i: number) => {
    current = i;
    covers.forEach((c, j) => (c.dataset.pos = String((j - i + covers.length) % covers.length)));
    swatches.forEach((s, j) => s.setAttribute("aria-pressed", String(j === i)));
    const sw = swatches[i]?.style.getPropertyValue("--sw");
    if (sample && sw) sample.style.setProperty("--accent", sw);
  };
  select(0);
  swatches.forEach((s, i) =>
    s.addEventListener("click", () => {
      manual = true;
      select(i);
    }),
  );
  if (prefersReducedMotion) return null;
  return new Loop(async (wait) => {
    await wait(2800);
    if (!manual) select((current + 1) % covers.length);
  });
}

function costTicket(tk: HTMLElement) {
  const root = tk.querySelector<HTMLElement>(".cost");
  if (!root) return null;
  const inputs = [...root.querySelectorAll<HTMLInputElement>("[data-opt]")];
  const out = root.querySelector<HTMLOutputElement>("[data-total]");
  const sel = root.querySelector<HTMLElement>("[data-sel]");
  const ticket = root.querySelector<HTMLElement>(".cost__ticket");
  const base = Number(out?.dataset.total ?? 0);
  let shown = base;
  let raf = 0;
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  const update = () => {
    const picked = inputs.filter((i) => i.checked);
    const target = base + picked.reduce((sum, i) => sum + Number(i.value), 0);
    if (sel) sel.textContent = `${picked.length} extra${picked.length === 1 ? "" : "s"}`;
    if (ticket && !prefersReducedMotion) {
      ticket.classList.remove("is-bump");
      void ticket.offsetWidth;
      ticket.classList.add("is-bump");
    }
    if (!out) return;
    cancelAnimationFrame(raf);
    if (prefersReducedMotion) {
      shown = target;
      out.textContent = fmt(target);
      return;
    }
    const from = shown;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      shown = from + (target - from) * (1 - Math.pow(1 - t, 3));
      out.textContent = fmt(shown);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  inputs.forEach((i) => i.addEventListener("change", update));

  if (prefersReducedMotion) return null;
  // A gentle demo: tick the first extra once, unless the visitor gets there first.
  return new Loop(async (wait) => {
    await wait(1400);
    if (!inputs.some((i) => i.checked) && inputs[0]) {
      inputs[0].checked = true;
      update();
    }
  }, true);
}

function signTicket(tk: HTMLElement) {
  const root = tk.querySelector<HTMLElement>(".sign");
  if (!root) return null;
  const trail = [...root.querySelectorAll<HTMLElement>(".sign__trail li")];
  const replay = root.querySelector<HTMLButtonElement>("[data-replay]");
  const finalState = () => {
    root.classList.add("is-signed", "is-stamped", "is-torn", "is-paid");
    trail.forEach((li) => li.classList.add("is-on"));
  };
  if (prefersReducedMotion) {
    finalState();
    replay?.addEventListener("click", finalState);
    return null;
  }
  const loop = new Loop(async (wait) => {
    root.classList.remove("is-signed", "is-stamped", "is-torn", "is-paid");
    trail.forEach((li) => li.classList.remove("is-on"));
    await wait(350);
    trail[0]?.classList.add("is-on");
    await wait(380);
    trail[1]?.classList.add("is-on");
    await wait(380);
    root.classList.add("is-signed");
    await wait(1350);
    trail[2]?.classList.add("is-on");
    root.classList.add("is-stamped");
    await wait(750);
    root.classList.add("is-torn");
    await wait(320);
    root.classList.add("is-paid");
    trail[3]?.classList.add("is-on");
  }, true);
  replay?.addEventListener("click", () => loop.restart());
  return loop;
}

function initTickets() {
  const tickets = [...document.querySelectorAll<HTMLElement>(".tk[data-ticket]")];
  const factories: Record<string, (tk: HTMLElement) => Loop | null> = {
    gds: gdsTicket,
    lib: libTicket,
    brand: brandTicket,
    cost: costTicket,
    sign: signTicket,
  };
  const loops = new Map<HTMLElement, Loop | null>();
  tickets.forEach((tk) => loops.set(tk, factories[tk.dataset.ticket ?? ""]?.(tk) ?? null));

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    tickets.forEach((tk) => tk.classList.add("is-open"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const tk = entry.target as HTMLElement;
        const loop = loops.get(tk);
        if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
          const first = !tk.classList.contains("is-open");
          tk.classList.add("is-open", "is-live");
          if (first) window.setTimeout(() => loop?.setLive(tk.classList.contains("is-live")), 650);
          else loop?.setLive(true);
        } else if (!entry.isIntersecting) {
          tk.classList.remove("is-live");
          loop?.setLive(false);
        }
      }
    },
    { threshold: [0, 0.3, 0.6] },
  );
  tickets.forEach((tk) => io.observe(tk));
}

/* ───────── TravelDocs: tabs + phone ───────── */

function initTravelDocs() {
  const section = document.querySelector<HTMLElement>(".lounge");
  const list = document.querySelector<HTMLElement>(".td-tabs");
  const phone = document.querySelector<HTMLElement>("#td-screen");
  if (!section || !list || !phone) return;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const shots = [...phone.querySelectorAll<HTMLImageElement>(".phone__screen img")];
  const DUR = 3800;
  let current = 0;
  let auto = !prefersReducedMotion;
  let timer = 0;
  let visible = false;

  list.style.setProperty("--td-dur", `${DUR}ms`);

  const select = (i: number, focus = false) => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, j) => {
      const on = j === current;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    shots.forEach((s, j) => s.classList.toggle("is-on", j === current));
    phone.setAttribute("aria-labelledby", tabs[current].id);
    if (focus) tabs[current].focus();
    schedule();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    if (auto && visible) timer = window.setTimeout(() => select(current + 1), DUR);
  };
  const stopAuto = () => {
    auto = false;
    list.classList.remove("is-auto");
    window.clearTimeout(timer);
  };

  tabs.forEach((t, i) =>
    t.addEventListener("click", () => {
      stopAuto();
      select(i);
    }),
  );
  list.addEventListener("keydown", (e) => {
    const map: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowDown: current + 1,
      ArrowLeft: current - 1,
      ArrowUp: current - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    stopAuto();
    select(map[e.key], true);
  });

  if (!("IntersectionObserver" in window)) {
    section.classList.add("is-in");
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible) {
          section.classList.add("is-in");
          if (auto) {
            list.classList.add("is-auto");
            // restart the progress bar for the current tab
            select(current);
          }
        } else {
          window.clearTimeout(timer);
          list.classList.remove("is-auto");
        }
      }
    },
    { threshold: 0.35 },
  );
  io.observe(section);
}

/* ───────── Departure board split-flap ───────── */

const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function initBoard() {
  const board = document.querySelector<HTMLElement>("[data-board]");
  if (!board) return;
  const cells: { el: HTMLElement; target: string }[] = [];
  board.querySelectorAll<HTMLElement>("[data-flap]").forEach((span) => {
    const text = (span.textContent ?? "").trim();
    const sr = document.createElement("span");
    sr.className = "qc-sr-only";
    sr.textContent = text;
    const vis = document.createElement("span");
    vis.setAttribute("aria-hidden", "true");
    for (const word of text.split(" ")) {
      const w = document.createElement("span");
      w.className = "flap-w";
      for (const ch of word.toUpperCase()) {
        const c = document.createElement("span");
        c.className = "fl";
        c.textContent = ch;
        w.append(c);
        cells.push({ el: c, target: ch });
      }
      vis.append(w);
    }
    span.replaceChildren(sr, vis);
  });
  if (prefersReducedMotion) return;

  const r = rng("board");
  onceVisible(
    board,
    () => {
      cells.forEach(({ el, target }, i) => {
        if (!/[A-Z0-9]/.test(target)) return;
        let flips = 4 + Math.floor(r() * 7) + (i % 9);
        const tick = () => {
          if (flips-- <= 0) {
            el.textContent = target;
            return;
          }
          el.textContent = FLAP_CHARS[Math.floor(r() * FLAP_CHARS.length)];
          window.setTimeout(tick, 55);
        };
        window.setTimeout(tick, Math.floor(i / 6) * 25);
      });
    },
    0.4,
  );
}

drawBarcodes();
drawQRs();
initHero();
initTickets();
initTravelDocs();
initBoard();
