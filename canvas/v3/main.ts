import "../../src/shared/site.ts";
import "./style.css";
import { prefersReducedMotion } from "../../src/shared/site.ts";

/* ───────── Helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

/** Toggles `is-live` on elements while they are on screen, so CSS loops pause offscreen. */
function liveWhileVisible(els: Element[]) {
  if (prefersReducedMotion) return;
  if (!("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("is-live"));
  const io = new IntersectionObserver((entries) =>
    entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
  );
  els.forEach((el) => io.observe(el));
}

/* ───────── Editor model ───────── */

type Mode = "canvas" | "grid";
type Id = "heading" | "image" | "quote" | "price" | "qr" | "sign";
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}
interface Row {
  blocks: Id[];
  cols: number;
  p: number;
}
interface Snapshot {
  mode: Mode;
  boxes: Record<Id, Box>;
  order: Id[];
  rows: Row[];
  showGrid: boolean;
  snap: boolean;
}

const PAGE_W = 420;
const PAGE_H = 594;
const STEP = 14;
const GUIDE_DIST = 6;
const NAMES: Record<Id, string> = {
  heading: "Heading",
  image: "Image",
  quote: "Quote",
  price: "Price table",
  qr: "QR code",
  sign: "eSignature",
};
const MIN: Record<Id, [number, number]> = {
  heading: [120, 80],
  image: [90, 90],
  quote: [110, 80],
  price: [130, 110],
  qr: [120, 72],
  sign: [180, 72],
};

function initEditor() {
  const editor = $("#te-editor");
  if (!editor) return;
  const page = $(".te-page", editor)!;
  const wrap = $(".te-pagewrap", editor)!;
  const free = $(".te-free", editor)!;
  const sel = $(".te-sel", editor)!;
  const chip = $("[data-sel-chip]", editor)!;
  const guideV = $(".te-guide--v", editor)!;
  const guideH = $(".te-guide--h", editor)!;
  const rowsEl = $$(".te-row", editor);
  const status = $("[data-status]", editor)!;
  const undoBtn = $<HTMLButtonElement>("[data-undo]", editor)!;
  const widthInput = $<HTMLInputElement>("[data-width]", editor)!;
  const widthOut = $("[data-width-out]", editor)!;
  const panels = $$("[data-panel]", editor);
  const blocks = new Map<Id, HTMLElement>($$("[data-blk]", editor).map((el) => [el.dataset.blk as Id, el]));
  const ids = [...blocks.keys()];
  const coarse = window.matchMedia("(pointer: coarse)");

  /* State — canvas boxes are read from the markup so HTML stays the single source. */
  const num = (el: HTMLElement, v: string) => Number(el.style.getPropertyValue(v));
  const boxes = {} as Record<Id, Box>;
  for (const [id, el] of blocks) {
    boxes[id] = { x: num(el, "--x"), y: num(el, "--y"), w: num(el, "--w"), h: num(el, "--h"), r: num(el, "--r") };
  }
  const state = {
    mode: "canvas" as Mode,
    boxes,
    order: [...ids].sort((a, b) => num(blocks.get(a)!, "--z") - num(blocks.get(b)!, "--z")),
    rows: [
      { blocks: ["heading"], cols: 1, p: 58 },
      { blocks: ["image", "quote"], cols: 2, p: 58 },
      { blocks: ["price", "qr"], cols: 2, p: 60 },
      { blocks: ["sign"], cols: 1, p: 58 },
    ] as Row[],
    showGrid: false,
    snap: true,
    sel: null as Id | null,
    row: 1,
  };

  const snapshot = (): Snapshot =>
    structuredClone({
      mode: state.mode,
      boxes: state.boxes,
      order: state.order,
      rows: state.rows,
      showGrid: state.showGrid,
      snap: state.snap,
    });
  const initial = snapshot();
  const history: Snapshot[] = [];
  let lastPush = 0;
  const pushUndo = (coalesce = false) => {
    const now = performance.now();
    if (!(coalesce && now - lastPush < 700)) history.push(snapshot());
    lastPush = now;
    if (history.length > 40) history.shift();
    undoBtn.disabled = false;
  };

  /* ───── Rendering ───── */

  let scale = 1;
  const applyBox = (id: Id) => {
    const b = state.boxes[id];
    const el = blocks.get(id)!;
    el.style.setProperty("--x", String(round(b.x)));
    el.style.setProperty("--y", String(round(b.y)));
    el.style.setProperty("--w", String(round(b.w)));
    el.style.setProperty("--h", String(round(b.h)));
    el.style.setProperty("--r", String(round(b.r)));
  };
  const applyOrder = () => state.order.forEach((id, i) => blocks.get(id)!.style.setProperty("--z", String(i + 1)));

  const renderSel = () => {
    const id = state.sel;
    for (const [bid, el] of blocks) el.classList.toggle("is-selected", bid === id);
    const show = state.mode === "canvas" && !!id;
    sel.hidden = !show;
    if (show && id) {
      const b = state.boxes[id];
      sel.style.setProperty("--x", String(round(b.x)));
      sel.style.setProperty("--y", String(round(b.y)));
      sel.style.setProperty("--w", String(round(b.w)));
      sel.style.setProperty("--h", String(round(b.h)));
      sel.style.setProperty("--r", String(round(b.r)));
      chip.textContent = `X ${round(b.x)}  Y ${round(b.y)}`;
    }
    $("[data-sel-name]", editor)!.textContent = id ? NAMES[id] : "Nothing selected";
    $("[data-sel-x]", editor)!.textContent = id ? String(round(state.boxes[id].x)) : "–";
    $("[data-sel-y]", editor)!.textContent = id ? String(round(state.boxes[id].y)) : "–";
    $("[data-sel-r]", editor)!.textContent = id ? `${round(state.boxes[id].r)}°` : "–";
    $$<HTMLButtonElement>("[data-act]", editor).forEach((b) => (b.disabled = !id));
  };

  const columnsFor = (row: Row): Id[][] => {
    if (row.cols === 1) return [row.blocks.slice()];
    const out: Id[][] = Array.from({ length: row.cols }, () => []);
    row.blocks.forEach((id, i) => out[i % row.cols].push(id));
    return out;
  };
  const template = (row: Row) => {
    if (row.cols === 1) return "minmax(0, 1fr)";
    if (row.cols === 2) return `minmax(0, ${row.p}fr) minmax(0, ${100 - row.p}fr)`;
    const rest = (100 - row.p) / 2;
    return `minmax(0, ${row.p}fr) minmax(0, ${rest}fr) minmax(0, ${rest}fr)`;
  };
  const widthLabel = (row: Row) => {
    if (row.cols === 1) return "100";
    if (row.cols === 2) return `${row.p} / ${100 - row.p}`;
    const rest = round((100 - row.p) / 2);
    return `${row.p} / ${rest} / ${rest}`;
  };

  /** Builds column containers for one row and moves its block elements into them. */
  const buildRow = (i: number) => {
    const row = state.rows[i];
    const host = $(".te-row__cols", rowsEl[i])!;
    host.style.gridTemplateColumns = template(row);
    const cols = columnsFor(row);
    const existing = $$(".te-col", host);
    if (existing.length !== cols.length) {
      existing.forEach((c) => c.remove());
      for (let c = 0; c < cols.length; c++) {
        const col = document.createElement("div");
        col.className = "te-col";
        host.append(col);
      }
    }
    $$(".te-col", host).forEach((col, c) => {
      col.querySelector(".te-col__empty")?.remove();
      for (const id of cols[c]) col.append(blocks.get(id)!);
      col.classList.toggle("is-stacked", cols[c].length > 1);
      if (!cols[c].length) {
        const empty = document.createElement("span");
        empty.className = "te-col__empty";
        empty.textContent = "+ Add block";
        col.append(empty);
      }
    });
  };
  const updateRowWidths = (i: number) => {
    $(".te-row__cols", rowsEl[i])!.style.gridTemplateColumns = template(state.rows[i]);
  };

  const renderGridPanel = () => {
    const row = state.rows[state.row];
    rowsEl.forEach((r, i) => r.classList.toggle("is-active", i === state.row));
    $$<HTMLButtonElement>("[data-row-pick]", editor).forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.rowPick) === state.row)),
    );
    $$<HTMLButtonElement>("[data-cols]", editor).forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.cols) === row.cols)),
    );
    widthInput.value = String(row.p);
    widthInput.disabled = row.cols === 1;
    widthInput.style.setProperty("--fill", `${((row.p - 25) / 50) * 100}%`);
    widthOut.textContent = widthLabel(row);
  };

  const statusText = () =>
    state.mode === "grid"
      ? "Grid mode: rows hold columns, columns stack blocks."
      : coarse.matches
        ? "Canvas mode: tap a block, then tap where it should go."
        : "Canvas mode: drag blocks anywhere. Arrow keys nudge.";

  /** Puts block elements where the current mode wants them (no animation). */
  const placeDom = () => {
    editor.dataset.mode = state.mode;
    page.dataset.mode = state.mode;
    page.dataset.showGrid = String(state.showGrid);
    $$("[data-mode-btn]", editor).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modeBtn === state.mode)));
    panels.forEach((p) => (p.hidden = p.dataset.panel !== state.mode));
    $$<HTMLButtonElement>("[data-opt]", editor).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.opt === "snap" ? state.snap : state.showGrid)),
    );
    if (state.mode === "grid") {
      state.rows.forEach((_, i) => buildRow(i));
    } else {
      for (const id of ids) free.insertBefore(blocks.get(id)!, sel);
      $$(".te-col", editor).forEach((c) => c.remove());
    }
    ids.forEach(applyBox);
    applyOrder();
    renderSel();
    renderGridPanel();
    status.textContent = statusText();
  };

  /* ───── FLIP: every visual change of block placement animates from where it was ───── */

  const offsetIn = (el: HTMLElement) => {
    let x = 0;
    let y = 0;
    let n: HTMLElement | null = el;
    while (n && n !== page) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    return { x, y };
  };
  const layoutBox = (id: Id) => {
    const el = blocks.get(id)!;
    if (state.mode === "canvas") return { x: 0, y: 0, w: state.boxes[id].w, h: state.boxes[id].h };
    const o = offsetIn(el);
    return { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight };
  };
  const visualBox = (id: Id): Box => {
    if (state.mode === "canvas") return { ...state.boxes[id] };
    return { ...layoutBox(id), r: 0 };
  };
  const tf = (t: Box, l: { x: number; y: number; w: number; h: number }) =>
    `translate(${t.x + t.w / 2 - l.x - l.w / 2}px, ${t.y + t.h / 2 - l.y - l.h / 2}px) rotate(${t.r}deg) scale(${t.w / l.w}, ${t.h / l.h})`;

  let flipping = 0;
  const flip = async (which: Id[], mutate: () => void, duration = 680) => {
    which.forEach((id) => blocks.get(id)!.getAnimations().forEach((a) => a.cancel()));
    const first = new Map(which.map((id) => [id, visualBox(id)]));
    editor.classList.add("is-flipping");
    flipping++;
    mutate();
    if (prefersReducedMotion) duration = 0;
    const anims = which.map((id, i) => {
      const last = visualBox(id);
      const lay = layoutBox(id);
      return blocks.get(id)!.animate([{ transform: tf(first.get(id)!, lay) }, { transform: tf(last, lay) }], {
        duration,
        delay: duration ? i * 35 : 0,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "backwards",
      });
    });
    await Promise.allSettled(anims.map((a) => a.finished));
    if (--flipping === 0) editor.classList.remove("is-flipping");
  };

  /* ───── Actions (shared by the visitor and the autoplay demo) ───── */

  const select = (id: Id | null) => {
    state.sel = id;
    if (id && state.mode === "grid") {
      state.row = state.rows.findIndex((r) => r.blocks.includes(id));
      renderGridPanel();
    }
    renderSel();
  };

  const setMode = (mode: Mode, record = true) => {
    if (mode === state.mode) return;
    if (record) pushUndo();
    void flip(ids, () => {
      state.mode = mode;
      placeDom();
    });
  };

  const setCols = (rowIdx: number, cols: number, record = true) => {
    const row = state.rows[rowIdx];
    if (row.cols === cols) return;
    if (record) pushUndo();
    void flip(row.blocks, () => {
      row.cols = cols;
      buildRow(rowIdx);
      renderGridPanel();
    }, 560);
  };

  const setWidth = (p: number) => {
    const row = state.rows[state.row];
    row.p = clamp(round(p), 25, 75);
    updateRowWidths(state.row);
    renderGridPanel();
  };

  const setRow = (i: number) => {
    state.row = i;
    renderGridPanel();
  };

  const setOpt = (opt: "snap" | "showGrid", on: boolean) => {
    state[opt] = on;
    placeDomOpts();
  };
  const placeDomOpts = () => {
    page.dataset.showGrid = String(state.showGrid);
    $$<HTMLButtonElement>("[data-opt]", editor).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.opt === "snap" ? state.snap : state.showGrid)),
    );
  };

  /** Snaps a proposed position to alignment guides first, then to the grid. */
  const snapMove = (id: Id, x: number, y: number, showGuides: boolean) => {
    const b = state.boxes[id];
    const xs = [PAGE_W / 2, 22, PAGE_W - 22];
    const ys = [PAGE_H / 2, 20, PAGE_H - 28];
    for (const o of ids) {
      if (o === id) continue;
      const ob = state.boxes[o];
      xs.push(ob.x, ob.x + ob.w / 2, ob.x + ob.w);
      ys.push(ob.y, ob.y + ob.h / 2, ob.y + ob.h);
    }
    let gx: number | null = null;
    let gy: number | null = null;
    let best = GUIDE_DIST;
    let snapX = 0;
    for (const ex of [0, b.w / 2, b.w]) {
      for (const c of xs) {
        const d = c - (x + ex);
        if (Math.abs(d) < best) {
          best = Math.abs(d);
          snapX = d;
          gx = c;
        }
      }
    }
    best = GUIDE_DIST;
    let snapY = 0;
    for (const ey of [0, b.h / 2, b.h]) {
      for (const c of ys) {
        const d = c - (y + ey);
        if (Math.abs(d) < best) {
          best = Math.abs(d);
          snapY = d;
          gy = c;
        }
      }
    }
    if (gx !== null) x += snapX;
    else if (state.snap) x = Math.round(x / STEP) * STEP;
    if (gy !== null) y += snapY;
    else if (state.snap) y = Math.round(y / STEP) * STEP;
    x = clamp(x, 0, PAGE_W - b.w);
    y = clamp(y, 0, PAGE_H - b.h);
    if (showGuides) showGuideLines(gx, gy);
    return { x, y };
  };
  const showGuideLines = (gx: number | null, gy: number | null) => {
    guideV.classList.toggle("is-on", gx !== null);
    guideH.classList.toggle("is-on", gy !== null);
    if (gx !== null) guideV.style.setProperty("--g", `${gx}px`);
    if (gy !== null) guideH.style.setProperty("--g", `${gy}px`);
  };
  const hideGuides = () => showGuideLines(null, null);

  const setDragging = (id: Id, on: boolean) => {
    blocks.get(id)!.classList.toggle("is-dragging", on);
    sel.classList.toggle("is-dragging", on);
  };

  const moveTo = (id: Id, x: number, y: number) => {
    const b = state.boxes[id];
    b.x = x;
    b.y = y;
    applyBox(id);
    renderSel();
  };

  const rotateBy = (id: Id, d: number) => {
    const b = state.boxes[id];
    b.r = clamp(Math.round((b.r + d) / 5) * 5, -45, 45);
    applyBox(id);
    renderSel();
  };

  const rotateTo = (id: Id, deg: number) => {
    state.boxes[id].r = deg;
    applyBox(id);
    renderSel();
  };

  const layer = (id: Id, dir: 1 | -1) => {
    const i = state.order.indexOf(id);
    const j = clamp(i + dir, 0, state.order.length - 1);
    if (i === j) return;
    state.order.splice(i, 1);
    state.order.splice(j, 0, id);
    applyOrder();
  };

  const restore = (snap: Snapshot, duration = 680) =>
    flip(ids, () => {
      state.mode = snap.mode;
      state.boxes = structuredClone(snap.boxes);
      state.order = snap.order.slice();
      state.rows = structuredClone(snap.rows);
      state.showGrid = snap.showGrid;
      state.snap = snap.snap;
      placeDom();
    }, duration);

  const undo = () => {
    const snap = history.pop();
    undoBtn.disabled = history.length === 0;
    if (snap) void restore(snap);
  };

  /* ───── Page scale: the A4 page is laid out at 420×594 and scaled to fit ───── */

  const fit = () => {
    scale = wrap.clientWidth / PAGE_W || 1;
    page.style.setProperty("--s", String(scale));
    $("[data-zoom]", editor)!.textContent = String(round(scale * 100));
  };
  new ResizeObserver(fit).observe(wrap);
  fit();

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = page.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  /* ───── Visitor input ───── */

  let ghost: Ghost | null = null;
  const takeOver = () => {
    if (ghost) {
      ghost.stop();
      ghost = null;
      hideGuides();
    }
  };
  editor.addEventListener("pointerdown", (e) => e.isTrusted && takeOver(), { capture: true });
  editor.addEventListener("keydown", (e) => e.isTrusted && takeOver(), { capture: true });
  editor.addEventListener("focusin", () => takeOver());

  type Drag = {
    kind: "move" | "resize" | "rotate";
    id: Id;
    start: { x: number; y: number };
    box: Box;
    moved: boolean;
    before: Snapshot;
  };
  let drag: Drag | null = null;

  const beginDrag = (e: PointerEvent, kind: Drag["kind"], id: Id, target: HTMLElement) => {
    drag = { kind, id, start: toPage(e), box: { ...state.boxes[id] }, moved: false, before: snapshot() };
    target.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toPage(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.moved) setDragging(drag.id, true);
    drag.moved = true;
    const b = state.boxes[drag.id];
    if (drag.kind === "move") {
      const s = snapMove(drag.id, drag.box.x + dx, drag.box.y + dy, true);
      moveTo(drag.id, s.x, s.y);
    } else if (drag.kind === "resize") {
      const [mw, mh] = MIN[drag.id];
      let w = drag.box.w + dx;
      let h = drag.box.h + dy;
      if (state.snap) {
        w = Math.round((b.x + w) / STEP) * STEP - b.x;
        h = Math.round((b.y + h) / STEP) * STEP - b.y;
      }
      b.w = clamp(w, mw, PAGE_W - b.x);
      b.h = clamp(h, mh, PAGE_H - b.y);
      applyBox(drag.id);
      renderSel();
    } else {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      const near = Math.round(deg / 15) * 15;
      if (Math.abs(deg - near) < 3) deg = near;
      b.r = clamp(deg, -180, 180);
      applyBox(drag.id);
      renderSel();
    }
  };
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      history.push(drag.before);
      undoBtn.disabled = false;
      setDragging(drag.id, false);
    }
    hideGuides();
    drag = null;
  };

  for (const [id, el] of blocks) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      select(id);
      if (state.mode !== "canvas" || e.pointerType === "touch") return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      beginDrag(e, "move", id, el);
    });
    el.addEventListener("pointermove", onDragMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("click", () => select(id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(id);
        return;
      }
      if (state.mode !== "canvas") return;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = arrows[e.key];
      if (dir) {
        e.preventDefault();
        if (state.sel !== id) select(id);
        pushUndo(true);
        const step = e.shiftKey ? STEP * 2 : state.snap ? STEP : 2;
        const b = state.boxes[id];
        moveTo(id, clamp(b.x + dir[0] * step, 0, PAGE_W - b.w), clamp(b.y + dir[1] * step, 0, PAGE_H - b.h));
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (state.sel !== id) select(id);
        pushUndo(true);
        rotateBy(id, e.shiftKey ? -5 : 5);
      } else if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        pushUndo();
        layer(id, e.key === "]" ? 1 : -1);
      }
    });
  }

  /* Selection handles: these carry touch-action:none, so they drag on touch too without hijacking page scroll. */
  $$("[data-handle]", sel).forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      if (!state.sel || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      beginDrag(e, h.dataset.handle as Drag["kind"], state.sel, h);
    });
    h.addEventListener("pointermove", onDragMove);
    h.addEventListener("pointerup", endDrag);
    h.addEventListener("pointercancel", endDrag);
  });

  /* Tap-to-move on touch, deselect on mouse. */
  let lastPointer = "mouse";
  page.addEventListener("pointerdown", (e) => (lastPointer = e.pointerType), { capture: true });
  page.addEventListener("click", (e) => {
    if (state.mode !== "canvas") return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-blk], .te-sel")) return;
    if (lastPointer === "touch" && state.sel) {
      const id = state.sel;
      const p = toPage(e);
      const b = state.boxes[id];
      pushUndo();
      const s = snapMove(id, p.x - b.w / 2, p.y - b.h / 2, false);
      tapRipple(p.x, p.y);
      moveTo(id, s.x, s.y);
    } else {
      select(null);
    }
  });
  const tapRipple = (x: number, y: number) => {
    const dot = document.createElement("span");
    dot.className = "te-tap";
    dot.style.setProperty("--tx", `${x}px`);
    dot.style.setProperty("--ty", `${y}px`);
    page.append(dot);
    window.setTimeout(() => dot.remove(), 700);
  };

  /* Toolbar, palette, inspector */
  $$("[data-mode-btn]", editor).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.modeBtn as Mode)));
  undoBtn.addEventListener("click", undo);
  editor.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && history.length) {
      e.preventDefault();
      undo();
    }
  });

  $$("[data-pick]", editor).forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.pick as Id;
      select(id);
      const el = blocks.get(id)!;
      el.classList.remove("is-ping");
      void el.offsetWidth;
      el.classList.add("is-ping");
      el.focus({ preventScroll: true });
    }),
  );

  $$<HTMLButtonElement>("[data-opt]", editor).forEach((b) =>
    b.addEventListener("click", () => {
      const opt = b.dataset.opt as "snap" | "showGrid";
      pushUndo();
      setOpt(opt, !state[opt]);
    }),
  );

  $$<HTMLButtonElement>("[data-act]", editor).forEach((b) =>
    b.addEventListener("click", () => {
      const id = state.sel;
      if (!id) return;
      pushUndo();
      const act = b.dataset.act;
      if (act === "rotl") rotateBy(id, -5);
      else if (act === "rotr") rotateBy(id, 5);
      else layer(id, act === "fwd" ? 1 : -1);
    }),
  );

  $$("[data-row-pick]", editor).forEach((b) => b.addEventListener("click", () => setRow(Number(b.dataset.rowPick))));
  $$("[data-row-tag]", editor).forEach((b) => b.addEventListener("click", () => setRow(Number(b.dataset.rowTag))));
  $$("[data-cols]", editor).forEach((b) => b.addEventListener("click", () => setCols(state.row, Number(b.dataset.cols))));

  let widthUndo = false;
  widthInput.addEventListener("input", () => {
    if (!widthUndo) pushUndo();
    widthUndo = true;
    setWidth(Number(widthInput.value));
  });
  widthInput.addEventListener("change", () => (widthUndo = false));

  coarse.addEventListener("change", () => (status.textContent = statusText()));

  placeDom();

  /* ───── Autoplay: a ghost cursor demonstrates the editor until the visitor takes over ───── */

  if (!prefersReducedMotion) {
    ghost = new Ghost(editor, {
      blocks,
      page,
      sel,
      get scale() {
        return scale;
      },
      state,
      select,
      snapMove,
      moveTo,
      setDragging,
      hideGuides,
      rotateTo,
      setMode: (m) => setMode(m, false),
      setOpt,
      setRow,
      setCols: (i, n) => setCols(i, n, false),
      setWidth,
      reset: () => {
        history.length = 0;
        undoBtn.disabled = true;
        state.sel = null;
        return restore(initial, 900);
      },
    });
    ghost.start();
  }
}

