import "../../src/shared/site.ts";
import { prefersReducedMotion } from "../../src/shared/site.ts";
import "./style.css";

/* ───────── helpers ───────── */

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Runs `start` while `el` is on screen; the function it returns is called when it leaves. */
function whileVisible(el: Element, start: () => (() => void) | void, threshold = 0.2) {
  let stop: (() => void) | void | null = null;
  let on = false;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !on) {
        on = true;
        el.classList.add("is-live");
        stop = start();
      } else if (!entry.isIntersecting && on) {
        on = false;
        el.classList.remove("is-live");
        if (stop) stop();
        stop = null;
      }
    },
    { threshold },
  );
  io.observe(el);
}

/** Schedules [ms, fn] steps on a repeating loop. Returns a cancel function. */
function loop(steps: [number, () => void][], every: number) {
  let timers: number[] = [];
  const run = () => {
    timers = steps.map(([t, fn]) => window.setTimeout(fn, t));
    timers.push(window.setTimeout(run, every));
  };
  run();
  return () => timers.forEach(clearTimeout);
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/* ───────── Hero: the template fan ───────── */

function initFan() {
  const hero = $("[data-hero]");
  const fan = $("[data-fan]");
  if (!hero || !fan) return;

  // breathing loops and the route dot only run while the hero is on screen
  const route = $<SVGSVGElement>(".t9-route", hero);
  route?.pauseAnimations();
  whileVisible(
    hero,
    () => {
      if (prefersReducedMotion) return;
      route?.unpauseAnimations();
      return () => route?.pauseAnimations();
    },
    0.05,
  );

  if (prefersReducedMotion) {
    fan.style.setProperty("--s", "1");
    return;
  }

  let s = 0;
  let px = 0;
  let py = 0;
  let target = 1;
  let tpx = 0;
  let tpy = 0;
  let raf = 0;

  const frame = () => {
    s += (target - s) * 0.075;
    px += (tpx - px) * 0.08;
    py += (tpy - py) * 0.08;
    fan.style.setProperty("--s", s.toFixed(4));
    fan.style.setProperty("--px", px.toFixed(4));
    fan.style.setProperty("--py", py.toFixed(4));
    const settled = Math.abs(target - s) < 0.001 && Math.abs(tpx - px) < 0.001 && Math.abs(tpy - py) < 0.001;
    raf = settled ? 0 : requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  fan.style.setProperty("--s", "0");
  const imgs = $$<HTMLImageElement>("img", fan);
  Promise.all(imgs.map((img) => img.decode().catch(() => undefined))).then(() => {
    fan.classList.add("is-ready");
    window.setTimeout(kick, 350);
  });

  const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
  hero.addEventListener("pointermove", (event) => {
    if (!fine.matches || !fan.classList.contains("is-ready")) return;
    const r = fan.getBoundingClientRect();
    const nx = (event.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (event.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const near = Math.max(0, 1 - Math.hypot(nx, ny) / 1.6);
    target = 1 + 0.32 * near;
    tpx = Math.max(-1, Math.min(1, nx));
    tpy = Math.max(-1, Math.min(1, ny));
    kick();
  });
  hero.addEventListener("pointerleave", () => {
    target = 1;
    tpx = 0;
    tpy = 0;
    kick();
  });
}

/* ───────── Signature: live theme switcher ───────── */

type Seg = [icon: string, day: string, title: string, detail: string];
type Theme = {
  agency: string;
  kicker: string;
  title: string;
  dates: string;
  travellers: string;
  destination: string;
  segs: Seg[];
  total: string;
};

const THEMES: Record<string, Theme> = {
  paradise: {
    agency: "Paradise Travel",
    kicker: "Leisure itinerary",
    title: "Seven nights in Bali",
    dates: "12 – 19 May",
    travellers: "2 adults",
    destination: "Seminyak, Bali",
    segs: [
      ["flight", "Fri 12", "Sydney to Denpasar", "SYD 10:35 → DPS 15:10"],
      ["hotel", "Fri 12", "Beachfront villa", "7 nights · Check-in 15:00"],
      ["tour", "Sat 13", "Uluwatu temple at sunset", "Private guide · 16:30"],
    ],
    total: "$8,640",
  },
  meridian: {
    agency: "Meridian Business Travel",
    kicker: "Corporate itinerary",
    title: "Singapore leadership summit",
    dates: "3 – 6 Jun",
    travellers: "3 executives",
    destination: "Marina Bay, Singapore",
    segs: [
      ["flight", "Wed 3", "Sydney to Singapore", "Business · SYD 09:20 → SIN 14:45"],
      ["car", "Wed 3", "Private airport transfer", "Meet and greet · 15:30"],
      ["hotel", "Wed 3", "Marina Bay hotel", "3 nights · Late check-out"],
    ],
    total: "$14,980",
  },
  lynx: {
    agency: "African Lynx Travel",
    kicker: "Group itinerary",
    title: "Kruger safari for twelve",
    dates: "8 – 14 Sep",
    travellers: "Group of 12",
    destination: "Sabi Sand, South Africa",
    segs: [
      ["flight", "Mon 8", "Johannesburg to Skukuza", "Charter · JNB 10:10 → SZK 11:20"],
      ["hotel", "Mon 8", "Riverside safari lodge", "6 nights · Full board"],
      ["tour", "Tue 9", "Sunrise game drive", "Daily · 05:30 with ranger"],
    ],
    total: "$71,400",
  },
  sunshine: {
    agency: "Sunshine Travel",
    kicker: "Family itinerary",
    title: "Gold Coast family holiday",
    dates: "5 – 12 Jul",
    travellers: "2 adults, 2 children",
    destination: "Gold Coast, Queensland",
    segs: [
      ["flight", "Sat 5", "Melbourne to Gold Coast", "MEL 08:15 → OOL 10:30"],
      ["car", "Sat 5", "Family SUV hire", "Pick-up 11:00 · 7 days"],
      ["ticket", "Sun 6", "Theme park passes", "3 days · Family of four"],
    ],
    total: "$6,320",
  },
};
const ORDER = Object.keys(THEMES);
const THEME_FONTS =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600&family=Manrope:wght@500;700;800&family=Playfair+Display:wght@600&display=swap";

function initStudio() {
  const studio = $("[data-studio]");
  const doc = $("[data-doc]");
  if (!studio || !doc) return;
  const radios = $$<HTMLInputElement>('input[name="t9-style"]', studio);
  const slot = (name: string) => $(`[data-slot="${name}"]`, doc);
  let current = "paradise";
  let busy = false;

  // Load the display fonts for the sample brands only when the section is near.
  const fontIO = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      fontIO.disconnect();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = THEME_FONTS;
      document.head.append(link);
    },
    { rootMargin: "900px 0px" },
  );
  fontIO.observe(studio);

  const write = (name: string) => {
    const t = THEMES[name];
    doc.dataset.theme = name;
    $$("[data-cover]", doc).forEach((img) => img.classList.toggle("is-active", img.dataset.cover === name));
    slot("mark")?.setAttribute("href", `#t9-m-${name}`);
    const text: Record<string, string> = {
      agency: t.agency,
      kicker: t.kicker,
      title: t.title,
      dates: t.dates,
      travellers: t.travellers,
      destination: t.destination,
      total: t.total,
    };
    t.segs.forEach(([icon, day, title, detail], i) => {
      slot(`s${i}-icon`)?.setAttribute("href", `#t9-i-${icon}`);
      text[`s${i}-day`] = day;
      text[`s${i}-title`] = title;
      text[`s${i}-detail`] = detail;
    });
    for (const [key, value] of Object.entries(text)) {
      const el = slot(key);
      if (el) el.textContent = value;
    }
    radios.forEach((r) => {
      r.checked = r.value === name;
      r.closest(".t9-preset")?.classList.toggle("is-active", r.checked);
    });
    current = name;
  };

  const apply = (name: string, viaUser: boolean) => {
    if (name === current || busy) return;
    if (prefersReducedMotion) return write(name);

    // Users get a view transition (colour, type and cover morph together);
    // the ambient autoplay uses a calm crossfade so it never fights with scrolling.
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } })
      .startViewTransition;
    if (viaUser && vt) {
      busy = true;
      document.documentElement.classList.add("t9-vt");
      const transition = vt.call(document, () => write(name));
      transition.finished.finally(() => {
        document.documentElement.classList.remove("t9-vt");
        busy = false;
      });
      return;
    }
    busy = true;
    doc.classList.add("is-swapping");
    window.setTimeout(() => {
      write(name);
      doc.classList.remove("is-swapping");
      doc.classList.add("is-arriving");
      window.setTimeout(() => {
        doc.classList.remove("is-arriving");
        busy = false;
      }, 700);
    }, 260);
  };

  write(current);

  let userTookOver = false;
  let stopAuto: (() => void) | null = null;
  const takeOver = () => {
    if (userTookOver) return;
    userTookOver = true;
    studio.classList.remove("is-auto");
    stopAuto?.();
  };

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      takeOver();
      if (radio.checked) apply(radio.value, true);
    });
  });
  studio.addEventListener("pointerdown", takeOver);
  studio.addEventListener("focusin", takeOver);

  if (prefersReducedMotion) return;
  whileVisible(
    studio,
    () => {
      if (userTookOver) return;
      studio.classList.add("is-auto");
      const timer = window.setInterval(() => {
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
        apply(next, false);
      }, 5200);
      stopAuto = () => window.clearInterval(timer);
      return () => {
        studio.classList.remove("is-auto");
        window.clearInterval(timer);
      };
    },
    0.45,
  );
}

