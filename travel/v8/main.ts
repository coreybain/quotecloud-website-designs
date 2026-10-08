import "../../src/shared/site.ts";
import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/* ───────── Pause loops while sections are off screen ───────── */

function initInView() {
  const sections = $$("[data-anim]");
  const setSmil = (el: Element, on: boolean) =>
    el.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
      if (!svg.querySelector("animateMotion")) return;
      if (on && !prefersReducedMotion) svg.unpauseAnimations();
      else svg.pauseAnimations();
    });
  if (!("IntersectionObserver" in window)) {
    sections.forEach((s) => s.classList.add("is-inview"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      e.target.classList.toggle("is-inview", e.isIntersecting);
      setSmil(e.target, e.isIntersecting);
    }
  });
  sections.forEach((s) => io.observe(s));
}

/* ───────── Hero: interactive proposal ───────── */

function initProposal() {
  const prop = $("#proposal");
  if (!prop) return;

  const NIGHTS = 7;
  const FLIGHT_PP = 680;
  const TOUR_PP = 95;
  const TRANSFER = 120;
  const INSURANCE_PP = 79;

  const views = $$("[data-view]", prop);
  const lines = Object.fromEntries($$("[data-line]", prop).map((li) => [li.dataset.line!, li]));
  const totalEl = $("[data-total]", prop)!;
  const totalWrap = totalEl.closest(".t8-total")!;
  const depositEl = $("[data-deposit]", prop)!;
  const live = $("[data-live-total]", prop)!;
  const paxVal = $("#pax-val", prop)!;
  const stepBtns = $$<HTMLButtonElement>("[data-step]", prop);
  const shown = new Map<Element, number>();

  let pax = 2;
  let total = 0;
  let liveTimer = 0;

  const tween = (el: Element, to: number) => {
    const from = shown.get(el) ?? to;
    shown.set(el, to);
    if (prefersReducedMotion || from === to) {
      el.textContent = money(to);
      return;
    }
    const start = performance.now();
    const dur = 650;
    const step = (now: number) => {
      if (shown.get(el) !== to) return; // superseded
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const state = () => {
    const room = $<HTMLInputElement>('input[name="room"]:checked', prop)!;
    const on = (name: string) => $<HTMLInputElement>(`input[name="${name}"]`, prop)!.checked;
    const rooms = Math.ceil(pax / 2);
    const values: Record<string, number> = {
      flights: FLIGHT_PP * pax,
      hotel: Number(room.dataset.rate) * NIGHTS * rooms,
      tour: on("tour") ? TOUR_PP * pax : 0,
      transfer: on("transfer") ? TRANSFER : 0,
      insurance: on("insurance") ? INSURANCE_PP * pax : 0,
    };
    return { room, rooms, values };
  };

  const render = (changed?: string) => {
    const { room, rooms, values } = state();
    $("[data-room-name]", prop)!.textContent = room.dataset.name!;
    $("[data-flights-note]", prop)!.textContent = `× ${pax}`;
    $("[data-hotel-note]", prop)!.textContent = rooms > 1 ? `${NIGHTS} nights × ${rooms} rooms` : `${NIGHTS} nights`;

    for (const [key, li] of Object.entries(lines)) {
      const v = values[key];
      li.classList.toggle("is-off", v === 0);
      if (v > 0) tween($("[data-amt]", li)!, v);
      if (changed && (changed === key || changed === "all") && v > 0) {
        li.classList.remove("is-flash");
        void li.offsetWidth;
        li.classList.add("is-flash");
      }
    }
    const newTotal = Object.values(values).reduce((a, b) => a + b, 0);
    if (newTotal !== total && changed) {
      totalWrap.classList.remove("is-pulse");
      void (totalWrap as HTMLElement).offsetWidth;
      totalWrap.classList.add("is-pulse");
    }
    total = newTotal;
    tween(totalEl, total);
    tween(depositEl, total * 0.2);
    $("[data-sign-sum]", prop)!.textContent = `Bali Discovery · ${pax} traveller${pax > 1 ? "s" : ""} · ${money(total)} AUD`;

    stepBtns.forEach((b) => {
      const d = Number(b.dataset.step);
      b.setAttribute("aria-disabled", String((d < 0 && pax <= 1) || (d > 0 && pax >= 6)));
    });

    if (changed) {
      window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        live.textContent = `Trip total ${money(total)} AUD for ${pax} traveller${pax > 1 ? "s" : ""}.`;
      }, 450);
    }
  };

  const touch = () => prop.classList.add("is-touched");

  prop.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches("input")) return;
    touch();
    render(input.name === "room" ? "hotel" : input.name);
  });

  stepBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const next = pax + Number(btn.dataset.step);
      if (next < 1 || next > 6) return;
      touch();
      pax = next;
      paxVal.textContent = String(pax);
      paxVal.classList.remove("is-bump");
      void paxVal.offsetWidth;
      paxVal.classList.add("is-bump");
      render("all");
    }),
  );

  /* Views: choose → sign → done */
  const setView = (name: string, focus = true) => {
    prop.dataset.state = name;
    for (const v of views) {
      const on = v.dataset.view === name;
      v.hidden = false;
      v.classList.toggle("is-current", on);
      v.inert = !on;
    }
    if (!focus) return;
    const target =
      name === "sign"
        ? $("[data-sign-title]", prop)
        : name === "done"
          ? $("[data-done-title]", prop)
          : $('[data-action="sign"]', prop);
    target?.focus({ preventScroll: true });
    // On small screens the card shrinks to the new view; bring its top back into view
    const top = (prop.querySelector(".t8-prop__views") ?? prop).getBoundingClientRect().top;
    if (top < 72) window.scrollTo({ top: window.scrollY + top - 96, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };
  setView("choose", false);

  /* Signature pad */
  const pad = $(".t8-pad:not(.t8-pad--type)", prop)!;
  const canvas = $<HTMLCanvasElement>("canvas", pad)!;
  const ctx = canvas.getContext("2d")!;
  const confirmBtn = $<HTMLButtonElement>('[data-action="confirm"]', prop)!;
  const nameInput = $<HTMLInputElement>("#sig-name", prop)!;
  const script = $("[data-script]", prop)!;
  const sigTabs = $$<HTMLButtonElement>('.t8-sign__tabs [role="tab"]', prop);
  let mode: "draw" | "type" = "draw";
  let ink = 0;
  let drawing = false;
  let last: { x: number; y: number; t: number; w: number } | null = null;
  let mid: { x: number; y: number } | null = null;

  const sizeCanvas = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1b1b3a";
    ink = 0;
    pad.classList.remove("has-ink");
    updateConfirm();
  };

  const updateConfirm = () => {
    confirmBtn.disabled = mode === "draw" ? ink < 40 : nameInput.value.trim().length < 2;
  };

  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = point(e);
    last = { ...p, w: 2.6 };
    mid = { x: p.x, y: p.y };
    ctx.beginPath();
    ctx.fillStyle = "#1b1b3a";
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing || !last || !mid) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const p = point(ev);
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < 0.8) continue;
      const speed = dist / Math.max(1, p.t - last.t);
      const w: number = Math.max(1.1, Math.min(3.2, 3.4 - speed * 0.9));
      const width: number = last.w + (w - last.w) * 0.35;
      const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.moveTo(mid.x, mid.y);
      ctx.quadraticCurveTo(last.x, last.y, m.x, m.y);
      ctx.stroke();
      ink += dist;
      mid = m;
      last = { ...p, w: width };
    }
    if (ink > 8) pad.classList.add("has-ink");
    updateConfirm();
  });
  const endStroke = () => {
    drawing = false;
    last = null;
    mid = null;
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  const clearPad = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ink = 0;
    pad.classList.remove("has-ink");
    updateConfirm();
  };

  const setMode = (m: "draw" | "type", focus = false) => {
    mode = m;
    sigTabs.forEach((t) => {
      const on = t.id === `sig-tab-${m}`;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute("aria-controls")}`)!.hidden = !on;
      if (on && focus) t.focus();
    });
    if (m === "draw") requestAnimationFrame(sizeCanvas);
    updateConfirm();
  };
  sigTabs.forEach((t, i) => {
    t.addEventListener("click", () => setMode(i === 0 ? "draw" : "type"));
    t.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : (i + 1) % 2;
      setMode(next === 0 ? "draw" : "type", true);
    });
  });
  nameInput.addEventListener("input", () => {
    script.textContent = nameInput.value;
    updateConfirm();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !confirmBtn.disabled) confirmBtn.click();
  });

  if ("ResizeObserver" in window) new ResizeObserver(() => prop.dataset.state === "sign" && mode === "draw" && sizeCanvas()).observe(pad);

  prop.addEventListener("click", (e) => {
    const action = (e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) return;
    touch();
    if (action === "sign") {
      setView("sign");
      setMode(mode);
      requestAnimationFrame(sizeCanvas);
    } else if (action === "back") {
      setView("choose");
    } else if (action === "clear") {
      clearPad();
    } else if (action === "confirm") {
      const name = mode === "type" ? nameInput.value.trim() : "Alex Morgan";
      const when = new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
      $("[data-done-meta]", prop)!.textContent = `Signed by ${name} · ${when} · audit trail saved`;
      setView("done");
    } else if (action === "replay") {
      clearPad();
      nameInput.value = "";
      script.textContent = "";
      setView("choose");
    }
  });

  render();
}

/* ───────── Build the itinerary ───────── */

type Seg = { title: string; meta: string; time: string; conf: string };
const LABEL: Record<string, string> = {
  flight: "Flight",
  hotel: "Hotel",
  transfer: "Transfer",
  tour: "Tour",
  cruise: "Cruise",
  train: "Train",
  car: "Car",
  ferry: "Ferry",
  activity: "Activity",
  insurance: "Insurance",
};
const SEGMENTS: Record<string, Seg[]> = {
  flight: [
    { title: "Sydney → Rome", meta: "Economy · via Dubai · Seats 32A–B", time: "06:40", conf: "EK7Q2M" },
    { title: "Rome → Florence", meta: "Economy · 55 min · Bag included", time: "09:05", conf: "AZ4RT1" },
    { title: "Naples → Sydney", meta: "Premium economy · via Doha", time: "14:30", conf: "QR9H3D" },
  ],
  hotel: [
    { title: "Trastevere boutique hotel", meta: "Deluxe double · 2 nights · Breakfast", time: "14:00", conf: "HTL-48213" },
    { title: "Oltrarno palazzo suite", meta: "Junior suite · 2 nights · River view", time: "15:00", conf: "HTL-51907" },
    { title: "Positano sea-view hotel", meta: "Terrace room · 3 nights · Breakfast", time: "15:00", conf: "HTL-60334" },
  ],
  transfer: [
    { title: "Fiumicino → Trastevere", meta: "Private car · Meet & greet", time: "07:30", conf: "TRF-2210" },
    { title: "Santa Maria Novella → hotel", meta: "Private car · 15 min", time: "12:10", conf: "TRF-2231" },
    { title: "Naples → Positano", meta: "Private driver · 1 h 20 min", time: "13:00", conf: "TRF-2248" },
  ],
  tour: [
    { title: "Vatican Museums & Sistine Chapel", meta: "Small group · Skip-the-line", time: "09:00", conf: "TUR-1180" },
    { title: "Uffizi Gallery highlights", meta: "Private guide · 2 hours", time: "10:00", conf: "TUR-1204" },
    { title: "Pompeii with an archaeologist", meta: "Half day · Hotel pick-up", time: "08:30", conf: "TUR-1239" },
  ],
  cruise: [
    { title: "Tiber sunset cruise", meta: "Aperitivo on board · 90 min", time: "18:30", conf: "CRU-0412" },
    { title: "Cinque Terre coastal cruise", meta: "Day trip · Lunch on board", time: "08:45", conf: "CRU-0437" },
    { title: "Amalfi Coast day cruise", meta: "Positano · Amalfi · Ravello", time: "10:00", conf: "CRU-0458" },
  ],
  train: [
    { title: "Rome → Orvieto", meta: "Regional · 1st class · 1 h 15 min", time: "08:10", conf: "TR-8790" },
    { title: "Rome → Florence", meta: "High-speed · 1st class · Coach 3", time: "10:20", conf: "TR-8812" },
    { title: "Florence → Naples", meta: "High-speed · 1st class · Coach 5", time: "09:10", conf: "TR-8846" },
  ],
  car: [
    { title: "Compact car hire", meta: "Pick-up Roma Termini · 1 day", time: "09:00", conf: "CAR-3301" },
    { title: "Tuscany convertible hire", meta: "Pick-up Florence · 2 days", time: "09:30", conf: "CAR-3326" },
    { title: "Coastal car with driver", meta: "Sorrento · Full day", time: "09:00", conf: "CAR-3350" },
  ],
  ferry: [
    { title: "Civitavecchia → Giglio", meta: "Fast ferry · 1 h", time: "08:15", conf: "FER-7720" },
    { title: "Livorno → Elba", meta: "Car ferry · 1 h 40 min", time: "07:50", conf: "FER-7741" },
    { title: "Positano → Capri", meta: "Fast ferry · 40 min", time: "09:30", conf: "FER-7765" },
  ],
  activity: [
    { title: "Trastevere food walk", meta: "Evening · Tastings included", time: "19:00", conf: "ACT-5103" },
    { title: "Tuscan cooking class", meta: "Market visit & lunch", time: "10:00", conf: "ACT-5129" },
    { title: "Limoncello tasting", meta: "Family-run lemon grove", time: "16:00", conf: "ACT-5152" },
  ],
  insurance: [
    { title: "Comprehensive travel cover", meta: "2 travellers · Worldwide · 10 days", time: "Active", conf: "POL-55120" },
    { title: "Comprehensive travel cover", meta: "2 travellers · Worldwide · 10 days", time: "Active", conf: "POL-55120" },
    { title: "Comprehensive travel cover", meta: "2 travellers · Worldwide · 10 days", time: "Active", conf: "POL-55120" },
  ],
};
const MAX_PER_DAY = 5;

function segEl(type: string, idx: number) {
  const s = SEGMENTS[type][idx];
  const li = document.createElement("li");
  li.className = "t8-seg";
  li.dataset.type = type;
  li.dataset.key = `${type}-${type === "insurance" ? 0 : idx}`;
  li.innerHTML = `
    <span class="t8-seg__icon"><svg aria-hidden="true"><use href="#i-${type}" /></svg></span>
    <div class="t8-seg__main"><p class="t8-seg__title"></p><p class="t8-seg__meta"></p></div>
    <div class="t8-seg__side"><span class="t8-seg__time"></span><span class="t8-seg__conf"></span></div>
    <button type="button" class="t8-seg__remove"><svg aria-hidden="true"><use href="#i-close" /></svg></button>`;
  $(".t8-seg__title", li)!.textContent = s.title;
  $(".t8-seg__meta", li)!.textContent = `${LABEL[type]} · ${s.meta}`;
  $(".t8-seg__time", li)!.textContent = s.time;
  $(".t8-seg__conf", li)!.textContent = s.conf;
  $(".t8-seg__remove", li)!.setAttribute("aria-label", `Remove ${LABEL[type].toLowerCase()} ${s.title}`);
  return li;
}

function initBuilder() {
  const root = $(".t8-build");
  if (!root) return;
  const days = $$(".t8-day", root);
  const lists = days.map((d) => $(".t8-day__list", d)!);
  const radios = $$<HTMLButtonElement>(".t8-daypick [role=radio]", root);
  const tiles = $$<HTMLButtonElement>(".t8-tile", root);
  const live = $("[data-build-live]", root)!;
  let target = 0;

  const announce = (msg: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = msg), 30);
  };

  const setTarget = (i: number, focusRadio = false) => {
    target = i;
    radios.forEach((r, k) => {
      r.setAttribute("aria-checked", String(k === i));
      r.tabIndex = k === i ? 0 : -1;
      if (k === i && focusRadio) r.focus();
    });
    days.forEach((d, k) => d.classList.toggle("is-target", k === i));
  };

  const refreshFull = () => days.forEach((d, k) => d.classList.toggle("is-full", lists[k].children.length >= MAX_PER_DAY));

  const shake = (day: HTMLElement) => {
    day.classList.remove("is-shake");
    void day.offsetWidth;
    day.classList.add("is-shake");
  };

  const add = (type: string, dayIdx: number) => {
    const list = lists[dayIdx];
    const dayName = `Day ${dayIdx + 1}`;
    if (list.children.length >= MAX_PER_DAY) {
      shake(days[dayIdx]);
      announce(`${dayName} is full. Remove a segment or choose another day.`);
      return;
    }
    const keys = new Set($$<HTMLElement>(".t8-seg", list).map((s) => s.dataset.key));
    const order = [dayIdx, (dayIdx + 1) % 3, (dayIdx + 2) % 3];
    const idx = order.find((i) => !keys.has(`${type}-${type === "insurance" ? 0 : i}`));
    if (idx === undefined) {
      shake(days[dayIdx]);
      announce(`${LABEL[type]} is already on ${dayName}.`);
      return;
    }
    const li = segEl(type, idx);
    if (!prefersReducedMotion) {
      li.classList.add("is-new");
      li.addEventListener("animationend", (e) => e.target === li && e.animationName === "t8-seg-in" && window.setTimeout(() => li.classList.remove("is-new"), 1400));
    }
    list.append(li);
    refreshFull();
    const r = li.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 64) li.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    announce(`${LABEL[type]} ${SEGMENTS[type][idx].title} added to ${dayName}.`);
  };

  /* Day selection */
  radios.forEach((r, i) => {
    r.addEventListener("click", () => setTarget(i));
    r.addEventListener("keydown", (e) => {
      const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      setTarget((i + keys[e.key] + radios.length) % radios.length, true);
    });
  });
  $$<HTMLButtonElement>(".t8-day__head", root).forEach((b) =>
    b.addEventListener("click", () => {
      setTarget(Number(b.dataset.targetDay));
      announce(`Adding segments to Day ${Number(b.dataset.targetDay) + 1}.`);
    }),
  );

  /* Palette: roving tabindex toolbar */
  let suppressClick = false;
  tiles.forEach((tile, i) => {
    tile.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      add(tile.dataset.seg!, target);
    });
    tile.addEventListener("keydown", (e) => {
      const cols = getComputedStyle(tile.parentElement!).gridTemplateColumns.split(" ").length;
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      let next = -1;
      if (e.key in moves) next = i + moves[e.key];
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tiles.length - 1;
      else if (/^[1-3]$/.test(e.key)) {
        setTarget(Number(e.key) - 1);
        announce(`Adding segments to Day ${e.key}.`);
        return;
      } else return;
      e.preventDefault();
      next = Math.max(0, Math.min(tiles.length - 1, next));
      tiles.forEach((t, k) => (t.tabIndex = k === next ? 0 : -1));
      tiles[next].focus();
    });
  });

  /* Drag from palette (mouse and pen; touch uses tap) */
  tiles.forEach((tile) => {
    tile.addEventListener("pointerdown", (down) => {
      if (down.pointerType === "touch" || down.button !== 0) return;
      const sx = down.clientX;
      const sy = down.clientY;
      let ghost: HTMLElement | null = null;
      let over: number | null = null;

      const move = (e: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
          ghost = document.createElement("div");
          ghost.className = "t8-ghost";
          ghost.innerHTML = `<svg aria-hidden="true"><use href="#i-${tile.dataset.seg}" /></svg>${LABEL[tile.dataset.seg!]}`;
          document.body.append(ghost);
          document.body.classList.add("t8-is-dragging");
          tile.classList.add("is-dragging");
        }
        ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 24}px) rotate(-3deg)`;
        const day = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".t8-day");
        const idx = day ? days.indexOf(day) : -1;
        over = idx >= 0 ? idx : null;
        days.forEach((d, k) => d.classList.toggle("is-over", k === over));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!ghost) return;
        suppressClick = true;
        window.setTimeout(() => (suppressClick = false), 0);
        const g = ghost;
        document.body.classList.remove("t8-is-dragging");
        tile.classList.remove("is-dragging");
        days.forEach((d) => d.classList.remove("is-over"));
        if (over !== null) {
          setTarget(over);
          add(tile.dataset.seg!, over);
          g.remove();
        } else {
          g.animate([{ opacity: 1 }, { opacity: 0, transform: g.style.transform + " scale(0.8)" }], { duration: 200 }).onfinish = () => g.remove();
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });

  /* Remove */
  root.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(".t8-seg__remove");
    if (!btn) return;
    const li = btn.closest<HTMLElement>(".t8-seg")!;
    const list = li.parentElement!;
    const dayIdx = lists.indexOf(list);
    const title = $(".t8-seg__title", li)!.textContent;
    const next = (li.nextElementSibling ?? li.previousElementSibling)?.querySelector<HTMLButtonElement>(".t8-seg__remove");
    const finish = () => {
      li.remove();
      refreshFull();
      (next ?? $<HTMLButtonElement>(".t8-day__head", days[dayIdx])!).focus({ preventScroll: true });
      announce(`${title} removed from Day ${dayIdx + 1}.`);
    };
    if (prefersReducedMotion) return finish();
    li.style.pointerEvents = "none";
    const h = li.offsetHeight;
    li.animate(
      [
        { opacity: 1, transform: "none", height: `${h}px`, marginBottom: "0px" },
        { opacity: 0, transform: "translateX(24px) scale(0.97)", height: `${h}px`, marginBottom: "0px", offset: 0.55 },
        { opacity: 0, transform: "translateX(24px) scale(0.97)", height: "0px", marginBottom: "-10px", paddingBlock: "0px" },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    ).onfinish = finish;
  });

  setTarget(0);
  refreshFull();
}

