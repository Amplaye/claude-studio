<div align="center">

<img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/media/icon.png" width="120" alt="Claude Studio" />

# Claude Studio

**Claude Code, inside VS Code.** Chat, one-click permissions, and how much context you have left — always in sight.

</div>

---

## What it is, in two lines

Claude Studio brings **Claude Code into VS Code**. You talk to it like you would in the terminal, but the answers, the files it touches and the permissions it asks for become cards you read and buttons you click.

It's not another AI: it uses the **Claude Code you already have installed**. Same account, same `CLAUDE.md`, same skills, same permissions. The difference is you can see them.

![Claude Studio](https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/chat-full.png)

## What it does

**It asks before it touches anything.** When Claude wants to run a command or change a file, it shows you and waits: *Allow*, *Always allow*, *Deny*. Edits arrive as colored diffs — before they happen, not after.

**Three modes, one click.** *Plan* thinks without touching anything. *Ask* checks with you before acting. *Yolo* just gets on with it. Switch any time, even mid-conversation.

**It tells you how much context is left.** A bar with what this session has spent, your account limit, and how long until the next reset. No more conversations that stop dead without warning.

**Pick the model you want.** Opus, Sonnet, Haiku — each with its own color, so you can see at a glance which one is working.

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/modelli.png" alt="Model picker" /><br /><em>Every model its own color</em></td>
<td width="50%"><img src="https://raw.githubusercontent.com/Amplaye/claude-studio/main/docs/img/contesto.png" alt="Context bar" /><br /><em>How much context you have left</em></td>
</tr>
</table>

## Getting started

1. You need the **Claude Code CLI**, installed and already signed in to your account:
   ```
   npm install -g @anthropic-ai/claude-code
   claude
   ```
2. Install Claude Studio.
3. Click the icon in the left bar. Start typing.

That's it — no API keys to paste, nothing to configure. The account is the one you already use from the terminal.

## The handy bits

- **`@` for a file, `/` for a command** — the same ones you have in the terminal, skills and plugins included.
- **Paste images** straight into the chat.
- **It tells you when it's done**, with a chime and a notification, if you've wandered off in the meantime.
- **Pick up earlier conversations**, including ones you started in the terminal.
- **Sidebar or full tab**, whichever you prefer: same conversation, two faces.

## Shortcuts

| | |
|---|---|
| `Alt+N` | New conversation |
| `Alt+M` | Switch mode |
| `Alt+H` | History |
| `Esc` | Stop |
| `@` / `/` | File / command |

## Settings

All under `claudeStudio`: path to the CLI, automatic updates, context limit, and how it opens (sidebar or tab).

---

<div align="center">

**Requires** the [Claude Code](https://claude.com/claude-code) CLI, installed and signed in.

MIT · [Report an issue](https://github.com/Amplaye/claude-studio/issues) · [Development notes](https://github.com/Amplaye/claude-studio/blob/main/docs/SVILUPPO.md)

</div>
