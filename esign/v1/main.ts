import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────────────────────────────────────────────────────────────
   E-sign v1 — "Ink Bento"
   Every visual is a looping WAAPI timeline (transform / opacity / clip-path / stroke only).
   Each loop is built lazily when it first scrolls into view, pauses off-screen, and the
   markup's default state is the finished (signed) state, so no-JS and reduced motion read fine.
   ─────────────────────────────────────────────────────────────── */

const EASE = "cubic-bezier(.22,1,.36,1)";
const SPRING = "cubic-bezier(.34,1.56,.64,1)";
const PEN = "cubic-bezier(.45,.05,.55,.95)";
const LIN = "linear";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/* ───────── Today's date on the contract ───────── */

const now = new Date();
const day = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
$$("[data-today]").forEach((el) => (el.textContent = day));
$$("[data-today-time]").forEach((el) => (el.textContent = `${day}, ${time}`));

/* ───────── Broad-nib pressure: duplicate each signature's ink, nudged diagonally ───────── */

$$<SVGGElement>(".es .sig__ink").forEach((g) => {
  const nib = g.cloneNode(true) as SVGGElement;
  nib.setAttribute("class", "sig__nib");
  g.after(nib);
});

/* ───────── Timeline helpers ───────── */

type Frame = [ms: number, props: Keyframe, easing?: string];

/** One looping timeline of fixed length T; every animation shares T so they stay in sync. */
class Track {
  anims: Animation[] = [];
  constructor(readonly T: number) {}

  to(el: Element | null | undefined, frames: Frame[]) {
    if (!el || !frames.length) return;
    const kf: Keyframe[] = frames.map(([t, p, e]) => ({ ...p, offset: clamp01(t / this.T), easing: e ?? EASE }));
    if ((kf[0].offset as number) > 0) kf.unshift({ ...frames[0][1], offset: 0, easing: LIN });
    if ((kf[kf.length - 1].offset as number) < 1) kf.push({ ...frames[frames.length - 1][1], offset: 1 });
    this.anims.push(el.animate(kf, { duration: this.T, iterations: Infinity }));
  }

  /** Enter at tIn (from → to), hold, fade out at tOut. */
  show(
    el: Element | null | undefined,
    tIn: number,
    tOut: number,
    from: Keyframe,
    dur = 420,
    easing = EASE,
    to: Keyframe = { opacity: 1, transform: "none" },
  ) {
    this.to(el, [
      [0, from],
      [tIn, from, easing],
      [tIn + dur, to],
      [tOut, to],
      [tOut + 320, { ...to, opacity: 0 }],
    ]);
  }

  /** Quick press / pop on an element that otherwise stays put. */
  pulse(el: Element | null | undefined, t: number, scale = 1.06) {
    this.to(el, [
      [Math.max(0, t - 120), { transform: "none" }],
      [t + 40, { transform: `scale(${scale})` }],
      [t + 320, { transform: "none" }],
    ]);
  }
}

/** Draw strokes with stroke-dashoffset (pathLength=1). Signature paths carry --o/--l so strokes run in pen order. */
function ink(k: Track, el: Element | null | undefined, start: number, dur: number, out: number) {
  if (!el) return;
  const paths = el.matches("path, circle") ? [el as SVGElement] : $$<SVGElement>("path", el);
  for (const p of paths) {
    const o = Number(p.style.getPropertyValue("--o")) || 0;
    const l = Number(p.style.getPropertyValue("--l")) || 1;
    const s = start + o * dur;
    const e = s + l * dur;
    k.to(p, [
      [0, { strokeDashoffset: 1, opacity: 0 }, "steps(1, end)"],
      [s, { strokeDashoffset: 1, opacity: 1 }, PEN],
      [e, { strokeDashoffset: 0, opacity: 1 }],
      [out, { strokeDashoffset: 0, opacity: 1 }],
      [out + 380, { strokeDashoffset: 0, opacity: 0 }],
    ]);
  }
}

/**
 * Builds the timeline the first time `root` is on screen, pauses it off-screen, rebuilds it when the
 * width changes (positions are measured), and replays it when a mouse lifts the tile.
 */
