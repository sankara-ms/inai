import * as vscode from "vscode";

/**
 * Reads a configuration value from the `inai` namespace with a backwards
 * compatible fallback to the legacy `unboundAI` namespace.
 *
 * Precedence:
 * 1. If the `inai.<section>` value is explicitly set at any scope
 *    (user / workspace / workspace-folder), that value wins — VS Code already
 *    resolves the effective value across scopes.
 * 2. Otherwise, if a legacy `unboundAI.<section>` value is explicitly set,
 *    that value is used.
 * 3. Otherwise the provided default is returned.
 *
 * This preserves practical backwards compatibility for users whose
 * settings.json still uses the old `unboundAI.*` keys, without rewriting their
 * settings.
 */
export function getConfigValue<T>(
  section: string,
  defaultValue: T,
  scope?: vscode.ConfigurationScope,
): T {
  const modern = vscode.workspace.getConfiguration("inai", scope);
  const modernInspect = modern.inspect<T>(section);
  if (modernInspect && isExplicitlySet(modernInspect)) {
    return modern.get<T>(section, defaultValue);
  }

  const legacy = vscode.workspace.getConfiguration("unboundAI", scope);
  const legacyInspect = legacy.inspect<T>(section);
  if (legacyInspect && isExplicitlySet(legacyInspect)) {
    return legacy.get<T>(section, defaultValue);
  }

  // Neither namespace has an explicit value; use the modern default resolution.
  return modern.get<T>(section, defaultValue);
}

function isExplicitlySet<T>(
  inspect: {
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
  },
): boolean {
  return (
    inspect.globalValue !== undefined ||
    inspect.workspaceValue !== undefined ||
    inspect.workspaceFolderValue !== undefined
  );
}
