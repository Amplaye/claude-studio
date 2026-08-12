// Who actually makes the noise.
//
// The sound is built with Web Audio inside a webview, and a browser won't let a
// page make a sound until you've touched it — that's a rule, not a setting. So the
// end-of-work chime used to go to "the tab of this conversation", which with two or
// three sessions open is often a tab you've never clicked in: the message arrived,
// the page tried to play, the audio context was still asleep, and you heard nothing.
//
// Here every chat page in the window says whether it can make a sound and whether
// it's on screen, and the chime goes to one that can. It doesn't matter which
// conversation finished: what matters is that you hear that one did.
import type { Wire } from '../engine/protocol';

export interface Speaker {
  post(e: Wire): void;
  /** The page has been touched at least once: its audio is awake. */
  ready(): boolean;
  /** The page is on screen right now. */
  visible(): boolean;
}

class SoundBus {
  private speakers = new Set<Speaker>();

  add(s: Speaker): { dispose(): void } {
    this.speakers.add(s);
    return { dispose: () => this.speakers.delete(s) };
  }

  /**
   * One page plays, and only one: two pages playing the same chime a few
   * milliseconds apart sounds like a fault, not like a confirmation.
   *
   * The order is "who will really be heard": awake and on screen first, then just
   * awake (a background page whose audio works still carries across the desk),
   * then anyone at all — if nobody in the window has ever been touched there's
   * nothing to lose by trying.
   */
  play(e: Wire): boolean {
    const all = [...this.speakers];
    const target =
      all.find((s) => s.ready() && s.visible()) ??
      all.find((s) => s.ready()) ??
      all.find((s) => s.visible()) ??
      all[0];
    if (!target) return false;
    target.post(e);
    return true;
  }
}

export const sound = new SoundBus();
