import { onceVisible, prefersReducedMotion as RM } from "../../src/shared/site.ts";
import "./style.css";
import { SplitFlap } from "./flap.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────── Visibility-aware timelines: loops only run while on screen ───────── */

function watch(el: Element, cb: (visible: boolean) => void, threshold = 0.15) {
  let inView = false;
  const emit = () => cb(inView && document.visibilityState === "visible");
  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      emit();
    },
    { threshold },
  ).observe(el);
  document.addEventListener("visibilitychange", emit);
}

type Step = [delay: number, action: () => void];

function timeline(el: Element, steps: Step[]) {
  let i = 0;
  let timer = 0;
  let visible = false;
  const next = () => {
    if (!visible) return;
    timer = window.setTimeout(() => {
      timer = 0;
      steps[i][1]();
      i = (i + 1) % steps.length;
      next();
    }, steps[i][0]);
  };
  watch(el, (v) => {
    visible = v;
    if (v && !timer) next();
    if (!v && timer) {
      clearTimeout(timer);
      timer = 0;
    }
  });
}

/* ───────── Hero departure board ───────── */

const STAGES: [doc: string, status: string][] = [
  ["Quote", "Sent"],
  ["Itinerary", "Ready"],
  ["Booking", "On time"],
  ["Booking", "Boarding"],
  ["Booking", "Confirmed"],
];
const DESTS = ["Cape Town", "Santorini", "Queenstown", "Marrakech", "New York", "Reykjavik", "Maldives", "Tokyo", "Banff", "Paris", "Fiji", "Rome"].filter(
  (d) => d.length <= 9,
);

function initBoard() {
  const board = $("[data-board]");
  if (!board) return;
  const rows = $$("tr[data-row]", board).map((tr, r) => {
    const flaps = $$(".sf", tr).map((el) => new SplitFlap(el, !RM));
    return {
      tr,
      flaps,
      statusCell: tr.querySelector<HTMLElement>("[data-status]")!,
      stage: [0, 1, 4][r],
    };
  });

  const clockEl = $("[data-sf-clock]", board);
  const now = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  if (clockEl) clockEl.textContent = now();
  const clock = clockEl ? new SplitFlap(clockEl, !RM) : null;

  if (RM) return;

  const setStatus = (row: (typeof rows)[number], status: string) => {
    row.statusCell.dataset.status = status.toLowerCase().replace(/\s+/g, "-");
  };

  // Intro: rows flip into place, top to bottom.
  const finals = rows.map((row) => row.flaps.map((f) => f.value));
  rows.forEach((row) => (row.statusCell.dataset.status = "blank"));
  onceVisible(
    board,
    async () => {
      clock?.set(now());
      await sleep(250);
      for (const [r, row] of rows.entries()) {
        setStatus(row, finals[r][3]);
        row.flaps.forEach((f, c) => setTimeout(() => f.set(finals[r][c]), c * 90));
        await sleep(380);
      }
      await sleep(1600);
      startLoop();
    },
    0.2,
  );

  setInterval(() => {
    if (clock && clock.value !== now() && document.visibilityState === "visible") clock.set(now());
  }, 5000);

  let destIdx = 0;
  let minutes = 10 * 60 + 40;
  const startLoop = () => {
    let turn = 0;
    timeline(board, [
      [
        2300,
        () => {
          const row = rows[turn % rows.length];
          turn++;
          row.stage++;
          if (row.stage >= STAGES.length) {
            row.stage = 0;
            minutes = (minutes + 35) % (24 * 60);
            const t = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
            row.flaps[0].set(t);
            row.flaps[1].set(DESTS[destIdx++ % DESTS.length]);
          }
          const [doc, status] = STAGES[row.stage];
          row.flaps[2].set(doc);
          setStatus(row, status);
          row.flaps[3].set(status);
        },
      ],
    ]);
  };
}

/* ───────── Hero itinerary: segments drop in from the palette ───────── */