/* ───────── Engine: import from GDS / mid-office ───────── */

function initImport() {
  const el = $("[data-import]");
  if (!el) return;
  const label = $("[data-pnr-source]", el);
  const ref = $(".t9-pnr__bar b", el);
  const links = $$<HTMLAnchorElement>("[data-source]", el);
  const sources = [
    ["Sabre GDS", "PNR MLR7QX"],
    ["PowerSuite", "Booking 48213"],
    ["Tramada", "Booking TR-20931"],
  ];
  if (prefersReducedMotion) {
    el.dataset.step = "3";
    return;
  }
  let i = 0;
  const setSource = () => {
    const [name, code] = sources[i];
    if (label) label.textContent = name;
    if (ref) ref.textContent = code;
    links.forEach((a, n) => a.classList.toggle("is-on", n === i));
  };
  whileVisible(
    el,
    () =>
      loop(
        [
          [0, () => ((el.dataset.step = "0"), setSource())],
          [250, () => (el.dataset.step = "1")],
          [1650, () => (el.dataset.step = "2")],
          [2000, () => (el.dataset.step = "3")],
          [6600, () => ((el.dataset.step = "out"), (i = (i + 1) % sources.length))],
        ],
        7200,
      ),
    0.35,
  );
}

/* ───────── Engine: content library drag and drop ───────── */

