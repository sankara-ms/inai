import * as vscode from "vscode";

/**
 * Backwards-compatibility migration from the legacy `unboundAI.*` namespace to
 * the new `inai.*` namespace.
 *
 * Scope (focused, best-effort, non-destructive):
 * - SecretStorage BYOK provider API keys: `unboundAI.apiKey.<provider>` →
 *   `inai.apiKey.<provider>`.
 * - Optional cloud sync token: `unboundAI.cloud.token` → `inai.cloud.token`.
 * - workspaceState chat sessions + active session: `unboundAI.sessions` /
 *   `unboundAI.activeSession` → `inai.sessions` / `inai.activeSession`.
 *
 * Public *configuration* settings (`unboundAI.*` → `inai.*`) are handled with a
 * live read-time fallback in the code that reads them (see ProviderManager,
 * ContextService, CloudSync, StatusBar, ChatViewProvider) so that user /
 * workspace / workspace-folder settings continue to work without rewriting the
 * user's settings.json.
 *
 * Legacy values are left in place so that reverting to an older build keeps
 * working; the new keys simply take precedence once present.
 */

const LEGACY_SECRET_PREFIX = "unboundAI.apiKey.";
const NEW_SECRET_PREFIX = "inai.apiKey.";
const PROVIDERS = ["gemini", "groq", "openrouter"] as const;

const LEGACY_CLOUD_TOKEN = "unboundAI.cloud.token";
const NEW_CLOUD_TOKEN = "inai.cloud.token";

const LEGACY_SESSIONS = "unboundAI.sessions";
const NEW_SESSIONS = "inai.sessions";
const LEGACY_ACTIVE = "unboundAI.activeSession";
const NEW_ACTIVE = "inai.activeSession";

const MIGRATION_FLAG = "inai.migratedFromUnboundAI";

export async function migrateLegacyState(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    // Migrate secrets (API keys) if the new key is not already present.
    for (const p of PROVIDERS) {
      const existing = await context.secrets.get(NEW_SECRET_PREFIX + p);
      if (existing) continue;
      const legacy = await context.secrets.get(LEGACY_SECRET_PREFIX + p);
      if (legacy) {
        await context.secrets.store(NEW_SECRET_PREFIX + p, legacy);
      }
    }

    // Migrate optional cloud token.
    const newToken = await context.secrets.get(NEW_CLOUD_TOKEN);
    if (!newToken) {
      const legacyToken = await context.secrets.get(LEGACY_CLOUD_TOKEN);
      if (legacyToken) {
        await context.secrets.store(NEW_CLOUD_TOKEN, legacyToken);
      }
    }

    // Migrate workspaceState sessions + active session (do this once).
    const state = context.workspaceState;
    if (!state.get<boolean>(MIGRATION_FLAG, false)) {
      if (state.get(NEW_SESSIONS) === undefined) {
        const legacySessions = state.get(LEGACY_SESSIONS);
        if (legacySessions !== undefined) {
          await state.update(NEW_SESSIONS, legacySessions);
        }
      }
      if (state.get(NEW_ACTIVE) === undefined) {
        const legacyActive = state.get(LEGACY_ACTIVE);
        if (legacyActive !== undefined) {
          await state.update(NEW_ACTIVE, legacyActive);
        }
      }
      await state.update(MIGRATION_FLAG, true);
    }
  } catch {
    // Migration is best-effort; never block activation on failure.
  }
}
