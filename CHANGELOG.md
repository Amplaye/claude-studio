# Changelog

## 0.25.0

- **L'ufficio non si chiude piu' alle tue spalle.** Aprendo una conversazione
  nuova da dentro la stanza, la scheda che nasce e' anche lei nella stanza: prima
  ti ritrovavi in una scheda vuota e senza ufficio, e per scrivere a chiunque non
  fosse la prima conversazione toccava tornare alla chat normale. Lo stesso vale
  per il clic su una persona: la sua conversazione si apre in ufficio, non fuori.

- **Chi ti sta aspettando adesso si vede.** Una conversazione ferma su un
  permesso sta seduta identica a una che ha finito, e quella domanda poteva
  restare li' un'ora. Ora sopra la testa lampeggia un punto esclamativo e la
  targhetta sulla scrivania si accende; cliccando la persona esce il foglio con
  quello che ti sta chiedendo, e da li' si risponde — consenti o nega — senza
  passare dalla sua chat. Alle domande a scelta multipla si risponde di la',
  dove ci sono le scelte: il foglio ti ci porta.

- **Le conversazioni sotto la sesta esistevano ma non si potevano raggiungere.**
  Nella scheda a tutto schermo la colonna delle conversazioni era `display:
  block`, e l'elenco dentro cresceva oltre il fondo della colonna, che lo
  tagliava: niente barra di scorrimento e nessun modo di arrivarci. Adesso scorre,
  e la barra si prende il suo posto invece di comparire e sparire.

- **Le barre di contesto hanno una cornice**, e il cursore della barra di
  scorrimento un colore che si vede: era il grigio delle righine di separazione,
  ridotto a quattro pixel.

- **L'aggiornamento della CLI non si incaglia piu'** su quello che un `npm i -g`
  interrotto si lascia dietro: i suoi resti si spazzano via e l'installazione si
  riprova una volta sola.

## 0.24.0

- **THE OFFICE.** La fascia in cima dice solo dove sei e quanto contesto resta:
  chi c'è si vede nella stanza, ripeterlo per nome era dirlo due volte. Il "Chat"
  per uscire è passato nella testata, al posto del marchio.

- **Tre sgabelli in più, a capotavola.** Due ai lati corti del tavolo della sala
  riunioni, uno a quello del bar: sette posti oltre alle sei scrivanie, e li
  prendono i sub-agent quando le scrivanie finiscono.

- **In ufficio si lavora.** Alla scrivania si batte a macchina anche fra un turno
  e l'altro, e ci si alza ogni due minuti invece che ogni cinque secondi. Che
  Claude stia macinando *adesso* lo dicono l'anello verde, i puntini e lo schermo.

- **Una bacheca sola.** Anche quello che è fatto sta sul muro con il resto: la
  pila sul tavolo era un secondo posto dove andare a controllare le stesse cose.

- **Quello che scrivi mentre lavora cambia il piano.** Un messaggio in coda resta
  quindici secondi a portata di mano — si corregge, si ritira — e poi entra nel
  turno *in corso* invece di aspettarne la fine. Aspettare la fine voleva dire
  cambiare un piano quando non c'era più niente da cambiare.

- **Le foto e il filmato del negozio sono rifatti**, con THE OFFICE dentro. E il
  README è la metà: più immagini, meno righe.

## 0.23.0

- **L’ufficio è diventato un posto dove si lavora davvero.** La stanza non è più
  otto rettangoli con dentro dei cerchi: pavimento e muri di assito, sei scrivanie
  in due file, il bar col bancone e il tavolino, la sala riunioni, le piante negli
  angoli. I mobili sono ritagliati dal foglio di SeasonVale; quelli che una fattoria
  medievale non ha — il cestino della carta, la macchina del caffè, il lavandino —
  sono disegnati in CSS a colori pieni, perché un mobile che la scena dà per
  esistente e a guardarlo è un altro mobile è peggio che non averlo. La pianta, la
  griglia dei passi e il giro di chi si alza stanno in un file solo (`webview/room.js`)
  che si prendono sia l’ufficio sia la pagina di prova: due copie della stessa stanza
  si scollano al primo mobile spostato.

- **Ogni conversazione è un capo, e i suoi sub-agent vengono a lavorare.** I sub-agent
  che una conversazione apre entrano dalla porta, si siedono alla scrivania libera più
  vicina al loro capo — così il gruppetto resta un gruppetto — e riescono dalla porta
  quando hanno finito. Due schede aperte sono due capi, ognuno coi suoi: è la gerarchia
  vera, non una inventata per fare scena. Il legame era già sul filo e non lo sapeva
  nessuno, il quadro delle task viaggia sotto lo stesso id della card.

- **La bacheca, e i foglietti che se li porta chi lavora.** Al muro della sala riunioni
  una bacheca, sul tavolo la pila di quello che è fatto. Un foglietto è cinque pixel per
  quattro con la puntina: giallo da fare, rosso andato storto, verde archiviato, azzurro
  in mano a chi lo sta facendo. Non si spostano da soli — un sub-agent stacca il suo, se
  lo porta accanto al capo, e alla fine lo va a posare sull’archivio o lo riappende rosso.
  Il foglio è uno solo e sta dove sta la persona che lo porta, quindi la bacheca non può
  contare due volte lo stesso lavoro. Cliccandola esce il piano di ogni conversazione
  aperta, la stessa lista di passi della colonna del contesto.

- **Quattro tazze, e sono quelle.** Al bar la rastrelliera ne ha quattro. Chi va a
  prendersi un caffè ne prende una, la porta alla macchina, e torna alla scrivania dove
  la tazza resta a fumare accanto al monitor; al giro dopo se la riporta indietro e sei
  volte su dieci la ricarica e basta. Quando le tazze finiscono la rastrelliera è vuota
  davvero e chi arriva torna a mani vuote. Se una conversazione si chiude, la sua tazza
  rientra nel conto.

- **Le commissioni.** Annaffiare le piante, guardare in dispensa, leggere la bacheca,
  buttare la carta nel cestino. Una ogni venti secondi scarsi e nemmeno sempre: sono le
  cose che fanno sembrare abitato un ufficio proprio perché non succedono spesso. Solo
  quattro, e solo quelle che hanno il loro mobile in questa pianta — una commissione
  senza il suo mobile è una persona che mima.

- **Chi lavora per qualcuno gli tira le battute, e alle spalle ne dice altre.** Un
  impiegato fermo accanto al suo capo ogni tanto lo adula, e col numero vero dentro:
  «già otto cose fatte, capo» lo dice solo se il quadro delle task ne conta otto chiuse
  per quel capo lì. Se il capo è dall’altra parte della stanza — al bar, di solito — la
  battuta diventa un’altra: è l’unico modo in cui un ufficio dice che il capo non c’è.

- **Quello che succede si vede dall’altra parte della stanza.** Una busta parte dalla
  porta verso una scrivania quando comincia un turno e torna indietro quando finisce:
  uno schermo acceso dice com’è adesso, la busta dice il momento in cui è cambiato. Il
  monitor di chi lavora adesso scrive per davvero, con due righe che salgono e il cursore
  che lampeggia, e sotto la sedia c’è un alone che respira. Quando al contesto resta poco
  compare la scatoletta viola: una barra rossa fra sei barre non si vede.

- **Le persone nascono da un seme.** Non sono più tre caselle di un foglio uguali per
  tutti: le disegna `npc.js` dall’id della conversazione, quindi la stessa conversazione
  ritrova sempre la sua faccia anche fra una sessione e l’altra. Camicia e cravatta,
  cardigan, giacca, polo, occhiali, barba, cuffie da call center, badge, sei toni di pelle
  e otto pettinature. E tre andature invece di una posa sola — ferma, che digita, che
  cammina — consegnate come strisce di fotogrammi che fa girare il CSS con `steps()`:
  zero JavaScript per fotogramma, che con otto persone in una stanza vorrebbe dire otto
  timer.

