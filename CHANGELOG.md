# Changelog

All notable changes to Forger are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
