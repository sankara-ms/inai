# Contributing to INAI

Thanks for your interest in improving INAI!

## Development setup

```bash
git clone https://github.com/sankara-ms/inai.git
cd inai
npm install
```

Common scripts:

- `npm run typecheck` — strict TypeScript type checking (`tsc --noEmit`).
- `npm test` — run the vitest suite.
- `npm run build` — bundle the extension with esbuild.
- `npm run watch` — rebuild on change.
- `npm run lint` — ESLint.
- `npm run package` — build a `.vsix`.

Launch the Extension Development Host with `F5`.

## Project layout

See `docs/IMPLEMENTATION_PLAN.md` for the full folder structure and phased
plan.

## Guidelines

- Keep the **provider abstraction** clean: new providers implement the
  `Provider` interface in `src/types.ts`.
- **Never** apply file edits directly. Route everything through
  `SafeEditService` so changes are staged, diffed, and snapshotted.
- Any command execution must go through the **command classifier**; do not
  bypass SAFE/REVIEW/DANGEROUS gating.
- Add or update tests under `src/**/**.test.ts` for pure logic (context
  engine, path utils, classifier, diff, snapshots).
- Run `npm run typecheck` and `npm test` before opening a PR.

## Commit / PR

- Keep PRs focused and describe what was tested.
- Do not commit secrets. API keys belong in SecretStorage at runtime.
