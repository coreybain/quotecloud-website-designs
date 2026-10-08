import "../../src/shared/site.ts";
import "./style.css";
import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";
import {
  applyNib,
  createInk,
  presetStrokes,
  strokeOutline,
  strokesBox,
  upgradeStaticInk,
  type InkHandle,
  type Pt,
  type Stroke,
} from "./ink.ts";

const RM = prefersReducedMotion;
const NS = "http://www.w3.org/2000/svg";
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function req<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`esign v3: missing ${selector}`);
  return el;
}

const icon = (id: string, size = 16) =>
  `<svg class="sy-ico" width="${size}" height="${size}" aria-hidden="true"><use href="#${id}" /></svg>`;

/* ───────── Static signatures: upgrade fallback strokes to weighted ink ───────── */

const inks = new Map<SVGSVGElement, InkHandle>();
document.querySelectorAll<SVGSVGElement>("svg[data-ink]").forEach((svg) => {
  const handle = upgradeStaticInk(svg);
  if (!handle) return;
  inks.set(svg, handle);
  if (!RM) handle.hide();
});

function write(svg: SVGSVGElement | null, duration = 1400, delay = 0): Promise<void> {
  const handle = svg ? inks.get(svg) : undefined;
  if (!handle) return Promise.resolve();
  if (RM) {
    handle.finish();
    return Promise.resolve();
  }
  handle.hide();
  return handle.reveal(duration, delay);
}

const closeSig = document.querySelector<SVGSVGElement>(".sy-close__sig");
if (closeSig) onceVisible(closeSig, () => void write(closeSig, 1900, 200), 0.6);

/* ───────── Toggle sections ───────── */

type Side = "a" | "b";
type ToggleOptions = {
  stage: string;
  /** State to start in when JS runs (the no-JS markup holds the "best" state). */
  start: Side;
  /** Auto-advance to this state once, shortly after the stage is seen. */
  advanceTo: Side;
  advanceDelay: number;
  onVisible?: () => void;
  onState?: (state: Side, user: boolean) => void;
};

function initToggle(section: HTMLElement, opts: ToggleOptions) {
  const buttons = [...section.querySelectorAll<HTMLButtonElement>("[data-set]")];
  let touched = false;
  const set = (state: Side, user: boolean) => {
    if (section.dataset.state === state) return;
    section.dataset.state = state;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === state)));
    opts.onState?.(state, user);
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      touched = true;
      set(b.dataset.set as Side, true);
    }),
  );
  if (!RM) {
    section.dataset.state = opts.start;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === opts.start)));
  }
  const stage = section.querySelector(opts.stage) ?? section;
  onceVisible(
    stage,
    () => {
      if (touched) return;
      opts.onVisible?.();
      if (RM) return;
      window.setTimeout(() => {
        if (!touched) set(opts.advanceTo, false);
      }, opts.advanceDelay);
    },
    0.45,
  );
}

const one = document.querySelector<HTMLElement>(".sy-one");
if (one) {
  const sig = one.querySelector<SVGSVGElement>(".sy-qcdoc svg[data-ink]");
  initToggle(one, {
    stage: ".sy-one__stage",
    start: "a",
    advanceTo: "b",
    advanceDelay: 1500,
    onVisible: () => RM && write(sig),
    onState: (state) => state === "b" && void write(sig, 1300, 900),
  });
}

const place = document.querySelector<HTMLElement>(".sy-place");
if (place) {
  const qcSig = place.querySelector<SVGSVGElement>(".sy-paper--qc svg[data-ink]");
  const pdfSig = place.querySelector<SVGSVGElement>(".sy-paper--pdf svg[data-ink]");
  initToggle(place, {
    stage: ".sy-place__stage",
    start: "a",
    advanceTo: "b",
    advanceDelay: 3200,
    onVisible: () => void write(qcSig, 1300, 700),
    onState: (state) => (state === "a" ? void write(qcSig, 1200, 700) : void write(pdfSig, 1000, 1150)),
  });
}

const multi = document.querySelector<HTMLElement>(".sy-multi");
if (multi) {
  const sigOf = (i: number) => multi.querySelector<SVGSVGElement>(`[data-signer="${i}"] svg[data-ink]`);
  const people = [1, 2].map((i) => multi.querySelector<HTMLElement>(`[data-person="${i}"]`));
  const label = { waiting: "Waiting", signing: "Signing…", signed: "Signed" } as const;
  const setStatus = (p: HTMLElement | null, st: keyof typeof label) => {
    if (!p) return;
    p.dataset.st = st;
    const el = p.querySelector(".sy-person__st");
    if (el) el.textContent = label[st];
  };
  let run = 0;
  const sequence = async () => {
    const id = ++run;
    if (RM) {
      people.forEach((p) => setStatus(p, "signed"));
      [1, 2].forEach((i) => void write(sigOf(i)));
      return;
    }
    people.forEach((p) => setStatus(p, "waiting"));
    [1, 2].forEach((i) => {
      const s = sigOf(i);
      if (s) inks.get(s)?.hide();
    });
    await sleep(800);
    for (let k = 0; k < 2; k++) {
      if (id !== run) return;
      setStatus(people[k], "signing");
      await sleep(550);
      if (id !== run) return;
      await write(sigOf(k + 1), 1250);
      if (id !== run) return;
      setStatus(people[k], "signed");
      await sleep(250);
    }
  };
  initToggle(multi, {
    stage: ".sy-multi__stage",
    start: "a",
    advanceTo: "b",
    advanceDelay: 2300,
    onVisible: () => void write(sigOf(0), 1300, 300),
    onState: (state) => {
      if (state === "b") void sequence();
      else run++;
    },
  });
}

