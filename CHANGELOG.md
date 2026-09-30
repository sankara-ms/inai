# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-30

### Added

- Provider-agnostic core with `streamChat` / `listModels`:
  - Ollama (default, `localhost:11434`, `num_ctx` 16384).
  - BYOK Gemini, Groq, OpenRouter via SecretStorage.
  - Automatic HTTP 429 fallback to a configured provider.
- Sidebar streaming chat with Stop button and Ask / Edit / Agent modes.
- Model picker (toolbar + status bar).
- Context system: `Ctrl+L` selection, `@`-multi-picker, Explorer context menu,
  inline `@file` / `@folder` references, chunking + ranking that respects
  `.gitignore` and `.unboundignore`.
- Safe edits: staged proposals, native diff views, per-file and all
  accept/reject, `WorkspaceEdit` application, `.unbound/history` snapshots and
  revert, workspace path validation, and deletion confirmation.
- Agent tools (`read_file`, `search`, `edit_file`, `create_file`,
  `run_terminal`, `run_tests`) with SAFE / REVIEW / DANGEROUS classification.
- Session persistence via `workspaceState`.
- Status bar indicator.
- Optional (inert) Google OAuth / Supabase cloud sync scaffolding.
- Unit tests for context engine, path validation, command classifier, diff,
  and snapshot/revert.
- CI and release workflows (VSIX + Open VSX + Marketplace).
