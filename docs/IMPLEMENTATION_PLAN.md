# INAI — Implementation Plan

This document describes the folder structure, the phased build plan (phases
1–8), and the manual tests to run at the end of each phase.

## Folder structure

```
INAI/
├─ .github/
│  └─ workflows/
│     ├─ ci.yml                 # typecheck + test + build on push/PR
│     └─ release.yml            # package VSIX, publish Open VSX + Marketplace
├─ docs/
│  └─ IMPLEMENTATION_PLAN.md    # this file
├─ media/
│  ├─ icon.svg                  # activity bar / branding icon (supplied)
│  └─ icon.png                  # real 128x128 PNG (generated)
├─ scripts/
│  └─ generate-icon.js          # deterministic PNG generator (no deps)
├─ src/
│  ├─ extension.ts              # activation, commands, wiring
│  ├─ types.ts                  # Provider interface + shared types
│  ├─ providers/
│  │  ├─ providerManager.ts     # build providers, keys, 429 fallback
│  │  ├─ ollamaProvider.ts      # local default
│  │  ├─ openaiCompatProvider.ts# Groq + OpenRouter
│  │  └─ geminiProvider.ts      # Google Gemini
│  ├─ core/                     # pure, unit-tested logic
│  │  ├─ pathUtils.ts           # workspace path validation
│  │  ├─ ignoreMatcher.ts       # .gitignore/.unboundignore matching
│  │  ├─ contextEngine.ts       # chunk + rank
│  │  ├─ commandClassifier.ts   # SAFE/REVIEW/DANGEROUS
│  │  ├─ diff.ts                # line diff + stats
│  │  ├─ snapshot.ts            # snapshot + revert plan
│  │  └─ *.test.ts              # vitest suites
│  ├─ services/
│  │  ├─ contextService.ts      # VS Code context gathering
│  │  ├─ safeEditService.ts     # staged edits, diffs, WorkspaceEdit, snapshots
│  │  └─ sessionStore.ts        # workspaceState persistence
│  ├─ agent/
│  │  └─ tools.ts               # read/search/edit/create/terminal/tests
│  ├─ ui/
│  │  ├─ chatViewProvider.ts    # sidebar webview orchestration
│  │  └─ statusBar.ts           # status bar item
│  ├─ cloud/
│  │  └─ cloudSync.ts           # OPTIONAL, inert OAuth/Supabase scaffold
│  └─ webview/
│     └─ assets/
│        ├─ main.css            # plain CSS
│        └─ main.js             # plain JS webview controller
├─ package.json                 # manifest, scripts, contributions
├─ tsconfig.json                # strict TS
├─ esbuild.js                   # bundler + asset copy
├─ vitest.config.ts
├─ .eslintrc.cjs
├─ .vscodeignore
├─ README.md / LICENSE / CONTRIBUTING.md / CHANGELOG.md
```

## Phases

### Phase 1 — Scaffold & tooling
Manifest, tsconfig (strict), esbuild, vitest, eslint, ignore files, icon
assets.

**Manual tests**
- `npm install` succeeds.
- `npm run typecheck` passes.
- `npm run build` produces `dist/extension.js` and copies webview assets.
- `media/icon.png` opens as a 128×128 image.

### Phase 2 — Provider core
`types.ts` Provider interface; Ollama / Gemini / OpenAI-compatible providers;
`ProviderManager` with SecretStorage and 429 fallback.

**Manual tests**
- With Ollama running: **INAI: Pick Model** lists local models.
- Set a Gemini/Groq/OpenRouter key via **Set Provider API Key**; switch
  `inai.provider`; picker lists that provider's models.
- Configure `fallbackProvider`; simulate 429 and confirm fallback notice.

### Phase 3 — Sidebar chat + modes
Webview provider, HTML/CSS/JS, streaming, Stop, Ask/Edit/Agent selector, model
button, status bar.

**Manual tests**
- Open the sidebar; send a message; tokens stream in.
- **Stop** aborts an in-progress generation.
- Status bar shows `provider/model` and a spinner while generating.

### Phase 4 — Context system
`Ctrl+L` selection, `@` multi-picker, Explorer context menu, inline
`@file`/`@folder`, chunk/rank, `.gitignore`/`.unboundignore` respect.

**Manual tests**
- `Ctrl+L` adds the selection as a context chip.
- `@ Context` picker adds multiple files; chips are removable.
- Right-click a folder → *Add to Context* pulls its files (ignored files
  excluded).
- Type `@src/extension.ts` inline and confirm it is attached.

### Phase 5 — Safe edits
Staged edits, native diff, per-file + all accept/reject, `WorkspaceEdit`,
`.unbound/history` snapshots, revert, path validation, deletion confirmation.

**Manual tests**
- In Edit mode, ask for a change; a staged edit chip appears with `+/-` counts.
- **Diff** opens a side-by-side preview; nothing is written yet.
- **Accept** writes the file; a snapshot appears in `.unbound/history`.
- **Reject** discards the staged edit with no file change.
- **INAI: Revert to Snapshot** restores the prior state.
- A path like `../escape.ts` is refused.

### Phase 6 — Agent tools
`read/search/edit/create/terminal/tests` with SAFE/REVIEW/DANGEROUS gating.

**Manual tests**
- Agent mode: model emits `TOOL: read_file {"path":"README.md"}` and the
  result is shown.
- `search` returns matching lines.
- `edit_file` / `create_file` produce staged edits (never direct writes).
- `run_terminal` with `ls` runs (SAFE); `rm -rf` is refused (DANGEROUS);
  unknown commands require approval (REVIEW).

### Phase 7 — Persistence, status bar, packaging
`workspaceState` sessions, status bar polish, `.vscodeignore`, `vsce package`.

**Manual tests**
- Send messages, reload the window: history is restored.
- **New** starts a fresh session.
- `npm run package` produces a `.vsix`.

### Phase 8 — Optional cloud sync, docs, CI/release
Inert cloud scaffold; README/LICENSE/CONTRIBUTING/CHANGELOG; CI + release
workflows.

**Manual tests**
- With cloud disabled (default), sign-in reports "not configured".
- CI workflow runs typecheck + test + build.
- Release workflow (on tag) packages the VSIX and publishes to Open VSX /
  Marketplace when tokens are present.

## Verification commands

```bash
npm run typecheck
npm test
npm run build
npm run package   # requires @vscode/vsce (dev dependency)
```