/* ───────── Hero: the playable signing demo ───────── */

type FType = "sig" | "init" | "date" | "text";
type Adopted = { kind: "ink"; strokes: Stroke[] } | { kind: "type"; text: string };

const LABEL: Record<FType, string> = { sig: "Signature", init: "Initials", date: "Date", text: "Text" };
const ICON: Record<FType, string> = { sig: "sy-i-sign", init: "sy-i-init", date: "sy-i-date", text: "sy-i-text" };
const TEXT_VALUE: Record<string, string> = { t1: "NW-0612", t2: "Jordan Lee" };

const demoEl = document.querySelector<HTMLElement>("[data-demo]");
if (demoEl) initDemo(demoEl);

function initDemo(demo: HTMLElement) {
  const body = req("[data-demo-body]", demo);
  const page = req("[data-page]", demo);
  const canvas = req("[data-canvas]", demo);
  const guides = [...demo.querySelectorAll<HTMLElement>(".sy-guides i")];
  const chips = [...demo.querySelectorAll<HTMLButtonElement>("[data-chip]")];
  const slots = [...page.querySelectorAll<HTMLElement>("[data-slot]")];
  const sendBtn = req<HTMLButtonElement>("[data-send]", demo);
  const finishBtn = req<HTMLButtonElement>("[data-finish]", demo);
  const prepNote = req("[data-prep-note]", demo);
  const signNote = req("[data-sign-note]", demo);
  const signCount = req("[data-sign-count]", demo);
  const signList = req("[data-sign-list]", demo);
  const sub = req("[data-demo-sub]", demo);
  const otp = req("[data-otp]", demo);
  const digits = [...otp.querySelectorAll<HTMLElement>(".sy-otp__digits i")];
  const pad = req("[data-pad]", demo);
  const done = req("[data-done]", demo);
  const doneCard = req("[data-done-card]", demo);
  const doneTime = req("[data-done-time]", demo);
  const replayBtn = req<HTMLButtonElement>("[data-replay]", demo);
  const ghost = req("[data-ghost]", demo);
  const live = req("[data-live]", demo);
  const steps = [...demo.querySelectorAll<HTMLElement>("[data-step]")];
  const sides = [...demo.querySelectorAll<HTMLElement>("[data-side]")];

  let view: "prepare" | "sign" | "done" = "prepare";
  const placed = new Map<string, FType>();
  const signed = new Set<string>();
  let armed: FType | null = null;
  let adopted: Adopted | null = null;
  let busy = false;
  let epoch = 0;
  let auto = false; // true while the ghost demo is driving
  let suppressClick = false;

  const typeOf = (slot: HTMLElement) => slot.dataset.type as FType;
  const idOf = (slot: HTMLElement) => slot.dataset.slot ?? "";
  const nameOf = (slot: HTMLElement) => slot.dataset.name ?? "";
  const slotById = (id: string) => req(`[data-slot="${id}"]`, page);
  const chipOf = (t: FType) => req<HTMLButtonElement>(`[data-chip="${t}"]`, demo);
  const freeSlots = (t: FType) => slots.filter((s) => typeOf(s) === t && !placed.has(idOf(s)));
  const say = (msg: string) => {
    if (!auto) live.textContent = msg;
  };
  const focus = (el: HTMLElement | null | undefined) => {
    if (!auto && el) el.focus({ preventScroll: true });
  };
  const wipe = (el: Element, duration = 520, delay = 0) => {
    if (RM) return;
    el.animate([{ clipPath: "inset(-20% 100% -20% 0)" }, { clipPath: "inset(-20% 0 -20% 0)" }], {
      duration,
      delay,
      easing: "cubic-bezier(.45,.05,.3,1)",
      fill: "both",
    });
  };

  chips.forEach((c) => c.setAttribute("aria-pressed", "false"));

  /* ── Slot hit targets (tap/keyboard placement) ── */
  const hits = new Map<HTMLElement, HTMLButtonElement>();
  slots.forEach((slot) => {
    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "sy-slot__hit";
    hit.addEventListener("click", () => {
      if (!armed || typeOf(slot) !== armed || placed.has(idOf(slot))) return;
      const t = armed;
      disarm();
      place(slot);
      focus(chipOf(t));
    });
    hit.addEventListener("focus", () => {
      slot.classList.add("is-hover");
      showGuides(slot);
    });
    hit.addEventListener("blur", () => {
      slot.classList.remove("is-hover");
      showGuides(null);
    });
    slot.append(hit);
    hits.set(slot, hit);
  });

  page.addEventListener("keydown", (e) => {
    const hit = (e.target as Element).closest<HTMLButtonElement>(".sy-slot__hit");
    if (!hit || !armed) return;
    const list = slots.filter((s) => s.classList.contains("is-target")).map((s) => hits.get(s));
    const i = list.indexOf(hit);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % list.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
    if (next < 0) return;
    e.preventDefault();
    list[next]?.focus();
  });

  function showGuides(slot: HTMLElement | null) {
    if (!slot) {
      guides.forEach((g) => (g.style.opacity = "0"));
      return;
    }
    const c = canvas.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    const pos: Record<string, string> = {
      t: `translateY(${r.top - c.top}px)`,
      b: `translateY(${r.bottom - c.top}px)`,
      l: `translateX(${r.left - c.left}px)`,
      r: `translateX(${r.right - c.left}px)`,
    };
    guides.forEach((g) => {
      g.style.transform = pos[g.dataset.g ?? "t"] ?? "";
      g.style.opacity = "0.75";
    });
  }

  function nudge(chip: HTMLElement) {
    chip.classList.remove("is-nudge");
    void chip.offsetWidth;
    chip.classList.add("is-nudge");
  }

  function arm(t: FType, keyboard: boolean) {
    const free = freeSlots(t);
    if (!free.length) {
      nudge(chipOf(t));
      say(`All ${LABEL[t].toLowerCase()} spots are filled. Remove one to move it.`);
      return;
    }
    disarm();
    armed = t;
    chipOf(t).setAttribute("aria-pressed", "true");
    free.forEach((s) => {
      s.classList.add("is-target");
      hits.get(s)?.setAttribute("aria-label", `Place ${LABEL[t].toLowerCase()} field on ${nameOf(s)}`);
    });
    say(
      keyboard
        ? `${LABEL[t]} field picked up. Use the arrow keys to choose a spot, Enter to place it, Escape to cancel.`
        : `${LABEL[t]} field picked up. Choose a highlighted spot on the contract.`,
    );
    if (keyboard) {
      const first = hits.get(free[0]);
      // visibility flips with the class, so focus on the next frame
      requestAnimationFrame(() => focus(first));
    }
  }

  function disarm() {
    if (armed) chipOf(armed).setAttribute("aria-pressed", "false");
    armed = null;
    slots.forEach((s) => s.classList.remove("is-target", "is-hover"));
    showGuides(null);
  }

  /* ── Placing and removing fields (sender view) ── */
  function place(slot: HTMLElement, from?: DOMRect) {
    const t = typeOf(slot);
    const id = idOf(slot);
    if (placed.has(id)) return;
    placed.set(id, t);
    const field = document.createElement("span");
    field.className = "sy-field";
    field.dataset.field = id;
    const label = t === "text" ? cap(nameOf(slot)) : LABEL[t];
    field.innerHTML = `${icon(ICON[t], 14)}<span>${label}</span><button type="button" class="sy-field__x" aria-label="Remove ${LABEL[t].toLowerCase()} field from ${nameOf(slot)}">${icon("sy-i-x", 12)}</button>`;
    const x = field.querySelector("button");
    x?.addEventListener("click", (e) => {
      e.stopPropagation();
      unplace(slot);
      focus(chipOf(t));
    });
    x?.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        unplace(slot);
        focus(chipOf(t));
      }
    });
    slot.append(field);
    if (!RM) {
      if (from) {
        const to = field.getBoundingClientRect();
        const sx = from.width / Math.max(1, to.width);
        const sy = from.height / Math.max(1, to.height);
        field.style.transformOrigin = "0 0";
        field.animate(
          [
            { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, opacity: 0.85 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 460, easing: "cubic-bezier(.2,1.25,.4,1)" },
        );
      }
      field.classList.add("is-snap");
    }
    syncPrep();
    say(`${LABEL[t]} field placed on ${nameOf(slot)}.`);
  }

  function unplace(slot: HTMLElement) {
    slot.querySelector(".sy-field")?.remove();
    placed.delete(idOf(slot));
    syncPrep();
    say(`Removed the field from ${nameOf(slot)}.`);
  }

  let wasReady = false;
  function syncPrep() {
    const n = placed.size;
    const ready = [...placed.values()].includes("sig");
    sendBtn.disabled = !ready;
    if (ready && !wasReady && !RM) {
      sendBtn.classList.remove("is-ready");
      void sendBtn.offsetWidth;
      sendBtn.classList.add("is-ready");
    }
    wasReady = ready;
    const fields = `${n} field${n === 1 ? "" : "s"} placed`;
    prepNote.textContent = !n ? "Add a signature field to send" : ready ? `${fields} · ready to send` : `${fields} · add a signature`;
    chips.forEach((c) => c.classList.toggle("is-full", !freeSlots(c.dataset.chip as FType).length));
  }

  /* ── Chips: click/tap/Enter arms; pointer drag places directly ── */
  chips.forEach((chip) => {
    const t = chip.dataset.chip as FType;
    chip.addEventListener("click", (e) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (view !== "prepare") return;
      if (armed === t) {
        disarm();
        say("Cancelled.");
        return;
      }
      arm(t, e.detail === 0);
    });
    chip.addEventListener("pointerdown", (e) => startDrag(e, chip, t));
  });

  function makeDragEl(t: FType) {
    const el = document.createElement("div");
    el.className = "sy-drag";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `${icon(ICON[t], 16)}${LABEL[t]}`;
    return el;
  }

  function nearestSlot(t: FType, x: number, y: number) {
    let best: HTMLElement | null = null;
    let bestD = 96;
    for (const s of freeSlots(t)) {
      const r = s.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  function startDrag(e: PointerEvent, chip: HTMLButtonElement, t: FType) {
    if (e.button !== 0 || view !== "prepare") return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let el: HTMLElement | null = null;
    let hover: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!el) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!freeSlots(t).length) {
          nudge(chip);
          end();
          return;
        }
        disarm();
        el = makeDragEl(t);
        document.body.append(el);
        chip.classList.add("is-pressed");
        freeSlots(t).forEach((s) => s.classList.add("is-target"));
      }
      ev.preventDefault();
      el.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 20}px) rotate(-2deg)`;
      const next = nearestSlot(t, ev.clientX, ev.clientY);
      if (next !== hover) {
        hover?.classList.remove("is-hover");
        hover = next;
        hover?.classList.add("is-hover");
        showGuides(hover);
      }
    };
    const up = () => {
      end();
      if (!el) return;
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 0);
      chip.classList.remove("is-pressed");
      slots.forEach((s) => s.classList.remove("is-target", "is-hover"));
      showGuides(null);
      const dragged = el;
      if (hover) {
        place(hover, dragged.getBoundingClientRect());
        dragged.remove();
      } else {
        const from = dragged.getBoundingClientRect();
        const to = chip.getBoundingClientRect();
        const back = dragged.animate(
          [
            { transform: dragged.style.transform, opacity: 1 },
            { transform: `translate(${to.left + 8}px, ${to.top + 6}px) scale(.8)`, opacity: 0 },
          ],
          { duration: RM ? 0 : 320, easing: "cubic-bezier(.4,0,.2,1)" },
        );
        void from;
        back.finished.finally(() => dragged.remove());
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  demo.addEventListener("click", (e) => {
    if (!armed) return;
    const target = e.target as Element;
    if (target.closest("[data-chip], .sy-slot__hit")) return;
    disarm();
  });

  /* ── Views ── */
  function setView(v: typeof view) {
    view = v;
    demo.dataset.view = v;
    sides.forEach((s) => (s.hidden = s.dataset.side === "prepare" ? v !== "prepare" : v === "prepare"));
    const order = ["prepare", "sign", "done"];
    steps.forEach((li) => {
      const i = order.indexOf(li.dataset.step ?? "");
      const now = order.indexOf(v);
      if (i === now) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
      li.classList.toggle("is-past", i < now);
    });
    sub.textContent =
      v === "prepare" ? "Acme Solutions · Draft" : v === "sign" ? "Signing as Jordan Lee" : "Completed · certificate attached";
    if (v === "sign") buildSign();
  }

  async function flip(mid: () => void) {
    if (RM) {
      mid();
      return;
    }
    const out = body.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }], {
      duration: 300,
      easing: "cubic-bezier(.5,0,.75,0)",
      fill: "forwards",
    });
    try {
      await out.finished;
    } catch {
      return;
    }
    mid();
    const back = body.animate([{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)" }], {
      duration: 460,
      easing: "cubic-bezier(.2,.8,.3,1)",
    });
    out.cancel();
    await back.finished.catch(() => undefined);
  }

  sendBtn.addEventListener("click", () => void send());
  async function send() {
    if (busy || view !== "prepare" || sendBtn.disabled) return;
    busy = true;
    const ep = epoch;
    disarm();
    say("Sent. Switching to the signer’s view.");
    await flip(() => setView("sign"));
    if (ep !== epoch) return;
    await runOtp(ep);
    if (ep !== epoch) return;
    busy = false;
    focus(page.querySelector<HTMLElement>(".sy-sfield.is-next"));
  }

  async function runOtp(ep: number) {
    otp.hidden = false;
    otp.classList.remove("is-ok");
    digits.forEach((d) => {
      d.textContent = "";
      d.classList.remove("is-in");
    });
    say("One-time passcode sent to Jordan. Verifying.");
    await sleep(RM ? 300 : 700);
    const code = "482913";
    for (let i = 0; i < digits.length; i++) {
      if (ep !== epoch) return;
      digits[i].textContent = code[i];
      digits[i].classList.add("is-in");
      await sleep(RM ? 0 : 130);
    }
    if (ep !== epoch) return;
    otp.classList.add("is-ok");
    await sleep(RM ? 500 : 800);
    if (ep !== epoch) return;
    otp.hidden = true;
    say("Verified. Complete each highlighted field.");
  }

  /* ── Signer view ── */
  const SIGN_LABEL: Record<FType, string> = { sig: "Sign", init: "Initial", date: "Date", text: "Fill" };

  function buildSign() {
    signList.replaceChildren();
    signed.clear();
    slots
      .filter((s) => placed.has(idOf(s)))
      .forEach((slot) => {
        slot.querySelector(".sy-field")?.remove();
        const t = typeOf(slot);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sy-sfield";
        b.dataset.sfield = idOf(slot);
        b.innerHTML = `${icon(ICON[t], 14)}<span>${t === "text" ? cap(nameOf(slot)) : SIGN_LABEL[t]}</span>`;
        b.setAttribute("aria-label", `${t === "sig" ? "Sign" : t === "init" ? "Initial" : "Fill in"} ${nameOf(slot)}`);
        b.addEventListener("click", () => fill(slot));
        slot.append(b);
        const li = document.createElement("li");
        li.dataset.for = idOf(slot);
        li.textContent = t === "text" ? cap(nameOf(slot)) : LABEL[t];
        signList.append(li);
      });
    syncSign();
  }

  function syncSign() {
    const total = signList.children.length;
    const n = signed.size;
    signCount.textContent = `${n} of ${total} done`;
    [...signList.children].forEach((li) => li.classList.toggle("is-done", signed.has((li as HTMLElement).dataset.for ?? "")));
    const pending = [...page.querySelectorAll<HTMLElement>("button.sy-sfield")];
    pending.forEach((b, i) => b.classList.toggle("is-next", i === 0));
    finishBtn.disabled = pending.length > 0;
    if (!pending.length && total) {
      signNote.textContent = "All fields complete";
      if (!RM) {
        finishBtn.classList.remove("is-ready");
        void finishBtn.offsetWidth;
        finishBtn.classList.add("is-ready");
      }
    } else {
      signNote.textContent = `${pending.length} field${pending.length === 1 ? "" : "s"} left · select the highlighted one`;
    }
  }

  function initials() {
    if (adopted?.kind === "type") {
      const parts = adopted.text.split(/\s+/).filter(Boolean);
      const s = parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase();
      if (s) return s;
    }
    return "JL";
  }

  function fill(slot: HTMLElement) {
    if (view !== "sign" || busy || signed.has(idOf(slot))) return;
    if (typeOf(slot) === "sig" && !adopted) {
      openPad(slot);
      return;
    }
    complete(slot);
  }

  function inkSvg(strokes: Stroke[]) {
    const svg = document.createElementNS(NS, "svg");
    const box = strokesBox(strokes, 6);
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "sy-sfield__ink");
    svg.setAttribute("aria-hidden", "true");
    const ink = createInk(strokes);
    svg.append(ink.g);
    return { svg, ink };
  }

  function complete(slot: HTMLElement) {
    const t = typeOf(slot);
    const id = idOf(slot);
    const btn = slot.querySelector<HTMLElement>("button.sy-sfield");
    if (!btn) return;
    const hadFocus = document.activeElement === btn || pad.contains(document.activeElement);
    const out = document.createElement("span");
    out.className = "sy-sfield is-done";
    let spoken = "";
    if (t === "sig" && adopted?.kind === "ink") {
      const { svg, ink } = inkSvg(adopted.strokes);
      out.append(svg);
      if (RM) ink.finish();
      else {
        ink.hide();
        void ink.reveal(1100, 80);
      }
      spoken = "Signed";
    } else {
      const span = document.createElement("span");
      if (t === "sig" || t === "init") {
        const text = t === "sig" && adopted?.kind === "type" ? adopted.text : initials();
        span.className = "sy-sfield__script";
        span.textContent = text;
        if (t === "sig") {
          const base = slot.classList.contains("sy-slot--sm") ? 2 : 2.6;
          span.style.fontSize = `${base * Math.min(1, 11 / Math.max(11, text.length))}em`;
        }
        spoken = t === "sig" ? "Signed" : "Initialled";
      } else if (t === "date") {
        span.className = "sy-sfield__val";
        span.textContent = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        spoken = `Dated ${span.textContent}`;
      } else {
        span.className = "sy-sfield__val";
        span.textContent = id === "t2" && adopted?.kind === "type" ? adopted.text : (TEXT_VALUE[id] ?? "Jordan Lee");
        spoken = `Filled in ${span.textContent}`;
      }
      out.append(span);
      wipe(span, t === "sig" ? 900 : 520);
    }
    btn.replaceWith(out);
    signed.add(id);
    syncSign();
    say(`${spoken}: ${nameOf(slot)}.`);
    if (hadFocus) focus(page.querySelector<HTMLElement>(".sy-sfield.is-next") ?? finishBtn);
  }

  finishBtn.addEventListener("click", () => {
    if (busy || finishBtn.disabled || view !== "sign") return;
    setView("done");
    doneTime.textContent = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
    done.hidden = false;
    say("Agreement completed. Certificate of authenticity attached.");
    focus(doneCard);
  });

  replayBtn.addEventListener("click", () => {
    reset();
    focus(chips[0]);
    say("Demo reset. Place a field to start again.");
  });

  /* ── Signature pad ── */
  const padSvg = req<SVGSVGElement>("[data-draw]", pad);
  const drawG = req<SVGGElement>("[data-draw-ink]", pad);
  const hint = req("[data-draw-hint]", pad);
  const clearBtn = req<HTMLButtonElement>("[data-draw-clear]", pad);
  const adoptBtn = req<HTMLButtonElement>("[data-adopt]", pad);
  const tabs = [...pad.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const panels = [...pad.querySelectorAll<HTMLElement>("[data-panel]")];
  const typeInput = req<HTMLInputElement>("[data-type-input]", pad);
  const typePreview = req<SVGTextElement>("[data-type-preview]", pad);
  const uploadBtn = req<HTMLButtonElement>("[data-upload]", pad);
  const uploadFile = req("[data-upload-file]", pad);
  const uploadBar = req(".sy-upload__bar i", pad);
  const uploadImg = req<SVGSVGElement>("[data-upload-img]", pad);

  type Tab = "draw" | "type" | "upload";
  let tab: Tab = "draw";
  let padSlot: HTMLElement | null = null;
  let strokes: Stroke[] = [];
  let livePts: Pt[] | null = null;
  let livePath: SVGPathElement | null = null;
  let lastT = 0;
  let uploaded = false;
  let uploadRun = 0;
  let frame = 0;

  const NIB = { min: 1.15, max: 3.9, blend: 0.5 };

  function openPad(slot: HTMLElement) {
    padSlot = slot;
    pad.hidden = false;
    syncAdopt();
    say("Create your signature: draw it, type it, or upload an image.");
    focus(tabs.find((b) => b.dataset.tab === tab));
  }

  function closePad(restore: boolean) {
    const slot = padSlot;
    pad.hidden = true;
    padSlot = null;
    if (restore && slot) focus(slot.querySelector<HTMLElement>("button.sy-sfield"));
  }

  function setTab(t: Tab, moveFocus = false) {
    tab = t;
    tabs.forEach((b) => {
      const on = b.dataset.tab === t;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && moveFocus) b.focus();
    });
    panels.forEach((p) => (p.hidden = p.dataset.panel !== t));
    if (t === "type") wipe(typePreview, 700);
    syncAdopt();
  }

  tabs.forEach((b, i) => {
    b.addEventListener("click", () => setTab(b.dataset.tab as Tab));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      setTab(next.dataset.tab as Tab, true);
    });
  });

  function syncAdopt() {
    const ok =
      tab === "draw"
        ? strokes.reduce((n, s) => n + s.length, 0) >= 8
        : tab === "type"
          ? typeInput.value.trim().length > 0
          : uploaded;
    adoptBtn.disabled = !ok;
  }

  /* drawing */
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = padSvg.getBoundingClientRect();
    const k = 400 / Math.max(1, r.width);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  function beginStroke() {
    livePts = [];
    livePath = document.createElementNS(NS, "path");
    drawG.append(livePath);
    hint.classList.add("is-gone");
  }

  function addPoint(p: { x: number; y: number }, t: number) {
    const pts = livePts;
    if (!pts) return;
    const prev = pts[pts.length - 1];
    if (!prev) {
      pts.push({ x: p.x, y: p.y, w: 3 });
      lastT = t;
      return;
    }
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (d < 0.9) return;
    const v = d / Math.max(1, t - lastT);
    const target = clamp(4.4 - v * 1.5, 1.3, 4.4);
    // light positional smoothing keeps hand-jitter out without visible lag
    pts.push({ x: prev.x + (p.x - prev.x) * 0.7, y: prev.y + (p.y - prev.y) * 0.7, w: prev.w * 0.72 + target * 0.28 });
    lastT = t;
  }

  function renderLive() {
    frame = 0;
    if (livePts && livePath) livePath.setAttribute("d", strokeOutline(applyNib(livePts, NIB)));
  }

  function endStroke() {
    if (livePts && livePts.length) {
      strokes.push(applyNib(livePts, NIB));
      renderLive();
    }
    livePts = null;
    livePath = null;
    syncAdopt();
  }

  function clearPad() {
    strokes = [];
    livePts = null;
    livePath = null;
    drawG.replaceChildren();
    hint.classList.remove("is-gone");
    syncAdopt();
  }

  padSvg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    padSvg.setPointerCapture(e.pointerId);
    beginStroke();
    addPoint(toLocal(e), e.timeStamp);
    renderLive();
  });
  padSvg.addEventListener("pointermove", (e) => {
    if (!livePts) return;
    const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of list.length ? list : [e]) addPoint(toLocal(ev), ev.timeStamp);
    if (!frame) frame = requestAnimationFrame(renderLive);
  });
  const stopDraw = () => {
    if (!livePts) return;
    if (frame) cancelAnimationFrame(frame);
    endStroke();
  };
  padSvg.addEventListener("pointerup", stopDraw);
  padSvg.addEventListener("pointercancel", stopDraw);
  clearBtn.addEventListener("click", clearPad);

  /* typing */
  function updatePreview() {
    const v = typeInput.value.trim();
    typePreview.textContent = v || " ";
    typePreview.style.fontSize = `${Math.round(66 * Math.min(1, 12 / Math.max(12, v.length)))}px`;
    syncAdopt();
  }
  typeInput.addEventListener("input", updatePreview);
  typeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !adoptBtn.disabled) adoptBtn.click();
  });

  /* upload (simulated) */
  function resetUpload() {
    uploadRun++;
    uploaded = false;
    uploadBtn.hidden = false;
    uploadFile.hidden = true;
    uploadBar.getAnimations().forEach((a) => a.cancel());
    uploadImg.replaceChildren();
  }
  uploadBtn.addEventListener("click", async () => {
    const id = ++uploadRun;
    uploadBtn.hidden = true;
    uploadFile.hidden = false;
    const ink = createInk(presetStrokes("jordan"));
    uploadImg.setAttribute("viewBox", "0 0 400 150");
    uploadImg.replaceChildren(ink.g);
    ink.finish();
    uploadImg.style.opacity = "0";
    const bar = uploadBar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: RM ? 0 : 900,
      easing: "cubic-bezier(.3,.6,.3,1)",
      fill: "forwards",
    });
    await bar.finished.catch(() => undefined);
    if (id !== uploadRun) return;
    uploadImg.style.opacity = "1";
    if (!RM) uploadImg.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], 380);
    uploaded = true;
    syncAdopt();
    say("signature.png uploaded.");
  });

  adoptBtn.addEventListener("click", () => {
    if (adoptBtn.disabled) return;
    if (tab === "draw") adopted = { kind: "ink", strokes: strokes.slice() };
    else if (tab === "type") adopted = { kind: "type", text: typeInput.value.trim() };
    else adopted = { kind: "ink", strokes: presetStrokes("jordan") };
    const slot = padSlot;
    closePad(false);
    if (slot) complete(slot);
  });

  pad.querySelectorAll<HTMLButtonElement>("[data-pad-cancel]").forEach((b) => b.addEventListener("click", () => closePad(true)));

  pad.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusables = [...pad.querySelectorAll<HTMLElement>("button, input")].filter(
      (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.offsetParent !== null,
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  demo.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!pad.hidden) {
      e.stopPropagation();
      closePad(true);
    } else if (armed) {
      const t = armed;
      disarm();
      say("Cancelled.");
      focus(chipOf(t));
    }
  });

  /* ── Reset ── */
  function reset() {
    epoch++;
    busy = false;
    disarm();
    closePad(false);
    body.getAnimations().forEach((a) => a.cancel());
    slots.forEach((s) => s.querySelectorAll(".sy-field, .sy-sfield").forEach((n) => n.remove()));
    placed.clear();
    signed.clear();
    adopted = null;
    clearPad();
    typeInput.value = "Jordan Lee";
    updatePreview();
    resetUpload();
    setTab("draw");
    otp.hidden = true;
    done.hidden = true;
    sendBtn.classList.remove("is-ready");
    finishBtn.classList.remove("is-ready");
    wasReady = false;
    setView("prepare");
    syncPrep();
  }

  /* ── Ghost autoplay ── */
  const ABORT = new Error("ghost-abort");
  let ghostRun = 0;
  let ghostOn = false;
  let touched = false;
  let gx = 0;
  let gy = 0;

  const guard = (id: number) => {
    if (id !== ghostRun) throw ABORT;
  };
  const gsleep = async (id: number, ms: number) => {
    await sleep(ms);
    guard(id);
  };
  const demoPoint = (el: Element, fx = 0.5, fy = 0.5) => {
    const r = el.getBoundingClientRect();
    const d = demo.getBoundingClientRect();
    return { x: r.left - d.left + r.width * fx, y: r.top - d.top + r.height * fy };
  };
  const setG = (x: number, y: number) => {
    gx = x;
    gy = y;
    ghost.style.transform = `translate(${x - 5}px, ${y - 3}px)`;
  };
  async function glide(id: number, p: { x: number; y: number }, speed = 1) {
    const from = ghost.style.transform;
    const dur = clamp(260 + Math.hypot(p.x - gx, p.y - gy) * 1.05, 360, 1000) / speed;
    setG(p.x, p.y);
    await ghost
      .animate([{ transform: from }, { transform: ghost.style.transform }], { duration: dur, easing: "cubic-bezier(.55,0,.25,1)" })
      .finished.catch(() => undefined);
    guard(id);
  }
  async function press(id: number, el: Element) {
    ghost.classList.add("is-down");
    el.classList.add("is-pressed");
    await sleep(170);
    ghost.classList.remove("is-down");
    el.classList.remove("is-pressed");
    guard(id);
  }
  async function clickOn(id: number, el: HTMLElement, fx = 0.5, fy = 0.5) {
    await glide(id, demoPoint(el, fx, fy));
    await press(id, el);
    el.click();
    guard(id);
  }

  async function ghostDrag(id: number, t: FType, slot: HTMLElement) {
    const chip = chipOf(t);
    await glide(id, demoPoint(chip, 0.35, 0.5));
    ghost.classList.add("is-down");
    chip.classList.add("is-pressed");
    await gsleep(id, 160);
    const drag = makeDragEl(t);
    drag.classList.add("sy-drag--ghost");
    ghost.append(drag);
    freeSlots(t).forEach((s) => s.classList.add("is-target"));
    chip.classList.remove("is-pressed");
    await glide(id, demoPoint(slot, 0.3, 0.5), 0.8);
    slot.classList.add("is-hover");
    showGuides(slot);
    await gsleep(id, 280);
    const rect = drag.getBoundingClientRect();
    drag.remove();
    ghost.classList.remove("is-down");
    slots.forEach((s) => s.classList.remove("is-target", "is-hover"));
    showGuides(null);
    place(slot, rect);
    await gsleep(id, 420);
  }

  async function ghostDraw(id: number) {
    const pre = presetStrokes("jordan");
    const toDemo = (p: { x: number; y: number }) => {
      const r = padSvg.getBoundingClientRect();
      const d = demo.getBoundingClientRect();
      const k = r.width / 400;
      return { x: r.left - d.left + p.x * k, y: r.top - d.top + p.y * k };
    };
    for (const s of pre) {
      await glide(id, toDemo(s[0]), 1.8);
      ghost.classList.add("is-down");
      beginStroke();
      const dur = s.length * 2.1;
      await new Promise<void>((resolve, reject) => {
        const t0 = performance.now();
        const step = (now: number) => {
          if (id !== ghostRun) return reject(ABORT);
          const n = clamp(Math.ceil(((now - t0) / dur) * s.length), 1, s.length);
          livePts = s.slice(0, n).map((p) => ({ ...p }));
          renderLive();
          const tip = toDemo(s[n - 1]);
          setG(tip.x, tip.y);
          if (n >= s.length) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      ghost.classList.remove("is-down");
      endStroke();
      await gsleep(id, 70);
    }
  }

  async function ghostLoop(id: number) {
    try {
      for (;;) {
        reset();
        setG(...(Object.values(demoPoint(canvas, 0.72, 0.86)) as [number, number]));
        ghost.classList.add("is-on");
        await gsleep(id, 900);
        await ghostDrag(id, "sig", slotById("s2"));
        await ghostDrag(id, "init", slotById("i1"));
        await ghostDrag(id, "date", slotById("d2"));
        await clickOn(id, sendBtn);
        while (busy || view !== "sign") await gsleep(id, 100);
        await gsleep(id, 250);
        const tapField = async (sid: string) => {
          const b = slotById(sid).querySelector<HTMLElement>("button.sy-sfield");
          if (!b) return;
          await clickOn(id, b);
          await gsleep(id, 520);
        };
        await tapField("i1");
        const sig = req("button.sy-sfield", slotById("s2"));
        await clickOn(id, sig);
        await gsleep(id, 420);
        await ghostDraw(id);
        await gsleep(id, 260);
        await clickOn(id, adoptBtn);
        await gsleep(id, 1250);
        await tapField("d2");
        await clickOn(id, finishBtn);
        await gsleep(id, 900);
        await glide(id, demoPoint(canvas, 0.9, 0.2));
        ghost.classList.remove("is-on");
        await gsleep(id, 5200);
      }
    } catch (err) {
      if (err !== ABORT) throw err;
    }
  }

  function startGhost() {
    if (RM || touched || ghostOn) return;
    ghostOn = true;
    auto = true;
    void ghostLoop(++ghostRun);
  }

  function stopGhost() {
    if (!ghostOn) return;
    ghostOn = false;
    ghostRun++;
    auto = false;
    ghost.getAnimations().forEach((a) => a.cancel());
    ghost.classList.remove("is-on", "is-down");
    ghost.querySelector(".sy-drag")?.remove();
    chips.forEach((c) => c.classList.remove("is-pressed"));
    sendBtn.classList.remove("is-pressed");
    finishBtn.classList.remove("is-pressed");
    adoptBtn.classList.remove("is-pressed");
    reset();
  }

  const takeOver = () => {
    if (touched) return;
    touched = true;
    stopGhost();
  };
  demo.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isTrusted) return;
      // On touch, only a press on a control counts — swiping across the demo to scroll shouldn't cancel it.
      if (e.pointerType === "touch" && !(e.target as Element).closest("button, a, input, [data-draw]")) return;
      takeOver();
    },
    true,
  );
  demo.addEventListener("keydown", (e) => e.isTrusted && takeOver(), true);
  demo.addEventListener("focusin", (e) => e.isTrusted && takeOver(), true);

  reset();
  if (RM) {
    // No autoplay under reduced motion: start with a prepared document so "Send" is one click away.
    ["s2", "i1", "d2"].forEach((id) => place(slotById(id)));
    live.textContent = "";
  } else if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startGhost();
        else stopGhost();
      },
      { threshold: 0.25 },
    ).observe(demo);
  }
}