function initLibrary() {
  const el = $("[data-lib]");
  if (!el) return;
  const items = $$("[data-lib-item]", el);
  const ghost = $(".t9-lib__ghost", el);
  const ghostText = $("[data-lib-ghost]", el);
  const drop = $(".t9-lib__drop", el);
  const dropText = $("[data-lib-drop]", el);
  const viz = $(".t9-lib__viz", el);
  if (!ghost || !drop || !viz || !ghostText || !dropText) return;
  const dropIcon = $("use", drop);
  if (prefersReducedMotion) {
    el.dataset.step = "done";
    return;
  }
  let i = 0;
  const pick = () => {
    const item = items[i];
    items.forEach((it) => it.classList.toggle("is-picked", it === item));
    const label = item.textContent?.trim() ?? "";
    ghostText.textContent = label;
    ghost.querySelector("use")?.setAttribute("href", item.querySelector("use")?.getAttribute("href") ?? "");
    const v = viz.getBoundingClientRect();
    const a = item.getBoundingClientRect();
    const b = drop.getBoundingClientRect();
    el.dataset.step = "drag";
    ghost.animate(
      [
        { transform: `translate(${a.left - v.left}px, ${a.top - v.top}px) scale(1)`, opacity: 0 },
        { transform: `translate(${a.left - v.left + 6}px, ${a.top - v.top - 6}px) scale(1.03) rotate(-1.5deg)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${b.left - v.left}px, ${b.top - v.top}px) scale(1) rotate(0)`, opacity: 1, offset: 0.86 },
        { transform: `translate(${b.left - v.left}px, ${b.top - v.top}px) scale(1)`, opacity: 0 },
      ],
      { duration: 1500, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    );
    window.setTimeout(() => {
      dropText.textContent = label;
      dropIcon?.setAttribute("href", item.querySelector("use")?.getAttribute("href") ?? "");
      el.dataset.step = "dropped";
    }, 1250);
  };
  whileVisible(
    el,
    () =>
      loop(
        [
          [400, pick],
          [3300, () => ((el.dataset.step = "rest"), (i = (i + 1) % items.length))],
        ],
        3600,
      ),
    0.35,
  );
}

/* ───────── Engine: trip cost with optional extras ───────── */

function initCost() {
  const el = $("[data-cost]");
  const totalEl = $("[data-cost-total]");
  if (!el || !totalEl) return;
  const base = 7200;
  const extras = $$<HTMLButtonElement>("[data-extra]", el);
  let shown = base;
  let raf = 0;

  const render = () => {
    const to = base + extras.reduce((sum, b) => sum + (b.getAttribute("aria-checked") === "true" ? Number(b.dataset.extra) : 0), 0);
    cancelAnimationFrame(raf);
    if (prefersReducedMotion) {
      shown = to;
      totalEl.textContent = money(to);
      return;
    }
    const from = shown;
    const start = performance.now();
    totalEl.classList.remove("is-bump");
    void totalEl.offsetWidth;
    totalEl.classList.add("is-bump");
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      totalEl.textContent = money(shown);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  let touched = false;
  extras.forEach((btn) =>
    btn.addEventListener("click", () => {
      touched = true;
      btn.setAttribute("aria-checked", String(btn.getAttribute("aria-checked") !== "true"));
      render();
    }),
  );

  if (prefersReducedMotion) return;
  // A one-time gentle demo so the interaction is discoverable.
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      window.setTimeout(() => {
        if (touched) return;
        extras[0]?.setAttribute("aria-checked", "true");
        render();
      }, 1400);
    },
    { threshold: 0.6 },
  );
  io.observe(el);
}

