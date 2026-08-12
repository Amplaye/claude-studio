# Claude Studio

Chat di Claude Code e barra di contesto, in una sola estensione di VSCode.

Cliccando l'icona nella barra delle attivita' si apre la **scheda a tutto schermo**
— una sola: se c'e' gia', torna davanti — con il contesto in una colonna di fianco.
Chi preferisce il pannello laterale lo tiene: li' Chat e Contesto sono due pannelli
impilati, e si arriva con "Claude Studio: Apri nel pannello laterale" o spegnendo
`claudeStudio.openAsTab`.

La chat non ha un motore proprio: parla con la CLI `claude` gia' installata sul PC
attraverso l'Agent SDK ufficiale. Da li' arrivano gratis autenticazione, modelli,
permessi, `CLAUDE.md`, skill, plugin, MCP, hook, memoria e slash command — tutta roba
che vive nel motore, non nell'interfaccia.

## Stato

- **Fase 1 — fatta**: scheletro, motore, risposta in streaming parola per parola.
  In piu', fuori piano: la chat si apre anche **come scheda** a tutto schermo, e le
  due facce (pannello laterale e scheda) condividono la stessa conversazione.
- **Fase 2 — fatta**: parita' di funzionamento con l'estensione ufficiale.
  - **Permessi dentro la chat**, nelle tre facce della stessa domanda: strumento
    (Consenti / Consenti sempre / Rifiuta), piano di `ExitPlanMode` (approva ed
    esegui, approva senza piu' chiedere le modifiche, continua a pianificare),
    domande a scelta multipla di `AskUserQuestion`.
  - **Modalita'** scelta dalla testata: chiede / modifiche senza chiedere / solo
    piano / non chiede mai.
  - **Tool disegnati**: diff colorati (il "prima" dai dati del tool, mai riletto dal
    disco), lista dei todo, output ripiegabile che dichiara quante righe ha,
    sub-agent annidati dentro la card del Task che li ha lanciati, percorsi
    cliccabili che aprono il file nell'editor.
  - **Cronologia**: le conversazioni del progetto, ripescate e ridipinte com'erano,
    riprese o continuate su un ramo nuovo.
  - **Ingressi**: `@` per un file, `/` per gli slash command veri della CLI,
    immagini incollate, e il codice selezionato nell'editor che si allega da solo.
  - **Ponte con l'editor**: server MCP `editor` con diff nativo, errori/avvisi che
    l'editor gia' conosce, file aperti e selezione, apertura di un file su una riga.
  - **Testata**: modello, modalita', contesto dell'ultimo turno e costo della
    conversazione.
- **Fase 3 — fatta**: la context bar assorbita.
  - **Pannello "Contesto"**: uso dell'account (5h e 7 giorni, con quanto manca al
    reset), una card per conversazione aperta con contesto, token, **costo** e barra
    che scivola, e in fondo progetto, ramo git e totale speso. Lo stesso pannello
    (stesso codice, `webview/ctxpanel.js`) sta anche **di fianco alla scheda** a
    tutto schermo, dove il pannello laterale non c'e': si mostra e si nasconde dalla
    testata, e sotto i 900 px si toglie di mezzo da sola per non strozzare il
    discorso.
  - **Barra di stato**: dove sei, il contesto, quante conversazioni, l'uso
    dell'account, il ramo — con **Ionicons cotte in un font su misura**, perche' li'
    VSCode disegna solo icone che arrivano da un font.
  - **Il legame certo**: la conversazione aperta dalla chat non viene indovinata.
    Id, titolo, se sta lavorando e se la stai guardando li sa questa stessa
    estensione. Per le tab dell'ufficiale resta l'euristica, e la card lo dichiara
    ("stimata", "ultima attiva") invece di far finta di saperlo.
  - **Difetti della 0.0.6 corretti**: costo sommato su **tutto** il transcript (e
    finalmente mostrato), gruppi editor oltre il quarto raggiungibili, `~/.claude`
    creata se manca, codice morto tolto, e i nostri due file in `~/.claude`
    rinominati per non pestare i piedi alla 0.0.6 finche' resta installata.
