/* Claude Studio — cosa si dicono, in ufficio.
 *
 * Prima ognuno parlava da solo: una frase pescata dal mucchio del posto dove
 * stava, o una battuta tirata al capo. Frasi giuste, ma prescritte — dopo dieci
 * minuti si riconoscono, e una stanza dove nessuno risponde a nessuno e' una
 * stanza di gente che parla al muro.
 *
 * Qui ci sono le scene: due che si parlano, una battuta per uno, e quello di cui
 * parlano e' vero. Il passo che uno sta facendo, il file che ha aperto, quanti
 * passi mancano al suo capo, il messaggio che un aiutante ha appena scritto
 * all'altro, il contesto che sta finendo, il branch, l'ora, il giorno. I numeri e
 * i nomi li mette chi chiama (office.js, `ritratto` e `stanzaOra`): qui ci sono
 * solo le frasi, con i buchi da riempire.
 *
 *   {a.lavoro}  il ritratto di chi parla per primo
 *   {b.mancano} quello di chi risponde
 *   {s.branch}  la stanza: progetto, branch, consumi, ora, bacheca
 *   {x.testo}   il resto che porta l'occasione: il messaggio, la nota d'archivio
 *
 * Una scena con un buco che non si riempie — un file che non c'e', un piano senza
 * passi — semplicemente non si recita: si passa alla prossima. E' quello che
 * permette di scrivere frasi con dati veri senza mai far dire «sto leggendo
 * undefined» a nessuno.
 *
 * Le stesse scene non tornano a giro stretto: le ultime quattordici si saltano.
 *
 * Al capo si da' del lei, come nelle battute di sempre; fra colleghi del tu. E
 * niente parole col genere — nessuno qui sa se chi e' seduto li' e' un lui o una
 * lei, e una vignetta sbagliata su una persona si nota prima di ogni altra cosa.
 *
 * Nessuna dipendenza e nessun DOM: si prova anche da Node (scripts/dialoghi-check.mjs).
 */
