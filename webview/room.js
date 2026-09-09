/* Claude Studio — la stanza.
 *
 * La pianta dell'ufficio e la vita che ci gira dentro, in un posto solo: i muri,
 * i mobili, le scrivanie, dove si puo' mettere i piedi, e il giro di chi ogni
 * tanto si alza e va a prendersi un caffe'.
 *
 * Sta qui e non dentro `office.js` perche' la usano in due: l'ufficio vero
 * dell'estensione e la pagina di prova `docs/office-sv.html`, che e' dove la
 * stanza si monta e si guarda prima di mandarla in produzione. Due copie della
 * stessa pianta si scollano al primo mobile spostato, ed e' proprio la pianta la
 * cosa che si sposta di continuo.
 *
 * Quello che resta di la' e' quello che di qua non c'entra: chi sono le persone,
 * come si chiamano, quanto contesto gli resta, cosa succede se ci clicchi sopra.
 * La stanza non lo sa e non deve saperlo — sa dove sono i muri.
 *
 * I mobili sono ritagli di SeasonVale (`interiors/All Tileset`), impacchettati
 * in un foglio solo da `scripts/sv-sheet.mjs`, che scrive anche la mappa dei
 * nomi in `sv-room.js`. Le persone no: quelle le disegna `npc.js` dal seme.
 *
 * Misure: tutto in pixel di stanza, 384x320. Un mobile non e' grande quanto la
 * sua casella — SeasonVale li disegna alti, perche' si vede anche il fianco —
 * quindi ognuno ha la sua misura vera e si appoggia per terra dal basso.
 */
