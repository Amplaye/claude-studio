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
- **Fase 2 — in corso**. Fatto: i **permessi dentro la chat**, con le tre facce della
  stessa domanda — strumento (Consenti / Consenti sempre / Rifiuta), piano di
  `ExitPlanMode` (approva, approva senza piu' chiedere le modifiche, continua a
  pianificare), domande a scelta multipla di `AskUserQuestion`. In testata si sceglie
  la **modalita'**: chiede / modifiche senza chiedere / solo piano / non chiede mai.
  Resta da fare: rendering ricco dei tool (diff, todo, sub-agent), cronologia e
  ripresa, ingressi (`@file`, slash command, immagini), ponte con l'editor.
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

Per installarla: `npm run package` e poi
`code --install-extension claude-studio.vsix --force`, quindi ricaricare la finestra.

L'estensione **non** impacchetta una copia di `claude`: usa quella installata
globalmente. Se sta in un posto insolito, il percorso di `cli.js` si indica in
Impostazioni → Claude Studio → Cli Path.
