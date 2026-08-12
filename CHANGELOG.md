# Changelog

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
