/* Ink: variable-width handwritten strokes rendered as SVG.
   Each stroke is a list of points with a width. It is drawn as a filled ribbon
   (chunked so self-crossing loops never punch holes) and revealed along its
   centreline with a stroke-dashoffset mask, so it looks like a pen writing it. */

export type Pt = { x: number; y: number; w: number };
export type Stroke = Pt[];

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

/** Hand-authored signature centrelines in a 400×150 box (upright; slant is applied when sampled). */
export const SIGNATURES = {
  jordan: [
    "M48 44C62 30 92 24 100 32C108 42 90 70 80 96C72 118 60 130 46 126C32 122 36 104 52 98C70 92 92 92 108 88C116 86 120 72 130 72C140 72 138 88 128 88C120 88 122 76 134 78C142 80 144 88 150 86C156 84 156 74 162 74C168 74 166 88 176 88C186 88 184 70 194 52C198 44 196 40 192 46C186 56 186 82 194 88C200 92 206 78 214 78C222 78 220 90 214 90C208 90 212 80 222 80C228 80 226 88 232 88C240 88 240 76 248 76C256 76 252 90 262 88",
    "M286 40C280 60 272 92 268 110C266 120 278 120 290 112C300 104 304 96 312 96C322 96 316 108 308 106C302 104 306 94 316 94C330 94 330 108 340 106C346 104 344 96 338 98C332 100 334 108 346 108C356 108 362 102 368 96",
    "M60 136C150 126 280 122 360 118",
  ],
  priya: [
    "M60 120C64 96 70 60 76 34C80 22 112 22 116 40C120 58 92 70 72 66",
    "M100 96C108 84 114 80 118 88C122 96 120 104 126 96C132 86 138 82 144 86C150 90 146 104 154 100C162 96 164 84 170 84C176 84 170 108 178 104C186 100 190 86 198 86C208 86 204 102 196 100C190 98 196 86 206 88C212 90 212 100 220 98",
    "M252 50C240 40 226 52 236 64C246 76 262 84 252 100C244 112 226 106 228 98",
    "M262 98C270 70 282 40 286 34C280 60 276 84 274 100C280 86 288 80 294 84C300 90 296 100 304 98C314 96 316 84 324 86",
    "M230 116C270 112 320 108 360 92",
  ],
  marcus: [
    "M48 112C56 80 64 50 70 34C76 60 82 84 88 96C96 70 104 46 112 32C114 60 116 88 122 104C128 92 134 84 142 86C150 88 146 100 140 100C134 100 138 88 150 88C158 88 156 100 164 98C172 96 172 86 180 86C186 86 184 100 192 98C200 96 206 88 214 90",
    "M238 44C244 70 250 90 254 100C260 84 266 70 270 64C272 80 276 92 282 100C290 86 296 62 300 46",
    "M300 46C300 70 300 96 304 100C312 106 324 92 316 86C308 82 306 98 320 100C330 102 336 84 334 70C332 92 336 104 346 100C356 94 352 82 344 86",
    "M40 128C140 112 260 124 380 106",
  ],
} as const;
export type SignatureName = keyof typeof SIGNATURES;

let measurer: SVGPathElement | null = null;
function measurePath(d: string) {
  if (!measurer) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    measurer = document.createElementNS(NS, "path");
    svg.append(measurer);
    document.body.append(svg);
  }
  measurer.setAttribute("d", d);
  return measurer;
}

const NIB_ANGLE = -0.72; // radians; a pen held at roughly 40°

/** Calligraphic widths from stroke direction, tapered at both ends, lightly smoothed. */
export function applyNib(pts: Pt[], { min = 1.05, max = 3.5, blend = 1 } = {}): Pt[] {
  const n = pts.length;
  const raw = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(n - 1, i + 2)];
    const theta = Math.atan2(b.y - a.y, b.x - a.x);
    const nib = min + (max - min) * Math.abs(Math.sin(theta - NIB_ANGLE));
    return blend * nib + (1 - blend) * p.w;
  });
  const taper = Math.min(10, Math.floor(n / 3));
  return pts.map((p, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -2; k <= 2; k++) {
      const v = raw[i + k];
      if (v !== undefined) {
        sum += v;
        count++;
      }
    }
    const edge = Math.min(i, n - 1 - i);
    const t = taper ? Math.min(1, edge / taper) : 1;
    const ease = 0.38 + 0.62 * (1 - (1 - t) * (1 - t));
    return { x: p.x, y: p.y, w: (sum / count) * ease };
  });
}

/** Samples a preset signature into slanted, nib-weighted strokes. */
export function presetStrokes(name: SignatureName, { slant = 0.24, step = 1.5 } = {}): Stroke[] {
  return SIGNATURES[name].map((d) => {
    const path = measurePath(d);
    const len = path.getTotalLength();
    const n = Math.max(2, Math.ceil(len / step));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const q = path.getPointAtLength((len * i) / n);
      pts.push({ x: q.x - (q.y - 75) * slant, y: q.y, w: 0 });
    }
    return applyNib(pts);
  });
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Smooth open path through points using quadratic curves between midpoints. */
function smooth(pts: { x: number; y: number }[], move = true): string {
  if (!pts.length) return "";
  let d = (move ? "M" : "L") + f(pts[0].x) + " " + f(pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += "Q" + f(pts[i].x) + " " + f(pts[i].y) + " " + f(mx) + " " + f(my);
  }
  const last = pts[pts.length - 1];
  return d + "L" + f(last.x) + " " + f(last.y);
}