/* ───────── Engine: e-sign and pay ───────── */

function initSign() {
  const el = $("[data-sign]");
  if (!el) return;
  if (prefersReducedMotion) {
    el.dataset.step = "3";
    return;
  }
  whileVisible(
    el,
    () =>
      loop(
        [
          [0, () => (el.dataset.step = "0")],
          [300, () => (el.dataset.step = "1")],
          [2000, () => (el.dataset.step = "2")],
          [3000, () => (el.dataset.step = "3")],
        ],
        7000,
      ),
    0.35,
  );
}

/* ───────── Ambient loops: media, phones, flow ───────── */

function initAmbient() {
  ["[data-media]", "[data-flow]"].forEach((sel) => {
    const el = $(sel);
    if (el) whileVisible(el, () => undefined, 0.15);
  });

  const phones = $("[data-phones]");
  if (!phones) return;
  const screens = $$("img", $(".t9-phone--c", phones) ?? phones);
  whileVisible(
    phones,
    () => {
      if (prefersReducedMotion || screens.length < 2) return;
      let i = 0;
      const timer = window.setInterval(() => {
        i = (i + 1) % screens.length;
        screens.forEach((s, n) => s.classList.toggle("is-active", n === i));
      }, 3600);
      return () => window.clearInterval(timer);
    },
    0.2,
  );
}

initFan();
initStudio();
initImport();
initLibrary();
initCost();
initSign();
initAmbient();
