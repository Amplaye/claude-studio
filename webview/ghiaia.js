/* ============================================================================
   La ghiaia dell'atrio: l'anello di sassi bianchi in mezzo al corridoio.

   E' l'unica cosa della stanza che non viene da SeasonVale, e non per capriccio:
   nel pacchetto un'aiuola vista dall'alto non c'e'. C'e' la fontanella — quella
   si' — ma appoggiata sul pavimento nudo sembra un oggetto posato li' e non una
   cosa che sta in quel punto da sempre. La ghiaia e' quello che la rende un
   pezzo di atrio invece che un soprammobile.

   Disegnata e non ritagliata vuol dire due righe di regole in piu':
   - i sassi si posano uno per uno, non e' un disco bianco steso. Un disco
     bianco uniforme e' una pozzanghera; quello che deve leggersi qui e' il
     ghiaino, e un sasso e' due pixel con la luce sopra e l'ombra sotto.
   - e sotto ci va comunque un fondo chiaro: fra un sasso e l'altro deve vedersi
     altro ghiaino, non il pavimento dell'ufficio.

   Il caso e' ripetibile come per la gente di `npc.js`: stesso seme, stessa
   ghiaia. Una ghiaia che si rimescola a ogni pixel di finestra tirato e' una
   ghiaia che qualcuno rastrella ogni due secondi.

     window.GHIAIA.disegna(seme, larghezza, altezza) -> data URL PNG (pixel, 4x)

   Nessuna dipendenza, nessuna rete: si apre da file://, come npc.js.
   ========================================================================== */
(function () {
  'use strict';

  const ZOOM = 4; // il PNG esce a 4x: nitido senza ricampionare

  /* Le stesse due righe di npc.js: FNV-1a sul seme e mulberry32. Ripetibile fra
     sessioni diverse — Math.random non lo e'. */
  function impronta(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dado(n) {
    return function () {
      n = (n + 0x6d2b79f5) | 0;
      let t = Math.imul(n ^ (n >>> 15), 1 | n);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Bianchi davvero: il pavimento dell'ufficio e' chiaro, e un ghiaino grigio ci
     sparisce dentro. Quattro toni — due per il sasso illuminato, due per il
     fondo e per l'ombra — che a questa misura sono tutto il volume che ci sta. */
  const SASSI = ['#FFFFFC', '#F8F4EA', '#EAE3D5', '#CFC6B2'];
  /* Un pixel scuro attorno alla sagoma, trasparente e non nero: sotto ci passa
     il colore della stanza. Senza, la ghiaia chiara sul pavimento chiaro del
     corridoio e' una macchia senza bordi. */
  const BORDO = 'rgba(28, 22, 14, 0.66)';

  // Una griglia di colori grande quanto il disegno, e i pixel si posano uno alla
  // volta. Il canvas arriva solo alla fine, un fillRect per pixel: niente
  // drawImage, quindi niente interpolazione da spegnere.
  const tela = (w, h) => ({ w, h, px: new Array(w * h).fill(null) });
  const dentro = (t, x, y) => x >= 0 && y >= 0 && x < t.w && y < t.h;
  function px(t, x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (dentro(t, x, y)) t.px[y * t.w + x] = c;
  }
  const leggi = (t, x, y) => (dentro(t, x, y) ? t.px[y * t.w + x] : null);

  /** Il contorno, in coda a tutto: si raccoglie prima e si scrive dopo, se no il
      bordo appena messo conta come sagoma per il pixel accanto e la figura si
      ingrassa di un anello per giro. */
  function contorno(t) {
    const bordo = [];
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (leggi(t, x, y)) continue;
        if (leggi(t, x - 1, y) || leggi(t, x + 1, y) || leggi(t, x, y - 1) || leggi(t, x, y + 1))
          bordo.push([x, y]);
      }
    }
    for (const [x, y] of bordo) px(t, x, y, BORDO);
  }

  function stampa(t) {
    const c = document.createElement('canvas');
    c.width = t.w * ZOOM;
    c.height = t.h * ZOOM;
    const g = c.getContext('2d');
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const col = t.px[y * t.w + x];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      }
    }
    return c.toDataURL('image/png');
  }

  function disegna(seme, w, h) {
    const r = dado(impronta('ghiaia:' + seme + ':' + w + 'x' + h));
    const t = tela(w, h);
    const cx = w / 2 - 0.5;
    const cy = h / 2 - 0.5;
    const rx = w / 2 - 0.5;
    const ry = h / 2 - 0.8;
    // Il fondo: l'ellisse piena, piu' scura verso il bordo e verso il basso —
    // e' li' che la conca scende dentro il pavimento.
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        px(t, x, y, dx * dx + dy * dy > 0.68 || dy > 0.3 ? SASSI[3] : SASSI[2]);
      }
    }
    // E i sassi sopra, uno per uno. La radice quadrata del caso li distribuisce
    // uniformemente sul disco invece che ammucchiarli in mezzo.
    const quanti = Math.round(w * h * 0.36);
    for (let i = 0; i < quanti; i++) {
      const a = r() * Math.PI * 2;
      const q = Math.sqrt(r());
      const x = cx + Math.cos(a) * (rx - 1) * q;
      const y = cy + Math.sin(a) * (ry - 0.6) * q;
      const largo = r() < 0.35 ? 2 : 1;
      const chiaro = SASSI[r() < 0.55 ? 0 : 1];
      for (let d = 0; d <= largo; d++) px(t, x + d, y, chiaro);
      px(t, x + largo, y + 1, SASSI[3]);
    }
    contorno(t);
    return stampa(t);
  }

  /* Si disegna una volta sola: la stanza si rimonta a ogni cambio di misura, e
     rifare mille sassi a ogni pixel di finestra tirato e' lavoro buttato. */
  const memo = new Map();

  window.GHIAIA = {
    disegna(seme, w, h) {
      const k = seme + ':' + w + 'x' + h;
      let v = memo.get(k);
      if (!v) {
        v = disegna(String(seme), w, h);
        memo.set(k, v);
      }
      return v;
    },
  };
})();
