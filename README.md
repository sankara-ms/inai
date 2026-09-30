# INAI

INAI — Free, local-first AI coding assistant for VS Code.

A provider-agnostic AI coding assistant for VS Code. Local-first by default
(Ollama), with bring-your-own-key support for Gemini, Groq, and OpenRouter.
Edits are always staged for review and never applied directly, agent actions
are safety-classified, and everything works against your local workspace.

## Features

- **Provider-agnostic core** — unified `streamChat` / `listModels` interface.
  - Default: **Ollama** at `http://localhost:11434` with `num_ctx` = `16384`.
  - **BYOK**: Gemini, Groq, OpenRouter. Keys stored in VS Code SecretStorage.
  - **429 fallback** — automatically retries on a configured fallback provider.
- **Sidebar chat** with streaming responses and a **Stop** button.
- **Three modes**: **Ask** (Q&A), **Edit** (staged file edits), **Agent** (tools).
- **Model picker** in the toolbar and status bar.
- **Context**:
  - `Ctrl+L` (`Cmd+L`) adds the current selection.
  - `@ Context` multi-picker to add many files at once.
  - Right-click a file/folder in Explorer → *Add to Context*.
  - Inline `@file` / `@folder` references in your message.
  - Context is chunked and ranked for relevance, honoring `.gitignore` and
    `.unboundignore`.
- **Safe edits**:
  - Never written directly. Every change is staged and previewed with a native
    VS Code **diff view**.
  - **Per-file** and **Accept All / Reject All** controls.
  - Applied via `WorkspaceEdit`.
  - **Snapshots** saved to `.unbound/history`; revert any snapshot.
  - Workspace **path validation** (no escaping the workspace) and **deletion
    confirmation**.
- **Agent tools**: `read_file`, `search`, `edit_file`, `create_file`,
  `run_terminal`, `run_tests` — each classified **SAFE / REVIEW / DANGEROUS**
  with matching controls (dangerous terminal commands are never auto-run).
- **Persistence** — chat sessions stored in `workspaceState`.
- **Status bar** shows the active provider/model and generation state.

## Requirements

- VS Code `^1.85`.
- For local use: [Ollama](https://ollama.com) running with at least one model
  pulled (e.g. `ollama pull llama3.1`).

## Setup

1. Install the extension (or run from source — see CONTRIBUTING).
2. Local (default): start Ollama, then open the **INAI** sidebar.
3. Cloud providers: run **INAI: Set Provider API Key**, choose the
   provider, and paste your key. Then set `inai.provider` accordingly.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `inai.provider` | `ollama` | Active provider. |
| `inai.ollama.baseUrl` | `http://localhost:11434` | Ollama server URL. |
| `inai.ollama.numCtx` | `16384` | Context window (`num_ctx`). |
| `inai.model` | `""` | Selected model id (empty = first available). |
| `inai.fallbackProvider` | `""` | Provider to use on HTTP 429. |
| `inai.temperature` | `0.2` | Sampling temperature. |
| `inai.respectGitignore` | `true` | Honor `.gitignore` / `.unboundignore`. |

> **Backwards compatibility:** settings previously stored under the legacy
> `unboundAI.*` namespace are still honored as a fallback if the corresponding
> `inai.*` setting is not set. Stored API keys, cloud tokens, and chat sessions
> are migrated automatically on first activation. The legacy `.unboundignore`
> file and `.unbound/history` snapshot directory are unchanged.

## Optional Cloud Sync (scaffolding)

Cloud sync (Google OAuth + Supabase) is **optional and not enabled by
default**. The extension ships typed scaffolding in `src/cloud/cloudSync.ts`
that is inert unless you both enable it and provide credentials. There is **no
bundled backend** — you must supply your own Supabase project and Google OAuth
client. See the file header and `docs/IMPLEMENTATION_PLAN.md` for the exact
integration points. Until wired, the feature clearly reports that it is not
configured rather than pretending to authenticate.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest
npm run build       # esbuild bundle
npm run package     # produce a .vsix
```

Press `F5` in VS Code to launch an Extension Development Host.

## Publishing (manual)

The release workflow packages a VSIX and can publish to Open VSX / the VS Code
Marketplace when the appropriate tokens are present. To publish manually,
replace the placeholder tokens below with your own — no publishing happens
automatically.

Package a VSIX locally:

```bash
npm run package        # produces inai-0.1.1.vsix
```

GitHub Release (attach the VSIX to a tagged release):

```bash
# Create a tag and push it, then attach the VSIX to the GitHub Release.
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 inai-0.1.1.vsix --repo sankara-ms/inai
```

Open VSX:

```bash
# Requires an Open VSX account + namespace.
npx ovsx publish inai-0.1.1.vsix -p "<OVSX_TOKEN>"
```

VS Code Marketplace:

```bash
# Requires an Azure DevOps publisher + Personal Access Token.
npx @vscode/vsce publish --packagePath inai-0.1.1.vsix -p "<VSCE_TOKEN>"
```

Do not commit real tokens. Keep them in CI secrets or your local environment.

## License

MIT — see [LICENSE](LICENSE).
