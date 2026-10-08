/* Hero: Consultant | Traveller toggle with shared-element (FLIP) morphing, auto-cycle and scripted scenes. */

type Side = "consultant" | "traveller";

const EASE = "cubic-bezier(.3,.9,.3,1)";
const FLIP_MS = 780;
const DWELL: Record<Side, number> = { consultant: 7800, traveller: 10200 };

export function money(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Tween the text of one or more elements between two dollar amounts. */
export function tweenMoney(els: Element[], from: number, to: number, ms = 700) {
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * e;
    els.forEach((el) => (el.textContent = money(v)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initHero(reduced: boolean) {
  const stageEl = document.querySelector<HTMLElement>("#stage");
  const segEl = document.querySelector<HTMLElement>(".seg");
  if (!stageEl || !segEl) return;
  const stage: HTMLElement = stageEl;
  const seg: HTMLElement = segEl;

  const tabs = [...seg.querySelectorAll<HTMLButtonElement>(".seg__tab")];
  const progress = seg.querySelector<HTMLElement>(".seg__progress")!;
  const pauseBtn = document.querySelector<HTMLButtonElement>(".seg-pause");
  const body = stage.querySelector<HTMLElement>(".win__body")!;
  const cur = body.querySelector<HTMLElement>(".cur:not(.cur--b)")!;
  const curB = body.querySelector<HTMLElement>(".cur--b")!;
  const ghost = body.querySelector<HTMLElement>(".drag-ghost")!;
  const flipEls = [...stage.querySelectorAll<HTMLElement>("[data-flip]")];
  const totals = [...stage.querySelectorAll<HTMLElement>("[data-total]")];

  let side: Side = (stage.dataset.side as Side) || "consultant";
  let auto = !reduced; // auto-alternating
  let paused = reduced; // all motion paused (pause button)
  let visible = true;
  let hovering = false;
  let token = 0;
  let progressAnim: Animation | null = null;
  let running: Animation[] = [];

  /* ── helpers ── */

  const wait = (ms: number, t: number) =>
    new Promise<boolean>((res) => setTimeout(() => res(t === token), ms));

  const isShown = (el: Element | null): el is HTMLElement =>
    !!el && (el as HTMLElement).offsetParent !== null && el.getClientRects().length > 0;

  function pointIn(el: Element, fx = 0.5, fy = 0.5) {
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - b.left + r.width * fx, y: r.top - b.top + r.height * fy };
  }

  function place(el: HTMLElement, p: { x: number; y: number }, ms = 0) {
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,0,.2,1), opacity .3s` : "opacity .3s";
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  function hideCursors() {
    [cur, curB, ghost].forEach((c) => c.classList.remove("is-on", "is-press"));
  }

  async function click(t: number, target?: HTMLElement) {
    cur.classList.add("is-press");
    target?.classList.add("is-press");
    const ok = await wait(180, t);
    cur.classList.remove("is-press");
    target?.classList.remove("is-press");
    return ok;
  }

  /* ── state resets ── */

  function resetConsultant() {
    body.querySelector(".sg--drop")?.classList.remove("is-dropped");
    body.querySelectorAll(".tile.is-hot").forEach((e) => e.classList.remove("is-hot"));
    body.querySelectorAll(".lib__list li").forEach((e) => e.classList.remove("is-hot", "is-added"));
    body.querySelector(".doc__title")?.classList.remove("is-sel");
    body.querySelector(".doc__guide")?.classList.remove("is-flash");
  }

  const ASK = "Could we add a sunset dinner on the last night?";
  function resetTraveller() {
    body.querySelectorAll<HTMLElement>(".opt").forEach((o) => o.classList.toggle("is-sel", o.dataset.opt === "garden"));
    totals.forEach((e) => (e.textContent = money(8240)));
    body.querySelectorAll("[data-act]").forEach((e) => e.classList.remove("is-on"));
    const compose = body.querySelector<HTMLElement>('[data-act="compose"]');
    if (compose) compose.textContent = "Ask Jess a question";
    body.querySelector(".act__compose")?.classList.remove("is-typing");
    stage.querySelectorAll(".is-signed").forEach((e) => e.classList.remove("is-signed"));
    body.querySelector(".doc__title")?.classList.remove("is-sel");
  }

  /* ── scenes ── */

  async function consultantScene(t: number) {
    resetConsultant();
    const tile = body.querySelector<HTMLElement>('.tile[data-seg="tour"]');
    const drop = body.querySelector<HTMLElement>(".sg--drop");
    if (!isShown(tile) || !isShown(drop)) return;

    place(cur, pointIn(body, 0.5, 0.8));
    if (!(await wait(450, t))) return;
    cur.classList.add("is-on");
    place(cur, pointIn(tile, 0.55, 0.55), 900);
    if (!(await wait(1000, t))) return;

    tile.classList.add("is-hot");
    if (!(await click(t))) return;
    const start = pointIn(tile, 0.2, 0.2);
    place(ghost, start);
    ghost.classList.add("is-on");
    const end = pointIn(drop, 0.42, 0.1);
    place(cur, { x: end.x + 26, y: end.y + 14 }, 1000);
    place(ghost, end, 1000);
    if (!(await wait(1050, t))) return;
    ghost.classList.remove("is-on");
    tile.classList.remove("is-hot");
    drop.classList.add("is-dropped");
    if (!(await wait(700, t))) return;

    const lib = body.querySelector<HTMLElement>('.lib__list li[data-lib="guide"]');
    if (isShown(lib)) {
      place(cur, pointIn(lib, 0.4, 0.55), 900);
      if (!(await wait(950, t))) return;
      lib.classList.add("is-hot");
      if (!(await click(t))) return;
      lib.classList.add("is-added");
      const guide = body.querySelector<HTMLElement>(".doc__guide");
      guide?.classList.add("is-flash");
      if (!(await wait(900, t))) return;
      guide?.classList.remove("is-flash");
      lib.classList.remove("is-hot");
    }

    // A colleague joins and selects the title
    const title = body.querySelector<HTMLElement>(".doc__title");
    if (isShown(title)) {
      cur.classList.remove("is-on");
      const p = pointIn(title, 0.9, 1.1);
      place(curB, { x: p.x + 160, y: p.y + 120 });
      curB.classList.add("is-on");
      place(curB, p, 1000);
      if (!(await wait(1100, t))) return;
      title.classList.add("is-sel");
      if (!(await wait(1500, t))) return;
      title.classList.remove("is-sel");
      curB.classList.remove("is-on");
    }
    hideCursors();
  }

  async function travellerScene(t: number) {
    resetTraveller();
    const water = body.querySelector<HTMLElement>('.opt[data-opt="water"]');
    const garden = body.querySelector<HTMLElement>('.opt[data-opt="garden"]');
    if (!isShown(water) || !garden) return;

    place(cur, pointIn(body, 0.5, 0.35));
    if (!(await wait(600, t))) return;
    cur.classList.add("is-on");
    place(cur, pointIn(water, 0.6, 0.6), 900);
    if (!(await wait(1000, t))) return;
    if (!(await click(t, water))) return;
    garden.classList.remove("is-sel");
    water.classList.add("is-sel");
    tweenMoney(totals, 8240, 9180);
    if (!(await wait(900, t))) return;

    const ask = body.querySelector<HTMLElement>('[data-act="ask"]')!;
    const typing = body.querySelector<HTMLElement>('[data-act="typing"]')!;
    const reply = body.querySelector<HTMLElement>('[data-act="reply"]')!;
    const composeBox = body.querySelector<HTMLElement>(".act__compose");
    const compose = body.querySelector<HTMLElement>('[data-act="compose"]');

    if (isShown(composeBox) && compose) {
      place(cur, pointIn(composeBox, 0.3, 0.55), 900);
      if (!(await wait(950, t))) return;
      if (!(await click(t))) return;
      composeBox.classList.add("is-typing");
      cur.classList.remove("is-on");
      for (let i = 1; i <= ASK.length; i++) {
        compose.textContent = ASK.slice(0, i);
        if (!(await wait(22, t))) return;
      }
      if (!(await wait(250, t))) return;
      composeBox.classList.remove("is-typing");
      compose.textContent = "Ask Jess a question";
    } else {
      cur.classList.remove("is-on");
    }
    ask.classList.add("is-on");
    if (!(await wait(450, t))) return;
    typing.classList.add("is-on");
    if (!(await wait(1000, t))) return;
    typing.classList.remove("is-on");
    reply.classList.add("is-on");
    if (!(await wait(700, t))) return;

    // Accept & sign: on the phone on wide screens, in the side panel otherwise
    const phone = stage.querySelector<HTMLElement>(".phone--hero");
    const actSign = body.querySelector<HTMLElement>(".act__sign");
    if (isShown(phone)) {
      const btn = phone.querySelector<HTMLElement>(".sbtn");
      btn?.classList.add("is-press");
      if (!(await wait(200, t))) return;
      btn?.classList.remove("is-press");
      phone.classList.add("is-signed");
    } else if (isShown(actSign)) {
      const btn = actSign.querySelector<HTMLElement>(".sbtn")!;
      place(cur, pointIn(btn, 0.5, 0.6), 900);
      cur.classList.add("is-on");
      if (!(await wait(950, t))) return;
      if (!(await click(t, btn))) return;
      actSign.classList.add("is-signed");
      if (!(await wait(900, t))) return;
      cur.classList.remove("is-on");
    }
  }

  async function runScene() {
    const t = ++token;
    hideCursors();
    if (paused || !visible) return;
    if (!(await wait(FLIP_MS + 120, t))) return;
    do {
      if (side === "consultant") await consultantScene(t);
      else await travellerScene(t);
      // Without auto-switching, keep the current side alive with a gentle loop
      if (auto || t !== token) return;
      if (!(await wait(2600, t))) return;
    } while (t === token && !paused && visible);
  }

  /* ── FLIP ── */

  function flipTo(next: Side) {
    const first = flipEls.map((el) => el.getBoundingClientRect());
    running.forEach((a) => a.cancel());
    running = [];

    stage.dataset.side = next;
    if (reduced) return;

    flipEls.forEach((el, i) => {
      const f = first[i];
      const l = el.getBoundingClientRect();
      if (!l.width || !l.height || !f.width || !f.height) return;
      const mode = el.dataset.flip;
      let dx = f.left - l.left;
      const dy = f.top - l.top;
      const opts: KeyframeAnimationOptions = { duration: FLIP_MS, easing: EASE, delay: i * 14, fill: "backwards" };
      let a: Animation;

      if (mode === "media") {
        const s = Math.max(f.width / l.width, f.height / l.height);
        const ix = Math.max(0, (l.width - f.width / s) / 2);
        const iy = Math.max(0, (l.height - f.height / s) / 2);
        dx -= s * ix;
        const ty = dy - s * iy;
        a = el.animate(
          [
            { transform: `translate(${dx}px, ${ty}px) scale(${s})`, clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px)` },
            { transform: "none", clipPath: "inset(0px 0px 0px 0px)" },
          ],
          opts,
        );
      } else if (mode === "text") {
        const s = f.width / l.width;
        a = el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }], opts);
      } else if (mode === "box") {
        a = el.animate(
          [{ transform: `translate(${dx}px, ${dy}px) scale(${f.width / l.width}, ${f.height / l.height})` }, { transform: "none" }],
          opts,
        );
      } else {
        a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opts);
        try {
          running.push(
            el.animate([{ transform: `scale(${f.width / l.width}, ${f.height / l.height})` }, { transform: "none" }], {
              ...opts,
              pseudoElement: "::before",
            }),
          );
        } catch {
          /* pseudo-element animation unsupported: translate only */
        }
      }
      running.push(a);
    });
  }

  /* ── switching ── */

  function select(next: Side, focus = false) {
    tabs.forEach((tab) => {
      const on = tab.dataset.side === next;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) {
        stage.setAttribute("aria-labelledby", tab.id);
        if (focus) tab.focus();
      }
    });
    stage.querySelectorAll<HTMLElement>("[data-sr]").forEach((p) => (p.hidden = p.dataset.sr !== next));
    seg.dataset.side = next;
    if (next === side) return;
    side = next;
    hideCursors();
    token++;
    flipTo(next);
    if (next === "traveller") resetTraveller();
    else resetConsultant();
    runScene();
    restartProgress();
  }

  function restartProgress() {
    progressAnim?.cancel();
    progressAnim = null;
    if (!auto || paused) return;
    progressAnim = progress.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: DWELL[side],
      easing: "linear",
      fill: "forwards",
    });
    progressAnim.onfinish = () => {
      if (auto && !paused) select(side === "consultant" ? "traveller" : "consultant");
    };
    syncProgress();
  }

  function syncProgress() {
    if (!progressAnim) return;
    if (visible && !hovering && !paused) progressAnim.play();
    else progressAnim.pause();
  }

  function stopAuto() {
    if (!auto) return;
    auto = false;
    progressAnim?.cancel();
    progressAnim = null;
  }

  /* ── events ── */

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      stopAuto();
      select(tab.dataset.side as Side);
      if (!paused && side === tab.dataset.side) {
        /* already on this side: make sure its scene is alive */
      }
    });
    tab.addEventListener("keydown", (e) => {
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      stopAuto();
      select(tabs[j].dataset.side as Side, true);
    });
  });

  function setPaused(p: boolean) {
    paused = p;
    if (pauseBtn) {
      pauseBtn.dataset.paused = String(p);
      pauseBtn.setAttribute("aria-label", p ? "Play the animation" : "Pause the animation");
    }
    if (p) {
      token++;
      hideCursors();
      progressAnim?.pause();
    } else {
      if (!progressAnim) {
        auto = true;
        restartProgress();
      } else syncProgress();
      runScene();
    }
  }
  pauseBtn?.addEventListener("click", () => setPaused(!paused));
  if (pauseBtn) pauseBtn.setAttribute("aria-label", "Pause the animation");

  stage.addEventListener("pointerenter", () => {
    hovering = true;
    syncProgress();
  });
  stage.addEventListener("pointerleave", () => {
    hovering = false;
    syncProgress();
  });

  function setVisible(v: boolean) {
    if (v === visible) return;
    visible = v;
    syncProgress();
    if (v) runScene();
    else {
      token++;
      hideCursors();
    }
  }
  new IntersectionObserver((entries) => entries.forEach((en) => setVisible(en.isIntersecting && !document.hidden)), {
    threshold: 0.15,
  }).observe(stage);
  document.addEventListener("visibilitychange", () => {
    const r = stage.getBoundingClientRect();
    setVisible(!document.hidden && r.bottom > 0 && r.top < innerHeight);
  });

  // Keep the cursor honest if the layout changes under it
  let rz = 0;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      if (!paused && visible) runScene();
    }, 250);
  });

  /* ── start ── */

  if (pauseBtn && reduced) {
    pauseBtn.dataset.paused = "true";
    pauseBtn.setAttribute("aria-label", "Play the animation");
  }
  resetTraveller();
  resetConsultant();
  stage.querySelectorAll<HTMLElement>(".opt").forEach((o) => o.classList.toggle("is-sel", o.dataset.opt === "garden"));
  if (!reduced) {
    restartProgress();
    runScene();
  }
}