- **Una fascia sola in cima.** Con l’ufficio aperto la scheda aveva due testate appaiate
  che si ripetevano. Adesso la fascia dell’ufficio è due gruppi — a sinistra dove sei e
  chi hai davanti, a destra i consumi e la via d’uscita — sullo stesso fondo dell’altra,
  e la testata della chat lascia cadere i tre bottoni che di là ci sono già.

- **Le foto di prova non vanno più dentro il pacchetto.** `dist/` è la cartella del build
  ma è anche dove finiscono gli screenshot che si fanno mentre si lavora: quattro PNG di
  lavoro viaggiavano dentro il `.vsix`.

## 0.22.2

- **Il bottone dell’ufficio non si vedeva a tutto schermo.** Stava sulla testata che
  disegna VS Code sopra i pannelli della barra laterale, e sopra una scheda quella
  testata non esiste: chi lavora a tutto schermo — cioè esattamente chi guarderebbe
  l’ufficio — non aveva modo di aprirlo se non dalla tavolozza dei comandi. Adesso
  nella scheda il bottone sta nella testata della chat, accanto a quello del contesto;
  nella barra laterale resta dov’era, che lì lo spazio per un’icona in più non c’è e la
  pillola dello stato ci rimetteva le parole.

## 0.22.1

- **L’ufficio non si trovava.** Stava solo nella testata del pannello del contesto, che
  e’ la meta’ di sotto della barra laterale: chi guarda la chat non lo vedeva mai. Adesso
  il bottone c’e’ anche sopra la chat, accanto a “apri come scheda”, e la scheda torna da
  sola dopo un riavvio della finestra anche se l’estensione non era ancora sveglia.

## 0.22.0

- **L'ufficio.** Un comando nuovo — *Claude Studio: The Office*, e il bottone in cima al
  pannello del contesto — apre una scheda a tutto schermo con la pianta di un ufficio
  visto dall'alto: moquette, finestre sul muro in fondo, reception, contabilita', la
  sala riunioni coi vetri, l'ufficio del capo, la cucina, la fotocopiatrice che
  lampeggia in fondo all'annesso. Dentro c'e' una persona per ogni conversazione
  aperta, seduta alla sua scrivania, con la targhetta davanti che dice il nome e quanto
  contesto le resta. Chi sta lavorando batte a macchina e ha il monitor acceso — che e'
  la cosa che si vede per prima da dall'altra parte della stanza; chi ha finito mentre
  guardavi altrove alza una spunta verde; chi e' ferma da un pezzo sbiadisce; quella
  dove sei ha il faretto sotto la sedia. Le nostre sono color creta e le schede
  dell'estensione ufficiale azzurre, come sulle card. Cliccare una persona porta alla
  sua conversazione, esattamente come cliccare la sua card; quando una conversazione si
  chiude la sua scrivania si libera, e la prossima che arriva ci si siede.
- **Via la striscia nel pannello laterale.** Era la stessa idea in trecento pixel di
  larghezza, ed era il difetto: un ufficio in trecento pixel e' una fila di sagome. Il
  pannello torna com'era — le card, i numeri, i passi — e l'ufficio ha una scheda tutta
  sua, che e' la misura in cui si guarda una stanza.

## 0.21.0

- **L'ufficio.** Sopra le card del contesto adesso c'e' una stanza, e dentro una
  persona per ogni conversazione aperta, con il pavimento che le scorre piano sotto i
  piedi. Chi sta lavorando batte a macchina e ha tre puntini sulla testa; chi ha finito
  mentre guardavi altrove alza una spunta verde; chi e' fermo da un pezzo sbiadisce.
  Quella dove sei ha il faretto sotto i piedi e il cartellino col nome sempre acceso,
  le altre lo dicono passandoci sopra. Le nostre sono color creta e le schede
  dell'estensione ufficiale azzurre — la stessa distinzione che fanno gia' l'icona e la
  pillola sulla card, detta senza parole. Cliccare una persona porta alla sua
  conversazione esattamente come cliccare la sua card, e quando una conversazione si
  chiude le altre camminano nel posto che ha lasciato invece di saltarci dentro. Le
  card non cambiano di una riga: i numeri sono da leggere, la stanza si guarda e basta,
  ed e' la risposta a "chi c'e' e chi sta lavorando" senza leggere niente. Sparisce da
  sola quando il pannello e' troppo basso per tenerla senza mangiarsi le card, e sta
  ferma se al sistema hai chiesto meno animazioni.

## 0.20.1

- **I messaggi in attesa vanno in alto a sinistra.** Stavano appoggiati sopra la barra
  di scrittura, cioe' fra le cose gia' dette e quella che stai scrivendo: due o tre in
  fila spingevano il campo verso il basso e si leggevano come pezzi del discorso, che
  e' l'unica cosa che non sono — non sono ancora successi. Adesso sono un riquadro suo
  in cima alla colonna, ancorato a sinistra e largo quanto gli basta, sopra il discorso
  e non dentro. Resta tutto il resto: la frase che dice quanti sono e quando partono,
  il numero d'ordine, la matita, la ×.

## 0.20.0

- **Via la mappa del turno.** La colonna di bande colorate lungo il bordo sinistro del
  discorso non c'e' piu': come si usava non convinceva, e una barra che sta li' sempre
  e si apre addosso alle carte quando ci passi accanto costa piu' attenzione di quanta
  ne facesse risparmiare. Restano lo scorrimento e la barra di sistema, che dicono la
  stessa cosa senza chiedere niente. Se ne vanno con lei anche Alt+Su e Alt+Giu, che
  saltavano da un gruppo di passi al successivo.

## 0.19.3

- **I passi finivano prima della barra sopra di loro.** La lista dentro la card si
  rimetteva la gutter che la card gia' le dava, e la barra di scorrimento si mangiava
  gli ultimi dieci pixel di ogni riga: i passi partivano dodici pixel piu' in dentro
  dei numeri del contesto e finivano venti prima. Adesso righe, barra dei passi e barra
  del contesto cominciano e finiscono sulle stesse due linee, con o senza scorrimento.

## 0.19.2

- **Partito e ritirato erano indistinguibili.** Un messaggio usciva dalla coda con la
  stessa animazione tutte e due le volte: che fosse stato preso in carico o che
  l'avessi buttato via, la riga scivolava via uguale. Guardando non c'era modo di
  sapere quale delle due — con la × li' accanto, che e' il posto peggiore in cui avere
  un dubbio del genere. Adesso il motore dice quale delle due e' successa, e chi parte
  lo dice: la riga diventa verde, si spunta, e i suoi bottoni spariscono subito, che
  da li' non si torna indietro. La frase in testa smette di contarlo nello stesso
  istante — se e' partito non e' piu' in attesa.

- **I passi non sono piu' incollati uno all'altro.** Un pixel di distacco fra righe
  che hanno tutte un fondo colorato non e' distacco: otto passi diventavano un blocco
  unico in cui bisognava cercare dove finiva uno e cominciava l'altro. Quattro pixel,
  un po' piu' di respiro dentro, e un letto appena accennato anche sotto i passi che
  devono ancora arrivare — senza, in un elenco misto le righe col fondo sembravano
  schede e quelle senza sembravano il vuoto in mezzo.

- **Uno in corso, non quattro.** Il piano lo riscrive il modello intero a ogni giro, e
  gliene sfugge facilmente piu' d'uno acceso insieme: quattro righe si accendevano
  tutte e la lista diventava un muro d'arancione in cui non si capiva piu' dove fosse
  arrivato. Tutta la grammatica del pannello dice "uno" — una riga accesa, una stima —
  quindi vale il primo e gli altri tornano a essere quello che sono, cioe' da fare. E
  l'orologio della stima parte solo su quello vero: uno degli scartati che lo prendesse
  adesso, quando poi tocca a lui davvero, ripartirebbe da mezz'ora fa.