(function (root) {
  'use strict';

  /* Ogni scena: `r` le battute, «A:» o «B:» davanti; `se` (facoltativo) quando ha
     senso. Le scene con sole battute di A si recitano anche da soli. */
  const SCENE = {
    // ---- A lavora per B: un aiutante, o chi porta il passo del piano ----
    capoAiutante: [
      { r: ['A:«{a.lavoro}»: a buon punto', 'B:Bene. Lo voglio vedere chiuso'] },
      { r: ['B:Come va con «{a.lavoro}»?', 'A:Meglio del previsto', 'B:Questa la voglio sentire più spesso'] },
      { se: (a, b) => b.mancano > 0, r: ['A:Quanti passi mancano, capo?', 'B:{b.mancano} su {b.totale}. Coraggio'] },
      { r: ['A:Sto {a.azioneG} {a.file}', 'B:Occhio a non rompere niente'] },
      { r: ['A:Capo, sono {a.durata} che ci lavoro', 'B:E si vede. Continua così'] },
      { r: ['B:Ti serve qualcosa?', 'A:Un caffè e un’altra ora', 'B:Il caffè te lo offro'] },
      { r: ['A:Se finisco presto posso andare al bar?', 'B:Se finisci presto'] },
      { r: ['B:{a.Tipo}, trovato qualcosa?', 'A:Niente di decisivo, per ora', 'B:Scava ancora'] },
      { r: ['A:Ho {a.azioneP} {a.file}: sembra a posto', 'B:Sembra o è?', 'A:È. Credo'] },
      { se: (a, b) => b.ctx >= 50, r: ['A:Il contesto come va, capo?', 'B:Sono {b.alCtx}. Fai in fretta'] },
      { r: ['B:Ricordati di provarlo', 'A:Lo provo due volte', 'B:Tre'] },
      { r: ['A:«{a.lavoro}»: quasi fatto', 'B:Quel «quasi» mi preoccupa'] },
      { r: ['B:Tutto bene lì?', 'A:Tutto sotto controllo', 'B:Mh.'] },
      { se: (a, b) => b.aiutanti > 1, r: ['A:Siamo in {b.aiutanti} a lavorare per lei', 'B:E vi pago tutti in caffè'] },
      { r: ['A:Capo, mi dà due minuti?', 'B:Uno. Poi «{a.lavoro}»'] },
      { r: ['B:Chi ti ha detto di farlo così?', 'A:Il piano', 'B:Ah. Allora va bene'] },
      { se: (a, b, s) => s.momento === 'sera' || s.momento === 'notte', r: ['A:Capo, {s.sonoLe}…', 'B:Lo so. Ultimo sforzo'] },
      { se: (a, b) => a.comando === 'i test', r: ['A:Capo, faccio girare i test', 'B:E speriamo bene'] },
      { se: (a, b) => a.numero > 0, r: ['B:Passo {a.numero}, giusto?', 'A:Giusto. Il {a.numero}° di {a.totale}'] },
    ],

    // ---- A e B lavorano per lo stesso capo ----
    colleghi: [
      { r: ['A:Anche tu per «{a.capo}»?', 'B:Sì, io su «{b.lavoro}»'] },
      { r: ['A:Chi finisce prima offre il caffè', 'B:Allora offri tu'] },
      { r: ['A:Tu cosa fai?', 'B:Sto {b.azioneG} {b.file}', 'A:Ti invidio'] },
      { se: (a, b) => a.tipo && a.tipo === b.tipo, r: ['A:{a.Tipo} anche tu?', 'B:Pure io. Siamo una squadra'] },
      { se: (a, b) => a.tipo && b.tipo && a.tipo !== b.tipo, r: ['A:Tu che tipo sei?', 'B:{b.Tipo}. E tu?', 'A:{a.Tipo}. Ci completiamo'] },
      { r: ['A:Il capo ha detto entro oggi', 'B:Oggi quando?', 'A:Oggi.'] },
      { r: ['A:Mi passi il file?', 'B:Solo in lettura'] },
      { se: (a, b, s) => s.gente >= 5, r: ['A:Siamo in {s.gente} qui dentro', 'B:E la macchinetta è una sola'] },
      { se: (a, b, s) => s.fare > 0, r: ['A:Hai visto quanti gialli in bacheca?', 'B:{s.fare}. Uno è mio'] },
      { r: ['A:Come lo trovi il capo oggi?', 'B:Concentrato', 'A:Cioè nervoso'] },
      { r: ['A:Ci scambiamo i compiti?', 'B:Neanche per sogno'] },
      { r: ['A:Tu hai cominciato dopo di me', 'B:E finisco prima. Guarda'] },
    ],

    // ---- due vicini di scrivania ----
    vicini: [
      { r: ['A:Su cosa sei?', 'B:«{b.lavoro}»', 'A:Auguri'] },
      { se: (a, b) => b.totale > 0, r: ['A:A che punto sei?', 'B:{b.fatte} su {b.totale}', 'A:Io sto peggio'] },
      { se: (a, b) => b.aiutanti > 0, r: ['A:Quanti aiutanti hai?', 'B:{b.aiutanti}. E vogliono tutti il caffè'] },
      { se: (a, b) => b.ctx >= 60, r: ['A:Che contesto hai?', 'B:Sono {b.alCtx}', 'A:Comprimi, comprimi'] },
      { se: (a, b) => b.occupato, r: ['A:Il tuo schermo lampeggia', 'B:Sta pensando. Io no'] },
      { se: (a, b) => b.finito, r: ['A:Hai finito?', 'B:Il turno sì. Il lavoro mai'] },
      { se: (a, b) => b.aiutanti > 0, r: ['A:Mi presti un aiutante?', 'B:Sono tutti impegnati'] },
      { r: ['A:Ancora su {b.file}?', 'B:Sì. È più lungo del previsto'] },
      { se: (a, b) => b.comando === 'i test', r: ['A:Sento i test girare da qui', 'B:Incrocia le dita'] },
      { se: (a, b) => b.comando === 'la build', r: ['A:Chi ha rotto la build?', 'B:Non io. Credo'] },
      { r: ['A:Che giornata, eh?', 'B:E non è ancora finita'] },
      { r: ['A:Sempre su {s.branch}?', 'B:Sempre e solo {s.branch}'] },
      { r: ['A:Hai già fatto il push?', 'B:Aspetto che passino i test'] },
      { r: ['A:Pausa fra poco?', 'B:Appena chiudo «{b.lavoro}»'] },
      { r: ['A:Silenzio da quella parte', 'B:Concentrazione'] },
      { r: ['A:Mi senti?', 'B:Ho le cuffie', 'A:Allora sì'] },
      { se: (a, b) => a.totale > 0 && b.totale > a.totale, r: ['A:Il tuo piano è più lungo del mio', 'B:Non è la lunghezza che conta'] },
      { se: (a, b, s) => s.sporco, r: ['A:C’è roba non salvata in git', 'B:Non guardare me'] },
      { se: (a, b) => a.lavoro && b.lavoro, r: ['A:Io su «{a.lavoro}». Tu?', 'B:«{b.lavoro}»', 'A:Ci vediamo al bar'] },
    ],

    // ---- al bar ----
    bar: [
      { se: (a, b) => b.mancano > 0, r: ['A:Caffè?', 'B:Doppio. Ho {b.mancano} passi davanti'] },
      { r: ['A:Caffè?', 'B:Doppio, oggi'] },
      { se: (a, b, s) => s.sessione >= 50, r: ['A:La sessione è {s.alSessione}', 'B:Allora caffè corto'] },
      {
        se: (a, b, s) => s.settimana >= 50 && /^(lunedì|martedì|mercoledì)$/.test(s.giorno),
        r: ['A:La settimana è già {s.alSettimana}', 'B:E siamo solo a {s.giorno}'],
      },
      { se: (a, b, s) => s.momento === 'sera' || s.momento === 'notte', r: ['A:Ancora qui {s.alleOra}?', 'B:«{b.nome}» non si chiude da solo'] },
      { se: (a, b, s) => s.momento === 'mattina', r: ['A:Buongiorno! Già al secondo?', 'B:Terzo. Ma chi li conta'] },
      { se: (a, b, s) => s.giorno === 'venerdì', r: ['A:Venerdì: si rilascia?', 'B:Di venerdì? Mai'] },
      { se: (a, b, s) => s.giorno === 'lunedì', r: ['A:Lunedì, eh', 'B:Il caffè lo sa'] },
      { r: ['A:Come va su {s.progetto}?', 'B:Si muove. Piano, ma si muove'] },
      { r: ['A:Quante tazze pulite ci sono?', 'B:Meno di quante ne servono'] },
      { se: (a, b, s) => s.sessione >= 60, r: ['A:La sessione si rinnova {s.resetSessione}', 'B:Fino ad allora, piano coi token'] },
      { se: (a, b, s) => s.quanti >= 3, r: ['A:{s.quanti} conversazioni aperte', 'B:Ci vorrebbe un’altra macchinetta'] },
      { se: (a, b) => b.fatte > 0, r: ['A:Pausa meritata?', 'B:{b.fatte} passi chiusi. Direi di sì'] },
      { r: ['A:Senti che rumore fa', 'B:È il suono della produttività'] },
      { r: ['A:Zucchero?', 'B:Amaro. Come il mio ultimo test'] },
      { r: ['A:Chi lascia le tazze nel lavandino?', 'B:Non guardare me'] },
      { r: ['A:Mi offri il caffè?', 'B:Quando passano i test'] },
      { r: ['A:Lo prendi lungo?', 'B:Lungo come il mio piano'] },
      { se: (a, b, s) => !!s.branch, r: ['A:Su {s.branch} tutto tranquillo?', 'B:Per ora. Tocchiamo ferro'] },
    ],

    // ---- in sala riunioni ----
    riunione: [
      { r: ['A:Allineamento veloce?', 'B:Cinque minuti. Poi «{b.lavoro}»'] },
      { se: (a, b, s) => s.fare > 0 && s.fatte > 0, r: ['A:In bacheca ci sono {s.fare} gialli', 'B:E {s.fatte} verdi. Dai'] },
      { se: (a, b, s) => s.storte > 0, r: ['A:Ci sono {s.storte} rossi in bacheca', 'B:Ne parliamo dopo il caffè'] },
      { r: ['A:Questa riunione poteva essere un messaggio', 'B:Tutte potevano esserlo'] },
      { r: ['A:Verbalizzi tu?', 'B:Verbalizza la bacheca'] },
      { r: ['A:Chi si prende «{b.lavoro}»?', 'B:Ce l’ho già io'] },
      { r: ['A:Ricapitoliamo?', 'B:C’è un piano. Si segue'] },
      { r: ['A:Punto successivo?', 'B:Il caffè'] },
    ],

    // ---- A e' andato alla scrivania di B ----
    visita: [
      { r: ['A:Come va con «{b.lavoro}»?', 'B:Ci sono quasi', 'A:Ti lascio lavorare'] },
      { r: ['A:Disturbo?', 'B:Sto {b.azioneG} {b.file}', 'A:Allora ripasso'] },
      { r: ['A:Passavo di qui', 'B:Passa anche dal bar, già che ci sei'] },
      { se: (a, b) => b.aiutanti > 0, r: ['A:Serve una mano?', 'B:Ho già {b.aiutanti} aiutanti, grazie'] },
      { se: (a, b) => !(b.aiutanti > 0), r: ['A:Serve una mano?', 'B:Ce la faccio, grazie'] },
      { se: (a, b) => b.mancano > 0, r: ['A:Quanto ti manca?', 'B:{b.mancano} passi', 'A:Forza!'] },
      { r: ['A:Hai visto la bacheca?', 'B:Preferisco di no'] },
      { se: (a, b) => b.ctx >= 70, r: ['A:Il tuo contesto è {b.alCtx}', 'B:Lo so, lo so'] },
      { se: (a, b, s) => s.momento === 'sera', r: ['A:Che fai stasera?', 'B:Finisco «{b.lavoro}»'] },
      { r: ['A:Bella scrivania', 'B:È uguale alla tua', 'A:Appunto'] },
      { se: (a, b) => b.comando === 'i test', r: ['A:Ancora i test?', 'B:Finché non passano'] },
      { se: (a, b) => b.fatte > 0, r: ['A:Novità?', 'B:{b.fatte} passi fatti', 'A:Niente male'] },
      { r: ['A:Ti porto qualcosa dal bar?', 'B:Un caffè e un po’ di pazienza'] },
    ],

    // ---- le occasioni: succede qualcosa di vero, e qualcuno lo dice ----

    // A porta il passo appena preso, B e' il suo capo
    'arrivo-passo': [
      { se: (a) => a.numero > 0 && a.totale > 0, r: ['A:Eccomi: «{a.lavoro}»', 'B:Vai, è il {a.numero}° di {a.totale}'] },
      { r: ['A:Mi prendo «{a.lavoro}»', 'B:Perfetto, conto su di te'] },
      { r: ['B:Tocca a «{a.lavoro}»', 'A:Ci penso io'] },
      { r: ['A:Foglietto staccato. Si parte', 'B:Ottimo'] },
      { r: ['A:Al lavoro su «{a.lavoro}»'] },
    ],
    // A e' un aiutante appena seduto, B chi l'ha lanciato
    'arrivo-aiutante': [
      { r: ['A:{a.Tipo} a rapporto!', 'B:Il compito è sul foglietto'] },
      { r: ['A:Ho il foglietto: «{a.lavoro}»', 'B:Grazie, mi serve presto'] },
      { r: ['B:Eccoti, ti aspettavo', 'A:Dove mi siedo?', 'B:Dove trovi posto'] },
      { r: ['A:Mi hanno detto «{a.lavoro}»', 'B:Esatto. Vai'] },
      { r: ['A:{a.Tipo} in postazione'] },
    ],
    'finito-passo': [
      { se: (a, b) => b.mancano > 0, r: ['A:«{a.lavoro}»: fatto!', 'B:Ottimo. Ne mancano {b.mancano}'] },
      { se: (a, b) => b.mancano === 0, r: ['A:Ultimo passo chiuso!', 'B:Festa!'] },
      { r: ['A:Fatto. Lo appendo in verde', 'B:Grazie!'] },
      { r: ['A:Questo è andato', 'B:Avanti il prossimo'] },
      { r: ['A:«{a.lavoro}»: fatto!'] },
    ],
    'fallito-passo': [
      { r: ['A:«{a.lavoro}» non è andato', 'B:Pazienza, ci riproviamo'] },
      { r: ['A:Lo appendo in rosso, capo', 'B:Ne parliamo dopo'] },
      { r: ['A:Questo lo appendo in rosso'] },
    ],
    'finito-aiutante': [
      { r: ['A:Fatto in {a.durata}', 'B:Grazie, ottimo lavoro'] },
      { r: ['A:Ecco i risultati', 'B:Li guardo subito'] },
      { r: ['A:«{a.lavoro}»: finito', 'B:Perfetto. Puoi andare'] },
      { r: ['A:Finito! Riporto il foglietto'] },
    ],
    'fallito-aiutante': [
      { r: ['A:Non ce l’ho fatta, capo', 'B:Succede. Grazie lo stesso'] },
      { r: ['A:«{a.lavoro}» si è incagliato', 'B:Ci penso io'] },
      { r: ['A:Niente da fare. Foglietto rosso'] },
    ],
    // A scrive a B: {x.testo} e' il messaggio vero, accorciato
    lettera: [
      { r: ['A:«{x.testo}»', 'B:Ricevuto'] },
      { r: ['A:«{x.testo}»', 'B:Ci guardo subito'] },
      { r: ['A:«{x.testo}»', 'B:Ok, ti rispondo'] },
      { r: ['A:Ti ho scritto: «{x.testo}»', 'B:Letto'] },
      { r: ['A:Mando: «{x.testo}»'] },
    ],
    // A torna dall'archivio con una nota; B, se c'e', e' chi gli sta vicino
    archivio: [
      { r: ['A:Ho ripescato «{x.nota}»', 'B:Utile?', 'A:Molto'] },
      { r: ['A:In archivio c’era «{x.nota}»', 'B:Quella vecchia storia'] },
      { r: ['A:Trovato! «{x.nota}»', 'B:Lo sapevo che c’era'] },
      { r: ['A:Riletto «{x.nota}». Ora torna'] },
    ],
    // A e' un vicino, B ha appena finito un turno lungo
    'turno-finito': [
      { se: (a, b) => b.fatte > 0, r: ['A:Finito?', 'B:Finito! {b.fatte} passi chiusi'] },
      { r: ['A:Bel lavoro, «{b.nome}»', 'B:Grazie, ci voleva'] },
      { r: ['A:Hai finito? Caffè?', 'B:Arrivo'] },
    ],
    // da soli: chi ha appena ricevuto il tuo messaggio
    'turno-iniziato': [
      { r: ['A:Ricevuto, ci lavoro'] },
      { r: ['A:Nuovo messaggio, si parte'] },
      { r: ['A:Arrivo, arrivo'] },
      { r: ['A:Vediamo cosa mi chiedi'] },
      { r: ['A:Letto. Ci penso io'] },
    ],
    // da soli: la conversazione che hai appena aperto
    focus: [
      { r: ['A:Eccomi'] },
      { r: ['A:Dimmi tutto'] },
      { r: ['A:Sono qui'] },
      { r: ['A:Ciao! Che facciamo?'] },
      { se: (a) => a.totale > 0, r: ['A:Siamo a {a.fatte} su {a.totale}'] },
    ],
    // A aspetta una risposta da te; B, se c'e', e' un vicino
    domanda: [
      { r: ['A:Mi serve il tuo via libera', 'B:Ehi, ti stanno aspettando!'] },
      { r: ['A:Aspetto una risposta…', 'B:Qualcuno gli risponda!'] },
      { r: ['A:Posso andare avanti?'] },
      { r: ['A:Serve un sì per continuare'] },
    ],
    // A e' un vicino, B ha il contesto quasi pieno
    contesto: [
      { r: ['A:«{b.nome}», sei {b.alCtx}!', 'B:Lo so. Sto per compattare'] },
      { r: ['A:Contesto {b.alCtx}, eh', 'B:Faccio spazio fra poco'] },
    ],
    'contesto-solo': [{ r: ['A:Sono {a.alCtx} di contesto…'] }, { r: ['A:Contesto quasi pieno: {a.ctx}%'] }],
    // A gia' seduto, B appena arrivato
    benvenuto: [
      { r: ['A:Eccoti!', 'B:Ciao a tutti'] },
      { r: ['A:Ciao «{b.nome}»', 'B:Ciao! Dov’è il caffè?'] },
      { se: (a, b, s) => s.momento === 'mattina', r: ['A:Buongiorno!', 'B:Buongiorno a te'] },
      { r: ['A:Una scrivania libera c’è', 'B:L’ho vista, grazie'] },
    ],
    // A saluta chi se ne va ({x.nome})
    saluto: [
      { r: ['A:Ciao «{x.nome}», alla prossima'] },
      { r: ['A:Ci vediamo, «{x.nome}»'] },
      { r: ['A:Chiude «{x.nome}». Scrivania libera'] },
    ],
    consumi: [
      { r: ['A:Sessione {s.alSessione}!', 'B:Si rinnova {s.resetSessione}'] },
      { r: ['A:Siamo {s.alSessione} di sessione', 'B:Piano coi token, gente'] },
      { r: ['A:Sessione {s.alSessione}. Piano coi token'] },
    ],
    // le risposte alle battute di sempre (office.js, l'aura del capo)
    adulazione: [
      { r: ['B:Lo so'] },
      { r: ['B:Grazie. Torna al lavoro'] },
      { r: ['B:Adulatore'] },
      { r: ['B:Aumento? Vediamo'] },
      { r: ['B:Apprezzo'] },
      { r: ['B:Non esagerare'] },
      { r: ['B:Me lo segno'] },
      { se: (a, b) => b.fatte > 0, r: ['B:{b.fatte}, e la giornata è lunga'] },
    ],
    pettegolezzo: [
      { r: ['B:Shh, ti sente'] },
      { r: ['B:Lo pensavo anch’io'] },
      { r: ['B:Non dirlo a me'] },
      { r: ['B:Abbassa la voce'] },
      { r: ['B:Ma va’?'] },
    ],
  };

  /* ---- riempire i buchi ---- */

  const BUCO = /\{([abxs])\.(\w+)\}/g;

  /** Il valore di un buco, o null se non c'e': zero e' un numero vero, la stringa vuota no. */
  function valore(fonti, chi, campo) {
    const f = fonti[chi];
    if (!f) return null;
    const v = f[campo];
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v))) return null;
    return String(v);
  }

  /** La battuta riempita, o null se un buco resta vuoto. */
  function riempi(testo, fonti) {
    let manca = false;
    const out = testo.replace(BUCO, (_, chi, campo) => {
      const v = valore(fonti, chi, campo);
      if (v == null) {
        manca = true;
        return '';
      }
      return v;
    });
    return manca ? null : out;
  }

  /** Le scene recitate di recente, per non risentirle a giro stretto. */
  const recenti = [];
  const MEMORIA = 14;

  const mischia = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /**
   * Una scena del `tipo` che si puo' recitare con questi due, o null.
   *
   * `a` e `b` sono i ritratti di chi parla (b puo' mancare: allora valgono solo le
   * scene da soli), `s` la stanza, `x` quello che porta l'occasione. Torna le battute
   * gia' riempite: `[{ chi: 'a' | 'b', testo }]`.
   */
  function scena(tipo, a, b, s, x) {
    const elenco = SCENE[tipo];
    if (!elenco || !a) return null;
    const fonti = { a, b, s: s || {}, x: x || {} };
    const buone = [];
    for (const [i, sc] of elenco.entries()) {
      const conB = sc.r.some((r) => r.startsWith('B:') || r.includes('{b.'));
      if (conB && !b) continue;
      // Una scena di sole risposte (le battute di sempre) vuole B e basta.
      if (!b && sc.r.every((r) => r.startsWith('B:'))) continue;
      try {
        if (sc.se && !sc.se(a, b || {}, fonti.s, fonti.x)) continue;
      } catch {
        continue;
      }
      const righe = [];
      let ok = true;
      for (const r of sc.r) {
        const testo = riempi(r.slice(2), fonti);
        if (testo == null) {
          ok = false;
          break;
        }
        righe.push({ chi: r[0] === 'B' ? 'b' : 'a', testo });
      }
      if (ok) buone.push({ id: tipo + '#' + i, righe });
    }
    if (!buone.length) return null;
    // Le piu' fresche prima; se sono state dette tutte di recente, quella detta da
    // piu' tempo.
    const fresche = buone.filter((c) => !recenti.includes(c.id));
    const scelta = fresche.length
      ? mischia(fresche)[0]
      : buone.slice().sort((p, q) => recenti.indexOf(p.id) - recenti.indexOf(q.id))[0];
    recenti.push(scelta.id);
    if (recenti.length > MEMORIA) recenti.splice(0, recenti.length - MEMORIA);
    return scelta.righe;
  }

  root.DIALOGHI = { scena, SCENE, riempi };
})(typeof window !== 'undefined' ? window : globalThis);
