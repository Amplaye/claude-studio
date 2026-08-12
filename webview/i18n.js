/* Claude Studio — the two languages the interface speaks.
 *
 * One dictionary, two columns. English is the source of truth: every key exists in
 * EN, and IT is allowed to be missing one — you get the English back rather than an
 * empty label or a raw key on screen.
 *
 * Nothing here reloads the page. `I18N.set()` swaps the language and calls back;
 * chat.js redraws the parts it builds by hand and `I18N.apply()` rewrites the ones
 * that sit in the HTML. That's what makes the switch instant.
 *
 * Markup contract, all three optional and combinable on one element:
 *   data-i18n="key"        -> textContent
 *   data-i18n-title="key"  -> title attribute
 *   data-i18n-ph="key"     -> placeholder attribute
 */
(() => {
  const EN = {
    // ---- header ----
    'top.mode': 'How it handles permissions (Alt+M)',
    'top.mode.plan': 'Plan only: it thinks but touches nothing',
    'top.mode.plan.label': 'Plan',
    'top.mode.ask': 'Asks before acting',
    'top.mode.ask.label': 'Ask',
    'top.mode.yolo': 'Never asks: does everything on its own',
    'top.mode.yolo.label': 'Yolo',
    'top.settings': 'Model, thinking and notifications (Alt+I)',
    'top.history': 'Conversations in this project (Alt+H)',
    'top.context': 'Show or hide the context (Alt+C)',
    'top.tab': 'Open as a tab',
    'top.new': 'New session in a new tab (Alt+N)',

    // ---- history drawer ----
    'drawer.title': 'Conversations',
    'drawer.empty': 'No saved conversations for this project.',
    'common.close': 'Close',

    // ---- settings panel ----
    'cfg.title': 'Settings',
    'cfg.model': 'Model',
    'cfg.effort': 'Effort',
    'cfg.thinking': 'Thinking',
    'cfg.done': "When it's done",
    'cfg.language': 'Language',
    'cfg.language.hint': 'Changes the whole interface straight away',
    'cfg.sound': 'Sound',
    'cfg.volume': 'Volume',
    'cfg.away': "Only when VS Code isn't in front",
    'cfg.onAsk': 'Also chime when a permission is needed',
    'cfg.toast': "VS Code notification when you're away",
    'cfg.test': 'Test the sound',
    'cfg.models.waiting': 'The models will appear after the first message',

    'sound.cozy': 'Cozy',
    'sound.harvest': 'Harvest',
    'sound.levelup': 'Level up',
    'sound.starlit': 'Starlit',
    'sound.chest': 'Chest',
    'sound.off': 'Mute',

    // ---- effort ----
    'effort.': 'Auto',
    'effort..desc': 'Claude decides how hard to work based on the question',
    'effort.low': 'Fast',
    'effort.low.desc': 'Answers right away — good for simple questions',
    'effort.medium': 'Balanced',
    'effort.medium.desc': 'The right mix of speed and precision',
    'effort.high': 'Thorough',
    'effort.high.desc': 'Takes the time to do things properly',
    'effort.xhigh': 'Very thorough',
    'effort.xhigh.desc': 'Analyses everything in depth before acting',
    'effort.max': 'Maximum',
    'effort.max.desc': 'Spares nothing, the highest quality',
    'effort.none': "This model doesn't take effort levels: it decides for itself",

    // ---- thinking ----
    'think.auto': 'Auto',
    'think.auto.desc': 'Claude decides when to reason in depth',
    'think.on': 'On',
    'think.on.desc': 'Reasons step by step before every answer',
    'think.off': 'Off',
    'think.off.desc': 'Answers directly, with no intermediate reasoning',
    'think.capped': ' — on this model it means a fixed token ceiling',

    // ---- what each model is for (the CLI always words these the same way) ----
    'model.everyday': 'For every day, complex ones too',
    'model.hardest': 'The most capable, for the tough jobs',
    'model.routine': 'Efficient for routine things',
    'model.fastest': 'The fastest, answers on the fly',

    // ---- composer ----
    'composer.placeholder': 'Message Claude…  (@ for a file, / for a command, Enter to send)',
    'composer.send': 'Send',
    'composer.stop': 'Stop',
    'composer.dropSelection': "Don't attach the selection",
    'composer.removeImage': 'Remove',
    'composer.attachedImage': 'Attached image',

    // ---- the "@" and "/" menu ----
    'menu.commands': ' Commands',
    'menu.search': 'Search for a command…',
    'menu.needSession': ' Send a message to load the commands',
    'menu.general': 'General',

    // ---- empty state ----
    'empty.title': 'Ready.',
    'empty.body':
      'Write below: you get the same Claude Code you use from the terminal, with your CLAUDE.md, skills, MCP and permissions.',
    'empty.key.file': 'a file',
    'empty.key.command': 'a command',
    'empty.key.new': 'new',
    'empty.key.history': 'history',
    'empty.key.stop': 'stop',

    // ---- the conversation ----
    'msg.reasoning': 'Reasoning',
    'msg.thinking': 'Claude is thinking…',
    'msg.openInEditor': 'Open in the editor',
    'msg.lines': '{n} lines',
    'msg.moreLines': '… {n} more lines',
    'msg.replaceAll': 'all occurrences replaced',
    'msg.item': '1 item',
    'msg.items': '{n} items',

    // ---- permissions ----
    'perm.title': 'Your permission is needed',
    'perm.wants': 'Claude wants to use {tool}',
    'perm.approve': 'Approve and run',
    'perm.approveAuto': "Approve, don't ask about edits",
    'perm.keepPlanning': 'Keep planning',
    'perm.allow': 'Allow',
    'perm.always': 'Always allow',
    'perm.alwaysHint': "The rule stays written in the project's permissions (.claude/settings.local.json).",
    'perm.deny': 'Deny',
    'perm.send': 'Send',

    // Labels the extension sends back once a card is answered. They arrive already
    // written, and get looked up here so the card reads in your language too.
    'label.Allowed': 'Allowed',
    'label.Always allowed': 'Always allowed',
    'label.Allowed (Yolo)': 'Allowed (Yolo)',
    'label.Rejected': 'Rejected',
    'label.Cancelled': 'Cancelled',
    'label.Plan approved': 'Plan approved',
    'label.Approved, automatic edits': 'Approved, automatic edits',
    'label.Keep planning': 'Keep planning',
    'label.Answered': 'Answered',

    // ---- errors ----
    'err.cli.title': "Can't find the Claude Code CLI on this computer.",
    'err.cli.hint':
      'Install it with "npm i -g @anthropic-ai/claude-code", or point to the path of cli.js in Settings → Claude Studio → Cli Path.',
    'err.rate.title': "You've hit the account's usage limit.",
    'err.rate.hint': 'The context panel shows how long until the next reset.',
    'err.auth.title': 'Claude Code is not authenticated.',
    'err.auth.hint': 'Open a terminal, run "claude" and sign in again: the chat uses the same authentication.',
    'err.credit.title': "The account doesn't have the credit to answer.",
    'err.credit.hint': 'The context panel shows how much has been spent so far.',
    'err.context.title': 'The conversation has filled up the context window.',
    'err.context.hint': 'Open a new one (Alt+N) and start again from a summary: nothing else fits in here.',
    'err.net.title': 'The connection dropped.',
    'err.net.hint': "Check the network and send the message again: the conversation wasn't lost.",
    'err.stopped.title': 'Turn interrupted.',
    'err.stopped.hint': 'The next message picks up from here.',
    'err.exit.title': 'The Claude process shut itself down.',
    'err.exit.hint': 'Send the message again: the session restarts automatically.',
    'err.generic.title': 'Something went wrong.',
    'err.generic.hint': 'Usually sending the message again is enough. Below is what the engine said.',
    'err.none': 'Error with no description.',
    'err.details': 'Technical details',

    // ---- how long ago ----
    'ago.now': 'just now',
    'ago.min': '{n} min ago',
    'ago.hour': 'an hour ago',
    'ago.hours': '{n} hours ago',
    'ago.yesterday': 'yesterday',
    'ago.days': '{n} days ago',

    // ---- lightbox ----
    'lightbox.close': 'Close (Esc)',

    // ---- the context panel (sidebar, and the column inside the tab) ----
    'ctx.account': 'Account',
    'ctx.session': 'Session · 5h',
    'ctx.week': 'Week · 7d',
    'ctx.resets': 'resets {when}',
    'ctx.rename': 'Rename',
    'ctx.here': 'here',
    'ctx.busy': 'active now',
    'ctx.recent': 'recently active',
    'ctx.idle': 'idle',
    'ctx.own': 'Claude Studio conversation',
    'ctx.foreign': 'Tab from the official extension',
    'ctx.ownPill': 'opened by Claude Studio · id {id}',
    'ctx.foreignPill': 'tab "{tab}" · id {id}',
    'ctx.estimated': ' · estimated',
    'ctx.lastActive': ' · last active',
    'ctx.activeNow': ' · active now',
    'ctx.empty': 'No conversations open in this project.',
  };

  const IT = {
    'top.mode': 'Come gestisce i permessi (Alt+M)',
    'top.mode.plan': 'Solo piano: ragiona ma non tocca niente',
    'top.mode.plan.label': 'Piano',
    'top.mode.ask': 'Chiede prima di agire',
    'top.mode.ask.label': 'Chiedi',
    'top.mode.yolo': 'Non chiede mai: fa tutto da solo',
    'top.mode.yolo.label': 'Yolo',
    'top.settings': 'Modello, ragionamento e notifiche (Alt+I)',
    'top.history': 'Conversazioni di questo progetto (Alt+H)',
    'top.context': 'Mostra o nascondi il contesto (Alt+C)',
    'top.tab': 'Apri come scheda',
    'top.new': 'Nuova sessione in una nuova scheda (Alt+N)',

    'drawer.title': 'Conversazioni',
    'drawer.empty': 'Nessuna conversazione salvata per questo progetto.',
    'common.close': 'Chiudi',

    'cfg.title': 'Impostazioni',
    'cfg.model': 'Modello',
    'cfg.effort': 'Impegno',
    'cfg.thinking': 'Ragionamento',
    'cfg.done': 'Quando ha finito',
    'cfg.language': 'Lingua',
    'cfg.language.hint': "Cambia subito tutta l'interfaccia",
    'cfg.sound': 'Suono',
    'cfg.volume': 'Volume',
    'cfg.away': 'Solo quando VS Code non è in primo piano',
    'cfg.onAsk': 'Suona anche quando serve un permesso',
    'cfg.toast': 'Notifica di VS Code quando non sei al computer',
    'cfg.test': 'Prova il suono',
    'cfg.models.waiting': 'I modelli compaiono dopo il primo messaggio',

    'sound.cozy': 'Coccola',
    'sound.harvest': 'Raccolto',
    'sound.levelup': 'Livello su',
    'sound.starlit': 'Stellato',
    'sound.chest': 'Scrigno',
    'sound.off': 'Muto',

    'effort.': 'Auto',
    'effort..desc': 'Decide Claude quanto impegnarsi, in base alla domanda',
    'effort.low': 'Veloce',
    'effort.low.desc': 'Risponde subito — va bene per le domande semplici',
    'effort.medium': 'Bilanciato',
    'effort.medium.desc': 'Il giusto mezzo fra velocità e precisione',
    'effort.high': 'Accurato',
    'effort.high.desc': 'Si prende il tempo di fare le cose per bene',
    'effort.xhigh': 'Molto accurato',
    'effort.xhigh.desc': 'Analizza tutto a fondo prima di agire',
    'effort.max': 'Massimo',
    'effort.max.desc': 'Non si risparmia niente, la qualità più alta',
    'effort.none': 'Questo modello non prende livelli di impegno: decide da sé',

    'think.auto': 'Auto',
    'think.auto.desc': 'Decide Claude quando ragionare a fondo',
    'think.on': 'Sì',
    'think.on.desc': 'Ragiona passo per passo prima di ogni risposta',
    'think.off': 'No',
    'think.off.desc': 'Risponde diretto, senza ragionamento intermedio',
    'think.capped': ' — su questo modello vuol dire un tetto fisso di token',

    'model.everyday': 'Per ogni giorno, anche le cose complesse',
    'model.hardest': 'Il più capace, per i lavori tosti',
    'model.routine': 'Efficiente per le cose di routine',
    'model.fastest': 'Il più veloce, risponde al volo',

    'composer.placeholder': 'Scrivi a Claude…  (@ per un file, / per un comando, Invio per mandare)',
    'composer.send': 'Manda',
    'composer.stop': 'Ferma',
    'composer.dropSelection': 'Non allegare la selezione',
    'composer.removeImage': 'Togli',
    'composer.attachedImage': 'Immagine allegata',

    'menu.commands': ' Comandi',
    'menu.search': 'Cerca un comando…',
    'menu.needSession': ' Manda un messaggio per caricare i comandi',
    'menu.general': 'Generali',

    'empty.title': 'Pronto.',
    'empty.body':
      'Scrivi qui sotto: è lo stesso Claude Code che usi dal terminale, con il tuo CLAUDE.md, le skill, gli MCP e i permessi.',
    'empty.key.file': 'un file',
    'empty.key.command': 'un comando',
    'empty.key.new': 'nuova',
    'empty.key.history': 'cronologia',
    'empty.key.stop': 'ferma',

    'msg.reasoning': 'Ragionamento',
    'msg.thinking': 'Claude sta pensando…',
    'msg.openInEditor': "Apri nell'editor",
    'msg.lines': '{n} righe',
    'msg.moreLines': '… altre {n} righe',
    'msg.replaceAll': 'sostituite tutte le occorrenze',
    'msg.item': '1 voce',
    'msg.items': '{n} voci',

    'perm.title': 'Serve il tuo permesso',
    'perm.wants': 'Claude vuole usare {tool}',
    'perm.approve': 'Approva ed esegui',
    'perm.approveAuto': 'Approva, non chiedere per le modifiche',
    'perm.keepPlanning': 'Continua a pianificare',
    'perm.allow': 'Consenti',
    'perm.always': 'Consenti sempre',
    'perm.alwaysHint': 'La regola resta scritta nei permessi del progetto (.claude/settings.local.json).',
    'perm.deny': 'Nega',
    'perm.send': 'Manda',

    'label.Allowed': 'Consentito',
    'label.Always allowed': 'Consentito sempre',
    'label.Allowed (Yolo)': 'Consentito (Yolo)',
    'label.Rejected': 'Rifiutato',
    'label.Cancelled': 'Annullato',
    'label.Plan approved': 'Piano approvato',
    'label.Approved, automatic edits': 'Approvato, modifiche automatiche',
    'label.Keep planning': 'Continua a pianificare',
    'label.Answered': 'Risposto',

    'err.cli.title': 'Non trovo la CLI di Claude Code su questo computer.',
    'err.cli.hint':
      'Installala con "npm i -g @anthropic-ai/claude-code", oppure indica il percorso di cli.js in Impostazioni → Claude Studio → Cli Path.',
    'err.rate.title': "Hai raggiunto il limite d'uso dell'account.",
    'err.rate.hint': 'Il pannello del contesto dice quanto manca al prossimo azzeramento.',
    'err.auth.title': 'Claude Code non è autenticato.',
    'err.auth.hint': 'Apri un terminale, lancia "claude" e rientra: la chat usa la stessa autenticazione.',
    'err.credit.title': "L'account non ha il credito per rispondere.",
    'err.credit.hint': 'Il pannello del contesto dice quanto è stato speso finora.',
    'err.context.title': 'La conversazione ha riempito la finestra di contesto.',
    'err.context.hint': 'Aprine una nuova (Alt+N) e riparti da un riassunto: qui dentro non ci sta altro.',
    'err.net.title': 'La connessione è caduta.',
    'err.net.hint': 'Controlla la rete e rimanda il messaggio: la conversazione non è andata persa.',
    'err.stopped.title': 'Turno interrotto.',
    'err.stopped.hint': 'Il prossimo messaggio riprende da qui.',
    'err.exit.title': 'Il processo di Claude si è spento da solo.',
    'err.exit.hint': 'Rimanda il messaggio: la sessione riparte da sola.',
    'err.generic.title': 'Qualcosa è andato storto.',
    'err.generic.hint': 'Di solito basta rimandare il messaggio. Qui sotto c\'è quello che ha detto il motore.',
    'err.none': 'Errore senza descrizione.',
    'err.details': 'Dettagli tecnici',

    'ago.now': 'adesso',
    'ago.min': '{n} min fa',
    'ago.hour': "un'ora fa",
    'ago.hours': '{n} ore fa',
    'ago.yesterday': 'ieri',
    'ago.days': '{n} giorni fa',

    'lightbox.close': 'Chiudi (Esc)',

    'ctx.account': 'Account',
    'ctx.session': 'Sessione · 5h',
    'ctx.week': 'Settimana · 7g',
    'ctx.resets': 'si azzera {when}',
    'ctx.rename': 'Rinomina',
    'ctx.here': 'qui',
    'ctx.busy': 'attiva adesso',
    'ctx.recent': 'attiva di recente',
    'ctx.idle': 'ferma',
    'ctx.own': 'Conversazione di Claude Studio',
    'ctx.foreign': "Scheda dell'estensione ufficiale",
    'ctx.ownPill': 'aperta da Claude Studio · id {id}',
    'ctx.foreignPill': 'scheda "{tab}" · id {id}',
    'ctx.estimated': ' · stimata',
    'ctx.lastActive': ' · ultima attiva',
    'ctx.activeNow': ' · attiva adesso',
    'ctx.empty': 'Nessuna conversazione aperta in questo progetto.',
  };

  const DICT = { en: EN, it: IT };
  let lang = 'en';
  const listeners = [];

  /** Missing key or missing translation both fall back to English, then to the key
   *  itself — a visible label beats a blank one. */
  function t(key, vars) {
    const s = (DICT[lang] && DICT[lang][key]) ?? EN[key] ?? key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  }

  /** Rewrites everything the HTML declared. Safe to call as often as you like. */
  function apply(root) {
    const r = root || document;
    for (const n of r.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of r.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
    for (const n of r.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
  }

  window.I18N = {
    get lang() {
      return lang;
    },
    t,
    apply,
    /** Switches language and tells whoever draws by hand to draw again. */
    set(next) {
      const v = DICT[next] ? next : 'en';
      if (v === lang) return;
      lang = v;
      document.documentElement.lang = v;
      apply();
      for (const fn of listeners) fn(v);
    },
    /** Called after every switch: that's where the hand-built parts redraw. */
    onChange(fn) {
      listeners.push(fn);
    },
  };
})();
