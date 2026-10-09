import { onceVisible, prefersReducedMotion } from "../../src/shared/site.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/* ───────── Tone + Assistant Rules ───────── */

type Tone = "neutral" | "friendly" | "professional" | "concise" | "persuasive" | "technical";

/** sample answers to "Suggest next steps for client": full and concise versions per tone */
const STEPS: Record<Tone, { full: string[]; short: string[] }> = {
  neutral: {
    full: [
      "Confirm the go-live order for the three depots.",
      "Send a sample job export so the data migration and UAT can be planned.",
      "Sign the proposal to book the March kickoff with your stakeholders.",
    ],
    short: ["Confirm the depot go-live order.", "Send a sample job export.", "Sign to book the March kickoff."],
  },
  friendly: {
    full: [
      "Let us know which depot you'd like to go live first.",
      "Pop over a sample job export and we'll plan the data migration and UAT around it.",
      "Once you're happy, sign the proposal and we'll lock in March with your stakeholders.",
    ],
    short: ["Tell us which depot goes first.", "Send over a sample job export.", "Sign when you're happy and we'll lock in March."],
  },
  professional: {
    full: [
      "Please confirm the preferred go-live sequence for the three depots.",
      "Provide a representative job export to inform data migration and UAT planning.",
      "Countersign the proposal to secure the March kickoff with your stakeholders.",
    ],
    short: ["Confirm the go-live sequence.", "Provide a representative job export.", "Countersign to secure the March kickoff."],
  },
  concise: {
    full: ["Confirm the depot go-live order.", "Share a sample job export for migration and UAT.", "Sign to secure a March kickoff."],
    short: ["Confirm depot order.", "Share a job export.", "Sign for March."],
  },
  persuasive: {
    full: [
      "Pick the first depot to go live, and your dispatchers start saving time within weeks.",
      "Share a sample job export so your history moves across intact and UAT is a formality.",
      "Sign this week to secure the March kickoff before the rollout calendar fills up for your stakeholders.",
    ],
    short: ["Pick the first depot and start saving time.", "Share a job export to keep your history.", "Sign this week to secure March."],
  },
  technical: {
    full: [
      "Confirm depot IDs and go-live sequence for tenant configuration.",
      "Provide a representative job export (CSV) for field mapping and UAT.",
      "Countersign to schedule kickoff and the onboarding cadence with your stakeholders.",
    ],
    short: ["Confirm depot IDs and sequence.", "Provide a CSV job export for field mapping.", "Countersign to schedule kickoff."],
  },
};

const PLAIN: [RegExp, string][] = [
  [/data migration and UAT planning/g, "moving your data and testing"],
  [/data migration and UAT/g, "moving your data and testing"],
  [/migration and UAT/g, "moving your data and testing"],
  [/field mapping and UAT/g, "matching your data fields and testing"],
  [/tenant configuration/g, "setup"],
  [/the onboarding cadence/g, "the training plan"],
  [/onboarding cadence/g, "training plan"],
  [/Depot IDs/g, "Depot details"],
  [/depot IDs/g, "depot details"],
  [/go-live/g, "launch"],
  [/ \(CSV\)/g, ""],
  [/CSV /g, ""],
  [/UAT/g, "testing"],
  [/Countersign/g, "Sign"],
  [/with your stakeholders/g, "with your team"],
  [/stakeholders/g, "team"],
];

const TONE_LABEL: Record<Tone, string> = {
  neutral: "Neutral",
  friendly: "Friendly",
  professional: "Professional",
  concise: "Concise",
  persuasive: "Persuasive",
  technical: "Technical",
};