## 0.19.1

- **Un messaggio in attesa si puo' correggere.** C'era la ×, che lo ritira, e da li'
  lo riscrivi da capo — ma riscriverlo lo manda in fondo, e con due in attesa
  correggere un refuso nel primo vorrebbe dire spedirlo dopo il secondo, che e'
  l'unica cosa che una coda deve garantire. Adesso c'e' la matita: il campo prende il
  posto della riga, Invio tiene, Esc lascia com'era, e il messaggio non si muove dal
  suo posto. Si clicca anche sul testo, che e' dove guardi.

  Solo le parole. Gli allegati non si toccano da li' e restano attaccati: il messaggio
  vero si porta dietro il codice selezionato e l'elenco dei percorsi, appesi in coda al
  testo, e riscrivere il testo e basta avrebbe staccato il PDF senza dire niente. La
  coda si ritrova per differenza e si riattacca alle parole nuove. Il controllo lo
  prova sul serio, con la CLI vera: un file con dentro una parola inventata, il
  messaggio modificato mentre e' in fila, e quella parola deve comparire nella
  risposta — se l'allegato si fosse staccato, non avrebbe modo di saperla.

## 0.19.0

- **La lista dei passi, e non piu' solo quello in corso.** La CLI non ha piu' uno
  strumento per scrivere una lista di cose da fare — TodoWrite non esiste, e quelle
  che oggi chiama task sono i sub-agent, che un turno normale non apre mai. Il
  pannello quindi aveva da disegnare una riga sola: *"Edit chat.css"*. Dice cosa sta
  succedendo adesso e nient'altro; quanti passi ci sono e a che punto siamo non
  aveva risposta da nessuna parte. Lo strumento mancante adesso ce lo mette
  l'estensione: ospita gia' un server MCP suo — quello del diff nativo e degli errori
  dell'editor — e ci ha aggiunto `plan`. Claude ci scrive il piano intero prima di
  cominciare e lo riscrive a ogni passo che parte o finisce, e la lista compare nella
  card della sua conversazione, con la spunta che si muove in tempo reale.

- **Quanto manca a *questo* passo.** "2 di 5 fatte" dice quanto manca alla lista, non
  al passo che sta correndo, e quella e' la domanda che ci si fa. Non e' una cosa che
  si sappia — nessuno sa quanto ci vuole a "sistemare i test" finche' non e'
  sistemato — quindi non e' una misura e non si presenta come tale: la tilde davanti
  al numero e' la differenza fra una misura e un'ipotesi. La stima e' il tempo che
  questo passo sta impiegando rispetto alla **mediana** di quelli gia' finiti nella
  stessa lista; la mediana e non la media, perche' in ogni elenco c'e' un `npm
  install` che e' durato dieci volte gli altri e con la media sposterebbe la stima di
  tutti. Si ferma al 95% e aspetta: un passo che segna 100% ed e' ancora li' ha detto
  una bugia, uno fermo al 95% ha detto "ci sta mettendo piu' degli altri", che e'
  vero. L'estensione manda due numeri crudi e l'orologio gira nella pagina, cosi' la
  barra cammina da sola senza far battere il filo una volta al secondo.

- **E quando il piano non c'e', i passi che ha fatto davvero.** Questa e' la parte
  onesta: il piano lo scrive Claude, e "lo scrive" e' una cosa che si spera. Provato
  dal vivo tre volte con la stessa istruzione — due volte l'ha scritto, una no. Un
  pannello che dipende da quella scelta e' vuoto un turno su tre, cioe' il difetto da
  cui si e' partiti. Adesso, senza piano, la card elenca gli ultimi sei passi del
  turno con l'ultimo che pulsa: `Read store.ts` · `Grep activeForm` · **`Edit
  chat.css`**. Non e' una previsione e non si atteggia a tale — niente totale, niente
  percentuale — ma non chiede niente a nessuno, quindi c'e' sempre.

- **Gli strumenti del ponte con l'editor hanno un nome che si legge.** Si annunciavano
  come `mcp__editor__open_files` in mezzo a `Read` e `Bash`, che sembra un errore di
  stampa. Il server e' uno solo, quindi il prefisso non distingueva niente.

- **L'argilla quando fa da testo.** Su fondo nero il pesca legge benissimo; su carta
  bianca sta a due a uno, cioe' non legge affatto. Adesso e' un token suo (`--accent`)
  che si scurisce sui temi chiari senza toccare fondi, bordi e gradienti, e il
  controllo di contrasto verifica il token invece dei venti posti che lo useranno.

## 0.18.0

- **La coda dei messaggi era tre cose che nessuno puo' indovinare.** Un riquadro
  tratteggiato, un orologio che gira, quello che avevi scritto su una riga troncata,
  e una ×. Niente diceva *perche'* stesse li', niente diceva *quando* sarebbe
  partito — un orologio dice "aspetta", non "parte a turno finito" — e con due in
  fila non si capiva quale dei due andasse prima. Adesso e' un posto, non una
  pastiglia: un riquadro con una frase in testa che dice cosa sta succedendo e
  quando smette (`2 in attesa — partono appena finisce questo turno`), e le righe si
  numerano da due in su.

- **Quello che alleghi a un messaggio in coda si vede.** Era il difetto piu' facile
  da pagare: attacchi una foto e un foglio di calcolo, il messaggio si mette in fila,
  e da quel momento e' una riga di testo senza nessun modo di ricordarti cosa si sta
  portando dietro. Ora la miniatura e le pastiglie stanno li' dentro — le stesse
  identiche che vedrai nel discorso quando sara' partito, cliccabili allo stesso
  modo per riaprire il file. Il testo si legge su due righe invece di una troncata,
  perche' un messaggio in attesa lo rileggi per decidere se tenerlo.

- **Ritirarlo non vuol dire perderlo.** La × toglieva il messaggio dalla coda e
  buttava via quello che avevi scritto. Adesso il testo torna nel campo di scrittura
  — a meno che nel frattempo tu non abbia cominciato a scrivere altro li' dentro, e
  allora quello che vale e' l'altro. La coda ha anche un tetto d'altezza: quattro
  messaggi con le foto spingevano la barra di scrittura fuori dalla finestra, e
  adesso scorre invece di schiacciare la cosa che serve per svuotarla.

## 0.17.1

- **La mappa del turno era ancora un codice a barre, e l'idea sbagliata era la
  stessa di prima: il passo non e' l'unita'.** La 0.17.0 raggruppava i passi *dello
  stesso tipo consecutivi*, e sulla carta bastava. Su un turno vero no: un turno
  alterna — testo, tool, testo, tool — quindi non si fondeva quasi niente e a
  ottanta passi la colonna tornava ad essere confetti. E sotto tutte e due le
  versioni la posizione di una tacca voleva dire "quanti passi sono venuti prima di
  me", che non ha niente a che vedere con dove quel passo sta davvero in quello che
  stai scorrendo: un recap di quaranta righe era una tacca, e quaranta letture da
  una riga erano quaranta. La mappa e la barra di scorrimento accanto non erano
  d'accordo su dove fosse niente.

  Adesso non e' un elenco di passi disegnato sul bordo, e' un **righello del
  documento**: ogni tacca sta dove sta davvero la sua carta ed e' alta quanto e'
  alta davvero, misurate sulla stessa altezza che usa la barra di scorrimento. Da
  li' vengono due cose da sole. Le parti tranquille — leggere, ragionare, scrivere
  una risposta — si toccano e si leggono come un nastro solo, senza nessuna logica
  di raggruppamento; e quello a cui torneresti (un tuo messaggio, un file scritto,
  un comando, una domanda, un guasto) e' disegnato piu' spesso e esce dal nastro,
  esattamente all'altezza a cui scorreresti. Un riquadro segna la fetta che hai
  davanti, cosi' la colonna si legge per quello che e'. Il pannello che si apre col
  puntatore sopra — icona, nome, conteggio — resta com'era, perche' quella meta'
  funzionava.

  C'e' anche `npm run map-shot`: recita un turno da ottanta passi e ne salva lo
  scatto, stretto e largo, chiuso e aperto. I controlli girano su una quindicina di
  passi, ed e' con quindici passi che questa colonna e' sembrata a posto due volte
  di fila.

## 0.17.0

- **La mappa del turno dice a parole quello che diceva a colori.** Era una tacca per
  passo lungo il bordo, colorata per tipo: grigio, arancione, blu e rosso senza una
  legenda da nessuna parte, cioe' un codice che nessuno ti ha mai insegnato e che si
  impara a ignorare. E una tacca per passo non reggeva un turno vero: col minimo di
  tre pixel e due di distacco, oltre i centoquaranta passi la colonna era piena e
  tutto il resto veniva tagliato via — la mappa perdeva esattamente il pezzo che
  stavi guardando. Adesso l'unita' non e' il passo, e' il **gruppo**: le letture di
  fila sono una banda sola, alta quanti passi tiene. Quindici bande invece di
  duecento tacche, e le differenze d'altezza sono la forma. Col puntatore sopra (o
  entrandoci col Tab) la colonna si apre in un elenco che dice le stesse cose
  scritte: icona, nome, quanti — "Letto ×12", "Eseguito git status", "Andato storto
  out.txt". Il colore smette di essere qualcosa da decifrare, perche' la legenda e'
  la cosa stessa. `Alt+↑` e `Alt+↓` saltano da un gruppo all'altro senza mouse.

- **Il tema chiaro non e' piu' un tema al buio.** Il pannello e' nato su fondo scuro,
  dove "massimo contrasto" vuol dire bianco: testo bianco, bordi bianchi al 14%,
  hover bianchi al 4%. Su un tema chiaro ognuna di quelle e' della tinta della carta
  — cioe' non c'e': i bordi sparivano, le etichette sparivano, la barra della
  modalita' diventava una pastiglia vuota. Il neutro adesso e' un token solo
  (`--ink`), e un tema chiaro e' quattro righe che lo ribaltano invece di un secondo
  foglio di stile da tenere al passo. Verde, giallo e rosso hanno il loro valore
  chiaro: un `#e3b341` che su nero legge come un avviso, su bianco e' una
  scarabocchiata di evidenziatore.

