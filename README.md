<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img src="assets/logo.svg" width="360" alt="skillboard">
  </picture>
</p>

English | [繁體中文](README.zh-TW.md)

# skillboard: a skills pane for Claude Code (a Claude Code mod)

A **Claude Code plugin**, built on **Claude Code mods**. When you have hundreds of skills from many plugins, it lists every skill your session can use in one **Skills Pane** beside the chat, with a one-line summary each, so you can find the right one without digging through docs. If you give it a TypeSafe Jev API key, it also suggests the skills that fit the prompt you just sent.

It works in the Claude Desktop Code tab and in `claude` in a terminal.

https://github.com/user-attachments/assets/4e2d2cb6-3677-441f-bb95-adb55453b98b

The pane has three parts, top to bottom:

| Part | What it shows | Example |
|---|---|---|
| **Recommended** | Up to 3 skills that fit your last prompt, each with a confidence percentage. Shown only when a Jev API key is set | `tdd 62%` after you ask to write tests first |
| **Toolbar** | Search box, **Refresh**, the language menu, **Expand all / Collapse all** | Type `review` to find every review skill |
| **Skill Catalog** | Every skill, grouped by Source: one group per plugin with its version, then User, Project and Built-in | `[ ▸ mattpocock-skills ]  1.3.1 · 27` |

## Quick start

```bash
claude plugin marketplace add wide3751/skillboard
claude plugin install skillboard@skillboard
```

Then start a new session, in Desktop or in a terminal, and type `/skillboard`. A session that was already open does not pick up a newly installed plugin, even after `/reload-plugins`.

The repository is private: you must be a collaborator on GitHub, with GitHub access set up on your computer (for example `gh auth login`).

You can also paste this to Claude Code and let it install skillboard for you:

> Install skillboard by following https://github.com/wide3751/skillboard/blob/main/README.md

## Usage

| Command | Description |
|---|---|
| `/skillboard` | Open or close the Skills Pane in this session |

**In the pane:**

- **Groups**: each Source is a button. Click it to open or close the group. The version and the number of skills sit on the right.
- **Skills**: each skill shows its name and, under it, the first sentence of its description (or of its translation, when there is one). Click a skill to expand its full description and its buttons.
- **Fill**: puts `/skill-name` at the start of the prompt box. Text you already typed stays after it, as the skill's arguments. If the prompt box can't be filled, the command is copied to the clipboard instead.
- **Translate**: Claude Haiku translates the description into the interface language and saves it to your Translation File. **Original** switches back to the source text. A translation whose source text has changed is marked **Outdated**.
- **Translate this group (N)**: the first row of an open group. It translates the N skills in the group that have no translation or an outdated one, up to 3 at a time, and shows each one as it arrives.
- **Hide skill**: removes the skill from the catalog, from search and from Jev requests, across sessions. **Show hidden (N)** at the bottom of the catalog shows hidden skills again, dimmed, with **Unhide**.
- **Recommended**: click a suggestion to open its group and expand it in the catalog. **Re-suggest** asks Jev again with your current prompt.
- **Narrow terminals**: when the pane sits above the prompt box, it shows one line per suggestion, the search box and **All**. **All** shows the catalog in a window of about 6 rows that you scroll with ▲ and ▼.

