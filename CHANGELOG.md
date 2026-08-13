# Changelog

## Unreleased

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