- **La richiesta di permesso prende la tastiera.** Era una carta che compariva e
  basta: per rispondere senza mouse dovevi tabulare tutta la conversazione, e uno
  screen reader la incontrava come un paragrafo qualsiasi che scorreva via mentre il
  turno restava fermo per motivi che nessuno aveva annunciato. Ora si annuncia
  (`alertdialog`) e il fuoco ci va sopra — ma **non mentre stai scrivendo**: rubare
  il cursore a meta' frase e' come si finisce a scrivere mezzo messaggio dentro un
  bottone. Risposta data, il fuoco torna alla barra di scrittura invece di restare
  parcheggiato su un bottone spento. E c'e' una riga sola, invisibile, che dice a voce
  quello che dice la pastiglia in testata — non il discorso intero, che vorrebbe dire
  leggere ad alta voce ogni singolo token in arrivo.

- **Quello che avevi scritto e' ancora li'.** Mezzo paragrafo battuto, poi un
  "Reload Window", un cambio di scheda, un cambio di tema — e la bozza spariva. Ora
  sta nella stessa memoria che gia' si ricorda quale conversazione e' in questa
  scheda, ed e' l'unica che sopravvive a un ricaricamento.

- **Il resto di un diff lungo si apre.** La carta si ferma a sessanta righe, che e'
  giusto — mille righe versate nel discorso ti fanno perdere il messaggio sopra — ma
  "+840 righe" era un punto fermo con niente dietro: la coda di una modifica che ti
  stavano chiedendo di approvare non si poteva proprio leggere. Adesso e' un bottone.

- **La freccia per tornare indietro sta accanto al messaggio.** I checkpoint — com'era
  ogni file un attimo prima che Claude lo toccasse — c'erano da sempre, ma l'unica
  porta era `/rewind` e un elenco a scelta rapida in cui riconoscere il proprio
  messaggio da settanta caratteri. Il punto pero' e' esattamente li', accanto al
  messaggio che l'ha aperto, ed e' li' che lo cerchi guardando. Cosa rimettere a posto
  — codice, conversazione o tutti e due — lo chiede ancora l'estensione: riscrivere
  dei file e' roba che si conferma. E ogni punto adesso ha un id suo invece della sua
  posizione nell'elenco: tornare indietro butta via i punti successivi, i messaggi
  dopo ne aprono di nuovi, e con le posizioni la freccia di un messaggio del ramo
  abbandonato avrebbe rimesso a posto i file di qualcun altro.

- **`@` trova anche i simboli.** Cercava solo fra i percorsi, quindi allegare la
  funzione che stai guardando voleva dire ricordarsi in quale file vive — e se te lo
  ricordassi non la staresti cercando. I simboli VS Code li ha gia' indicizzati: sono
  quelli di `Ctrl+T`, li calcola il language server del progetto, e chiederli non
  costa niente. `@needsThinking` adesso trova `needsThinking — function —
  src/engine/protocol.ts:60`. Nel messaggio entra sempre il percorso, che e' l'unica
  cosa che `@` sa espandere: il simbolo e' come l'hai trovato, non cosa gli mandi.


## 0.16.0

- **Il pannello delle task era agganciato a tre strumenti che non esistono piu'.**
  Ascoltava `TodoWrite`, `TaskCreate` e `TaskUpdate`. La CLI di oggi non ne ha
  nessuno dei tre: chiedendoglieli, il modello risponde per iscritto che non li ha —
  provato, non dedotto. Per questo la card diceva "sto capendo cosa fare" per
  sessioni intere: non c'era niente da ascoltare. Quelle che la CLI chiama task
  adesso sono i sub-agent, e non passano da nessuna chiamata a un tool: li annuncia
  lei con dei messaggi di sistema suoi (`task_started`, `task_progress`,
  `task_updated`), che e' la sorgente che usa il suo pannello e che qui non ascoltava
  nessuno. Ora si ascolta quella. I due dialetti vecchi restano per chi gira una CLI
  di prima.

- **La card dice sempre cosa sta facendo.** Le task esistono solo quando apre un
  sub-agent, e un turno normale — legge, modifica, lancia i test — non ne apre
  nessuno: anche riparato il pannello, la card sarebbe rimasta muta quasi sempre.
  Adesso quando non c'e' una lista c'e' il passo in corso, per nome — `Read
  tax.ts`, `Bash npm test` — con un pallino che pulsa. E' la sola domanda che si fa
  guardando quella card, e per la prima volta ha una risposta.

- **Fallita non e' fatta.** Un sub-agent che non arriva in fondo aveva la stessa
  spunta verde di uno riuscito. Adesso ha il suo colore e il suo segno.

- **Un turno si legge a colpo d'occhio.** Sette carte identiche alte 64 pixel per
  dire "ha letto due file e ne ha scritto uno": una `Read` che non ha cambiato
  niente occupava esattamente lo spazio di un `Edit` che ti ha riscritto un modulo, e
  trovare i due passi che contano voleva dire leggerli tutti e quaranta. I passi che
  non lasciano niente dietro (letture, ricerche, sguardi in rete) ora sono una riga
  alta un terzo, e quelli di fila si stringono in un blocco solo. I nomi dei file
  restano tutti — "Read ×4" sarebbe stato piu' corto e avrebbe buttato via proprio
  la cosa che si cerca. Chi scrive tiene la sua carta piena, e una lettura andata
  storta se la riprende all'istante.