/* ───────── Tabbed showcase with auto-advance ───────── */

function initTabs() {
  const wrap = $(".t8-tabs");
  if (!wrap) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', wrap);
  const panels = tabs.map((t) => $(`#${t.getAttribute("aria-controls")}`)!);
  let current = 0;
  let hover = false;
  let focus = false;
  let visible = false;

  const select = (i: number, user = false) => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === current;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].classList.toggle("is-active", on);
    });
    if (user) {
      wrap.classList.remove("is-auto");
      tabs[current].scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const syncPause = () => wrap.classList.toggle("is-paused", hover || focus || !visible);

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(i, true));
    t.addEventListener("keydown", (e) => {
      const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in map)) return;
      e.preventDefault();
      select(map[e.key], true);
      tabs[current].focus();
    });
  });

  wrap.addEventListener("animationend", (e) => {
    if (e.animationName !== "t8-progress" || !wrap.classList.contains("is-auto")) return;
    select(current + 1);
    // keep the auto-advancing tab visible in the scrollable mobile tab strip without moving the page
    const list = tabs[current].parentElement!;
    const t = tabs[current];
    if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, behavior: "smooth" });
  });
  wrap.addEventListener("pointerenter", () => ((hover = true), syncPause()));
  wrap.addEventListener("pointerleave", () => ((hover = false), syncPause()));
  wrap.addEventListener("focusin", () => ((focus = true), syncPause()));
  wrap.addEventListener("focusout", (e) => {
    if (!wrap.contains(e.relatedTarget as Node | null)) {
      focus = false;
      syncPause();
    }
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        syncPause();
      },
      { threshold: 0.35 },
    ).observe(wrap);
  } else visible = true;

  select(0);
  if (!prefersReducedMotion) wrap.classList.add("is-auto");
  syncPause();
}

/* ───────── Mobile sticky CTA ───────── */

function initSticky() {
  const bar = $("[data-sticky]");
  const hero = $(".t8-hero");
  const ends = [$(".t8-close"), $(".qc-footer")].filter(Boolean) as HTMLElement[];
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  const link = $("a", bar)!;
  let pastHero = false;
  const endVisible = new Set<Element>();
  const sync = () => {
    const on = pastHero && endVisible.size === 0;
    bar.classList.toggle("is-on", on);
    bar.setAttribute("aria-hidden", String(!on));
    link.tabIndex = on ? 0 : -1;
  };
  new IntersectionObserver(([e]) => {
    pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
    sync();
  }).observe(hero);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? endVisible.add(e.target) : endVisible.delete(e.target)));
    sync();
  });
  ends.forEach((el) => io.observe(el));
}

initInView();
initProposal();
initBuilder();
initTabs();
initSticky();
