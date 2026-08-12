# Changelog

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