- **La mappa del turno.** Una tacca per passo lungo il bordo sinistro, colorata per
  tipo: letture grigie, scritture arancioni, comandi blu, errori rossi, permessi
  gialli. Si vede la forma di una risposta lunga senza scorrerla — "ha letto per due
  minuti, poi ha scritto tre file, poi si e' impantanato su un comando rosso" — e un
  click ti porta a quel passo. Sta nella gutter che la colonna aveva gia': non ha
  tolto un pixel a niente.

- **Quello che scrivi mentre lavora si vede che sta aspettando.** Il motore li
  metteva in fila da sempre, ma la chat li disegnava come gia' spediti: non capivi che
  aspettavano, non li potevi ritirare, e due erano indistinguibili da due partiti. Ora
  stanno sopra la barra di scrittura, con la ×. E la fila e' davvero nostra: l'SDK
  tirava il messaggio successivo nello stesso istante in cui lo scrivevi, quindi a
  fare la coda era la CLI e la pastiglia sarebbe durata mezzo secondo. Adesso il
  prossimo parte a turno finito, non prima.

- **L'editor segue Claude.** Ogni file che tocca si apre di fianco, scorre alle righe
  appena scritte e le illumina per un paio di secondi. Il fuoco non si sposta mai:
  continui a scrivere nella chat mentre il codice si muove nell'editor, che e' l'unico
  motivo per cui questa cosa puo' stare accesa di serie. Si spegne dalle impostazioni.

- **Gli errori che introduce se li sistema da solo.** A fine turno l'estensione
  guarda le sottolineature rosse che l'editor ha gia' calcolato — TypeScript, il
  linter, quello che c'e' — sui **soli file che quel turno ha toccato, e solo quelle
  che prima non c'erano. Se ce ne sono, il turno riparte da solo per chiuderle, con
  una card che lo dice: un turno che riparte in silenzio sarebbe la cosa piu'
  inquietante che un pannello possa fare. Il guinzaglio e' la meta' importante della
  funzione: due giri al massimo, mai sopra un turno che hai fermato tu, mai davanti a
  un messaggio che hai gia' scritto, mai su errori che non sono nati adesso. Finiti i
  tentativi si ferma e ti dice quanti ne restano, invece di riprovare la stessa
  correzione a spese tue. C'e' un controllo apposta che prova tutte queste regole
  contro la CLI vera (`npm run autofix-check`), ed e' in `npm run verify`.

- **L'anteprima e la chiusura dei turni** sono quelle della 0.15.6, che non e' mai
  stata pubblicata: sono qui dentro.

## 0.15.6

- **Ogni allegato si guarda prima di mandarlo, non solo le immagini.** Una foto aveva
  la sua miniatura da cliccare; tutto il resto era un nome e un peso, quindi l'unica
  domanda che ti fai davvero — "e' questo il contratto giusto?" — si risolveva
  mandandolo e sperando. Ora la pastiglia si apre: un'immagine si vede grande, un file
  di testo (un log, un .csv, un .env, del codice — qualunque cosa non abbia un byte
  zero in testa) si legge li' dentro col suo nome sopra, e un PDF, un foglio di
  calcolo o un video li apre il programma che sul computer li apre gia', che e' un
  lettore migliore di qualunque cosa una webview abbia il permesso di disegnare. Vale
  anche per gli allegati dei messaggi gia' spediti: tre messaggi dopo il file si
  riapre da li'.

- **Esc chiude l'anteprima e basta.** Chiudeva l'anteprima *e* fermava il turno: la
  scorciatoia di pagina era registrata per prima, quindi leggeva il tasto prima di
  tutti e lo prendeva per "ferma tutto". Uscivi da un'occhiata a un file e ammazzavi
  il lavoro che stavi guardando. Adesso l'anteprima intercetta Esc in cattura, prima
  di chiunque altro; con niente di aperto Esc ferma il turno come sempre.

- **La chiusura di un turno e' un riassunto, non un tema.** Il muro di testo alla fine
  — il codice ricapitolato file per file, il resoconto del ragionamento, e in fondo,
  se c'era, la riga che volevi — arrivava perche' nessuno aveva mai detto il
  contrario. Ora le istruzioni di sistema lo dicono: al massimo cinque righe, cosa e'
  cambiato e cosa manca, niente altro. Le risposte lunghe che chiedi apposta (una
  spiegazione, un piano, una revisione) restano lunghe: la regola vale solo per la
  chiusura.

- **I passi non si perdono piu' per strada.** Una task creata e avviata dentro lo
  stesso messaggio — cioe' ogni volta che Claude sa gia' da dove comincia — restava
  disegnata come "da fare": il numero glielo dava la risposta del tool, che arriva
  dopo, e la TaskUpdate che nel frattempo la nominava non trovava nessuno e spariva
  senza dire niente. Adesso il numero se lo prende alla nascita, contando, e la
  risposta del tool semmai lo corregge. E quando Claude chiede l'elenco (TaskList) —
  l'unico momento in cui la CLI dice tutte le task insieme — quello che risponde
  vince: se il pannello si era sfasato per qualsiasi altro motivo, li' torna a posto.

- **Fatto e in corso si vedono da lontano.** Le task finite hanno la riga sopra le
  parole piu' marcata e un letto verde appena accennato, cosi' in una colonna stretta
  si contano con un'occhiata invece di leggerle una per una; quella al lavoro ha una
  barra sul bordo sinistro, che e' la sola cosa che sopravvive quando la lista e' piu'
  lunga del pannello.

## 0.15.5

- **Le tre manopole le giri tu.** Modello, impegno e ragionamento avevano tutti e tre
  un "automatico" che non decideva niente. Sull'impegno voleva dire non dire niente
  al motore, e la CLI resta al livello fisso che ha: un livello chiamato "auto", nel
  motore, non esiste proprio. Sul ragionamento voleva dire la stessa identica cosa di
  "acceso", perche' a una CLI che non sente niente il ragionamento lo accende lei.
  Erano due bottoni per la stessa cosa, tutti e due scritti come se passassero la
  scelta a qualcun altro. Adesso ci sono solo scelte vere, e sono tue.

- **Alzando l'impegno, il ragionamento si accende da solo.** Da "molto accurato" in
  su il motore si rifiuta di lavorare col ragionamento spento — e quel rifiuto
  arrivava addosso a te, come turno fallito, al messaggio dopo aver toccato la
  manopola sbagliata. Ora scegliendo quel livello il ragionamento si accende **nel
  pannello, dove lo vedi**, e finche' resti lassu' il "No" e' fuori portata, con
  scritto sotto chi l'ha acceso. Nessuna correzione fatta di nascosto un attimo prima
  di partire: quello che leggi e' quello che parte.

- **La riga di fine turno dice quale modello ha risposto.** Nel colore del suo, lo
  stesso della sua carta, con accanto l'impegno di quel turno. C'era gia' tutto per
  saperlo e non veniva detto: aprivi il pannello per ricordarti con che cosa stavi
  parlando.

- **I conti del turno erano sbagliati, e adesso ci sono.** Il costo che arrivava a
  fine turno e' il totale della *sessione*, non del turno — la chat lo sommava a ogni
  giro, contando il primo turno tante volte quanti ne erano passati. Ora si tiene il
  totale per quello che e' e si misura a parte quanto e' costato davvero quel turno,
  sub-agent compresi, insieme a quanto contesto e' stato riletto dalla cache e quanto
  riscritto da zero: e' l'unico modo per vedere quando una scelta manda all'aria il
  lavoro gia' pagato.

## 0.15.3

- **The CLI gets updated the way you installed it.** Only an npm installation was
  kept up to date; installed with the native installer it was left alone, on the
  assumption it would see to itself. Now it is `claude update` that gets called
  there — its own command for this, which knows where it put itself and doesn't need
  npm, which on those machines may not be installed at all. Claude Code is what
  brings the new models and the fixes: falling behind on it is the one thing this
  extension must not let happen.
