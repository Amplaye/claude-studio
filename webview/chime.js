/* Claude Studio — il suono di fine lavoro.
   Niente file audio da spedire: il suono si costruisce qui con Web Audio, cosi'
   l'estensione resta leggera e il timbro si ritocca cambiando dei numeri.

   Regola del timbro: caldo, mai squillante. Onde morbide (triangolo e seno), un
   passa-basso che si chiude mentre la nota muore, un filo di stanza intorno.
   Deve farsi sentire dall'altra parte della scrivania senza far sobbalzare. */
(() => {
  let ctx;
  let master; // il volume dell'avviso, riscritto a ogni suonata
  let wet; // quanto ne va nella stanza (il riverbero)
  let last = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /**
   * La stanza: rumore che si spegne, filtrato scuro. E' un riverbero finto e
   * cortissimo, ma e' quello che toglie al suono l'aria da sveglia del telefono.
   */
  function room(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        // un polo solo: basta a scurire il rumore e a togliergli il sibilo
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
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    const conv = ctx.createConvolver();
    conv.buffer = room(1.1);
    wet = ctx.createGain();
    wet.gain.value = 0.3;
    wet.connect(conv);
    conv.connect(master);
    return ctx;
  }

  /** Una nota: corpo morbido, ottava sotto per il calore, coda che si chiude. */
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

    // Attacco breve ma non secco, e discesa esponenziale: e' la differenza fra
    // una campana e un bip.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.25, t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(f);
    f.connect(master);
    f.connect(wet);
  }

  /** Il tocco del battente: un soffio cortissimo, sotto la prima nota. */
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

  /* I tre suoni. `ask` e' sempre la versione corta e piu' bassa: serve a dire
     "sono fermo qui", non "ho finito". */
  const SOUNDS = {
    cozy(t, ev) {
      const notes = ev === 'ask' ? [523.25, 392.0] : [392.0, 523.25, 659.25];
      notes.forEach((f, i) =>
        note(t + i * 0.085, f, { dur: 1.15 - i * 0.1, gain: 0.26, type: 'triangle', cut: 1700 })
      );
      breath(t);
    },
    bell(t, ev) {
      const base = ev === 'ask' ? 587.33 : 783.99;
      [1, 2.02, 3.01].forEach((m, i) =>
        note(t, base * m, {
          dur: 2.2 - i * 0.55,
          gain: 0.15 / (i + 1),
          type: 'sine',
          cut: 3000,
          sub: i === 0,
        })
      );
    },
    soft(t, ev) {
      const notes = ev === 'ask' ? [523.25, 440.0] : [659.25, 523.25];
      notes.forEach((f, i) =>
        note(t + i * 0.13, f, { dur: 0.75, gain: 0.22, type: 'sine', cut: 1300, sub: false })
      );
    },
  };

  /**
   * Il contesto audio nasce muto finche' non hai toccato la pagina: e' una regola
   * del browser, non un capriccio. Si sveglia al primo clic o al primo tasto, che
   * tanto arrivano prima di qualunque risposta da aspettare.
   */
  function unlock() {
    const c = boot();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function play(name, ev, volume) {
    if (!name || name === 'off') return;
    const now = Date.now();
    if (now - last < 400) return; // due avvisi appiccicati suonano come un guasto
    last = now;

    const c = boot();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const make = SOUNDS[name];
    if (!make) return;

    const t = c.currentTime + 0.02;
    master.gain.setValueAtTime(clamp(volume == null ? 0.6 : volume, 0, 1), t);
    make(t, ev === 'ask' ? 'ask' : 'done');
  }

  window.Chime = { play, unlock, names: Object.keys(SOUNDS) };
})();