function initRules() {
  const form = $<HTMLFormElement>("#ac-settings");
  const out = $("#ac-preview-text");
  const foot = $("#ac-preview-foot");
  const save = $<HTMLButtonElement>("#ac-save");
  if (!form || !out || !foot || !save) return;

  const render = () => {
    const tone = (form.querySelector<HTMLInputElement>('input[name="ac-rtone"]:checked')?.value ?? "professional") as Tone;
    const rules = new Set($$<HTMLInputElement>('input[name="ac-rule"]:checked', form).map((i) => i.value));
    let items = rules.has("concise") ? STEPS[tone].short : STEPS[tone].full;
    if (rules.has("jargon")) items = items.map((s) => PLAIN.reduce((acc, [re, to]) => acc.replace(re, to), s));

    const el = document.createElement(rules.has("bullets") ? "ul" : "p");
    if (rules.has("bullets"))
      items.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        el.append(li);
      });
    else el.textContent = items.join(" ");

    if (!prefersReducedMotion) {
      el.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    out.replaceChildren(el);

    const bits = [TONE_LABEL[tone]];
    if (rules.has("concise")) bits.push("concise");
    if (rules.has("bullets")) bits.push("bullet points");
    if (rules.has("jargon")) bits.push("no jargon");
    foot.textContent = bits.join(" · ");

    save.classList.remove("is-saved");
    save.querySelector("span")!.textContent = "Save Settings";
  };

  form.addEventListener("change", render);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    save.classList.add("is-saved");
    save.querySelector("span")!.textContent = "Saved";
  });
}

/* ───────── Human + AI review bar ───────── */

function initReview() {
  const seg = $("#ac-seg-ai");
  const text = $("#ac-seg-text");
  const done = $("#ac-rdone");
  const reset = $<HTMLButtonElement>("#ac-rreset");
  const bar = $("#ac-rbar");
  if (!seg || !text || !done || !reset || !bar) return;
  const editBtn = $<HTMLButtonElement>('[data-review="edit"]', bar)!;
  const editLabel = $("span", editBtn)!;
  const original = text.textContent ?? "";

  const finish = (state: "accepted" | "rejected", msg: string) => {
    text.contentEditable = "false";
    editLabel.textContent = "Edit";
    seg.dataset.state = state;
    done.textContent = msg;
    reset.hidden = false;
    reset.focus({ preventScroll: true });
  };

  bar.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-review]");
    if (!btn) return;
    const what = btn.dataset.review;
    if (what === "accept") {
      const edited = text.contentEditable === "true" || text.textContent !== original;
      finish("accepted", edited ? "Edited and accepted by you. It's now part of the proposal." : "Accepted by you. It's now part of the proposal.");
    } else if (what === "reject") {
      finish("rejected", "Removed. Nothing was added to the document.");
    } else if (text.contentEditable === "true") {
      finish("accepted", "Edited and accepted by you. It's now part of the proposal.");
    } else {
      text.contentEditable = "true";
      editLabel.textContent = "Done";
      text.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(text);
        sel.collapseToEnd();
      }
    }
  });

  reset.addEventListener("click", () => {
    seg.dataset.state = "review";
    text.textContent = original;
    done.textContent = "";
    reset.hidden = true;
    $<HTMLButtonElement>('[data-review="accept"]', bar)?.focus({ preventScroll: true });
  });
}

/* ───────── Send, viewed, signed ───────── */

function initSend() {
  const card = $("#ac-sendcard");
  const btn = $<HTMLButtonElement>("#ac-send-go");
  if (!card || !btn) return;
  const label = $("span", btn)!;
  let timers: number[] = [];
  let ran = false;

  const run = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    ran = true;
    if (prefersReducedMotion) {
      card.dataset.step = "3";
      label.textContent = "Send again";
      return;
    }
    card.dataset.step = "0";
    btn.disabled = true;
    label.textContent = "Sending...";
    [1, 2, 3].forEach((n) =>
      timers.push(
        window.setTimeout(() => {
          card.dataset.step = String(n);
          if (n === 1) label.textContent = "Sent";
          if (n === 3) {
            label.textContent = "Send again";
            btn.disabled = false;
          }
        }, 450 + (n - 1) * 1100),
      ),
    );
  };

  btn.addEventListener("click", run);
  onceVisible(card, () => window.setTimeout(() => !ran && run(), 600), 0.55);
}

export function initSections() {
  initRules();
  initReview();
  initSend();
}