function initItinerary() {
  const itin = $("[data-itin]");
  const palette = $("[data-palette]");
  if (!itin) return;
  const segs = $$(".seg", itin);
  if (RM) {
    segs.forEach((s) => s.classList.add("is-in"));
    itin.classList.add("is-signed");
    return;
  }
  const steps: Step[] = [];
  steps.push([
    300,
    () => {
      segs.forEach((s) => s.classList.remove("is-in"));
      itin.classList.remove("is-signed");
    },
  ]);
  for (const seg of segs) {
    const pal = palette?.querySelector(`[data-pal="${seg.dataset.seg}"]`);
    steps.push([650, () => pal?.classList.add("is-active")]);
    steps.push([
      320,
      () => {
        pal?.classList.remove("is-active");
        seg.classList.add("is-in");
      },
    ]);
  }
  steps.push([1100, () => itin.classList.add("is-signed")]);
  steps.push([5200, () => itin.classList.add("is-out")]);
  steps.push([450, () => itin.classList.remove("is-out")]);
  timeline(itin, steps);
}

/* ───────── Gate labels: flip in once ───────── */

function initLabels() {
  $$(".sf--label").forEach((el) => {
    const final = (el.textContent ?? "").trim();
    const flap = new SplitFlap(el, !RM);
    if (!RM) onceVisible(el, () => setTimeout(() => flap.set(final, { spins: [2, 5] }), 200), 0.9);
  });
}

/* ───────── G1 Import: PNR lines become segments ───────── */

function initImport() {
  const root = $("[data-import]");
  if (!root) return;
  const lines = $$(".term__lines li", root);
  const segs = $$(".segs .seg", root);
  const src = $("[data-src]", root)!;
  if (RM) {
    segs.forEach((s) => s.classList.add("is-in"));
    lines.forEach((l) => l.classList.add("is-done"));
    return;
  }
  const sources = ["Sabre GDS", "PowerSuite", "Tramada"];
  let s = 0;
  const steps: Step[] = [
    [
      400,
      () => {
        root.classList.remove("is-out");
        segs.forEach((x) => x.classList.remove("is-in"));
        lines.forEach((x) => x.classList.remove("is-scan", "is-done"));
      },
    ],
  ];
  lines.forEach((line, i) => {
    steps.push([520, () => line.classList.add("is-scan")]);
    steps.push([
      260,
      () => {
        line.classList.replace("is-scan", "is-done");
        segs[i]?.classList.add("is-in");
      },
    ]);
  });
  steps.push([3200, () => root.classList.add("is-out")]);
  steps.push([
    420,
    () => {
      s = (s + 1) % sources.length;
      src.textContent = sources[s];
    },
  ]);
  timeline(root, steps);
}

/* ───────── G2 Enrich: blocks drop into the page ───────── */

function initEnrich() {
  const root = $("[data-enrich]");
  if (!root) return;
  const blocks = $$("[data-blk]", root);
  const tools = $$("[data-tool]", root);
  if (RM) {
    blocks.forEach((b) => b.classList.add("is-in"));
    return;
  }
  const steps: Step[] = [[300, () => root.classList.remove("is-out")]];
  blocks.forEach((b, i) => {
    steps.push([700, () => tools[i]?.classList.add("is-active")]);
    steps.push([
      280,
      () => {
        tools[i]?.classList.remove("is-active");
        b.classList.add("is-in");
      },
    ]);
  });
  steps.push([3800, () => root.classList.add("is-out")]);
  steps.push([500, () => blocks.forEach((b) => b.classList.remove("is-in"))]);
  timeline(root, steps);
}

/* ───────── G3 Libraries: items insert into the document ───────── */

function initLibrary() {
  const root = $("[data-lib]");
  if (!root) return;
  const blocks = $$(".mini-doc__blk", root);
  const item = (i: string) => root.querySelector(`.lib__item[data-i="${i}"]`);
  if (RM) {
    blocks.forEach((b) => {
      b.classList.add("is-in");
      item(b.dataset.i!)?.classList.add("is-added");
    });
    return;
  }
  const steps: Step[] = [];
  blocks.forEach((b) => {
    const it = item(b.dataset.i!);
    steps.push([900, () => it?.classList.add("is-pick")]);
    steps.push([
      420,
      () => {
        it?.classList.replace("is-pick", "is-added");
        b.classList.add("is-in");
      },
    ]);
  });
  steps.push([
    3400,
    () => {
      blocks.forEach((b) => b.classList.remove("is-in"));
      $$(".lib__item", root).forEach((x) => x.classList.remove("is-added"));
    },
  ]);
  timeline(root, steps);
}