- **An update that fails now says so.** It went into a log nobody opens, so the only
  visible outcome was staying a version behind, quietly, forever.

## 0.15.2

- **Updating the extension is VS Code's job.** Every build carried inside it the path
  of the folder it was compiled in, and on startup it went looking there to rebuild
  itself — a path that on anybody else's computer leads nowhere, and on a second
  computer of your own leads to the wrong place. Now there is nothing to look for:
  installed from the Marketplace the extension is updated by VS Code, as it should be.
  Whoever works on the source says so in **Claude Studio: Update Source Path**, and
  only that folder gets rebuilt — `~/claude-studio` holds on every machine you have.
  The CLI keeps being updated as before: it's the one that brings the new models.

## 0.15.1

- **The update works on the other machine too.** A build carries inside it the path of
  the folder it came out of, and that path only exists on the machine that made it: on
  the second one the extension looked for its own source, did not find it, and quietly
  stopped updating itself — whatever folder you had open. Now, when that path leads
  nowhere, it looks for the source under your home folder, which is where it is.

## 0.15.0

- **Opening Studio opens something new.** It used to read the last conversation of the
  project back off the disk the moment the extension woke up, so every session you
  "started" was already full of one you had not asked for — and the shortcut, the
  command and the icon all landed you back in yesterday. Now they open a new
  conversation, every time. Nothing is lost: the old ones are all in the context bar,
  a click away. Reloading the window is the one case that still restores, because there
  you are not opening a conversation, you are finding the one you were already in — and
  each tab comes back on its own, which is what that has always meant.

- **Clicking the Claude Studio icon with a session already open no longer flickers.**
  It brought the tab forward and closed the sidebar in the same breath, and from the
  outside that was a conversation opening and shutting again for no reason. Now the
  click does nothing, which is what there was to do.

- **Clicking a card opens that conversation in a tab.** It used to load it into the
  sidebar chat, or into the main tab on top of whatever you were reading — in one case
  you could not see it, in the other you lost the one you had. A conversation you open
  is a tab. If it already has one, that tab comes forward instead: one face per
  conversation, never two.

- **A long list of steps no longer pushes the other cards out of the panel.** With two
  or three conversations working at once the steps are the part that grows, and to
  reach the third card you had to scroll past dozens of lines you were not looking for.
  Each list keeps its own height and scrolls inside itself; the step being worked on
  still brings itself into view.

- **The task list is tested against the real CLI, and now the test can fail.** The
  offline check wrote its transcripts under `/var` and the SDK looked under
  `/private/var` — the same folder by two names, on every Mac — so it found nothing and
  reported the panel broken when it was fine. The live check asked Claude to "write
  yourself a list", which it did, in prose, in the message: a passing thought and an
  empty panel. It now names `TaskCreate` and `TaskUpdate`, and what it proves is the
  wire.

## 0.14.1

- **Each conversation's steps now live inside its own card.** With three tabs open the
  list was a mess, and the reason was on the wire: the lists were already kept apart,
  one per conversation, but only one of them was sent out and it travelled with no name
  on it. The panel drew whoever had moved last — so while you were reading one
  conversation's steps another one moved and swapped them under your eyes, with nothing
  saying it had happened. Now they all travel, each under the id of the conversation
  that wrote it, and the panel puts each list inside that conversation's card. "Whose
  steps are these" is not a question any more: they sit under the name of whoever wrote
  them down. A conversation with no steps stays a card and nothing else. The STEPS
  heading goes too — it was there to say what that box at the bottom of the column was,
  and inside a card that already carries its own name it would be the same word
  repeated once per conversation.

- **The account percentages follow the turn, instead of a clock.** They said "updated
  6m ago" and they were telling the truth: the panel was serving numbers from a
  quarter of an hour ago. Not because the timer was slow — because every "ask now"
  (panel opened, panel back in sight, session born) went straight out to an endpoint
  that is rate limited, and a handful of them in a row earned a 429, whose price was
  ten minutes of silence. One unlucky burst froze the numbers for the rest of the
  coffee. Now there is a floor of ten seconds between two calls that nothing skips,
  the 429 costs a minute (then two, then four, up to ten, and it forgets as soon as an
  answer comes back), and above all the numbers are asked for while a turn is running
  — which is the only moment they move. You watch them climb as you spend, and they
  settle the second Claude stops. Idle, when nothing can change, it goes back to
  asking twice a minute.

- **The engine now asks for Claude Code's instructions by name.** Not asking did not
  mean "use the default": the SDK, with that line missing, sends the CLI an *empty*
  system prompt — it explicitly says "you have no instructions". That today's CLI
  shrugs and behaves like Claude Code anyway is a detail of how it happens to be
  written, not a promise; a custom system prompt is honoured to the letter, so the
  empty one was living on clemency alone. The day it were taken at face value this
  panel would be talking to a model with the tools of Claude Code and none of its
  trade, without a line changing here. It is asked for properly now. The prompt rides
  at the head of the request, inside the prompt cache: paid for once a session, reread
  for a fraction after that.

- **Nothing the panel says is written in grey any more — anywhere.** tokens.css has
  said it from the first line since 0.0.6: text is full white, hierarchy comes from
  size and weight. Forty-nine rules across the chat and the context panel were quietly
  ignoring it, each carrying an `opacity` between 0.5 and 0.95 on plain words — the
  language beside a code block, the file names in a recap, "8 steps · 18k context", the
  size of an attachment, the description under every command in the menu, the timestamp
  in the history list, the numbers on a conversation card. On its own each looked like
  a tasteful half-tone. Together they meant most of what this thing says was grey on
  near-black, which you decipher rather than read. Hierarchy is still there — it is
  made of size, weight, spacing and the boxes things sit in, which is what those were
  supposed to be doing all along. Three things still sit back, because being dimmed is
  what they *mean*: disabled controls, the placeholder in an empty field (raised, but
  not to full, or it reads as text you already typed) and decoration that is not a
  word.

- **The STEPS section was reading a tool the CLI no longer has.** It listened for
  `TodoWrite` — one call carrying the whole list — and Claude Code stopped writing its
  steps that way: it now creates them one at a time with `TaskCreate` and moves them
  with `TaskUpdate`, and the number a task goes under ("#2") is not even in the call
  that creates it, it comes back in the tool's answer. So the section sat on "Working
  out what to do…" for entire sessions while the list existed the whole time, three
  feet away. Both dialects are now understood, and the list is built here as the calls
  arrive rather than waiting for one that never comes. Steps written the new way also
  survive the next message, because the CLI keeps them across a whole conversation and
  what you asked for two messages ago and has not been done yet is exactly what this
  section is for. Steps a sub-agent writes for itself stay out of it.

- **Nothing in that section is grey any more.** The house rule is written at the top of
  tokens.css — text is full white, hierarchy comes from size and weight — and this was
  breaking it in five places at once: the waiting line, the "2 to go", the state word
  and every row that was not the one in progress, all between 50% and 70%. On the
  sidebar's background that is the difference between reading a sentence and guessing
  it. The order still reads: the step being worked on has weight, a tinted bed and a
  beating icon; the finished ones have a green check and a rule through the words.
  The panel's own test now fails if any of it goes back to grey.

- **"Developer: Reload Window" no longer costs you every conversation but one.** The
  extension host dies at every reload and the conversations die with it; the
  transcripts stay on disk, so all that has to survive is knowing *which* transcript
  belonged to *which* tab. Nothing did. The deserializer threw away every tab after
  the first — `panel.dispose()`, written when there was one chat and one tab — so a
  window with four conversations came back with one, and reloading became something
  you learnt not to do. Each tab now puts its conversation id aside in its own
  webview state, the only memory that survives a reload still attached to the single
  tab, and comes back on it.