window.ROOM = (() => {
  const TILE = 16;
  const COLS = 24;
  const ROWS = 20;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const SV = window.SV;

  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  /* Chi sta piu' in basso copre chi sta piu' in alto: e' l'unica regola che
     tiene in ordine dei mobili alti, e l'unica che regge mentre la gente si
     sposta. Si ordina sul bordo di sotto, non sulla riga. */
  const depth = (n, bottom) => {
    n.style.zIndex = Math.round(bottom);
    return n;
  };

  // ---------- la pianta ----------
  //
  // I muri sono bande, `{c, r, w, h}` in caselle. I vani delle porte non sono un
  // tipo a parte: sono il pezzo di muro che non c'e'.
  const WALLS = [
    // Il muro di sopra ha un vano: due caselle in mezzo al corridoio fra la sala
    // riunioni e il bar, ed e' la porta d'ingresso. E' l'unico punto della
    // pianta dove il muro si apre su niente invece che su un'altra stanza —
    // dietro c'e' il resto del palazzo, che non si disegna.
    { c: 0, r: 0, w: 12, h: 1 },
    { c: 14, r: 0, w: 10, h: 1 },
    { c: 0, r: ROWS - 1, w: COLS, h: 1 },
    { c: 0, r: 0, w: 1, h: ROWS },
    { c: COLS - 1, r: 0, w: 1, h: ROWS },
    // I due muri delle stanze in alto. Il buco fra i pezzi e' la porta: righe 3
    // e 4, ed e' da li' che si entra al bar e in riunione.
    { c: 10, r: 1, w: 1, h: 2 },
    { c: 10, r: 5, w: 1, h: 3 },
    { c: 15, r: 1, w: 1, h: 2 },
    { c: 15, r: 5, w: 1, h: 3 },
    // Il muro che divide le due stanze dal salone. Arriva fino a colonna 10,
    // dove trova lo spigolo della sala riunioni: fermandosi a 9 restava un buco
    // quadrato nell'angolo, il pezzo di muro che manca in una pianta disegnata a
    // mano. Il passaggio e' quello fra le due stanze, colonne 11-14.
    { c: 1, r: 7, w: 9, h: 1 },
    { c: 15, r: 7, w: 8, h: 1 },
  ];

  /* Un mobile: `s` il ritaglio, `x` il bordo sinistro e `b` il bordo di sotto,
     in pixel. Il disegno sta in piedi da li' in su, quanto e' alto lui.

     In pixel e non in caselle apposta: i mobili di SeasonVale non sono larghi un
     numero intero di caselle, e allinearli alla griglia li lasciava sbilenchi in
     mezzo alle stanze. Cosi' invece si centrano davvero. */
  const PROPS = [
    // --- sala riunioni: due posti uno di fronte all'altro sui lati lunghi del
    //     tavolo, e la bacheca sul muro. Si siede su sgabelli e basta: la sedia
    //     di SeasonVale ha uno schienale alto che dal davanti copre mezzo
    //     tavolo, e in una stanza vista dall'alto era l'unico mobile di
    //     traverso. ---
    // Una bacheca sola, e centrata sul muro come il tavolo e gli sgabelli sotto.
    // La bacheca di sughero che le stava accanto era arredamento: aveva i suoi
    // fogli gia' disegnati sopra, e due bacheche appaiate — una vera e una finta —
    // erano soprattutto un modo di non far capire quale delle due si guarda.
    { s: 'board', x: 66, b: 36 },
    // Tirato indietro di dieci pixel dal tavolo: chi ci si siede ha i piedi sullo
    // sgabello, e attaccato com'era i piedi cadevano dentro l'ingombro del
    // tavolo — cioe' su una casella dove la stanza non manda nessuno.
    { s: 'stoolRound', x: 81, b: 52 },
    // E due a capotavola, uno per lato corto. Il tavolo ne teneva due su quattro
    // lati: i posti in piu' servono quando le scrivanie sono finite, e un capo
    // tavola vuoto mentre qualcuno sta in piedi in corsia e' un posto sprecato.
    { s: 'stoolRound', x: 45, b: 78 },
    { s: 'meetTable', x: 64, b: 84 },
    { s: 'stoolRound', x: 117, b: 78 },
    { s: 'stoolRound', x: 81, b: 100 },
    { s: 'plantPurple', x: 22, b: 110 },
    // E ai due capi del muro di sopra i mobili dell'ufficio: lo scaffale dei
    // faldoni a sinistra, l'armadio a destra. Non sono arredamento — sono le due
    // mezze pareti che restavano nude ai fianchi della lavagna, e una sala
    // riunioni con tre pareti vuote e' una stanza svuotata per il trasloco. Alti
    // quaranta, come la dispensa del bar: contro il muro in fondo la roba alta
    // sta bene, e' davanti che darebbe fastidio.
    //
    // Appoggiati a quarantotto e non piu' in basso, che e' la stessa riga della
    // dispensa del bar. Non e' per pareggiare il disegno: sotto il muro di sopra
    // passa la sola corsia che porta ai due posti in fondo alla stanza e alla
    // bacheca, e un mobile che scende quattro pixel piu' giu' la chiude — la
    // strada non ci arrivava piu' e chi ci andava si fermava a meta'.
    { s: 'shelfFull', x: 22, b: 48 },
    { s: 'cabinet', x: 130, b: 48 },
    // Il cestino sta in `DISEGNATI`, qui sotto: nel foglio non c'e'.

    // --- in mezzo non c'e' niente: e' il passaggio, e serve libero ---

    // --- il bar: la dispensa in fila sul muro, il tavolino e due sgabelli ---
    // Lo scaffale in mezzo e' vuoto apposta: e' la rastrelliera delle tazze, e le
    // tazze che ci stanno sopra sono quelle che ci sono davvero. Su uno scaffale
    // gia' pieno di roba disegnata non si sarebbe visto niente.
    { s: 'shelfJars', x: 258, b: 48 },
    { s: 'shelfEmpty', x: 288, b: 48 },
    // La macchina del caffe' e il lavandino stanno in `DISEGNATI`: nel foglio non
    // c'e' ne' l'una ne' l'altro, e finivano il primo su un armadietto e il
    // secondo su un comodino.
    // Il tavolo del bar sta sei pixel piu' in alto di prima, e i due capotavola
    // cinque sopra il suo bordo di sotto: e' la misura che mette il sedile alla
    // stessa altezza del piano. Prima uno dei due era attaccato al bordo e
    // l'altro dieci pixel piu' su, e due posti a capotavola a due altezze diverse
    // si leggono come due sgabelli lasciati li'.
    { s: 'stoolRound', x: 270, b: 85 },
    { s: 'meetTable', x: 288, b: 90 },
    // Davanti al tavolo e non nell'angolo a destra: li' il posto a sedere finiva
    // dentro l'ingombro della pianta, e uno sgabello su cui non ci si puo' sedere
    // e' arredamento che occupa un posto.
    { s: 'stoolRound', x: 305, b: 108 },
    { s: 'stoolRound', x: 341, b: 85 },
    { s: 'plantBlue', x: 350, b: 112 },

    // --- il salone: il verde sta contro i muri e negli angoli, il mezzo resta
    //     camminabile. Gli angoli in fondo sono l'unico posto di una stanza dove
    //     una pianta non e' mai d'intralcio a nessuno. ---
    { s: 'plantPurple', x: 22, b: 150 },
    { s: 'plantBlue', x: 350, b: 150 },
    // Una per angolo e non due. Appaiate erano una siepe: due piante alte una
    // accanto all'altra nello stesso angolo si leggono come un solo cespuglio
    // sfocato, e l'angolo smette di essere un angolo.
    { s: 'plantBlue', x: 22, b: 300 },
    { s: 'plantPurple', x: 351, b: 300 },
    // Fra le due piante di sinistra c'erano centotrenta pixel di pavimento e
    // nient'altro: la parete piu' lunga della stanza era anche l'unica senza
    // niente addosso. Adesso e' l'archivio — armadio e scaffale, la stessa coppia
    // della sala riunioni — e la corsia davanti resta com'era, perche' sono
    // profondi ventotto e le scrivanie cominciano a sessantotto.
    { s: 'cabinet', x: 18, b: 204 },
    { s: 'shelfFull', x: 18, b: 258 },
  ];

  /* ---- i mobili che nel foglio non ci sono ----
   *
   * SeasonVale e' una fattoria medievale: il cestino della carta e la macchina
   * del caffe' non ce li ha. Al loro posto stavano i due ritagli che ci
   * somigliavano di piu' — un barilotto e un armadietto — e si leggevano per
   * quello che erano davvero, una cassa da magazzino e un armadio. Un mobile che
   * la scena da' per esistente e che a guardarlo e' un altro mobile e' peggio
   * che non averlo: meta' della vita di questa stanza gira attorno al caffe', e
   * la macchina del caffe' non si vedeva da nessuna parte.
   *
   * Quindi si disegnano, con la stessa regola del computer: colori pieni a stop
   * netti, mai una sfumatura, e la sagoma prima del dettaglio. Il disegno sta in
   * `room.css`, che di questi due sa tutto; qui c'e' solo dove stanno e quanto
   * sono grandi.
   *
   * `w` e `h` non sono un vezzo: servono a marcarli nella griglia di dove si
   * mettono i piedi. Un mobile disegnato che non blocca e' un mobile che si
   * attraversa.
   */
  const DISEGNATI = [
    // Il cestino, in sala riunioni. E' l'unico mobile messo per una commissione e
    // non per la pianta: senza, "buttare la carta" non ha dove andare.
    { s: 'cestino', x: 141, b: 108, w: 12, h: 15 },
    // La macchina del caffe', al bar, in fila con la dispensa e giusto sopra il
    // punto dove ci si ferma a farselo.
    { s: 'macchina', x: 319, b: 48, w: 24, h: 40 },
    // E il lavandino in fondo alla fila, dove si va a lavare la tazza. Anche
    // questo la scena lo dava per esistente: chi lava dice "la lavo e la rimetto"
    // stando davanti a un comodino.
    { s: 'lavandino', x: 348, b: 48, w: 18, h: 28 },
    // La stampante, contro la parete destra del salone. Nella stanza c'era gia'
    // da un pezzo, ma solo a parole: "la stampante s'e' inceppata" e' una delle
    // frasi che si dicono alla scrivania, e la si diceva di un mobile che non
    // c'era. Un ufficio a sei scrivanie senza stampante e' l'unico al mondo.
    { s: 'stampante', x: 344, b: 190, w: 22, h: 18 },
    // E il boccione dell'acqua, piu' sotto sulla stessa parete. Questo lo
    // chiedeva per iscritto il commento delle commissioni qui sotto — "il
    // boccione dell'acqua non c'e'", messo come motivo di una commissione in
    // meno. Adesso c'e', e la commissione e' quella.
    { s: 'boccione', x: 348, b: 252, w: 14, h: 30 },
  ];

  /* Sei scrivanie, due file da tre, centrate nel salone. Le corsie fra una
     colonna e l'altra sono quelle da cui si sale al passaggio: e' il motivo per
     cui non sono attaccate fra loro.

     In orizzontale erano gia' centrate — cinquantadue di margine per parte — ma
     in verticale no: il blocco partiva dalla targhetta della prima fila, che
     stava due pixel sotto il muro, e sotto la seconda fila avanzavano
     quarantadue pixel di pavimento vuoto. Il salone e' alto centosettantasei
     (dal muro di mezzo a quello in fondo) e il blocco ne occupa
     centotrentadue: ventidue sopra e ventidue sotto, che vuol dire venti piu'
     in basso di dov'erano. */
  const DESKS = [
    { x: 68, b: 196 },
    { x: 168, b: 196 },
    { x: 268, b: 196 },
    { x: 68, b: 266 },
    { x: 168, b: 266 },
    { x: 268, b: 266 },
  ];

  const SW = SV.desk.w;
  const SH = SV.desk.h;

  /** Dove siede chi lavora alla scrivania `i`: angolo in alto a sinistra della figura. */
  const posto = (i) => ({ x: DESKS[i].x + 16, y: DESKS[i].b + 16 - 24 });

  /* ---- e i posti che non sono scrivanie ----
   *
   * Sette sgabelli: quattro c'erano gia' — due sui lati lunghi del tavolo della
   * sala riunioni, due a quello del bar — e tre sono i capotavola, aggiunti
   * perche' quattro finivano. Finche' le scrivanie bastavano erano arredamento.
   * Non bastano piu' — due schede aperte sono due capi e fino a otto sub-agent,
   * e sei posti non tengono dieci persone — e un ufficio con delle sedie vuote e
   * qualcuno in piedi in corsia non e' un ufficio pieno, e' un ufficio che non sa
   * dove metterlo.
   *
   * `x`/`y` e' l'angolo in alto a sinistra della figura, come `posto`. Sul
   * tavolo un computer non c'e' — e' un tavolo — quindi chi ci si siede se lo
   * porta: `lap` e' dove finisce il portatile e `lz` la profondita' del tavolo
   * piu' uno, perche' il portatile sta sul tavolo e non dietro.
   *
   * `verso` e' da che parte guarda lo schermo, cioe' dove siede il suo padrone.
   * Il disegno di `room.css` e' un portatile visto da chi ce l'ha davanti: tenuto
   * uguale per tutti, chi sta di sopra e chi sta a capotavola lavorava sul retro
   * del proprio schermo. Quattro versi e quattro posti attorno a un tavolo: ogni
   * portatile guarda la sua sedia.
   *
   * L'ordine e' quello in cui si riempiono, e i due della sala riunioni vengono
   * prima: e' la stanza chiusa, ed e' li' che ha senso mandare chi lavora per
   * qualcun altro. Il bar e' il posto dove si finisce quando la riunione e'
   * piena, che e' esattamente quello che succede in un ufficio vero.
   */
  /* ---- la porta ----
   *
   * Il vano sta a meta' del muro di sopra, nel corridoio fra le due stanze, e
   * `INGRESSO` e' dove si mettono i piedi appena dentro: da li' si entra e da li'
   * si esce, e non c'e' un altro modo di arrivare in questa stanza.
   *
   * Non e' la stessa `PORTA` della posta: quella e' il bordo di sotto della
   * cornice, cioe' "fuori dallo schermo, verso chi guarda", ed e' da li' che
   * volano le buste. Questa e' una porta vera, con due ante che si aprono.
   */
  const INGRESSO = [208, 30];
  /** Il vano: bordo sinistro e larghezza, in pixel. Due caselle. */
  const VANO = [192, 32];
  /** Quanto resta aperta dopo che qualcuno ci e' passato. */
  const PORTA_APERTA = 1600;

  let ante;
  let chiudiPorta;

  /**
   * Apre la porta, e la richiude da sola.
   *
   * Chi entra e chi esce la chiama e basta: non c'e' un conto di quanti ci sono
   * dentro il vano, perche' non serve — ogni passaggio rimanda avanti la
   * chiusura, e una porta che resta aperta un secondo di troppo mentre entra il
   * secondo di due e' esattamente quello che fa una porta vera.
   */
  function apriPorta() {
    if (!ante) return;
    ante.classList.add('aperta');
    clearTimeout(chiudiPorta);
    chiudiPorta = setTimeout(() => ante.classList.remove('aperta'), PORTA_APERTA);
  }

  const SGABELLI = [
    // Sala riunioni, di qua e di la' del tavolo. Chi sta di sopra lo si vede a
    // mezzo busto: il tavolo gli copre le gambe, ed e' giusto — sta dietro. I due
    // portatili non stanno affiancati ma uno dietro l'altro: il piano e' alto
    // tredici pixel, e due schermi alti nove sulla stessa riga non ci stanno.
    { x: 80, y: 76, lap: [82, 70], lz: 85, verso: 'giu' },
    { x: 80, y: 28, lap: [82, 59], lz: 85, verso: 'su' },
    // E i due capotavola, di fianco ai lati corti. Il portatile ce lo si mette
    // davanti sul tavolo, dalla propria parte: due portatili nello stesso punto
    // sono un portatile solo con due padroni.
    { x: 44, y: 54, lap: [66, 60], lz: 85, verso: 'sx' },
    { x: 116, y: 54, lap: [97, 60], lz: 85, verso: 'dx' },
    // Bar: uno per capotavola e uno davanti.
    { x: 269, y: 61, lap: [290, 66], lz: 91, verso: 'sx' },
    { x: 304, y: 84, lap: [306, 68], lz: 91, verso: 'giu' },
    { x: 340, y: 61, lap: [320, 66], lz: 91, verso: 'dx' },
  ];

  /* La bacheca, e basta.
   *
   * Un foglietto e' cinque per quattro con la puntina sopra, e non ci sta scritto
   * niente: a questa misura il testo non c'e' e il colore basta. Giallo da fare,
   * azzurro in mano a qualcuno, rosso andato storto, verde archiviato — sono
   * quattro colori e quattro stati, ed e' tutto quello che una bacheca dice
   * davvero anche quando i foglietti sono scritti.
   *
   * Una sola, e sul muro ce n'e' una sola. Le rosse in cima e le gialle sotto
   * stanno benissimo sullo stesso legno: e' il colore a dividerle, e tre bacheche
   * per una manciata di foglietti sono tre bacheche quasi vuote. La bacheca di
   * sughero che le stava accanto non c'e' piu': aveva i suoi fogli gia' disegnati
   * sopra, e appaiata a quella vera serviva soprattutto a non far capire quale
   * delle due si guarda.
   *
   * `griglia` e' l'angolo in alto a sinistra del primo foglietto: da li' in poi
   * quattro per riga, passo otto in orizzontale e sei in verticale. `posto` e'
   * dove ci si ferma davanti, e ci si arriva camminando come dappertutto. `z` e'
   * la profondita' del mobile a cui il foglio e' appeso, piu' uno: la stanza
   * ordina tutto sul bordo di sotto, e un foglio che non lo rispetta finisce
   * dietro al tavolo su cui dovrebbe stare.
   */
  const BACHECHE = {
    // Il posto sta a destra della bacheca e non davanti: davanti c'e' gia' quello
    // della commissione, e due che leggono lo stesso muro nello stesso punto sono
    // una persona sola disegnata due volte.
    muro: { griglia: [71, 10], posto: [112, 52], z: 37 },
  };

  /* ---- il bar, e le tazze che ci girano ----
   *
   * Quattro tazze, e sono quelle. Chi va a prendersi un caffe' ne prende una
   * dalla rastrelliera, la porta alla macchina, e da li' torna alla scrivania
   * dove la tazza resta a fumare accanto al monitor. Al giro dopo se la riporta
   * al bar: sei volte su dieci la ricarica e basta, quattro la lava e la
   * rimette a posto.
   *
   * Il conto e' l'unica cosa che rende la scena una scena e non un'animazione:
   * quando le tazze finiscono, la rastrelliera e' vuota davvero e chi arriva
   * torna indietro a mani vuote. E' quello a far leggere il bar come un posto
   * invece che come un mobile.
   */
  const MAX_TAZZE = 4;
  const BAR = { rastrelliera: [302, 60], macchina: [330, 60], lavandino: [356, 60] };
  /** Dove stanno le tazze sulla rastrelliera: due per ripiano. */
  const SCAFFALI = [
    [292, 22],
    [301, 22],
    [292, 32],
    [301, 32],
  ];
  /** Presa, erogazione, lavaggio, deposito, e il broncio di chi non ne trova. */
  const TEMPI = { prende: 800, fa: 2600, lava: 2400, posa: 600, broncio: 1600 };

  /* Dove si va quando ci si alza. Sono punti dove si mettono i piedi, non
     tragitti: la strada per arrivarci la trova la stanza, che sa dove sono i
     mobili. Prima erano catene di tappe scritte a mano, e bastava spostare uno
     scaffale perche' qualcuno ci camminasse dentro senza accorgersene.

     Al bar ci sono due posti separati perche' due che ci vanno insieme sono una
     pausa, mentre due fermi nello stesso punto sono una persona sola disegnata
     due volte. Si sta al bancone, fra la dispensa e il tavolino: davanti al
     tavolino la fascia libera e' due pixel e la stanza sigillata. */
  const METE = {
    caffe: [280, 62],
    spuntino: [320, 62],
    riunione: [52, 100],
  };
  /* Il bar pesa quattro volte il resto, ed e' giusto cosi': in un ufficio vero
     si va piu' spesso a prendere un caffe' che in sala riunioni. Pesare
     ripetendo il nome e' tutto quello che serve — una tabella di probabilita'
     sarebbe la stessa cosa scritta in dieci righe. */
  const NOMI_METE = ['caffe', 'spuntino', 'caffe', 'spuntino', 'riunione'];

  /* ---- le commissioni ----
   *
   * Le cose che in ufficio si fanno alzandosi e che non sono ne' lavoro ne'
   * caffe': annaffiare le piante, guardare cosa c'e' in dispensa, leggere la
   * bacheca, buttare la carta nel cestino.
   *
   * `posto` e' dove ci si ferma, `fx` dove va disegnato quello che si vede —
   * niente, per l'annaffiatoio, che sta addosso a chi annaffia — e `durata`
   * quanto ci si sta.
   *
   * Ce ne sono sei tipi: finestre da aprire in questa pianta non ce ne sono e il
   * sigaro del capo vorrebbe un ufficio del capo che qui non esiste, ma la
   * stampante e il boccione adesso stanno nella stanza — quindi ci si va. Una
   * commissione senza il suo mobile e' una persona che mima, e un mobile senza la
   * sua commissione e' arredamento: e' la stessa regola letta dai due lati.
   */
  const COMMISSIONI = [
    { k: 'annaffia', posto: [48, 146], durata: 4500, dice: 'Queste crescono in fretta' },
    { k: 'annaffia', posto: [330, 140], durata: 4500, dice: 'Un goccio d’acqua e via' },
    { k: 'annaffia', posto: [48, 296], durata: 4500, dice: 'Tocca a te, bella' },
    { k: 'annaffia', posto: [326, 296], durata: 4500, dice: 'Questa l’avevo dimenticata' },
    { k: 'dispensa', posto: [272, 60], fx: [262, 22], durata: 3200, dice: 'C’e’ rimasto qualcosa?' },
    { k: 'dispensa', posto: [272, 60], fx: [262, 22], durata: 3200, dice: 'Chi ha finito i biscotti?' },
    { k: 'bacheca', posto: [60, 52], fx: [71, 16], durata: 4000, dice: 'Qualcosa di nuovo?' },
    { k: 'cestino', posto: [126, 104], fx: [128, 84], durata: 2600, dice: 'Giornata di pulizie' },
    // Alla stampante ci si sta in piedi ad aspettare, che e' esattamente quello
    // che si fa davanti a una stampante. Il posto e' alla sua sinistra: davanti
    // c'e' il muro, e dietro non ci passa nessuno.
    { k: 'stampa', posto: [332, 200], fx: [346, 184], durata: 3600, dice: 'Aspetto che finisca' },
    { k: 'stampa', posto: [332, 200], fx: [346, 184], durata: 3600, dice: 'S’e’ inceppata di nuovo' },
    // E al boccione, piu' sotto. Due frasi come per la dispensa: e' il posto dove
    // ci si ferma senza un motivo, e sentirsi dire sempre la stessa cosa lo fa
    // sembrare un orario invece di una pausa.
    { k: 'acqua', posto: [332, 248], fx: [353, 226], durata: 3000, dice: 'Mi riempio la borraccia' },
    { k: 'acqua', posto: [332, 248], fx: [353, 226], durata: 3000, dice: 'Due dita e torno' },
  ];
  /** La prima dopo un po', poi ogni tanto: un ufficio non e' un cantiere. */
  const PRIMA_COMMISSIONE = 18000;
  const OGNI_COMMISSIONE = [14000, 32000];

  /* Quello che si dice in ufficio, e dove lo si dice.
   *
   * Erano un mucchio solo, pescate a caso, e si vedeva: uno fermo alla
   * macchinetta diceva "la stampante s'e' inceppata" e uno seduto alla scrivania
   * "il latte e' finito". Frasi giuste dette nel posto sbagliato, che e' il modo
   * piu' veloce di far sembrare finto un posto — una battuta fuori luogo si nota
   * prima di qualunque dettaglio del disegno. Adesso il mucchio lo sceglie dove
   * uno sta.
   *
   * Frasi corte apposta: a sei pixel una riga lunga esce dalla stanza, e comunque
   * in piedi vicino alla macchinetta nessuno fa un discorso.
   */
  const FRASI = {
    bar: [
      "Vado a fare un caffe'",
      'Prendi qualcosa anche tu?',
      "Il latte e' finito. Di nuovo",
      'Chi ha preso la mia tazza?',
      'Questo sa di bruciato',
      "Ne resta per uno solo",
      'Cinque minuti e arrivo',
    ],
    riunione: [
      'Punto veloce alle tre?',
      'Era una mail, non una call',
      'Ci aggiorniamo dopo pranzo',
      'Lo mettiamo a backlog',
      'Chi verbalizza?',
      'Giro di tavolo veloce',
    ],
    scrivania: [
      'In locale funzionava',
      "La stampante s'e' inceppata",
      'Te la giro per mail',
      'Due minuti e ho finito',
      'Domani ci penso',
      'Ho la call fra dieci minuti',
      "Venerdi' non si rilascia",
    ],
  };
  /** Di cosa si parla dove: la meta dove si e' andati lo dice gia'. */
  const DOVE = { caffe: 'bar', spuntino: 'bar', riunione: 'riunione' };

  /* Tutti i posti dove la stanza puo' mandare qualcuno, in un elenco solo.
     Non serve a far camminare nessuno — serve al controllo, ed e' l'unica cosa
     che tiene onesta questa pianta man mano che ci si aggiungono mobili: una
     meta finita dentro un armadio e' una persona che cammina contro un angolo
     per sempre, e a occhio non si nota finche' non tocca a lei. */
  const DESTINAZIONI = {
    ...METE,
    rastrelliera: BAR.rastrelliera,
    macchina: BAR.macchina,
    lavandino: BAR.lavandino,
    porta: INGRESSO,
    bacheca: BACHECHE.muro.posto,
    ...Object.fromEntries(SGABELLI.map((g, i) => ['sgabello' + i, [g.x + 8, g.y + 24]])),
    ...Object.fromEntries(COMMISSIONI.map((c, i) => [c.k + i, c.posto])),
  };

  // ---------- dove si puo' mettere i piedi ----------
  //
  // Una griglia da otto pixel su tutta la stanza: la casella e' occupata se ci
  // cade dentro un muro, un mobile o una scrivania. I mobili si contano per
  // tutta la loro sagoma e non solo per la base — sono alti perche' si vede il
  // fianco, ma dietro non ci passa nessuno lo stesso: stanno tutti contro un
  // muro.
  //
  // Gli ostacoli si gonfiano di otto in orizzontale e di due in verticale prima
  // di marcare le caselle. Non e' un margine di sicurezza: e' la persona. Il
  // conto si fa sui piedi, che sono un punto solo, ma la persona e' larga
  // sedici — quindi il punto deve stare almeno a mezza persona da un mobile, o
  // mezza spalla ci entra dentro. In verticale bastano due perche' i piedi
  // stanno gia' in fondo alla figura: la testa che sfiora uno scaffale, vista
  // dall'alto, e' giusto cosi'.
  const CELLA = 8;
  const GC = Math.ceil(W / CELLA);
  const GR = Math.ceil(H / CELLA);
  const MEZZA_PERSONA = 8;
  const MEZZO_PASSO = 2;
  const occupata = new Uint8Array(GC * GR);

  function blocca(x, y, w, h) {
    const x0 = x - MEZZA_PERSONA;
    const x1 = x + w + MEZZA_PERSONA;
    const y0 = y - MEZZO_PASSO;
    const y1 = y + h + MEZZO_PASSO;
    for (let r = 0; r < GR; r++) {
      const cy = r * CELLA + CELLA / 2;
      if (cy < y0 || cy > y1) continue;
      for (let c = 0; c < GC; c++) {
        const cx = c * CELLA + CELLA / 2;
        if (cx >= x0 && cx <= x1) occupata[r * GC + c] = 1;
      }
    }
  }

  for (const w of WALLS) blocca(w.c * TILE, w.r * TILE, w.w * TILE, w.h * TILE);
  for (const p of PROPS) {
    // Gli sgabelli no. Sono l'unico mobile su cui ci si mette SOPRA invece che
    // attorno, e marcarli occupati voleva dire che il posto a sedere era una
    // casella proibita: la strada si fermava accanto e non ci arrivava nessuno.
    if (p.s === 'stoolRound') continue;
    const d = SV[p.s];
    blocca(p.x, p.b - d.h, d.w, d.h);
  }
  for (const p of DISEGNATI) blocca(p.x, p.b - p.h, p.w, p.h);
  for (const d of DESKS) blocca(d.x, d.b - SH, SW, SH);

  const cella = (x, y) =>
    Math.min(GR - 1, Math.max(0, Math.floor(y / CELLA))) * GC +
    Math.min(GC - 1, Math.max(0, Math.floor(x / CELLA)));
  const centro = (n) => [(n % GC) * CELLA + CELLA / 2, ((n / GC) | 0) * CELLA + CELLA / 2];

  /** Il segmento fila dritto senza prendere niente? Si campiona ogni due pixel. */
  function dritto(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 0; i <= n; i++) {
      if (occupata[cella(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)]) return false;
    }
    return true;
  }

  /* La strada da un punto all'altro, in punti dove mettere i piedi.

     Onda a quattro direzioni su tutte le caselle libere, poi si sceglie la piu'
     vicina alla meta' fra quelle a cui si e' arrivati: cosi' una meta' murata —
     o diventata tale spostando un mobile — porta comunque il piu' vicino
     possibile, invece di non portare da nessuna parte. Millenovecento caselle
     non si sentono.

     Il cammino grezzo e' tutto a scalini di otto pixel. Si tira la corda: si va
     avanti finche' si vede il punto in linea retta, e si tiene solo quello piu'
     lontano. Restano tre o quattro tratti lunghi, che e' come attraversa una
     stanza uno che sa dove sta andando. */
  function cammino(x0, y0, x1, y1) {
    const partenza = cella(x0, y0);
    const da = new Int32Array(GC * GR).fill(-1);
    da[partenza] = partenza;
    const coda = [partenza];
    for (let i = 0; i < coda.length; i++) {
      const n = coda[i];
      const c = n % GC;
      const r = (n / GC) | 0;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= GC || r2 >= GR) continue;
        const m = r2 * GC + c2;
        if (occupata[m] || da[m] >= 0) continue;
        da[m] = n;
        coda.push(m);
      }
    }
    let meglio = partenza;
    let quanto = Infinity;
    for (const n of coda) {
      const [cx, cy] = centro(n);
      const d = Math.hypot(cx - x1, cy - y1);
      if (d < quanto) {
        quanto = d;
        meglio = n;
      }
    }
    const grezzo = [];
    for (let n = meglio; n !== partenza; n = da[n]) grezzo.unshift(centro(n));
    // L'ultimo passo e' la meta' vera e non il centro della casella, quando ci
    // si arriva dritti: se no la gente si ferma sempre sul reticolo.
    const ultimo = grezzo.length ? grezzo[grezzo.length - 1] : [x0, y0];
    if (dritto(ultimo[0], ultimo[1], x1, y1)) grezzo.push([x1, y1]);

    const tirato = [];
    let qui = [x0, y0];
    let i = 0;
    while (i < grezzo.length) {
      let j = grezzo.length - 1;
      while (j > i && !dritto(qui[0], qui[1], grezzo[j][0], grezzo[j][1])) j--;
      tirato.push(grezzo[j]);
      qui = grezzo[j];
      i = j + 1;
    }
    return tirato;
  }

  // ---------- come si costruisce ----------

  /** Appoggia un ritaglio del foglio: bordo sinistro `x`, bordo di sotto `b`. */
  function prop(name, x, b, cls) {
    const d = SV[name];
    const n = el('div', cls ? 'of-prop ' + cls : 'of-prop');
    n.dataset.k = name;
    n.style.left = x + 'px';
    n.style.top = b - d.h + 'px';
    n.style.width = d.w + 'px';
    n.style.height = d.h + 'px';
    n.style.backgroundPosition = -d.x + 'px ' + -d.y + 'px';
    return depth(n, b);
  }

  /**
   * Costruisce la stanza dentro `stage`: pavimento, muri, mobili, scrivanie.
   *
   * Il foglio arriva come indirizzo e non come classe perche' nella webview e'
   * un URI che sa solo l'estensione. Da li' in poi e' foglio di stile.
   *
   * Torna le scrivanie con addosso il loro schermo, che e' l'unica cosa della
   * stanza che poi cambia: chi la usa lo accende e lo spegne.
   */
  function monta(stage, foglio) {
    palco = stage;
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.setProperty('--sheet-room', 'url("' + foglio + '")');
    stage.append(el('div', 'of-floor'));

    for (const w of WALLS) {
      const n = el('div', 'of-wall');
      n.style.left = w.c * TILE + 'px';
      n.style.top = w.r * TILE + 'px';
      n.style.width = w.w * TILE + 'px';
      n.style.height = w.h * TILE + 'px';
      stage.append(depth(n, (w.r + w.h) * TILE));
    }
    /* La porta. Due ante che si aprono verso i due stipiti, e dietro il buio di
       quello che c'e' fuori. Nel foglio non c'e' — SeasonVale e' una fattoria —
       e comunque e' l'unica parte del muro che deve muoversi, il che vuol dire
       una cosa disegnata e non un ritaglio.

       Profondita' del muro: chi ci passa in mezzo ha i piedi piu' in basso e
       quindi le passa davanti, che e' giusto — sta entrando, non uscendo dal
       muro. */
    ante = el('div', 'of-porta');
    ante.append(el('i', 'anta sx'), el('i', 'anta dx'));
    ante.style.left = VANO[0] + 'px';
    ante.style.width = VANO[1] + 'px';
    stage.append(depth(ante, TILE));

    for (const p of PROPS) stage.append(prop(p.s, p.x, p.b));
    // I due disegnati a mano. Stessa regola: si appoggiano per terra dal bordo di
    // sotto, e chi sta piu' in basso copre chi sta piu' in alto.
    for (const p of DISEGNATI) {
      const n = el('div', 'of-' + p.s);
      n.style.left = p.x + 'px';
      n.style.top = p.b - p.h + 'px';
      n.style.width = p.w + 'px';
      n.style.height = p.h + 'px';
      stage.append(depth(n, p.b));
    }

    // Le tazze sulla rastrelliera. Vanno appena sopra lo scaffale — che sta
    // contro il muro in fondo al bar — e sotto chi ci passa davanti.
    rastrelliera = el('div', 'of-tazze');
    depth(rastrelliera, 49);
    stage.append(rastrelliera);
    disegnaTazze();

    return DESKS.map((d) => {
      stage.append(prop('desk', d.x, d.b, 'of-desk'));
      // Il computer non viene dal foglio: nel pacchetto non c'e' — e' una
      // fattoria medievale — e comunque e' l'unico mobile che deve accendersi,
      // il che vuol dire un colore che cambia e non un'immagine.
      const mon = el('div', 'of-mon');
      mon.append(el('i', 'of-screen'));
      mon.style.left = d.x + 15 + 'px';
      // Il piano della scrivania non e' la cima dello sprite: e' la riga del
      // ripiano, quattro pixel piu' sotto. E' li' che va appoggiato il piede del
      // monitor, se no sembra appeso al muro dietro.
      mon.style.top = d.b - SH + 4 - 16 + 'px';
      // Lo schermo sta SOPRA il piano, non dietro: e' l'unica cosa della stanza
      // che non segue la riga, perche' e' appoggiato sul mobile che la occupa.
      stage.append(depth(mon, d.b + 1));
      return { x: d.x, b: d.b, top: d.b - SH, mon };
    });
  }

  // ---------- come ci si veste ----------
  //
  // Le pose, e quanto ci mette un giro di ciclo. Chi lavora batte a macchina in
  // fretta, chi cammina va a tempo di passo, tutti gli altri respirano piano.
  const DURATA = { fermo: 1700, digita: 420, cammina: 560 };

  /**
   * Veste una figura con la posa che le tocca.
   *
   * Il generatore da' una striscia di fotogrammi affiancati, e il CSS la fa
   * scorrere a scatti interi: nessun timer in JavaScript, e una stanza che si
   * muove anche mentre nessuno la guarda. Se il generatore non sa fare le
   * strisce si ripiega sul disegno fermo — meglio un ufficio immobile che sei
   * scrivanie vuote.
   */
  function vesti(fig, seme, posa) {
    if (fig.dataset.posa === posa && fig.dataset.seme === seme) return;
    fig.dataset.posa = posa;
    fig.dataset.seme = seme;
    const s = window.NPC.strip && window.NPC.strip(seme, posa);
    if (s && s.frames > 1) {
      fig.style.setProperty('--npc', 'url("' + s.url + '")');
      fig.style.setProperty('--nf', s.frames);
      fig.style.setProperty('--nw', s.frames * 16 + 'px');
      fig.style.setProperty('--nd', DURATA[posa] + 'ms');
    } else {
      fig.style.setProperty('--npc', 'url("' + window.NPC.sprite(seme) + '")');
      fig.style.setProperty('--nf', 1);
      fig.style.setProperty('--nw', '16px');
    }
  }

  // ---------- e la vita ----------
  //
  // Ogni tanto uno si alza e va da qualche parte, e ci va per davvero: la strada
  // se la trova, mobile per mobile.
  //
  // Ma solo chi non ha niente da fare. Chi sta lavorando resta alla sua
  // scrivania e batte a macchina: e' l'unica regola che rende l'ufficio
  // leggibile da lontano — se si alzano tutti, il fatto che uno sia in piedi non
  // vuol piu' dire niente. E chi e' fermo da un pezzo non si alza e non parla:
  // sbiadito e in giro sarebbe una contraddizione.
  //
  // E si va in due al massimo, che a questa misura tre che si incrociano per i
  // corridoi sembrano solo confusione.

  /* Pixel al secondo. Due caselle al secondo: il bar sta in fondo alla stanza e
     dall'altra parte di due porte, e a passo di lumaca la pausa caffe' era tutta
     corridoio e mai bar. */
  const VELOCITA = 32;
  /** Due in giro insieme sono una pausa; tre che si incrociano sono confusione. */
  const MAX_FUORI = 2;
  /* E quanto si sta al proprio posto prima di potersi rialzare.

     Senza, con una conversazione sola aperta il giro qui sotto ripescava sempre
     lo stesso: usciva, tornava, e cinque secondi dopo era di nuovo in corridoio
     — cioe' un ufficio dove l'unico che c'e' non lavora mai. Il lavoro e' la
     regola e la pausa l'eccezione, e due minuti al posto sono la differenza fra
     "ogni tanto si alza" e "sta sempre in giro". */
  const RIPOSO = 120000;
  /** Ogni quanto si guarda se Claude e' ripartito, mentre uno e' al bar. */
  const ORECCHIO = 250;

  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
  const caso = (a) => a[Math.floor(Math.random() * a.length)];
  /** Chi si puo' alzare adesso: ha un posto, non sta gia' fuori, non lavora, e ci e' stato un po'. */
  const libero = (c) =>
    !c.fuori && !c.ferma && !c.lavora && c.casa && Date.now() - (c.ultimo || 0) >= RIPOSO;
  const piedi = (chi) => [parseFloat(chi.el.style.left) + 8, parseFloat(chi.el.style.top) + 24];

  function muovi(chi, fx, fy) {
    const x = fx - 8;
    const y = fy - 24;
    const dx = x - parseFloat(chi.el.style.left);
    const dy = y - parseFloat(chi.el.style.top);
    const ms = (Math.hypot(dx, dy) / VELOCITA) * 1000;
    chi.el.style.transition = 'left ' + ms + 'ms linear, top ' + ms + 'ms linear';
    chi.el.style.left = x + 'px';
    chi.el.style.top = y + 'px';
    // La profondita' cambia mentre si cammina: chi scende davanti a una
    // scrivania deve passarci davanti, chi risale deve sparirci dietro.
    depth(chi.el, fy);
    return attesa(ms);
  }

  /**
   * Ci va, tratto per tratto.
   *
   * Si ferma per due motivi: la conversazione si e' chiusa mentre lui era in
   * corridoio — e da li' in poi non c'e' piu' nessuno da muovere — oppure Claude
   * e' ripartito, e allora la pausa finisce dov'e'. Il ritorno no: quello non lo
   * ferma niente, perche' tornare a sedersi *e'* la cosa da fare.
   */
  async function vai(chi, fx, fy, ritorno) {
    for (const [x, y] of cammino(...piedi(chi), fx, fy)) {
      if (!chi.el.isConnected) return false;
      if (!ritorno && chi.lavora) return false;
      await muovi(chi, x, y);
    }
    return chi.el.isConnected;
  }

  /**
   * Porta un elemento da dov'e' a `[fx, fy]`, e basta.
   *
   * `vai` qui sopra e' per chi ha una scrivania e una conversazione dietro: si
   * ferma se Claude riparte, e sa dove tornare. Gli impiegati dei sub-agent non
   * hanno niente di tutto questo — entrano dalla porta, si mettono accanto al
   * loro capo e se ne vanno quando hanno finito — e per loro serve solo la
   * strada. Il tragitto e' quello vero: la stanza sa dove sono i mobili.
   */
  async function viaggio(el, fx, fy) {
    const chi = { el };
    for (const [x, y] of cammino(...piedi(chi), fx, fy)) {
      if (!el.isConnected) return false;
      await muovi(chi, x, y);
    }
    return el.isConnected;
  }

  /** Aspetta, ma con un orecchio: se Claude riparte la pausa finisce subito. */
  async function pausa(chi, ms) {
    const fine = Date.now() + ms;
    while (Date.now() < fine && !chi.lavora && chi.el.isConnected) {
      await attesa(Math.min(ORECCHIO, fine - Date.now()));
    }
  }

  /* Uno parla alla volta e per tre secondi: due nuvolette insieme a questa
     misura sono due rettangoli bianchi, e nessuno legge due rettangoli bianchi.

     `testo` si passa quando quello che si dice dipende da chi lo dice — le
     battute che si tirano al capo, o la task che si sta facendo. Senza, si pesca
     dal mucchio del posto dove uno sta. */
  function parla(chi, testo) {
    if (chi.dice || !chi.el.isConnected) return;
    const n = el('div', 'of-say');
    // Senza testo si pesca dal mucchio di dove si sta: al bar si parla di caffe',
    // in riunione di riunioni, e alla propria scrivania del proprio lavoro.
    n.textContent = testo || caso(FRASI[DOVE[chi.meta] || 'scrivania']);
    chi.el.append(n);
    chi.dice = n;
    setTimeout(() => {
      n.remove();
      if (chi.dice === n) chi.dice = null;
    }, 3200);
  }

  // ---------- il caffe' ----------

  /** Il palco, per le cose che non stanno addosso a nessuno: le tazze. */
  let palco;
  let rastrelliera;
  let tazzePulite = MAX_TAZZE;

  function disegnaTazze() {
    if (!rastrelliera) return;
    rastrelliera.replaceChildren(
      ...SCAFFALI.slice(0, tazzePulite).map(([x, y]) => {
        const n = el('i', 'of-tazza');
        n.style.left = x + 'px';
        n.style.top = y + 'px';
        return n;
      })
    );
  }

  /** Se la prende in mano. */
  function prendi(chi) {
    chi.tazza = el('i', 'of-tazza addosso');
    chi.el.append(chi.tazza);
  }

  /** E la posa sulla scrivania, dove resta a fumare anche mentre lui e' al bar. */
  function posa(chi) {
    if (!chi.tazza) return;
    chi.tazza.remove();
    chi.tazza = null;
    if (!chi.casa || !palco) return;
    chi.tazzaFerma = el('i', 'of-tazza piena');
    chi.tazzaFerma.style.left = chi.casa.x + 20 + 'px';
    chi.tazzaFerma.style.top = chi.casa.y - 6 + 'px';
    chi.tazzaFerma.style.zIndex = chi.casa.y + 10;
    palco.append(chi.tazzaFerma);
  }

  /**
   * Il giro delle tazze, in coda a una pausa al bar.
   *
   * Chi ci arriva con la tazza in mano l'ha portata dalla scrivania: sei volte
   * su dieci la ricarica e basta — che e' quello che si fa davvero — e quattro
   * la lava e la rimette a posto. Chi ci arriva a mani vuote e non ne ha una che
   * lo aspetta alla scrivania, tre volte su quattro se ne prende una.
   *
   * ponytail: i tragitti di qui dentro non si fermano se Claude riparte. Sono
   * dieci secondi al massimo, e una corsa interrotta a meta' lascia una tazza
   * fuori dal conto — che e' l'unico modo in cui questa scena si rompe davvero.
   */
  async function caffe(chi) {
    if (chi.tazza) {
      if (Math.random() < 0.6) {
        if (await vai(chi, ...BAR.macchina, true)) {
          parla(chi, 'Me ne faccio un altro');
          await attesa(TEMPI.fa);
        }
        return;
      }
      if (await vai(chi, ...BAR.lavandino, true)) {
        parla(chi, 'La lavo e la rimetto');
        await attesa(TEMPI.lava);
      }
      if (await vai(chi, ...BAR.rastrelliera, true)) {
        await attesa(TEMPI.posa);
        if (chi.tazza) {
          chi.tazza.remove();
          chi.tazza = null;
          tazzePulite = Math.min(MAX_TAZZE, tazzePulite + 1);
          disegnaTazze();
        }
      }
      return;
    }
    if (chi.tazzaFerma || Math.random() >= 0.75) return;
    if (!(await vai(chi, ...BAR.rastrelliera, true))) return;
    // La rastrelliera vuota e' vuota davvero: e' il conto a farla vuota, e sono
    // le stesse quattro tazze che girano da mezz'ora.
    if (tazzePulite <= 0) {
      parla(chi, 'Non c’e’ piu’ una tazza pulita');
      await attesa(TEMPI.broncio);
      return;
    }
    tazzePulite--;
    disegnaTazze();
    await attesa(TEMPI.prende);
    if (!chi.el.isConnected) {
      tazzePulite = Math.min(MAX_TAZZE, tazzePulite + 1);
      disegnaTazze();
      return;
    }
    prendi(chi);
    if (await vai(chi, ...BAR.macchina, true)) {
      parla(chi, 'Ne metto su uno');
      await attesa(TEMPI.fa);
    }
  }

  async function giro(chi, meta) {
    chi.fuori = true;
    chi.meta = meta;
    // Detto anche addosso all'elemento, non solo dentro l'oggetto: da fuori —
    // il foglio di stile, gli attrezzi del browser, i controlli — "e' in
    // corridoio" e' una cosa che si vede, e la posizione di chi cammina non
    // vuol dire niente finche' non e' tornato a sedersi.
    chi.el.classList.add('fuori');
    // Se ne ha una che la aspetta sulla scrivania se la porta dietro: al bar ci
    // si va con la propria tazza, non se ne prende un'altra ogni volta. E' la
    // riga che tiene il conto delle quattro tazze a quattro.
    if (chi.tazzaFerma && (meta === 'caffe' || meta === 'spuntino')) {
      chi.tazzaFerma.remove();
      chi.tazzaFerma = null;
      prendi(chi);
    }
    vesti(chi.fig, chi.seme, 'cammina');
    const albar = meta === 'caffe' || meta === 'spuntino';
    if (await vai(chi, ...METE[meta])) {
      vesti(chi.fig, chi.seme, 'fermo');
      // Al bar ci si ferma quattro volte tanto. Non e' un vezzo: fra andata e
      // ritorno il tragitto e' mezzo minuto, e con una sosta di due secondi al
      // bar non ci si vede mai nessuno — si vede solo gente nei corridoi.
      const sosta = albar ? 8000 : 2000;
      parla(chi);
      await pausa(chi, sosta + Math.random() * 2500);
      if (albar) await caffe(chi);
      vesti(chi.fig, chi.seme, 'cammina');
    }
    // Si torna sempre, anche se la pausa e' finita a meta' strada: l'unico modo
    // di non tornare e' che la conversazione si sia chiusa, o che nel frattempo
    // il posto non sia piu' suo.
    if (chi.el.isConnected && chi.casa) await vai(chi, chi.casa.x + 8, chi.casa.y + 24, true);
    // E la tazza finisce sulla scrivania, dove resta a fumare anche mentre lui
    // e' da un'altra parte.
    posa(chi);
    vesti(chi.fig, chi.seme, chi.posa);
    chi.el.classList.remove('fuori');
    chi.fuori = false;
    chi.meta = null;
    chi.ultimo = Date.now();
  }

  /** A che punto e' il giro delle mete. */
  let prossima = 0;

  /**
   * Il giro, per sempre: `elenco` viene richiamata ogni volta perche' la gente
   * va e viene — una conversazione si chiude e chi la teneva sparisce.
   *
   * Un abitante e': `{ el, fig, seme, casa: {x, y}, posa, ferma, lavora }`. Il
   * resto — `fuori`, `meta`, `dice`, `ultimo` — se lo scrive la stanza addosso.
   */
  async function vita(elenco) {
    for (;;) {
      await attesa(3000 + Math.random() * 4000);
      const tutti = elenco();
      const fuori = tutti.filter((c) => c.fuori);
      if (fuori.length >= MAX_FUORI) continue;
      // Chi lavora resta al suo posto: si va a cazzeggiare solo quando non c'e'
      // niente da fare, come in ufficio — e non due volte di fila.
      const liberi = tutti.filter(libero);
      if (!liberi.length) continue;
      // Anche le mete girano, invece di uscire a caso: fra andata, sosta e
      // ritorno un giro dura mezzo minuto, quindi in una stanza guardata per un
      // minuto il caso poteva benissimo non mandare nessuno al bar — ed e' meta'
      // del motivo per cui uno si alza. Quelle gia' occupate si saltano: due
      // fermi nello stesso punto sono una persona sola disegnata due volte.
      const presi = new Set(fuori.map((c) => c.meta));
      let meta = null;
      for (let i = 0; i < NOMI_METE.length && !meta; i++) {
        const m = NOMI_METE[prossima];
        prossima = (prossima + 1) % NOMI_METE.length;
        if (!presi.has(m)) meta = m;
      }
      if (!meta) continue;
      // Tocca a chi e' tornato al posto per primo: cosi' il giro fa il giro
      // davvero, invece di ricadere sempre sugli stessi due. Non si aspetta che
      // rientri — e' proprio l'attesa che teneva l'ufficio a uno in piedi.
      giro(
        liberi.reduce((a, b) => ((a.ultimo || 0) <= (b.ultimo || 0) ? a : b)),
        meta
      );
    }
  }

  // ---------- le commissioni ----------
  //
  // Un giro a parte da quello del bar, e piu' lento: due volte al minuto scarse,
  // e nemmeno sempre. Sono le cose che fanno sembrare abitato un ufficio proprio
  // perche' non succedono spesso — una che annaffia le piante ogni dieci secondi
  // non e' un ufficio, e' un giardino.

  /** Le commissioni gia' prese: una persona per posto, o sono due che mimano. */
  const prese = new Map();

  /** Quello che si vede: le gocce addosso a chi annaffia, il resto sul mobile. */
  function effetto(chi, c) {
    if (c.k === 'annaffia') {
      const n = el('i', 'of-annaffia');
      n.append(el('i'), el('i'), el('i'));
      chi.el.append(n);
      return n;
    }
    const n = el('i', 'of-fx ' + c.k);
    n.style.left = c.fx[0] + 'px';
    n.style.top = c.fx[1] + 'px';
    depth(n, c.fx[1] + 40);
    palco.append(n);
    return n;
  }

  async function commissione(chi, i) {
    const c = COMMISSIONI[i];
    prese.set(i, chi);
    chi.fuori = true;
    chi.meta = 'commissione';
    chi.el.classList.add('fuori');
    vesti(chi.fig, chi.seme, 'cammina');
    let fx = null;
    if (await vai(chi, ...c.posto)) {
      vesti(chi.fig, chi.seme, 'fermo');
      parla(chi, c.dice);
      fx = effetto(chi, c);
      await pausa(chi, c.durata);
      vesti(chi.fig, chi.seme, 'cammina');
    }
    if (fx) fx.remove();
    prese.delete(i);
    if (chi.el.isConnected && chi.casa) await vai(chi, chi.casa.x + 8, chi.casa.y + 24, true);
    posa(chi);
    vesti(chi.fig, chi.seme, chi.posa);
    chi.el.classList.remove('fuori');
    chi.fuori = false;
    chi.meta = null;
    chi.ultimo = Date.now();
  }

  async function commissioni(elenco) {
    await attesa(PRIMA_COMMISSIONE);
    for (;;) {
      // Due terzi delle volte, e non sempre: un turno saltato e' quello che
      // rende il turno dopo una cosa che succede invece che un orario.
      if (Math.random() < 0.65) {
        const liberi = elenco().filter(libero);
        const posti = COMMISSIONI.map((_, i) => i).filter((i) => !prese.has(i));
        if (liberi.length && posti.length) commissione(caso(liberi), caso(posti));
      }
      await attesa(OGNI_COMMISSIONE[0] + Math.random() * (OGNI_COMMISSIONE[1] - OGNI_COMMISSIONE[0]));
    }
  }

  /** Le chiacchiere vanno per conto loro: si parla anche da seduti — ma non
      mentre si lavora, che e' il punto di tutto il resto. */
  async function chiacchiere(elenco) {
    for (;;) {
      await attesa(4000 + Math.random() * 5000);
      const vivi = elenco().filter((c) => !c.ferma && !c.lavora && !c.dice);
      if (vivi.length) parla(caso(vivi));
    }
  }

  // ---------- la posta ----------
  //
  // Una busta che vola dalla porta a una scrivania quando parte un turno, e
  // dalla scrivania alla porta quando il turno finisce.
  //
  // Non e' un vezzo: uno schermo acceso e uno che si spegne dicono *com'e'
  // adesso*, e stando dall'altra parte della stanza il momento in cui cambia si
  // perde. La busta dice il momento — e da lontano, prima ancora di leggere un
  // nome, si vede se la stanza sta ricevendo o consegnando.
  //
  // La porta e' il muro in fondo in mezzo: e' da li' che entri tu, ed e' l'unico
  // punto della pianta che non e' di nessuno.
  //
  // Vola per conto suo. Gli estremi si fissano alla partenza — chi la manda puo'
  // benissimo alzarsi e andare al bar mentre lei e' ancora in aria, e una busta
  // che insegue una persona e' una busta che sbanda. L'arco lo fa `offset-path`:
  // una curva di due punti e un'animazione sola, invece di un timer che ridipinge
  // un elemento sessanta volte al secondo per un secondo e mezzo.
  const PORTA = [W / 2, H - TILE];
  /** Quante ne stanno in aria insieme. Oltre, sono coriandoli. */
  const MAX_BUSTE = 8;

  /**
   * Manda una busta fra la porta e `[x, y]`.
   *
   * `verso` e' `'giu''` quando la risposta esce e `'su'` quando il turno entra;
   * decide il colore e da che parte si vola.
   */
  function posta(stage, x, y, verso) {
    // Si contano quelle che ci sono, invece di tenere il conto: la stanza si
    // rimonta da capo quando la scheda si riapre, e un contatore sopravvissuto a
    // un rimontaggio e' un contatore che dice otto per sempre.
    if (stage.querySelectorAll('.of-mail').length >= MAX_BUSTE) return;
    const [px, py] = PORTA;
    const [x0, y0, x1, y1] = verso === 'su' ? [px, py, x, y] : [x, y, px, py];
    const n = el('div', 'of-mail ' + verso);
    // Il punto di controllo sta in mezzo e trentotto pixel piu' in alto: e'
    // quello che fa la campata. Piatta, una busta sembra trascinata per terra.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - 38;
    n.style.offsetPath = `path("M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}")`;
    // La durata viene dalla distanza, non dall'orologio: una busta che attraversa
    // tutta la stanza nello stesso tempo di una che va alla scrivania accanto e'
    // una che vola e una che scatta.
    const ms = Math.min(2000, Math.max(800, (Math.hypot(x1 - x0, y1 - y0) / 230) * 1000));
    n.style.animationDuration = ms + 'ms';
    n.addEventListener('animationend', () => n.remove());
    stage.append(n);
  }

  return {
    TILE,
    COLS,
    ROWS,
    W,
    H,
    SV,
    PROPS,
    DISEGNATI,
    DESKS,
    SGABELLI,
    INGRESSO,
    apriPorta,
    METE,
    DESTINAZIONI,
    BACHECHE,
    PORTA,
    SW,
    SH,
    posto,
    monta,
    posta,
    parla,
    viaggio,
    vesti,
    /**
     * Se ne va per sempre: la conversazione si e' chiusa.
     *
     * Serve per una cosa sola, ed e' il conto delle tazze. Chi sparisce con una
     * tazza in mano — o lasciandone una sulla scrivania — se la porta via dal
     * conto, e dopo qualche giro la rastrelliera e' vuota per sempre senza che
     * nessuno abbia bevuto niente. Qui la tazza torna a posto.
     *
     * Se torna quando il conto e' gia' pieno, il conto era gia' sbagliato prima:
     * si dice, e si tappa lo stesso. Un ufficio con cinque tazze su quattro e'
     * meno grave di uno che si ferma a discuterne.
     */
    congeda(chi) {
      if (!chi.tazza && !chi.tazzaFerma) return;
      if (chi.tazza) chi.tazza.remove();
      if (chi.tazzaFerma) chi.tazzaFerma.remove();
      chi.tazza = null;
      chi.tazzaFerma = null;
      if (tazzePulite >= MAX_TAZZE) console.warn('[ufficio] tazza di troppo: il conto e\' andato alla deriva');
      tazzePulite = Math.min(MAX_TAZZE, tazzePulite + 1);
      disegnaTazze();
    },
    cammino,
    occupata,
    cella,
    /** Si accende una volta: da li' in poi la stanza vive da sola. */
    accendi(elenco) {
      vita(elenco);
      chiacchiere(elenco);
      commissioni(elenco);
    },
  };
})();
