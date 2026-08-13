# Changelog

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