- **And the tab that came back first stopped being handed somebody else's
  conversation.** VS Code wakes a tab when it needs to draw it, so the one you were
  looking at returns first and the rest follow when you click them. Meanwhile the
  project kept a note of its own — the last conversation of the window, there for the
  sidebar chat, which has no tab to be woken from — and that note was read at startup,
  before any tab had spoken. It won by being first: whichever tab came back first was
  filled with the note's conversation instead of its own, and with three tabs open you
  got the same conversation twice and lost one. A tab now speaks for itself, including
  to say it had nothing open, and the note only talks when no tab does.

- **The steps Claude is working through now sit under the last card.** They had a
  panel of their own in the sidebar, which was a third box to open in order to read
  something about a conversation whose card you already had in front of you — and
  that panel could never say *which* conversation it was showing. They are now a
  section of the account panel, below the cards, in the same scroll: ticked-off steps
  strike themselves through, the one in progress pulses, and the section disappears
  entirely when there is nothing to tick, rather than sitting there saying "no tasks
  yet" for most of the day. The full-screen tab draws them in its column too.

- **Tasks in a tab opened with "+" were never recorded at all.** Only the primary
  chat was allowed to fill the list, and every conversation started from "+" — which
  is the normal way to start one — wrote its steps into nothing. The panel stayed
  empty for the whole life of that tab. Each conversation now keeps its own list and
  the panel shows the one you are looking at, so switching tab switches the steps.

- **A card you are done with can be closed.** There was no way to say so: a card left
  only when its conversation died of its own accord, so closing the primary tab left
  its card in the list saying "here" about a conversation that was nowhere, and a CLI
  session abandoned half-way could not be got rid of at all. Every card now has a ×.
  On a tab from "+" it closes the tab; on the sidebar chat it clears the conversation,
  card included; on somebody else's session it removes the announcement it left in
  ~/.claude/sessions. Closing the last face of a conversation also takes its card
  down on its own, and reopening the tab brings it back.

- **The mark carries more ink.** In the extensions list VS Code draws the icon at
  24px, where a stroke of 15.36/512 is two thirds of a pixel and antialiasing eats
  most of it: beside Claude Code — a solid disc that inks every pixel of its box —
  the starburst read as the smaller product although both filled the same square.
  The rays are drawn 45% thicker for the store tile, which is as much weight as the
  drawing can carry before the 24 of them close up into a blob.

- **Four checks that had been failing for months.** The panel's own test suite claimed
  a session belonged to a process born a minute ago while lending it the pid of a node
  started three seconds earlier; the guard against recycled pids did exactly its job,
  declared the file stale and threw it away, and the assertions further down found no
  cards. It failed depending on how long PowerShell took to answer, which is not a
  test. The fixtures now say when their processes really started, and the
  match-by-position case — which had been quietly skipping itself — runs.

## 0.12.0

- **Two thousand things worth knowing.** The new-session screen used to draw one of
  ten tips, all of them about this panel — useful once, then wallpaper. There are now
  2030, in fifty subjects: what the tilt of Uranus does to its poles, why honey found
  in a tomb was still edible, what Rembrandt lost when the Night Watch was trimmed to
  fit a wall. Both languages, written rather than translated. They are drawn from a
  shuffled bag kept between sessions, so you get a new one every time until you have
  seen them all — not a coin flip that shows you the same line twice in an evening.
  The library is picked from in the extension and only the chosen line is sent to the
  panel, so half a megabyte of facts never has to be parsed to read one sentence.

- **/clear and /rewind are in the menu again.** They had never actually been missing
  from the data: the menu cut the list at forty entries, and the built-in commands
  were added after the ones the CLI reports. Install enough skills and the two you
  reach for most fell off the end, present and invisible. The cap is gone — the list
  has a search box and scrolls — and the menu is now in two sections, Claude's own
  commands first and the project's skills below, because they come from different
  places and you go looking for them for different reasons. A command that wants an
  argument shows it, and searching an alias finds the command it belongs to.

- **The mark is the size of its neighbours.** On the Marketplace shelf Claude Studio
  sat visibly smaller than Claude Code next to it. Two paddings were stacked: the rays
  reach 481 of the 512 they are drawn in, and the tile then shrank that to 78%, so the
  mark filled 73% of a square that a circle icon fills entirely. It is now measured
  from the rays themselves and drawn edge to edge. Same file the editor tab uses, so
  the tab grew with it.

- **The account numbers are true the moment you look.** Opening the context panel
  scheduled a redraw that a sixty-second cache then discarded, so what you saw first
  was whatever was left over — and that cache outlives a restart, so it could be hours
  old with nothing saying so. Opening the panel, bringing it back to the front and
  starting a conversation now ask outright. One request at a time and the ten-minute
  cooldown after a refusal both still hold. When the figures cannot be vouched for
  they say how old they are, which is what matters when an account is shared between
  machines and people.

- **The step being worked on stops hiding.** The task panel was told which row was
  active and never used it: a dozen tasks in a sidebar that narrow is taller than the
  panel, so the one row you wanted was the one off screen. It follows the work now,
  and only when the work moves, so it never fights the wheel. Beside "3 of 7 done" it
  also says "4 to go" — the subtraction was yours to do, and it should not have been.

- **The recap says what it did, not just what it cost.** It listed time, steps and
  context: a receipt. Now the result, the number of files changed and the time come
  first, the filenames follow as buttons that open them, and steps and context drop to
  a quiet last line. After ten minutes away the question is what moved, and the answer
  was scattered across a dozen collapsed cards.

## 0.11.1

- The updater pulled in a newer agent SDK, and the lockfile went with it.

## 0.11.0

- **The steps Claude is working through, in the sidebar.** A third panel that holds
  the task list and ticks it off as the work happens, instead of leaving it folded
  inside a card in the middle of the thread. A new prompt clears it, so you are never
  reading the previous turn's plan next to the current question.
- **A PDF you attached no longer vanishes when you press Enter.** The attachment was
  being cleared before it had been read.
- **The five pills are back, and the new tab types itself in.**
- **The mark is pink and azure**, and it has no background to sit on.
- The screenshots were being taken of a screen that had not finished drawing.

## 0.10.0

- **The new tab shows the commands.** The empty screen used to explain the
  product to somebody who had already installed it, and teach five shortcuts.
  Now it lists the commands you can actually run: click one and it lands in the
  composer, ready to send.
- **The mark is ours.** The starburst from the logo sheet, redrawn as a vector so
  it holds at any size — 22 rays around a four-point star. It's on the editor
  tab, in the activity bar and on the new-tab screen.
- **The paperclip got warmer.** A white ring and an orange clip; on hover the
  orange floods the button and it lifts on a soft glow. It used to tilt, which
  read as the clip coming loose.
- **Reloading the window keeps the conversation.** "Developer: Reload Window"
  restarts the extension host and the chat went with it, even though the
  transcript was on disk the whole time — what was missing was remembering which
  one. The last conversation of the project is replayed on startup, so you come
  back to your work instead of an empty screen.
- **Picking a setting slides.** Same movement as the mode control up top. The
  row rebuilt every button on each repaint, so the slider reappeared already
  under the new choice and the move happened in the dark.
- **Publishing works from a Mac.** The release script only knew where to find a
  browser on Windows.

## 0.9.0

- **The shortcuts work on a Mac.** They never had: Option is a compose key over
  there, so Option+N doesn't report "n" — it reports "˜", the dead key for a
  tilde. Option+M reports "µ", Option+C reports "ç". The chat was reading the
  character instead of the key, so on macOS every single one of these did
  nothing. It now reads the key you physically pressed, which says the same
  thing on a Mac, on a PC, and on a French keyboard. New session, mode,
  conversations, settings, context, close tab — all of them answer now.
