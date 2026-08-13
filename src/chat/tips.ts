// The "Did you know?" line on the new-session screen.
//
// Two decisions worth writing down.
//
// The tips are picked here, in the extension, and not in the webview. There are a few
// thousand of them: shipping the whole library into every panel would mean parsing
// half a megabyte of JSON on each open, to read one sentence. The webview is handed
// the single line it is going to draw.
//
// And they are drawn from a bag, not with Math.random(). Random repeats: with a fresh
// draw every time you would see the same tip twice in an evening and never see most of
// them at all. The bag holds every index, shuffled; each new session pops one, and the
// bag only refills once it is empty. The remainder lives in globalState, so closing
// VS Code does not start the cycle over — you genuinely get a different one each time
// until you have seen them all.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** One tip in the two languages the interface speaks. */
export interface Tip {
  en: string;
  it: string;
}

const BAG_KEY = 'claudeStudio.tipBag';
/** Bumped when the library changes, so an old bag of indices is not reused against it. */
const SIZE_KEY = 'claudeStudio.tipBagSize';

class TipBag {
  private ctx?: vscode.ExtensionContext;
  private tips: Tip[] | null = null;

  init(ctx: vscode.ExtensionContext) {
    this.ctx = ctx;
  }

  /** Read once and kept. A missing or broken file costs the tip, never the panel. */
  private all(): Tip[] {
    if (this.tips) return this.tips;
    this.tips = [];
    try {
      const file = path.join(this.ctx!.extensionUri.fsPath, 'media', 'tips.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw)) {
        this.tips = raw.filter(
          (x: unknown): x is Tip =>
            !!x &&
            typeof (x as Tip).en === 'string' &&
            typeof (x as Tip).it === 'string' &&
            !!(x as Tip).en &&
            !!(x as Tip).it
        );
      }
    } catch {
      /* no library shipped, or it is unreadable: the screen simply has no tip */
    }
    return this.tips;
  }

  /**
   * The next tip, or null if there is no library. Never throws: this is decoration on
   * an empty screen, and a broken tip must not be able to stop the chat from opening.
   */
  next(): Tip | null {
    try {
      const tips = this.all();
      if (!tips.length || !this.ctx) return null;
      const store = this.ctx.globalState;

      // A library that changed size invalidates the leftover indices: they could point
      // past the end, or systematically skip whatever was appended.
      let bag = store.get<number[]>(BAG_KEY);
      const size = store.get<number>(SIZE_KEY);
      if (!Array.isArray(bag) || size !== tips.length) bag = [];

      if (!bag.length) {
        bag = tips.map((_, i) => i);
        // Fisher-Yates: every order equally likely, and no sort-comparator folklore.
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }

      const pick = bag.pop()!;
      void store.update(BAG_KEY, bag);
      void store.update(SIZE_KEY, tips.length);
      return tips[pick] ?? null;
    } catch {
      return null;
    }
  }

  /** How many the library holds — used by the checks, not by the interface. */
  count(): number {
    return this.all().length;
  }
}

export const tips = new TipBag();
