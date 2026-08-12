<div align="center">

<img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/media/icon.png" width="110" alt="Claude Studio" />

# Claude Studio

**The same Claude Code you already use — with a better place to use it.**

</div>

---

## In two lines

Claude Code is superb, and its VS Code panel is bare. Claude Studio replaces that
panel: **same CLI, same account, same `CLAUDE.md`, same skills, same
permissions** — nothing new to learn, nothing new to pay. What changes is what
you see while it works.

![Claude Studio](https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/demo.gif)

## What you get that you didn't have

**You see it working, second by second.** A strip above the box you type in says
what it's on right now — *Reading src/store.ts*, *Reasoning…* — with a clock that
ticks. No more staring at a still screen wondering if it's crashed.

**Every change is a card, and cards stay shut.** A file edit arrives as a
coloured diff you open when you want to. Nothing unfolds by itself and pushes
your reading off the screen.

**It asks before it touches anything.** *Allow* · *Always allow* · *Deny*. When
it asks you to choose between options, there's always a line to write your own
answer on — because the answer often isn't one of the three.

**Attach any file, not just pictures.** A paperclip in the box you type in, and
VS Code's own picker with no filter on it: a PDF, a spreadsheet, a log, a zip,
a video. Drop them on the message and they attach too. Images travel as images;
everything else travels as a path Claude opens with its own tools — which is
both the only thing that works for every format and the only thing that doesn't
push a forty-megabyte file through the chat.

**You know which conversation finished.** With three of them open, a chime tells
you *something* is ready, not *which* — and you go through the tabs one by one to
find out. Now the one that finished says so: a dot on its tab, a green mark on
its card. It goes out the moment you look at it.

**The last message reads like an answer.** Headings, lists, tables, code: the
recap at the end of a turn is laid out, not dumped as raw text.

**You know how much room is left.** Context used, account limits, time to the
next reset — for this conversation and for every other Claude you have open.

## Try it in one minute

```
npm install -g @anthropic-ai/claude-code   # if you haven't already
claude                                     # sign in once
```

Install Claude Studio, click the icon in the left bar, and type:

> `Read @src/settings.tsx and add a dark/light switch that survives a restart.`

You'll watch it read the file, propose the diff, ask before running the tests,
and close with a recap of what changed.

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/streaming.png" alt="Live activity" /><br /><em>What it's doing, right now</em></td>
<td width="50%"><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/permessi.png" alt="Permissions and questions" /><br /><em>You decide — and you can write your own answer</em></td>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/modelli.png" alt="Model picker" /><br /><em>Every model its own colour — and every switch moves</em></td>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/contesto.png" alt="Context panel" /><br /><em>Context left, everywhere — and which one finished</em></td>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/allegati.png" alt="Attachments" /><br /><em>Any file at all, not just pictures</em></td>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/suoni.png" alt="Sounds" /><br /><em>Even the lists are ours, and they open</em></td>
</tr>
</table>

## Three modes, one click

| | |
|---|---|
| **Plan** | thinks, touches nothing |
| **Ask** | checks with you before acting |
| **Yolo** | gets on with it |

Switch any time, even halfway through a conversation.

## The handy bits

- **`@` for a file, `/` for a command** — your skills and plugins included.
- **Paste an image**, **drop a file**, or use the paperclip — any format.
- **A chime and a notification** when it's done, if you've wandered off — and a
  mark on the conversation that finished, so you know which one.
- **24 past conversations** a click away, terminal ones included.
- **Sidebar or full tab**, same conversation on both.
- **English or Italian**, switched on the spot.

## Shortcuts

| | | | |
|---|---|---|---|
| `Alt+N` new | `Alt+M` mode | `Alt+H` history | `Alt+I` settings |
| `Alt+C` context | `Esc` stop | `@` file | `/` command |

## Settings

All under `claudeStudio`: path to the CLI, automatic updates, context window
size, and whether the icon opens the sidebar or a full tab.

---

<div align="center">

**Requires** the [Claude Code](https://claude.com/claude-code) CLI, installed and signed in.
It's your account and your usage: Claude Studio adds no service and no key of its own.

MIT · [Report an issue](https://github.com/Amplaye/claude-studio/issues) · [Development notes](https://github.com/Amplaye/claude-studio/blob/main/docs/SVILUPPO.md)

</div>
