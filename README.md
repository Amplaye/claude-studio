<div align="center">

<img src="https://raw.githubusercontent.com/mr-wilson-dev/claude-studio/main/media/icon.png" width="120" alt="Claude Studio" />

# Claude Studio

**Claude Code dentro VS Code.** Chat, permessi da approvare con un clic, e quanto contesto ti resta — sempre sott'occhio.

*Claude Code inside VS Code. Chat, one-click permissions, and your remaining context — always in sight.*

</div>

---

## Cos'è, in due righe

Claude Studio porta **Claude Code dentro VS Code**: gli scrivi come faresti da terminale, ma le risposte, i file che tocca e i permessi che chiede diventano schede da leggere e bottoni da premere.

Non è un'altra AI: usa la **Claude Code che hai già installato**. Stesso account, stessi `CLAUDE.md`, stesse skill, stessi permessi. Cambia solo che li vedi.

![Claude Studio](https://raw.githubusercontent.com/mr-wilson-dev/claude-studio/main/docs/img/chat-full.png)

## Cosa fa

**Chiede prima di toccare.** Quando Claude vuole lanciare un comando o modificare un file, te lo mostra e aspetta: *Consenti*, *Consenti sempre*, *Rifiuta*. Le modifiche le vedi come diff colorati, prima che succedano.

**Tre modi, un clic.** *Piano* ragiona senza toccare niente. *Chiede* domanda prima di agire. *Yolo* fa tutto da solo. Si cambia al volo, anche a metà conversazione.

**Ti dice quanto contesto resta.** Una barra col consumo della sessione, il limite dell'account e quanto manca al prossimo reset. Niente più conversazioni che si fermano di colpo.

**Scegli il modello che vuoi.** Opus, Sonnet, Haiku: ognuno con il suo colore, così vedi al volo chi sta lavorando.

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/mr-wilson-dev/claude-studio/main/docs/img/modelli.png" alt="I modelli" /><br /><em>Ogni modello il suo colore</em></td>
<td width="50%"><img src="https://raw.githubusercontent.com/mr-wilson-dev/claude-studio/main/docs/img/contesto.png" alt="Il contesto" /><br /><em>Quanto contesto ti resta</em></td>
</tr>
</table>

## Come si parte

1. Serve la **CLI di Claude Code** installata e già collegata al tuo account:
   ```
   npm install -g @anthropic-ai/claude-code
   claude
   ```
2. Installa Claude Studio.
3. Clicca l'icona nella barra a sinistra. Scrivi.

Nient'altro: niente chiavi API da incollare, niente configurazione. L'account è quello che usi già da terminale.

## Le cose comode

- **`@` per un file, `/` per un comando** — gli stessi che hai da terminale, skill e plugin compresi.
- **Incolla immagini** direttamente nella chat.
- **Ti avvisa quando ha finito**, con un suono e una notifica, se nel frattempo sei andato altrove.
- **Riprendi le conversazioni** di prima, anche quelle iniziate da terminale.
- **Pannello o scheda intera**, come preferisci: stessa conversazione, due facce.

## Scorciatoie

| | |
|---|---|
| `Alt+N` | Conversazione nuova |
| `Alt+M` | Cambia modo |
| `Alt+H` | Cronologia |
| `Esc` | Ferma |
| `@` / `/` | File / comando |

## Impostazioni

Tutte sotto `claudeStudio`: percorso della CLI, aggiornamenti automatici, limite di contesto, e come si apre (pannello o scheda).

---

<div align="center">

**In English** — Claude Studio brings [Claude Code](https://claude.com/claude-code) into VS Code. It uses the CLI you already have installed — same account, same `CLAUDE.md`, same skills — and turns its answers, file edits and permission requests into cards you read and buttons you click. See every command before it runs, approve diffs before they land, and keep an eye on how much context you have left.

**Requires** the Claude Code CLI, installed and signed in.

MIT · [Segnala un problema](https://github.com/mr-wilson-dev/claude-studio/issues) · [Note di sviluppo](https://github.com/mr-wilson-dev/claude-studio/blob/main/docs/SVILUPPO.md)

</div>