**Keyboard in a terminal** (for when your terminal doesn't report mouse clicks):

| Key | Action |
|---|---|
| `ctrl+x tab` | Move from the prompt into the pane |
| `tab` / `shift+tab` | Move between buttons and the search box |
| `enter` | Press the selected button |
| `esc` | Go back to the prompt, leaving the pane open |
| `ctrl+x x` | Close the pane |

## Settings

Run `/plugin configure skillboard@skillboard`. All four options have defaults, so you can skip this until you want recommendations.

| Option | Default | Description |
|---|---|---|
| `jevApiKey` | empty | Your TypeSafe Jev API key, kept in secure storage. Empty turns recommendations off |
| `threshold` | `0.1` | The lowest probability a suggestion needs to be shown. If none reaches it, the pane says no skill stands out |
| `autoRecommend` | on | Ask Jev after every prompt. Off: only when you press **Re-suggest** |
| `language` | `auto` | Interface language: English, 繁體中文, 日本語, 简体中文. `auto` checks Claude Code's `language` setting, `LC_ALL`, `LANG`, then the macOS preferred language, and falls back to English. You can also switch it in the pane |

## Supported environments

| Where `claude` runs | Pane | Tested |
|---|---|---|
| Claude Desktop Code tab | Docked on the right, as a tab beside other panes | ✓ |
| Terminal, full screen and at least 110 columns wide | Docked beside the chat | ✓ |
| Narrower terminal | Above the prompt box, compact | ✓ |
| VS Code, mobile | Drawn, without layout work; mobile has no search box | Not yet |

## Privacy and security

**What it reads**

- The skill list of the current session, and each skill's `SKILL.md` on disk for its description
- `~/.claude/plugins/installed_plugins.json` and your `enabledPlugins` setting, for plugin versions
- Your prompt box, only when you press **Fill**

**What it sends**

- To **TypeSafe Jev**, only when a Jev API key is set: the text of the prompt you sent (cut at 4,000 characters) and the name and description of each visible skill. Never file contents or the conversation history. Slash commands, hidden prompts, background task notifications and messages from other sessions are not sent
- To **Claude Haiku**, only when you press a translate button: that skill's description. This uses your Claude usage

**What it writes**

- `~/.claude/skillboard/translations/<language>.md`: one Markdown file per language. You can edit it by hand, and the pane shows your edits
- The list of hidden skills and your language choice, in Claude Code's plugin storage

**Commands it runs**

- `defaults read -g AppleLanguages`, on macOS only, to find your preferred language when `language` is `auto`

## Requirements

- Claude Code with mod support, in the Claude Desktop Code tab or `claude` in a terminal. Tested with Claude Code v2.1.301 and Claude Desktop
- Optional: a [TypeSafe](https://docs.typesafe.ai/introduction) Jev API key, for recommendations

## Update, disable or uninstall

**Update**:

```bash
claude plugin marketplace update skillboard
claude plugin update skillboard@skillboard
```

**Disable for now** (stays installed; turn it back on with `enable`):

```bash
claude plugin disable skillboard@skillboard
```

**Remove completely**:

```bash
claude plugin uninstall skillboard@skillboard
claude plugin marketplace remove skillboard
rm -rf ~/.claude/skillboard
```

The last line deletes your Translation Files, which stay behind when the plugin is removed. After updating, disabling or removing, start a new session for it to take effect.

## Limitations

- **No recommendations without Jev**: there is no keyword fallback. Without an API key, the pane is a catalog.
- **Panes share one dock as tabs**: when another mod's pane is open, such as switchboard, the two are tabs and only one shows at a time.
- **No right-click**: hiding a skill is a button in its expanded view.
- **Language detection on Desktop**: the macOS preferred language is read with a command that may not run in a Desktop session. If the pane comes up in English, set `language` or switch it in the pane.
- **Translations cost Claude usage**: translating a large group means one Haiku call per skill.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `/skillboard` is not found | The session was open before you installed, or `/reload-plugins` unloaded a mod loaded with hot reload. Start a new session |
| The Skills tab says `skillboard has not drawn in this pane` | The mod is no longer loaded in this session. Close the tab and start a new session |
| A plugin shows fewer skills than it ships | Disabled plugins are not listed. Check `enabledPlugins` in your settings |
| No Recommended section | Set `jevApiKey` with `/plugin configure skillboard@skillboard` |
| `Jev rejected the API key` or `Jev quota used up` | Check your key and quota in the TypeSafe console |
| The pane is in English | Set `language`, or pick a language in the pane |

## Contributing

Issues and pull requests are welcome. Before changing behavior, read [GLOSSARY.md](GLOSSARY.md) for the terminology and the decisions in [docs/adr/](docs/adr/) (both in Chinese). When you add or change UI text, update all four languages in [hooks/i18n.ts](hooks/i18n.ts).

Develop and test from this folder:

```bash
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
