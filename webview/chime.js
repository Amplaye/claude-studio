/* Claude Studio — the sound for when the work is done.
   No audio files to ship: the sound is built here with Web Audio, so the
   extension stays light and the tone gets tweaked by changing a few numbers.

   Rule for the tone: warm, never shrill. Soft waves (triangle and sine), a
   low-pass that closes as the note dies, a thread of room around it.
   It has to carry across the desk without making you jump. */
(() => {
  let ctx;
  let master; // the chime's volume, rewritten on every play
  let wet; // how much of it goes into the room (the reverb)
  let last = 0;

  /* How far the slider pushes at maximum. The notes are born quiet (barely 0.25)
     so they don't smear into each other: without this push the slider at the end
     of its travel is still a whisper. There's a limiter downstream, so you can
     turn it up without the chords crackling. */
  const BOOST = 4.2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /**
   * The room: noise that fades out, filtered dark. It's a fake and very short
   * reverb, but it's what takes the phone-alarm feel out of the sound.
   */
  function room(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        // a single pole: enough to darken the noise and take the hiss off it
        prev = prev * 0.72 + white * 0.28;
        d[i] = prev * Math.pow(1 - i / n, 2.6);
      }
    }
    return buf;
  }

  function boot() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (_) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.6 * BOOST;

    /* The limiter: keeps the peaks under zero when several notes stack up.
       It's what lets you turn the volume up without hearing the "crack". */
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.18;
    master.connect(lim);
    lim.connect(ctx.destination);

    const conv = ctx.createConvolver();
    conv.buffer = room(1.1);
    wet = ctx.createGain();
    wet.gain.value = 0.3;
    wet.connect(conv);
    conv.connect(master);
    return ctx;
  }

  /** One note: soft body, an octave below for warmth, a tail that closes. */
  function note(t0, freq, o) {
    const dur = o.dur || 0.9;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(o.cut || 1700, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, (o.cut || 1700) * 0.32), t0 + dur);

    const osc = ctx.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);

    if (o.sub !== false) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq / 2;
      const sg = ctx.createGain();
      sg.gain.value = 0.3;
      sub.connect(sg);
      sg.connect(g);
      sub.start(t0);
      sub.stop(t0 + dur + 0.1);
    }

    // Short attack but not abrupt, and an exponential decay: that's the difference
    // between a bell and a beep.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.25, t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(f);
    f.connect(master);
    f.connect(wet);
  }

  /** The touch of the striker: a very short breath, under the first note. */
  function breath(t0) {
    const n = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  /* The sounds. `ask` is always the short, lower version: it's there to say
     "I'm stuck here", not "I'm done". */
  const SOUNDS = {
    /* Cozy — the original, three warm notes going up */
    cozy(t, ev) {
      const notes = ev === 'ask' ? [523.25, 392.0] : [392.0, 523.25, 659.25];
      notes.forEach((f, i) =>
        note(t + i * 0.085, f, { dur: 1.15 - i * 0.1, gain: 0.26, type: 'triangle', cut: 1700 })
      );
      breath(t);
    },
    /* Harvest — inspired by the harvesting sound in Stardew Valley:
       two sweet notes rising fast, like when you pick a fruit */
    harvest(t, ev) {
      if (ev === 'ask') {
        note(t, 587.33, { dur: 0.3, gain: 0.22, type: 'sine', cut: 2200, sub: false });
        note(t + 0.08, 698.46, { dur: 0.4, gain: 0.18, type: 'sine', cut: 1800, sub: false });
      } else {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          note(t + i * 0.065, f, { dur: 0.5 - i * 0.08, gain: 0.2 - i * 0.03, type: 'sine', cut: 2400 - i * 300, sub: false })
        );
      }
      breath(t);
    },
    /* Level up — inspired by the level-up fanfare:
       a major chord arpeggiated with an echo */
    levelup(t, ev) {
      if (ev === 'ask') {
        note(t, 440.0, { dur: 0.5, gain: 0.2, type: 'triangle', cut: 1600 });
        note(t + 0.12, 554.37, { dur: 0.5, gain: 0.18, type: 'triangle', cut: 1400 });
      } else {
        const chord = [392.0, 493.88, 587.33, 783.99];
        chord.forEach((f, i) =>
          note(t + i * 0.1, f, { dur: 1.4 - i * 0.2, gain: 0.24 - i * 0.04, type: 'triangle', cut: 2000, sub: i === 0 })
        );
        breath(t);
      }
    },
    /* Starlit — inspired by the night star in Stardew:
       a short, crystalline chime */
    starlit(t, ev) {
      if (ev === 'ask') {
        note(t, 1046.5, { dur: 0.35, gain: 0.14, type: 'sine', cut: 3200, sub: false });
      } else {
        [1318.5, 1567.98, 1318.5, 1046.5].forEach((f, i) =>
          note(t + i * 0.09, f, { dur: 0.6, gain: 0.13, type: 'sine', cut: 3000, sub: false })
        );
      }
    },
    /* Chest — inspired by opening a treasure chest:
       a low note climbing to a high major, triumphant */
    chest(t, ev) {
      if (ev === 'ask') {
        note(t, 329.63, { dur: 0.6, gain: 0.22, type: 'triangle', cut: 1500 });
        note(t + 0.15, 440.0, { dur: 0.5, gain: 0.2, type: 'triangle', cut: 1400 });
      } else {
        note(t, 261.63, { dur: 1.2, gain: 0.2, type: 'triangle', cut: 1600 });
        note(t + 0.12, 329.63, { dur: 1.0, gain: 0.22, type: 'triangle', cut: 1800 });
        note(t + 0.24, 392.0, { dur: 0.9, gain: 0.24, type: 'triangle', cut: 2000 });
        note(t + 0.40, 523.25, { dur: 1.1, gain: 0.26, type: 'triangle', cut: 2200 });
        breath(t);
      }
    },
  };

  /**
   * The audio context is born muted until you've touched the page: that's a
   * browser rule, not a whim. It wakes up on the first click or the first
   * keystroke, which come before any answer worth waiting for anyway.
   */
  function unlock() {
    const c = boot();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function play(name, ev, volume) {
    if (!name || name === 'off') return;
    const now = Date.now();
    if (now - last < 400) return; // two chimes stuck together sound like a fault
    last = now;

    const c = boot();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const make = SOUNDS[name];
    if (!make) return;

    const t = c.currentTime + 0.02;
    master.gain.setValueAtTime(clamp(volume == null ? 0.6 : volume, 0, 1) * BOOST, t);
    make(t, ev === 'ask' ? 'ask' : 'done');
  }

  window.Chime = { play, unlock, names: Object.keys(SOUNDS) };
})();