/** Filled ribbon outline for a slice of a stroke. */
function ribbon(pts: Pt[], all: Pt[], offset: number): string {
  if (pts.length === 1) {
    const p = pts[0];
    const r = Math.max(0.8, p.w / 2);
    return `M${f(p.x - r)} ${f(p.y)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0`;
  }
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  pts.forEach((p, j) => {
    const i = offset + j;
    const a = all[Math.max(0, i - 1)];
    const b = all[Math.min(all.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = p.w / 2;
    left.push({ x: p.x - dy * h, y: p.y + dx * h });
    right.push({ x: p.x + dy * h, y: p.y - dx * h });
  });
  return smooth(left) + smooth(right.reverse(), false) + "Z";
}

/** Outline path data for a whole stroke, chunked to avoid self-intersection holes. */
export function strokeOutline(stroke: Stroke, chunk = 14): string {
  if (stroke.length < 3) return ribbon(stroke.slice(0, 1), stroke, 0);
  let d = "";
  for (let i = 0; i < stroke.length - 1; i += chunk) {
    const slice = stroke.slice(i, Math.min(stroke.length, i + chunk + 1));
    d += ribbon(slice, stroke, i);
  }
  return d;
}

/** Centreline used to reveal the ink (mask). */
export function strokeCentre(stroke: Stroke): string {
  if (stroke.length === 1) return `M${f(stroke[0].x)} ${f(stroke[0].y)}l0.1 0`;
  return smooth(stroke);
}

export function strokesBox(strokes: Stroke[], pad = 8) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      x0 = Math.min(x0, p.x - p.w);
      y0 = Math.min(y0, p.y - p.w);
      x1 = Math.max(x1, p.x + p.w);
      y1 = Math.max(y1, p.y + p.w);
    }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 400, h: 150 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export type InkHandle = {
  g: SVGGElement;
  /** Writes the ink on over `duration` ms (sequential strokes). Resolves when done. */
  reveal: (duration?: number, delay?: number) => Promise<void>;
  /** Shows the finished ink instantly. */
  finish: () => void;
  /** Hides the ink (ready to be revealed again). */
  hide: () => void;
};

/** Builds a masked ink group for the given strokes. Append `g` to any svg. */
export function createInk(strokes: Stroke[], className = "sy-ink"): InkHandle {
  const id = `sy-ink-m${++uid}`;
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", className);
  const mask = document.createElementNS(NS, "mask");
  mask.setAttribute("id", id);
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  const box = strokesBox(strokes, 20);
  mask.setAttribute("x", String(f(box.x)));
  mask.setAttribute("y", String(f(box.y)));
  mask.setAttribute("width", String(f(box.w)));
  mask.setAttribute("height", String(f(box.h)));

  const lengths = strokes.map((s) => s.reduce((acc, p, i) => (i ? acc + Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y) : 0), 0) + 6);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const maxW = Math.max(2, ...strokes.flat().map((p) => p.w));

  const centres = strokes.map((s) => {
    const c = document.createElementNS(NS, "path");
    c.setAttribute("d", strokeCentre(s));
    c.setAttribute("pathLength", "1");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "#fff");
    c.setAttribute("stroke-width", String(f(maxW + 3.5)));
    c.setAttribute("stroke-linecap", "round");
    c.setAttribute("stroke-linejoin", "round");
    c.style.strokeDasharray = "1 1.2";
    c.style.strokeDashoffset = "0";
    mask.append(c);
    return c;
  });

  const ink = document.createElementNS(NS, "path");
  ink.setAttribute("d", strokes.map((s) => strokeOutline(s)).join(""));
  ink.setAttribute("mask", `url(#${id})`);
  g.append(mask, ink);

  let running: Animation[] = [];
  const stop = () => {
    running.forEach((a) => a.cancel());
    running = [];
  };

  return {
    g,
    reveal(duration = 1400, delay = 0) {
      stop();
      let at = delay;
      running = centres.map((c, i) => {
        const d = (duration * lengths[i]) / total;
        const anim = c.animate([{ strokeDashoffset: 1.03 }, { strokeDashoffset: 0 }], {
          duration: d,
          delay: at,
          fill: "both",
          easing: i === centres.length - 1 && strokes.length > 1 ? "cubic-bezier(.45,.05,.3,1)" : "cubic-bezier(.4,.1,.55,.95)",
        });
        at += d + 60;
        return anim;
      });
      const last = running[running.length - 1];
      return last ? last.finished.then(() => undefined, () => undefined) : Promise.resolve();
    },
    finish() {
      stop();
      centres.forEach((c) => (c.style.strokeDashoffset = "0"));
    },
    hide() {
      stop();
      centres.forEach((c) => (c.style.strokeDashoffset = "1.03"));
    },
  };
}

/** Replaces the plain centreline paths of a static <svg data-ink="name"> with a weighted, animatable ink group. */
export function upgradeStaticInk(svg: SVGSVGElement): InkHandle | null {
  const name = svg.dataset.ink as SignatureName | undefined;
  if (!name || !(name in SIGNATURES)) return null;
  const handle = createInk(presetStrokes(name));
  svg.querySelectorAll(".sy-ink-cl").forEach((n) => n.remove());
  svg.append(handle.g);
  return handle;
}
