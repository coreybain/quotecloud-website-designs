/* Split-flap (Solari) display.
   Each character is a cell of four half-cards: two static halves and two hinged flaps
   that rotate in 3D. Real text lives in a visually hidden span; the cells are aria-hidden. */

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const STEP_MS = 78; // one flap, crisp
const STAGGER_MS = 22; // left-to-right ripple

const rand = (n: number) => Math.floor(Math.random() * n);

class Cell {
  root: HTMLSpanElement;
  private top: HTMLElement;
  private bottom: HTMLElement;
  private flapTop: HTMLElement;
  private flapBottom: HTMLElement;
  private chain: Promise<void> = Promise.resolve();
  private token = 0;
  cur = " ";

  constructor(initial: string) {
    this.root = document.createElement("span");
    this.root.className = "sf__c";
    this.root.innerHTML =
      '<span class="sf__h sf__t"><b></b></span><span class="sf__h sf__b"><b></b></span>' +
      '<span class="sf__f sf__ft"><b></b></span><span class="sf__f sf__fb"><b></b></span>';
    const [t, b, ft, fb] = [...this.root.children] as HTMLElement[];
    this.top = t.firstElementChild as HTMLElement;
    this.bottom = b.firstElementChild as HTMLElement;
    this.flapTop = ft;
    this.flapBottom = fb;
    this.setNow(initial);
  }

  setNow(ch: string) {
    this.token++;
    this.cur = ch;
    this.top.textContent = ch;
    this.bottom.textContent = ch;
    this.flapTop.style.visibility = this.flapBottom.style.visibility = "hidden";
    this.flapTop.getAnimations().forEach((a) => a.cancel());
    this.flapBottom.getAnimations().forEach((a) => a.cancel());
    this.chain = Promise.resolve();
  }

  private async step(next: string, ms: number) {
    const cur = this.cur;
    const ftB = this.flapTop.firstElementChild as HTMLElement;
    const fbB = this.flapBottom.firstElementChild as HTMLElement;
    this.top.textContent = next;
    this.bottom.textContent = cur;
    ftB.textContent = cur;
    fbB.textContent = next;
    this.flapTop.style.visibility = this.flapBottom.style.visibility = "visible";
    const half = ms / 2;
    this.flapTop.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], {
      duration: half,
      easing: "cubic-bezier(.5,0,.9,.5)",
      fill: "forwards",
    });
    const down = this.flapBottom.animate(
      [
        { transform: "rotateX(90deg)" },
        { transform: "rotateX(-8deg)", offset: 0.78 },
        { transform: "rotateX(0deg)" },
      ],
      { duration: half * 1.25, delay: half, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
    );
    await down.finished.catch(() => {});
    this.bottom.textContent = next;
    this.cur = next;
    this.flapTop.style.visibility = this.flapBottom.style.visibility = "hidden";
    this.flapTop.getAnimations().forEach((a) => a.cancel());
    down.cancel();
  }

  flipTo(target: string, delay: number, spins: number) {
    if (target === this.cur) return this.chain;
    const token = this.token;
    const seq: string[] = [];
    for (let i = 0; i < spins; i++) seq.push(CHARSET[rand(CHARSET.length)]);
    seq.push(target);
    this.chain = this.chain.then(async () => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      for (let i = 0; i < seq.length; i++) {
        if (token !== this.token) return;
        await this.step(seq[i], i === seq.length - 1 ? STEP_MS * 1.5 : STEP_MS);
      }
    });
    return this.chain;
  }
}

export class SplitFlap {
  readonly el: HTMLElement;
  readonly length: number;
  private sr: HTMLSpanElement;
  private cells: Cell[] = [];
  value: string;

  /** Builds cells inside `el`. `blank` starts every cell empty so the first `set` flips in. */
  constructor(el: HTMLElement, blank = false) {
    this.el = el;
    this.value = (el.textContent ?? "").trim();
    this.length = Number(el.dataset.sfLen) || this.value.length;
    el.textContent = "";
    this.sr = document.createElement("span");
    this.sr.className = "qc-sr-only";
    this.sr.textContent = this.value;
    const cells = document.createElement("span");
    cells.className = "sf__cells";
    cells.setAttribute("aria-hidden", "true");
    const padded = this.pad(blank ? "" : this.value);
    for (const ch of padded) {
      const cell = new Cell(ch);
      this.cells.push(cell);
      cells.append(cell.root);
    }
    el.append(this.sr, cells);
    el.classList.add("is-built");
  }

  private pad(text: string) {
    return text.toUpperCase().padEnd(this.length, " ").slice(0, this.length);
  }

  /** Flip to `text`. Returns when every cell has landed. */
  set(text: string, { instant = false, spins = [1, 4] as [number, number], stagger = STAGGER_MS } = {}) {
    this.value = text;
    this.sr.textContent = text;
    const padded = this.pad(text);
    if (instant) {
      this.cells.forEach((c, i) => c.setNow(padded[i]));
      return Promise.resolve();
    }
    const jobs = this.cells.map((c, i) => {
      if (c.cur === padded[i]) return Promise.resolve();
      const n = spins[0] + rand(spins[1] - spins[0] + 1);
      return c.flipTo(padded[i], i * stagger, padded[i] === " " ? Math.min(n, 1) : n);
    });
    return Promise.all(jobs).then(() => undefined);
  }
}