- **And they're written the way your keyboard writes them.** Every label that
  names a shortcut used to say "Alt+N" to everybody, which is the wrong name for
  that key on half the machines reading it. The tooltips, the hints on the empty
  screen and the "open a new one" in the full-context error now say `Alt+N` on
  Windows and Linux and `⌥N` on a Mac. Same shortcuts, same interface, same
  everywhere — only the name of the modifier changes.
- **The shop window shows the models you actually have.** The screenshots and the
  film were still full of last year's names. They now show Opus 5, Fable 5,
  Sonnet 5 and Haiku 4.5, each with its own colour and its own effect.
- **The attachments say what they mean.** The paperclip's tooltip, the text on
  the empty screen, the README and the marketplace description now spell out what
  can go into a message — PDF, Word, Excel, PowerPoint, CSV, JSON, zip, video,
  audio, logs, source code, images — instead of leaving "any kind" to be taken on
  trust. The picture and the film show six of them at once, and not one is an
  image.
- One shop only: the VS Code Marketplace. Open VSX and the rest are gone from the
  release script, the package and the login setup.

## 0.8.0

- **Attach any file at all — this is the big one.** There's a paperclip in the
  box you type in, and behind it VS Code's own picker with no filter on it
  whatsoever: a PDF, a spreadsheet, a log, a zip, a video, a font. You can drop
  them on the message too — from the explorer beside you, or from a browser
  window. Images travel as images, the way a pasted screenshot always has;
  everything else travels as a path Claude opens with its own tools, which is
  both the only thing that works for every format and the only thing that
  doesn't put a forty-megabyte file through the chat. Each attachment is a chip
  with the icon for its kind, its name and its size — because "18.0 MB" is worth
  reading before you send it.
- **You can see which conversation finished.** With three open, the chime said
  *something* was ready and left you to work out which: you went through the tabs
  one at a time. Now the one that finished says so — a dot in front of its name on
  the tab, a green *done* on its card in the context panel — and it goes out the
  moment you look at that conversation. If you were already looking at it when it
  finished, nothing lights up: you watched it happen. The number on the activity
  bar icon is now how many are waiting, not a permanent 1.
- **Every switch in the settings answers back.** The three checkboxes are real
  switches now: the knob slides across on a spring, stretches while you hold it
  down and throws a halo the moment it comes on. The list of sounds isn't a
  `<select>` any more — that one opened a menu drawn by the operating system, in
  the middle of a panel where everything else slides — but a list of ours that
  unrolls from its button, one option at a time, each with its own icon and a tick
  on the one in force. The volume bar fills up to the handle as you drag it, and
  the handle grows under the mouse. The model you pick takes a tick in its corner,
  drawn on the spot. And the panel deals itself out when it opens, a row at a time,
  top to bottom.
- **The pill in the header has its light all the way round.** It used to run along
  the bottom edge only, which read as an underline that had come loose rather than
  as something working. Now the whole border is the light, and it goes round —
  slower and warmer when a long silence sets in.
- Everything above is off when the system asks for less motion: what's left is the
  knob sliding, because that's the part that says the click landed.

## 0.7.0

- **What it's doing is now in the header**, next to the mode switch: the state and
  a clock, nothing else. It used to be a full-width strip above the writing field
  repeating the command it was running — a second line of log in the one place
  your eye should find the thread. The step count is still kept; you read it once
  at the end, in the recap. In a narrow sidebar the row gives way in order: the
  wordmark folds, then the switch goes to icons, then history and "open as tab"
  step aside until the turn ends.
- **One column, to the pixel — on both sides.** The right edge was off and it was
  hard to say why: the scrollbar lives inside the thread and was taking ten pixels
  off every card on that side. The gutter is now always reserved and the padding
  docked by the same amount, so the cards end where the writing field ends.
- **Your messages take the full column** like everything else, instead of hugging
  the right edge as bubbles, and **attached images sit above the text** — where
  they sat in the composer while you were writing it.
- **Links are clickable wherever they appear**, bare or in brackets, code blocks
  included, and they open in the browser. **Every code block has a copy button.**
- **The chime is heard again.** It used to go to "this conversation's page", which
  with several sessions open is often a tab you have never clicked in — and a page
  that has never been touched isn't allowed to make a sound. Now every page says
  whether its audio is awake and the chime goes to one that can be heard.
- **The context panel sees every conversation**, not just the first. With three
  tabs open it drew one card, the "you are here" badge never moved and the tokens
  you were spending in the other two belonged to nobody.
- **Tabs are named after their conversation** instead of "Claude Studio #2".
  Renaming the card in the context panel renames the tab; there's a command too
  (*Claude Studio: Rename This Conversation*).
- **Clicking a card takes you to the tab that holds it** — not to "Studio", which
  with several tabs open was the first one, hardly ever the one you clicked. And
  reopening a conversation from the history is known to the panel straight away,
  instead of at the next message.
- **The send arrow is a paper plane**, and Stop is the same black as the arrow.
- Fixed: the mode slider drifted a pixel at a time and never came back — it was
  measuring from the container's border instead of its padding.

## 0.6.0

- **No more ghost sessions.** A card could stay lit for hours on a conversation
  nobody had open any more: the CLI leaves a file per process in
  `~/.claude/sessions`, and when a process is killed rather than closed that file
  stays behind — then Windows hands the same PID to something else and "is it
  alive?" answers yes about a stranger. Now the process start time is checked
  against the one written in the file, two files for the same conversation become
  one card, and whatever is certainly dead is swept away — our own included, when
  the chat closes it.
- **A strip that says what it's doing, right now.** Above the writing field:
  the current step (*Reading store.ts*, *Reasoning…*), the number of steps and a
  clock that ticks every second. If nothing happens for a while it says that too,
  instead of leaving you to wonder whether it has crashed.
- **The reasoning has a light going round its border** while it's thinking,
  instead of a dashed outline that said nothing.
- **Nothing opens by itself any more.** Diffs, to-do lists and results stay shut
  until you open them: three diffs unfolding on their own used to push what you
  were reading off the screen.
- **The final recap is laid out.** Headings, lists, tables, quotes and code
  blocks are rendered — before, everything but code came out as raw text, hashes
  and hyphens included. And the turn closes with a line saying how it went, how
  long it took, how many steps and how much context it's carrying.
- **Multiple-choice questions have a line to write on.** What Claude offers isn't
  always what you want; now you can answer in your own words, or add to the
  options you ticked.
- **Composer.** The send arrow is black and centred by construction; Stop is the
  bare square, bigger, without the ring that read like a border drawn by mistake.
- **The thread lines up with the box you type in**, to the pixel.
- **The Sonnet card** has an effect of its own — violet ink and a light going the
  other way round from Opus's — instead of a halo that just breathed.
- **Tidier sidebar**: one gutter for the whole panel, account figures in two
  boxes of their own, everything centred on the number.
- **History up to 24 conversations** (it was 20).

## 0.5.1

- **Fixed the token count on sessions.** The percentage could go past 100% —
  241% on a 1M window — because the count came from the `result` message, whose
  usage is cumulative over the whole turn: every API call re-reads the cache, so
  a turn with ten tool calls added up its cached tokens ten times. The context is
  now measured on the last API call, which is what actually occupies the window.
- **Removed the dollar figure** from the context panel, from the chat and from
  the status bar tooltip: next to the context percentage it was only noise.

## 0.5.0

First public release.

- **Claude Code chat** inside VS Code: sidebar panel or full-screen tab, same
  conversation on both sides.
- **One-click permissions**: commands before they run, file edits as colored
  diffs, plans to approve, multiple-choice questions.
- **Three modes**: Plan (thinks only), Ask (checks before acting), Yolo (gets on
  with it). Switch any time, even mid-conversation.
- **Context bar**: what you've spent, what's left, and how long until your
  account resets.
- **Model picker**, each model with its own color, and the effort levels that
  model actually accepts.
- **`@` for files, `/` for commands**, paste images, a chime when the work is
  done, and history of earlier conversations.
