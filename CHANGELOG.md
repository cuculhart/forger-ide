# Changelog

All notable changes to Forger are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