function loop(root: HTMLElement | null, T: number, build: (k: Track) => void, hover?: HTMLElement | null) {
  if (!root) return;
  let k: Track | null = null;
  let visible = false;
  let width = 0;
  const make = () => {
    k?.anims.forEach((a) => a.cancel());
    k = new Track(T);
    build(k);
    if (!visible) k.anims.forEach((a) => a.pause());
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) return k?.anims.forEach((a) => a.playState === "running" && a.pause());
    if (!k) make();
    else k.anims.forEach((a) => a.playState === "paused" && a.play());
  }).observe(root);
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (width && w !== width && k) make();
    width = w;
  }).observe(root);
  hover?.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse" || !k) return;
    const t = Number(k.anims[0]?.currentTime ?? 0) % T;
    if (t < 1400) return; // just started; don't stutter
    k.anims.forEach((a) => {
      a.currentTime = 0;
      a.play();
    });
  });
}

/* ───────── Timelines ───────── */

function hero(k: Track) {
  const root = $("[data-hero]")!;
  const OUT = 10800;
  $$("[data-h-initial] .sig", root).forEach((s, i) => ink(k, s, 400 + i * 750, 650, OUT));
  k.pulse($(".signbox__tag", root), 1750, 1.08);
  ink(k, $(".sig--hero", root), 2000, 2500, OUT);
  k.show($("[data-h-date]", root), 4600, OUT, { opacity: 0, transform: "translateY(6px)" });
  const sealOn = { opacity: 1, transform: "rotate(-12deg) scale(1)" };
  k.to($("[data-h-seal]", root), [
    [0, { opacity: 0, transform: "rotate(-40deg) scale(1.7)" }],
    [5000, { opacity: 0, transform: "rotate(-40deg) scale(1.7)" }, SPRING],
    [5620, sealOn],
    [OUT, sealOn],
    [OUT + 320, { opacity: 0, transform: "rotate(-12deg) scale(.92)" }],
  ]);
  ink(k, $(".seal__tick", root), 5450, 380, OUT);
  k.show($("[data-h-stamp]", root), 5650, OUT, { opacity: 0, transform: "translateY(4px)" });
  k.show($("[data-h-toast]", root), 6050, OUT, { opacity: 0, transform: "translateY(14px) scale(.96)" }, 560, SPRING);
}