- **Fase 4 — fatta**: il repertorio completo delle animazioni e la rifinitura.
  - **Cambio conversazione**: il discorso vecchio esce scorrendo mentre quello
    nuovo entra dall'altra parte. Non e' una copia: sono gli stessi nodi, spostati
    in un fantasma appoggiato sopra il log e tagliato alla finestra che stavi
    guardando — se ne va proprio quello che vedevi.
  - **Attesa completa**: alone argilla che pulsa *e* gradiente che gira, i due
    movimenti insieme; e l'icona dello stato vuoto si disegna da sola, tracciato
    dopo tracciato, perche' le Ionicons outline sono tracciati veri.
  - **Errori leggibili**: dal motore arriva quello che arriva; qui si legge cos'e'
    successo e cosa si puo' fare (limite d'uso, autenticazione, credito, contesto
    pieno, rete, processo chiuso, CLI mancante). Il testo originale resta sotto,
    in "Dettagli tecnici", per chi lo vuole. Un turno che hai fermato tu non e'
    un guasto: stesso riquadro, tono diverso.
  - **Scorciatoie**: `Esc` ferma (o chiude la cronologia), `Alt+N` nuova
    conversazione, `Alt+H` cronologia, `Alt+M` modalita' permessi, `Alt+C` colonna
    del contesto, freccia in su sul campo vuoto per ripescare l'ultimo messaggio.
    Da VSCode: `Ctrl+Alt+C` apre la chat, `Ctrl+Alt+N` ne apre una nuova.
  - **Stato vuoto**: dice cos'e' questa chat e mostra le scorciatoie li', dove
    guardi mentre non c'e' ancora niente da leggere.
  - **Icona dell'estensione**: le sparkles di Ionicons sul gradiente argilla →
    pesca (`npm run icon`, poi committata: non pesa sulla build di tutti i giorni).

Il piano completo, con le indagini gia' fatte sul protocollo e i percorsi del
materiale di riferimento, sta in
`C:\Users\Steward\.claude\plans\io-non-me-ne-bright-lemur.md`.

## Cose imparate provando (non si vedono dal codice)

- Il messaggio `assistant` completo arriva **prima** che il blocco finisca di
  scorrere: non e' li' che si chiude un blocco di testo. Si chiude su
  `content_block_stop`, col testo accumulato dallo streaming.
- L'SDK va bene con la CLI installata anche se le versioni non combaciano
  (SDK 0.3.228 / CLI 2.1.79). Il binario nativo dell'SDK — 282 MB — non si
  impacchetta: si passa `pathToClaudeCodeExecutable`.
- `sdk.mjs` e' ESM ma importa solo moduli nativi di node, quindi esbuild lo converte
  in CJS senza strascichi. Serve solo sostituire `import.meta.url` (vedi `build.mjs`).
- Chromium non segue i `<use href="file.svg#id">` verso un file esterno: lo sprite
  Ionicons si incolla dentro il documento.
- Un `allow` **senza `updatedInput` viene rifiutato** dalla CLI, e lo fa in silenzio:
  la scheda dice "consentito" e il tool torna fallito con uno `ZodError` dentro il
  suo risultato. Si rimanda indietro l'input com'e' arrivato.
- "Consenti sempre" **non e' una cosa della sessione**: le regole suggerite dalla CLI
  hanno destinazione `localSettings`, quindi finiscono scritte in
  `.claude/settings.local.json` del progetto. Va detto a chi clicca, e le prove
  devono ripulire, altrimenti la seconda esecuzione passa senza chiedere niente —
  cioe' per il motivo sbagliato.
- La colonna della conversazione e' un flex: senza `flex: 0 0 auto` sui messaggi,
  appena il discorso supera l'altezza della finestra i messaggi **si schiacciano**
  invece di far scorrere. Si vede solo quando la pagina e' piena.
- Con un sub-agent al lavoro ci sono **piu' messaggi in volo insieme**, e i loro
  blocchi hanno indici che ripartono da zero. Tenere un solo "messaggio in corso"
  li fa accavallare: serve un filo per ciascuno, con chiave `parent_tool_use_id`.
