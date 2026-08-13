<div align="center">

<img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/media/mark.png" width="110" alt="Claude Studio" />

# Claude Studio

**The same Claude Code you already use — with a better place to use it.**

</div>

---

## In two lines

Claude Code is superb, and its VS Code panel is bare. Claude Studio replaces that
panel: **same CLI, same account, same `CLAUDE.md`, same skills, same
permissions** — nothing new to learn, nothing new to pay. What changes is what
you see while it works.

**It keeps itself current.** Claude Studio checks the Claude Code CLI and updates
it on its own, so the newest models and features are there the day they ship —
you never end up stuck on an old version.

![Claude Studio](https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/demo.gif)

## What you get that you didn't have

**You see it working, second by second.** A strip above the box you type in says
what it's on right now — *Reading src/store.ts*, *Reasoning…* — with a clock that
ticks. No more staring at a still screen wondering if it's crashed.

**Every change is a card, and cards stay shut.** A file edit arrives as a
coloured diff you open when you want to. Nothing unfolds by itself and pushes
your reading off the screen.

**A task list in the sidebar, ticking itself off.** When Claude plans a job it
writes down the steps — the **Tasks** panel shows them live: which one it's on
right now, how many are done, how many are left. It starts fresh at every
prompt, so what you're looking at is always this question's work and never the
last one's.

**It asks before it touches anything.** *Allow* · *Always allow* · *Deny*. When
it asks you to choose between options, there's always a line to write your own
answer on — because the answer often isn't one of the three.

**Attach any file. Not "any image" — any file.** This is the big one, and it is
the thing the official panel will not do: there, the paperclip only opens
pictures. Here it opens VS Code's own picker with **no filter on it at all**, so
whatever is on your disk can go into the message:

| | |
|---|---|
| **Documents** | PDF, Word (`.docx`), Pages, RTF, plain text, Markdown |
| **Spreadsheets & data** | Excel (`.xlsx`, `.xls`), CSV, TSV, JSON, XML, YAML, `.sql` dumps, SQLite files |
| **Slides** | PowerPoint (`.pptx`), Keynote |
| **Images** | PNG, JPG, GIF, WebP — these Claude actually *looks* at, and you see them in the chat |
| **Archives** | zip, tar, gz, 7z — hand over a whole folder in one go |
| **Logs & config** | `.log`, `.env`, `.ini`, `.toml`, `.conf`, crash dumps, stack traces |
| **Code** | any source file, in any language, from any project — not only the one you have open |
| **Audio & video** | `.mp4`, `.mov`, `.mp3`, `.wav` — the path goes over, and Claude reaches for the right tool |
| **Anything else** | there is no list to be on. If it is a file, it attaches. |

Three ways in: the paperclip, **drag and drop straight onto the message**, or
paste. Sizes are not a problem either — images travel as images, and everything
else travels as a *path* that Claude opens with its own tools, so a
forty-megabyte video never gets pushed through the chat. That is also the only
approach that works for every format at once, which is exactly why it is the one
used here.

Attach several at a time and ask one question about all of them: *"read the PDF
and the spreadsheet, watch the video, and tell me what doesn't match."*

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
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/modelli.png" alt="Model picker" /><br /><em>Opus 5, Fable 5, Sonnet 5, Haiku 4.5 — each its own colour</em></td>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/contesto.png" alt="Context panel" /><br /><em>Context left, everywhere — and which one finished</em></td>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/allegati.png" alt="Attachments" /><br /><em>PDF, Excel, Word, video, zip, logs — any file at all</em></td>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/suoni.png" alt="Sounds" /><br /><em>Even the lists are ours, and they open</em></td>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/task.png" alt="Task list" /><br /><em>The steps, ticking themselves off as it goes</em></td>
<td></td>
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
- **Paste an image**, **drop a file**, or use the paperclip — any format, any size.
- **A chime and a notification** when it's done, if you've wandered off — and a
  mark on the conversation that finished, so you know which one.
- **24 past conversations** a click away, terminal ones included.
- **Sidebar or full tab**, same conversation on both.
- **English or Italian**, switched on the spot.
- **Windows, macOS and Linux** — same interface, same shortcuts, written the way
  your own keyboard writes them.

## Shortcuts

Every shortcut works the same everywhere. Only the name of the modifier changes,
and the interface already writes it the way your machine does — `Alt` on Windows
and Linux, `⌥` (Option) on a Mac.

| | Windows · Linux | macOS |
|---|---|---|
| New session in a new tab | `Alt+N` | `⌥N` |
| Change mode (Plan · Ask · Yolo) | `Alt+M` | `⌥M` |
| Conversations | `Alt+H` | `⌥H` |
| Settings | `Alt+I` | `⌥I` |
| Show or hide the context | `Alt+C` | `⌥C` |
| Close this tab | `Alt+W` | `⌥W` |
| Stop | `Esc` | `Esc` |
| A file · a command | `@` · `/` | `@` · `/` |

And from anywhere in VS Code, with the chat not even focused:

| | Windows · Linux | macOS |
|---|---|---|
| Open Claude Studio | `Ctrl+Alt+C` | `⌘⌥C` |
| New session in a new tab | `Ctrl+Alt+N` | `⌘⌥N` |

## Settings

All under `claudeStudio`: path to the CLI, automatic updates, context window
size, and whether the icon opens the sidebar or a full tab.

---

<div align="center">

**Requires** the [Claude Code](https://claude.com/claude-code) CLI, installed and signed in.
It's your account and your usage: Claude Studio adds no service and no key of its own.

MIT · [Report an issue](https://github.com/Amplaye/claude-studio/issues) · [Development notes](https://github.com/Amplaye/claude-studio/blob/main/docs/SVILUPPO.md)

</div>