const tiles: Record<string, [number, (k: Track, root: HTMLElement) => void]> = {
  any: [
    8200,
    (k, root) => {
      const box = $(".any", root)!;
      const src = $("[data-any-src]", root)!;
      const block = $("[data-any-block]", root)!;
      const ghost = $("[data-any-ghost]", root)!;
      const b = box.getBoundingClientRect();
      const s = src.getBoundingClientRect();
      const t = block.getBoundingClientRect();
      ghost.style.width = `${s.width}px`;
      const sx = s.left - b.left;
      const sy = s.top - b.top;
      const tx = t.left - b.left + 14;
      const ty = t.top - b.top + 22;
      const at = (x: number, y: number, extra = "") => `translate(${x}px, ${y}px) ${extra}`;
      k.pulse(src, 420, 0.94);
      k.to(ghost, [
        [0, { opacity: 0, transform: at(sx, sy) }],
        [480, { opacity: 0, transform: at(sx, sy) }],
        [640, { opacity: 1, transform: at(sx, sy, "scale(1.06) rotate(-2deg)") }, "cubic-bezier(.55,0,.2,1)"],
        [1520, { opacity: 1, transform: at(tx, ty, "scale(1.06) rotate(-2deg)") }],
        [1720, { opacity: 0, transform: at(tx, ty, "scale(.92)") }],
      ]);
      k.to($("[data-any-drop]", root), [
        [0, { opacity: 0, transform: "scaleX(.2)" }],
        [1050, { opacity: 0, transform: "scaleX(.2)" }],
        [1280, { opacity: 1, transform: "none" }],
        [1560, { opacity: 1, transform: "none" }],
        [1760, { opacity: 0, transform: "none" }],
      ]);
      k.show(block, 1560, 7300, { opacity: 0, transform: "scale(.96)" }, 480, SPRING);
      ink(k, $(".sig", block), 2150, 2100, 7300);
    },
  ],
  plan: [
    6600,
    (k, root) => {
      $$(".tick path", root).forEach((p, i) => ink(k, p, 300 + i * 190, 320, 5900));
      k.show($(".plan__row--hi em", root), 1250, 5900, { opacity: 0, transform: "scale(.6)" }, 460, SPRING);
      k.show($("[data-plan-strike]", root), 1850, 5900, { opacity: 1, transform: "scaleX(0)" }, 520);
      k.show($(".plan__row--no em", root), 2400, 5900, { opacity: 0, transform: "translateX(-6px)" });
    },
  ],
  init: [
    6200,
    (k, root) => {
      $$("[data-init]", root).forEach((box, i) => {
        const t0 = 450 + i * 680;
        k.pulse(box, t0, 1.08);
        ink(k, $(".sig", box), t0 + 60, 480, 5300);
      });
      k.show($("[data-init-count]", root), 2600, 5300, { opacity: 0, transform: "translateY(6px) scale(.9)" }, 460, SPRING);
    },
  ],
  pdf: [
    8600,
    (k, root) => {
      const OUT = 7700;
      k.show($("[data-pdf-file]", root), 200, OUT, { opacity: 0, transform: "translateY(-10px)" });
      const [gh, gv] = $$("[data-pdf-guide]", root);
      const hF: Frame[] = [];
      const vF: Frame[] = [];
      $$("[data-fld]", root).forEach((f, i) => {
        const t0 = 800 + i * 480;
        const off = { opacity: 0, transform: "translate(-26px, -14px) scale(1.06)" };
        const on = { opacity: 1, transform: "none" };
        k.to(f, [
          [0, off],
          [t0, off],
          [t0 + 420, on],
          [OUT, on],
          [OUT + 300, { ...on, opacity: 0 }],
        ]);
        const y = `translateY(${f.offsetTop}px)`;
        const x = `translateX(${f.offsetLeft}px)`;
        const a = t0 + 240;
        hF.push([a, { opacity: 0, transform: y }], [a + 60, { opacity: 1, transform: y }], [a + 300, { opacity: 1, transform: y }], [a + 400, { opacity: 0, transform: y }]);
        vF.push([a, { opacity: 0, transform: x }], [a + 60, { opacity: 1, transform: x }], [a + 300, { opacity: 1, transform: x }], [a + 400, { opacity: 0, transform: x }]);
      });
      k.to(gh, hF);
      k.to(gv, vF);
      k.pulse($("[data-pdf-send]", root), 3500, 0.94);
    },
  ],
  signers: [
    8600,
    (k, root) => {
      const OUT = 7800;
      const bar: Frame[] = [[0, { transform: "scaleX(0)" }]];
      $$("[data-signer]", root).forEach((signer, i) => {
        const s0 = 400 + i * 2100;
        const done = s0 + 1500;
        k.to(signer, [
          [0, { transform: "none" }],
          [s0 - 220, { transform: "none" }],
          [s0, { transform: "translateY(-4px)" }],
          [done + 100, { transform: "translateY(-4px)" }],
          [done + 400, { transform: "none" }],
        ]);
        ink(k, $(".sig", signer), s0, 1500, OUT);
        const [wait, signed] = $$(":scope > span", $("[data-signer-state]", signer)!);
        k.to(wait, [
          [0, { opacity: 1 }],
          [done, { opacity: 1 }],
          [done + 200, { opacity: 0 }],
          [OUT, { opacity: 0 }],
          [OUT + 400, { opacity: 1 }],
        ]);
        k.show(signed, done + 80, OUT, { opacity: 0, transform: "translateY(4px)" }, 300);
        bar.push([done, { transform: `scaleX(${i / 3})` }], [done + 400, { transform: `scaleX(${(i + 1) / 3})` }]);
      });
      bar.push([OUT, { transform: "scaleX(1)" }], [OUT + 400, { transform: "scaleX(0)" }]);
      k.to($("[data-signers-bar]", root), bar);
    },
  ],
  tabs: [
    9600,
    (k, root) => {
      k.to($("[data-pad-ind]", root), [
        [0, { transform: "none" }],
        [3000, { transform: "none" }],
        [3350, { transform: "translateX(100%)" }],
        [6200, { transform: "translateX(100%)" }],
        [6550, { transform: "translateX(200%)" }],
        [9250, { transform: "translateX(200%)" }],
        [9600, { transform: "none" }],
      ]);
      const [draw, type, up] = $$("[data-pad-pane]", root);
      k.to(draw, [
        [0, { opacity: 1 }],
        [2900, { opacity: 1 }],
        [3100, { opacity: 0 }],
        [9350, { opacity: 0 }],
        [9600, { opacity: 1 }],
      ]);
      ink(k, $(".sig", draw), 300, 1900, 2800);
      k.to(type, [
        [0, { opacity: 0 }],
        [3150, { opacity: 0 }],
        [3350, { opacity: 1 }],
        [6100, { opacity: 1 }],
        [6300, { opacity: 0 }],
      ]);
      k.to($(".pad__typed", root), [
        [0, { clipPath: "inset(0 100% 0 0)" }],
        [3450, { clipPath: "inset(0 100% 0 0)" }, "steps(12, end)"],
        [4650, { clipPath: "inset(0 0% 0 0)" }],
      ]);
      k.to(up, [
        [0, { opacity: 0 }],
        [6350, { opacity: 0 }],
        [6550, { opacity: 1 }],
        [9150, { opacity: 1 }],
        [9350, { opacity: 0 }],
      ]);
      k.show($(".pad__upfile", root), 6450, 9150, { opacity: 0, transform: "translateY(12px)" }, 420, EASE);
      k.to($("[data-pad-prog]", root), [
        [0, { transform: "scaleX(0)" }],
        [6800, { transform: "scaleX(0)" }, "cubic-bezier(.3,.6,.4,1)"],
        [8100, { transform: "scaleX(1)" }],
      ]);
      k.pulse($(".pad__btn", root), 8350, 0.94);
    },
  ],
  otp: [
    6200,
    (k, root) => {
      $$("[data-otp]", root).forEach((box, i) => {
        if (!box.firstElementChild) box.innerHTML = `<span>${box.textContent}</span>`;
        const t = 500 + i * 230;
        k.pulse(box, t, 1.07);
        k.show(box.firstElementChild, t, 5200, { opacity: 0, transform: "translateY(10px)" }, 300);
      });
      k.show($("[data-otp-ok]", root), 2200, 5200, { opacity: 0, transform: "scale(.8)" }, 460, SPRING);
    },
  ],
  cert: [
    7000,
    (k, root) => {
      const OUT = 6100;
      ink(k, $("[data-cert-ring]", root), 300, 800, OUT);
      ink(k, $("[data-cert-tick]", root), 1050, 350, OUT);
      $$("[data-cert-row]", root).forEach((row, i) =>
        k.show(row, 1300 + i * 260, OUT, { opacity: 0, transform: "translateX(-10px)" }),
      );
      k.show($("[data-cert-hash]", root), 2250, OUT, { opacity: 0, transform: "none" }, 500);
    },
  ],
};