- Il ponte con l'editor **non ha bisogno di socket ne' di lockfile**: l'Agent SDK
  ospita un server MCP dentro il nostro stesso processo (`createSdkMcpServer`).
  Quindi e' una funzione, non una porta di rete — e non litiga con quello
  dell'estensione ufficiale, che resta installata.
- Per la barra di stato servono le Ionicons **piene**, non le outline: un glifo di un
  font e' una forma riempita, e un'icona fatta di sole linee sparisce. La build se ne
  accorge da sola (rifiuta gli SVG con `stroke=` e i glifi senza tracciato) invece di
  lasciarti scoprire i quadratini a estensione installata.
- Il costo nel transcript sta su **due chiavi diverse**: `costUSD` riga per riga e a
  volte un `totalCostUsd` che e' gia' il totale. Se c'e' il totale vince lui,
  altrimenti si somma. E si somma **anche** quello dei sub-agent, che sono soldi veri.
- Il **contesto** invece no: i messaggi dei sub-agent hanno `isSidechain: true` e una
  finestra tutta loro. Prendere l'ultimo `usage` senza guardare quel campo fa crollare
  la percentuale del discorso principale appena parte un Task.
- Rifare le celle dell'account a ogni giro sembra innocuo e non lo e': con una barra
  animata, ricostruirla ogni secondo e mezzo rilancia la scia **per sempre**. La regola
  "costruisci una volta, poi ridipingi" vale anche per le due celle in testa.
- `os.homedir()` su Windows legge `USERPROFILE`: basta cambiarlo prima di caricare il
  bundle e le prove scrivono in una cartella usa e getta invece che nella tua.
- Per far uscire di scena una conversazione, i messaggi si **spostano**, non si
  copiano: una copia dovrebbe ricostruire anche lo scorrimento. E il fantasma va
  appeso **fuori** dal log — dentro un contenitore che scorre si porterebbe dietro
  lo scorrimento invece di restare fermo sotto i tuoi occhi.
- `stroke-dasharray` e `stroke-dashoffset` si **ereditano**: si possono mettere sul
  `<svg>` e arrivano fin dentro la forma richiamata con `<use>`. E' l'unico motivo
  per cui un'icona presa dallo sprite puo' disegnarsi da sola.
