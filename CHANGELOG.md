# Changelog

All notable changes to Forger are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.2] - 2026-09-25

### Added

- Chat history controls: clear the current project's conversation from the
  Chat header, or delete saved conversations for every project from
  Settings. Both destructive actions require confirmation; clearing all
  histories also immediately resets the open Chat panel.

### Fixed

- Clearing all chat history no longer uses Electron's synchronous native
  confirmation dialog, which left Settings controls unresponsive after it
  closed. Destructive chat clears now use inline Confirm/Cancel controls.
- Editor undo/redo (Edit menu and Ctrl+Z/Ctrl+Shift+Z) did nothing: when
  the menu opened the editor lost text focus, so the handler fell back to
  the native (DOM) undo, which cannot reach Monaco's undo stack. The
  handler now calls `model.undo()/redo()` on the open file's model unless
  focus is in another editable element.
- AI file writes that wrapped the whole file in a markdown code fence
  ("```md ... ```") are unwrapped before writing - the fence was being
  saved literally, breaking markdown preview.
- WRITE_FILE blocks where a small model used the closing "```" of a
  wrapped body as the terminator (instead of "// END_WRITE_FILE") are now
  salvaged instead of looping on "incomplete block" retries.
- File-path arguments like "README.md (assuming you meant ...)" - prose
  parentheses appended by small models - are cleaned before use, so they
  no longer produce ENOENT reads of garbage filenames.
- Command-like lines inside WRITE_FILE/EDIT_FILE bodies (e.g. a README's
  own "// RUN_COMMAND:" example) are file content, not commands - they no
  longer execute or trip the malformed/unknown-command checks.
- The "code shown but not written" retry now fires for any response that
  contains a code fence (previously only when the whole reply was one
  fence) - models dodged the check by adding prose around the snippet.
- Explorer empty state: the Recent Projects list items inherited the
  accent-background button style, making them unreadable (dark text on
  teal, worst in Quiet Light). The rule now targets only the direct
  Open/New Project buttons.

### Changed

- Each open file now gets its own Monaco model (`path` + `keepCurrentModel`),
  so undo history and cursor position survive markdown preview toggles
  and file switches instead of being reset.
- Privacy: the LLM no longer sees absolute paths. Project context
  (file tree, selected/full-file contents) and command feedback
  (READ_FILE/LIST_FILES/WRITE_FILE/EDIT_FILE results, RUN_COMMAND output)
  use project-relative paths - previously `C:\Users\<name>\...` leaked
  the OS user name to cloud providers.
- The system prompt now names the host OS's browser opener directly
  (`// RUN_COMMAND: xdg-open <target>` on Linux, `start`/`open`
  elsewhere) instead of showing a three-OS table - small models were
  listing the manual steps for every OS instead of emitting the command.

## [0.3.1] - 2026-09-25

### Added

- Right-click context menu (undo/redo/cut/copy/paste/select-all in
  editable fields, copy/select-all on selected text) - Electron ships no
  built-in one, so chat text could not be copied on Linux/Windows.
- README: `git clone` and Node.js v22 install via `n`/`nvm` documented in
  Getting Started (English and Japanese).

### Fixed

- Settings: the Save/Clear buttons only apply to Gemini settings and are
  now hidden when the provider is Ollama - everything Ollama-side applies
  on change, so they blocked saving for no reason.
- "Clear API Key" no longer wipes unrelated settings (theme, provider,
  Ollama endpoint/model) - it deleted the entire in-memory config.
- `// END_READ_FILE`-style invented terminators no longer trigger the
  "unknown command" retry; only invented openers do.
- Two more small-model misfires now trigger a corrective retry instead of
  ending the turn: a file-creation request answered with only a markdown
  code fence (never written to disk), and the model parroting the app's
  own "Command execution results:" wrapper as its reply.

## [0.3.0] - 2026-09-24

### Added

- Cross-platform "open in browser": the agent prompt now documents the
  per-OS opener (`start` / `open` / `xdg-open`), and `RUN_COMMAND`
  intercepts all three plus `cmd /c start`, routing them through Electron's
  `shell.openPath` / `shell.openExternal` on every platform.
- Application icon (`assets/icon.ico` multi-size, `assets/icon.png`,
  transparent background): applied to the packaged exe, the Squirrel
  installer (`setupIcon`), the Add/Remove Programs entry (`iconUrl`), the
  Linux window/deb icon, and the About dialog.
- "Quiet Light" theme: a muted warm-paper light theme for users who find
  pure white backgrounds glaring. Covers the full UI (CSS variables),
  Monaco (`forger-quiet` editor theme), and the terminal, selectable via
  Settings > Theme.

### Changed

- About dialog: the tagline is now the brand slogan "Standalone,
  Privacy-First AI IDE", the app icon is shown, and the app name uses the
  brand gold (`#f1af10`; darker amber on light themes).