function flow(k: Track, root: HTMLElement) {
  const vertical = matchMedia("(max-width: 700px)").matches;
  const empty = vertical ? "inset(0 0 100% 0)" : "inset(0 100% 0 0)";
  const OUT = 7700;
  $$("[data-lane]", root).forEach((lane) => {
    const qc = lane.classList.contains("lane--qc");
    const start = 300;
    const dur = qc ? 1800 : 6000;
    k.to($("[data-lane-fill]", lane), [
      [0, { clipPath: empty, opacity: 1 }],
      [start, { clipPath: empty, opacity: 1 }, qc ? "cubic-bezier(.4,0,.3,1)" : LIN],
      [start + dur, { clipPath: "inset(0 0 0 0)", opacity: 1 }],
      [OUT, { clipPath: "inset(0 0 0 0)", opacity: 1 }],
      [OUT + 300, { clipPath: "inset(0 0 0 0)", opacity: 0 }],
    ]);
    const steps = $$("li", lane);
    steps.forEach((li, i) => {
      const t = start + (dur * i) / (steps.length - 1);
      k.to($(".pip > i", li), [
        [0, { transform: "scale(0)" }],
        [Math.max(0, t - 80), { transform: "scale(0)" }, SPRING],
        [t + 320, { transform: "none" }],
        [OUT, { transform: "none" }],
        [OUT + 300, { transform: "scale(0)" }],
      ]);
      k.to(li, [
        [0, { opacity: 0.55 }],
        [t, { opacity: 0.55 }],
        [t + 260, { opacity: 1 }],
        [OUT, { opacity: 1 }],
        [OUT + 300, { opacity: 0.55 }],
      ]);
    });
  });
}

/* ───────── Boot ───────── */

if (!prefersReducedMotion) {
  document.documentElement.classList.add("es-motion");

  loop($("[data-hero]"), 11600, (k) => {
    hero(k);
    document.documentElement.classList.remove("es-pre");
  });

  $$("[data-tile]").forEach((tile) => {
    const def = tiles[tile.dataset.tile ?? ""];
    if (def) loop(tile, def[0], (k) => def[1](k, tile), tile);
  });

  const flowEl = $("[data-flow]");
  loop(flowEl, 8300, (k) => flow(k, flowEl!));

  const close = $("[data-close]");
  loop(close, 9800, (k) => ink(k, $(".sig", close!), 400, 2800, 8800));
} else {
  document.documentElement.classList.remove("es-pre");
}