/* ───────── G4 Brand: covers rotate through the stack ───────── */

function initBrand() {
  const root = $("[data-brand]");
  if (!root || RM) return;
  const covers = $$(".cover", root);
  timeline(root, [
    [
      2600,
      () => {
        covers.forEach((c) => {
          const p = Number(c.dataset.pos);
          c.dataset.pos = String((p + covers.length - 1) % covers.length);
        });
      },
    ],
  ]);
}

/* ───────── G5 Price: optional extras update the total ───────── */

function initPrice() {
  const root = $("[data-price]");
  if (!root) return;
  const total = $("[data-total]", root)!;
  const opts = $$<HTMLButtonElement>(".opt", root);
  const base = 4550;
  let shown = base;
  let raf = 0;
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const render = () => {
    const target = base + opts.reduce((sum, o) => sum + (o.getAttribute("aria-checked") === "true" ? Number(o.dataset.add) : 0), 0);
    cancelAnimationFrame(raf);
    if (RM) {
      shown = target;
      total.textContent = fmt(target);
      return;
    }
    const from = shown;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
      total.textContent = fmt(shown);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    total.classList.remove("is-bump");
    void total.offsetWidth;
    total.classList.add("is-bump");
  };
  const toggle = (o: HTMLButtonElement, on?: boolean) => {
    o.setAttribute("aria-checked", String(on ?? o.getAttribute("aria-checked") !== "true"));
    render();
  };
  let auto = !RM;
  opts.forEach((o) =>
    o.addEventListener("click", () => {
      auto = false;
      toggle(o);
    }),
  );
  if (!auto) return;
  timeline(root, [
    [1800, () => auto && toggle(opts[0], true)],
    [1600, () => auto && toggle(opts[1], true)],
    [3200, () => auto && opts.forEach((o) => o.setAttribute("aria-checked", "false"))],
    [10, () => auto && render()],
  ]);
}

/* ───────── G6 Sign & pay ───────── */

function initSign() {
  const root = $("[data-sign]");
  if (!root) return;
  if (RM) {
    root.classList.add("is-signed", "is-stamped", "is-paid");
    return;
  }
  timeline(root, [
    [700, () => root.classList.add("is-signed")],
    [1500, () => root.classList.add("is-stamped")],
    [1200, () => root.classList.add("is-pressing")],
    [260, () => root.classList.replace("is-pressing", "is-paid")],
    [3600, () => root.classList.add("is-out")],
    [450, () => root.classList.remove("is-out", "is-signed", "is-stamped", "is-paid")],
  ]);
}

/* ───────── G7 TravelDocs: lock screen live activity updates ───────── */

function initApp() {
  const root = $("[data-app]");
  if (!root || RM) return;
  timeline(root, [[3200, () => root.classList.toggle("is-alt")]]);
}

/* ───────── Proof stats + closing board ───────── */

function initOnce(selector: string, container: string, opts: { gap?: number; spins?: [number, number] } = {}) {
  const root = $(container);
  if (!root) return;
  const flaps = $$(selector, root).map((el) => {
    const final = (el.textContent ?? "").trim();
    return { flap: new SplitFlap(el, !RM), final };
  });
  if (RM) return;
  onceVisible(
    root,
    async () => {
      for (const { flap, final } of flaps) {
        flap.set(final, { spins: opts.spins ?? [3, 7], stagger: 40 });
        await sleep(opts.gap ?? 260);
      }
    },
    0.5,
  );
}

initBoard();
initItinerary();
initLabels();
initImport();
initEnrich();
initLibrary();
initBrand();
initPrice();
initSign();
initApp();
initOnce(".sf--stat", "[data-stats]");
initOnce(".sf--xl", "[data-final]", { gap: 520, spins: [4, 9] });