/* ───────── Ghost cursor ───────── */

interface GhostApi {
  blocks: Map<Id, HTMLElement>;
  page: HTMLElement;
  sel: HTMLElement;
  readonly scale: number;
  state: { mode: Mode; boxes: Record<Id, Box>; showGrid: boolean; sel: Id | null; row: number; rows: Row[] };
  select(id: Id | null): void;
  snapMove(id: Id, x: number, y: number, guides: boolean): { x: number; y: number };
  moveTo(id: Id, x: number, y: number): void;
  setDragging(id: Id, on: boolean): void;
  hideGuides(): void;
  rotateTo(id: Id, deg: number): void;
  setMode(m: Mode): void;
  setOpt(o: "snap" | "showGrid", on: boolean): void;
  setRow(i: number): void;
  setCols(i: number, n: number): void;
  setWidth(p: number): void;
  reset(): Promise<void>;
}

class Stop extends Error {}

class Ghost {
  private el: HTMLElement;
  private pos = { x: 0, y: 0 };
  private stopped = false;
  private visible = false;
  private wake: (() => void) | null = null;

  constructor(
    private editor: HTMLElement,
    private api: GhostApi,
  ) {
    this.el = $(".te-ghost", editor)!;
    new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        this.poke();
      },
      { threshold: 0.35 },
    ).observe(editor);
    document.addEventListener("visibilitychange", () => this.poke());
  }

  private poke() {
    if (this.wake && this.visible && !document.hidden) {
      const w = this.wake;
      this.wake = null;
      w();
    }
  }

  /** Waits until the editor is on screen (pauses the loop offscreen) and bails out once stopped. */
  private async gate() {
    if (this.stopped) throw new Stop();
    if (!this.visible || document.hidden) {
      this.el.classList.remove("is-on");
      await new Promise<void>((r) => (this.wake = r));
      if (this.stopped) throw new Stop();
      this.el.classList.add("is-on");
    }
  }
  private async pause(ms: number) {
    await this.gate();
    await sleep(ms);
    await this.gate();
  }

  stop() {
    this.stopped = true;
    this.el.classList.remove("is-on", "is-down");
    this.el.getAnimations().forEach((a) => a.cancel());
    this.wake?.();
  }

  private local(clientX: number, clientY: number) {
    const r = this.editor.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  private centerOf(el: Element, fx = 0.5, fy = 0.5) {
    const r = el.getBoundingClientRect();
    return this.local(r.left + r.width * fx, r.top + r.height * fy);
  }
  private pagePoint(px: number, py: number) {
    const r = this.api.page.getBoundingClientRect();
    return this.local(r.left + px * this.api.scale, r.top + py * this.api.scale);
  }

  private place(x: number, y: number) {
    this.pos = { x, y };
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }
  private async glide(to: { x: number; y: number }, ms = 700) {
    await this.gate();
    const from = { ...this.pos };
    const a = this.el.animate(
      [{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }],
      { duration: ms, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
    );
    this.place(to.x, to.y);
    await a.finished.catch(() => undefined);
    if (this.stopped) throw new Stop();
  }
  private async press(fn: () => void) {
    this.el.classList.add("is-down");
    await sleep(160);
    if (this.stopped) throw new Stop();
    fn();
    this.el.classList.remove("is-down");
    await sleep(120);
  }
  private async clickOn(el: Element | null, fn: () => void, ms = 650) {
    if (!el) return;
    await this.glide(this.centerOf(el), ms);
    await this.press(fn);
  }
  private visibleEl(sel: string) {
    return $$(sel, this.editor).find((el) => el.getClientRects().length > 0) ?? null;
  }

  /** Animates a frame-by-frame value change (used for drags and the width slider). */
  private async tween(ms: number, step: (t: number) => void) {
    await this.gate();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (this.stopped) return resolve();
        const t = Math.min(1, (now - start) / ms);
        step(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    if (this.stopped) throw new Stop();
  }

  private async dragBlock(id: Id, toX: number, toY: number) {
    const { api } = this;
    const b = api.state.boxes[id];
    const grab = { x: b.w * 0.5, y: b.h * 0.42 };
    await this.glide(this.pagePoint(b.x + grab.x, b.y + grab.y));
    this.el.classList.add("is-down");
    api.select(id);
    await sleep(180);
    api.setDragging(id, true);
    const from = { x: b.x, y: b.y };
    try {
      await this.tween(1300, (t) => {
        const s = api.snapMove(id, from.x + (toX - from.x) * t, from.y + (toY - from.y) * t, true);
        api.moveTo(id, s.x, s.y);
        const p = this.pagePoint(from.x + (toX - from.x) * t + grab.x, from.y + (toY - from.y) * t + grab.y);
        this.place(p.x, p.y);
      });
      await sleep(260);
    } finally {
      api.setDragging(id, false);
      api.hideGuides();
      this.el.classList.remove("is-down");
    }
  }

  private async rotateBlock(id: Id, deg: number) {
    const { api } = this;
    api.select(id);
    await sleep(80);
    const handle = $("[data-handle='rotate']", api.sel);
    await this.glide(this.centerOf(handle!), 600);
    this.el.classList.add("is-down");
    const start = api.state.boxes[id].r;
    api.setDragging(id, true);
    try {
      await this.tween(900, (t) => {
        api.rotateTo(id, start + (deg - start) * t);
        const p = this.centerOf(handle!);
        this.place(p.x, p.y);
      });
    } finally {
      api.setDragging(id, false);
      api.rotateTo(id, Math.round(api.state.boxes[id].r));
      this.el.classList.remove("is-down");
    }
  }

  private async script() {
    const { api, editor } = this;
    const r = editor.getBoundingClientRect();
    this.place(r.width * 0.62, r.height * 0.9);
    await this.pause(1300);
    this.el.classList.add("is-on");

    await this.dragBlock("price", 194, 298);
    await this.pause(500);
    await this.rotateBlock("price", 4);
    await this.pause(400);
    await this.clickOn(this.visibleEl("[data-opt='showGrid']"), () => api.setOpt("showGrid", true));
    await this.pause(300);
    await this.dragBlock("image", 196, 44);
    await this.pause(700);

    await this.clickOn(this.visibleEl("[data-mode-btn='grid']"), () => api.setMode("grid"), 800);
    await this.pause(1500);
    await this.clickOn(this.visibleEl("[data-row-tag='1']"), () => api.setRow(1));
    await this.pause(300);
    await this.clickOn(this.visibleEl("[data-cols='3']"), () => api.setCols(1, 3));
    await this.pause(1200);
    await this.clickOn(this.visibleEl("[data-cols='1']"), () => api.setCols(1, 1));
    await this.pause(1200);
    await this.clickOn(this.visibleEl("[data-cols='2']"), () => api.setCols(1, 2));
    await this.pause(500);

    const range = this.visibleEl("[data-width]");
    if (range) {
      const at = (p: number) => this.centerOf(range, 0.04 + ((p - 25) / 50) * 0.92, 0.5);
      await this.glide(at(api.state.rows[1].p), 600);
      this.el.classList.add("is-down");
      const p0 = api.state.rows[1].p;
      await this.tween(900, (t) => {
        const p = p0 + (38 - p0) * t;
        api.setWidth(p);
        const q = at(p);
        this.place(q.x, q.y);
      });
      await this.tween(700, (t) => {
        const p = 38 + (64 - 38) * t;
        api.setWidth(p);
        const q = at(p);
        this.place(q.x, q.y);
      });
      this.el.classList.remove("is-down");
    }
    await this.pause(900);

    await this.clickOn(this.visibleEl("[data-mode-btn='canvas']"), () => api.setMode("canvas"), 800);
    await this.pause(2000);
    await this.glide({ x: r.width * 0.62, y: r.height * 0.9 }, 900);
    await api.reset();
    await this.pause(2200);
  }

  async start() {
    try {
      for (;;) await this.script();
    } catch (err) {
      if (!(err instanceof Stop)) throw err;
    }
  }
}

/* ───────── Same blocks, both modes ───────── */

function initBlockTwin() {
  const tiles = $$<HTMLButtonElement>(".te-tile");
  const twins = $$("[data-twin]");
  if (!tiles.length || !twins.length) return;
  let index = tiles.findIndex((t) => t.getAttribute("aria-pressed") === "true");
  let auto = !prefersReducedMotion;
  let visible = false;

  const show = (i: number) => {
    index = i;
    const tile = tiles[i];
    tiles.forEach((t) => t.setAttribute("aria-pressed", String(t === tile)));
    const icon = tile.querySelector("use")?.getAttribute("href") ?? "";
    const name = tile.textContent?.trim() ?? "";
    for (const twin of twins) {
      twin.querySelector("use")?.setAttribute("href", icon);
      const label = twin.querySelector("[data-twin-name]");
      if (label) label.textContent = name;
      twin.classList.remove("is-in");
      void twin.offsetWidth;
      twin.classList.add("is-in");
    }
  };
  tiles.forEach((t, i) =>
    t.addEventListener("click", () => {
      auto = false;
      show(i);
    }),
  );

  const section = $(".te-blocks__body");
  if (section && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.25 }).observe(section);
  }
  window.setInterval(() => {
    if (auto && visible && !document.hidden) show((index + 1) % tiles.length);
  }, 2200);
}

initEditor();
initBlockTwin();
liveWhileVisible($$(".te-mini, .te-close__switch, .te-sg__ink"));