- Agent prompt: explicitly requires emitting `// WRITE_FILE:` when asked
  to create a file (never a bare markdown code fence), using the exact
  file name the user asked for (no renames, extension changes, or
  subdirectory moves), the correct block terminator, and only
  opening/running files that already exist. Fixes small local models (e.g. qwen2.5-coder:1.5b) rewriting
  "index.html" into "routes/TestIndex.tsx" and opening files before
  creating them.
- Small Ollama models (<3B params, detected from the model tag) now use a
  compact system prompt (command protocol only, no app-context text) and
  only the last 8 history turns - long prompts and polluted history
  degrade instruction-following at that size.
- When no project is open, the model is told that file-operation and
  shell commands are unavailable and to ask the user to open a project
  first (both Ollama and Gemini), instead of receiving commands that all
  fail and hallucinating fake files and results on retry.

### Fixed

- A successful "open in browser" (`start`/`open`/`xdg-open`) no longer
  continues the agent loop: it produces no terminal output, and feeding
  "(no output)" back made small models read it as a failure - retrying,
  guessing the wrong OS, and fabricating results. The turn now ends with
  a success note and closing summary. The host OS is also stated in the
  system prompt so models stop emitting Linux commands on Windows.
- Invented commands (e.g. "// CREATE_INDEX.HTML") are detected and
  reported back to the model with the list of valid commands so it can
  retry, instead of being shown as raw text that ends the turn.
- `start`/`open`/`xdg-open` no longer chokes on trailing prose: the
  prompt example itself showed "(or start http://localhost:3000)" inside
  the command, which small models copy verbatim. The example was fixed
  and unquoted trailing parenthetical text is stripped from the target.
- Writes into a subdirectory the user never asked for are rejected before
  touching the disk: when the request names a bare file (e.g.
  "index.html") but the model targets "views/index.html", the write is
  refused and the model is told to emit it at the project root instead.
- Malformed file-command blocks are handled more gracefully: commands
  without a colon (`// READ_FILE file.js`) and blocks closed with another
  language's comment marker (`# END_WRITE_FILE`) now parse correctly; a
  `// WRITE_FILE` / `// EDIT_FILE` opener that still cannot be parsed is
  reported back to the model (naming the correct terminator) so it can
  re-emit a complete block, and the chat shows a retry note instead of
  raw command text.

## [0.2.0] - 2026-09-23

### Fixed

- `RUN_COMMAND start <target>` (open in browser) now launches the app
  reliably: `start` inside a transient ConPTY `cmd` could exit before the
  browser appeared. File/URL targets are opened via Electron's
  `shell.openPath` / `shell.openExternal` instead, confined to the project
  root for files.
- Small local models no longer imitate "▶️ Ran: ..." execution notes: chat
  history sent to the model now uses the raw response, so display notes
  (including notes saved in older chats) can no longer leak into the context
  and be parroted back as fake results.
- Switching provider/model in Settings mid-generation no longer retargets
  the in-flight request: the provider and model are pinned when Send is
  pressed, so every agent-loop step (and the model label) of one turn always
  uses the model that was selected at send time.

### Added

- Response time display: each assistant message now shows the LLM call's
  round-trip time (e.g. `(6.1s)`). In multi-step agent runs each turn shows
  its own turnaround, which makes comparing local model speeds easy.
- Streaming responses for the Ollama provider: replies appear token-by-token
  like AnythingLLM/Ollama CLI, so slow local models feel alive instead of
  sitting on "Generating response..." for a minute. Cancelling now actually
  aborts the in-flight HTTP request. (Gemini path unchanged.)
- Per-message model label: assistant messages show the model that produced
  them (e.g. `assistant (ollama:qwen3.5:4b)`), so switching models mid-chat
  stays verifiable.

## [0.1.1] - 2026-09-23

### Fixed

- AI agent now knows how to open files/URLs in the user's browser: the system
  prompt explains that `// RUN_COMMAND: start <target>` opens the default
  browser on Windows. Previously, small local models (e.g. `gemma4:e4b`) did not
  emit a command when asked to "open it in my browser".

## [0.1.0] - 2026-09-22

Initial public release.

### Added

- Standalone Electron AI editor: file explorer, Monaco editor, Git, real TTY
  terminal, and AI chat in a single window
- Agent loop with approval dialogs: WRITE_FILE / EDIT_FILE (diff edits) /
  READ_FILE / LIST_FILES / GREP / FIND_FILES / RUN_COMMAND
- Checkpoint & rollback for AI-touched files
- Gemini API (BYOK) and Ollama (fully offline) providers; LiteLLM proxy support
- File-tree-only context mode for token efficiency
- English/Japanese UI via `lang/<code>.json` localization
- Windows packaging (portable exe / Squirrel installer)
