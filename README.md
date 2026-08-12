# Claude Studio

Chat di Claude Code e barra di contesto, in una sola estensione di VSCode.

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
- Fase 3: la context bar assorbita.
- Fase 4: repertorio completo delle animazioni e rifinitura.

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

## Sviluppo

```
npm run build       # build di produzione
npm run watch       # ricompila a ogni salvataggio
npm run typecheck   # tsc --noEmit
npm run package     # produce claude-studio.vsix
npm run verify      # tipi + webview (Playwright) + bundle vero sulla CLI vera
```

`npm run verify` mette insieme le tre prove:

- `ui-check` fa recitare alla webview un turno intero, in entrambe le facce, con due
  tool in parallelo che finiscono in ordine invertito — e controlla che ogni esito
  stia sotto il tool giusto. Poi clicca davvero le tre schede di permesso e cambia
  modalita' dalla testata, controllando cosa parte verso l'estensione.
- `host-check` carica `dist/extension.js` con un `vscode` finto e gli fa fare tre
  turni sulla CLI vera: sessione, streaming, permesso chiesto e concesso *dentro la
  chat*, "Consenti sempre" che al turno dopo non richiede piu' niente, e la scheda
  aperta a meta' discorso che si riprende la storia.
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