- Un alone senza sfocatura non e' un alone: e' un secondo pallino. Con un anello che
  gira intorno diventa una macchia unica. La sfocatura resta **ferma** (si muovono
  solo scala e opacita'), quindi non costa niente.
- Sulla tastiera italiana `Ctrl+Alt` **e'** AltGr: le lettere da evitare sono quelle
  che ci scrivono un carattere (e, o, a, +, ...). `c` e `n` sono libere.
- Nelle prove, `postMessage` arriva **dopo**: se premi il tasto subito dopo aver
  detto alla pagina "sto lavorando", il tasto arriva prima del messaggio e la prova
  fallisce per il motivo sbagliato. Ci vuole un attimo di attesa in mezzo.

## Sviluppo

```
npm run build       # build di produzione
npm run watch       # ricompila a ogni salvataggio
npm run typecheck   # tsc --noEmit
npm run icon        # ridisegna media/icon.png (serve solo se cambia il segno)
npm run package     # produce claude-studio.vsix
npm run verify      # tipi + webview (Playwright) + bundle vero sulla CLI vera
```

`npm run verify` mette insieme le prove:

- `ui-check` fa recitare alla webview un turno intero, in entrambe le facce, con due
  tool in parallelo che finiscono in ordine invertito — e controlla che ogni esito
  stia sotto il tool giusto. Poi clicca davvero le tre schede di permesso e cambia
  modalita' dalla testata, controllando cosa parte verso l'estensione. Alla fine
  prova la rifinitura: lo stato vuoto con le scorciatoie, l'errore grezzo del motore
  che diventa una frase (col testo originale ancora raggiungibile), i due movimenti
  dell'attesa, `Esc` e `Alt+N` che partono davvero, e il cambio conversazione — che
  il fantasma stia **sopra** il log, si porti dietro quello che stavi guardando e
  non resti appeso.
- `context-check` fa lo stesso col pannello del contesto: controlla che le card si
  **ridipingano** invece di essere ricreate (marchia un nodo e verifica che
  sopravviva ai giri seguenti), che la barra scivoli e la scia non riparta da sola,
  che un aggancio incerto sia dichiarato, e che costo e totale si vedano.
- `data-check` carica `dist/extension.js` con un `vscode` finto **e una cartella
  utente usa e getta**, e prova i conti: costo sommato su tutto un transcript da
  400 KB (non solo sulla coda), letture incrementali quando il file cresce, il
  sub-agent che non deve coprire il contesto vero, il quinto gruppo di editor
  raggiunto, `~/.claude` creata se manca, i file scritti con i nomi nostri.
- `host-check` carica lo stesso bundle e gli fa fare quattro turni sulla CLI vera:
  sessione, streaming, permesso chiesto e concesso *dentro la chat*, "Consenti
  sempre" che al turno dopo non richiede piu' niente, la scheda aperta a meta'
  discorso che si riprende la storia — e che la conversazione appena fatta compaia
  nella barra di contesto **senza euristica** (`focusHow: studio`).
- `smoke` e `trace-order` sono le prove secche del motore, utili quando si sospetta
  che sia cambiato qualcosa nel protocollo.

Per usare la chat **a mano**, senza aprire VSCode, c'e' `scripts/drive.cjs`: carica
il bundle vero con un `vscode` finto e stampa quello che vedrebbe la webview.

```
node scripts/drive.cjs "ciao"
node scripts/drive.cjs --json "..."            # eventi grezzi, uno per riga
node scripts/drive.cjs --deny --mode plan "..."
node scripts/drive.cjs --image foto.png "che cosa mostra?"
node scripts/drive.cjs --cmd '{"cmd":"history"}'
```

⚠️ Di suo dice **si' a ogni permesso**: puntato su un prompt che scrive, scrive
davvero nel repo. Per le prove che toccano file si usa `--deny`.

Per installarla: `npm run package` e poi
`code --install-extension claude-studio.vsix --force`, quindi ricaricare la finestra.

L'estensione **non** impacchetta una copia di `claude`: usa quella installata
globalmente. Se sta in un posto insolito, il percorso di `cli.js` si indica in
Impostazioni → Claude Studio → Cli Path.

## Impostazioni

| Chiave | Cosa fa |
|---|---|
| `claudeStudio.cliPath` | Percorso di `cli.js`. Vuoto = lo trova da solo. |
| `claudeStudio.contextLimit` | La finestra di contesto su cui si calcola la %. |
| `claudeStudio.refreshSeconds` | Ogni quanto la barra di contesto rifa' i conti (1,5s). |
| `claudeStudio.statusBar` | Spegne la riga nella barra di stato. |
| `claudeStudio.openAsTab` | Cliccando l'icona si apre la scheda e il pannello laterale si chiude. Spegnilo per restare nel pannello. |

## Scorciatoie

| Tasti | Cosa fa |
|---|---|
| `Ctrl+Alt+C` | Apre Claude Studio (da qualsiasi punto di VSCode). |
| `Ctrl+Alt+N` | Apre una conversazione nuova. |
| `Esc` | Ferma quello che sta facendo; a cronologia aperta, la chiude. |
| `Alt+N` | Conversazione nuova. |
| `Alt+H` | Cronologia del progetto. |
| `Alt+M` | Modalita' dei permessi. |
| `Alt+C` | Colonna del contesto (solo nella scheda a tutto schermo). |
| `↑` | Sul campo vuoto, ripesca l'ultimo messaggio mandato. |
| `@` / `/` | File del progetto / slash command veri della CLI. |
| `Invio` | Manda. `Maiusc+Invio` va a capo. |

Le prime due si cambiano da VSCode → File → Preferenze → Scorciatoie da tastiera,
cercando "Claude Studio". Le altre vivono dentro la chat.

## Convivenza con la context-bar 0.0.6

Finche' restano installate tutte e due non si pestano i piedi: i due file in
`~/.claude` hanno nomi diversi (`.claude-studio-usage.json` e
`claude-studio-session-names.json`), quindi anche i nomi che dai alle sessioni sono
separati. Le percentuali invece devono coincidere: si leggono dagli stessi
transcript. Il costo no — quello la 0.0.6 lo sottostima sulle conversazioni lunghe,
ed e' uno dei difetti corretti qui.
