import * as path from "path";

/**
 * Path safety helpers. All file operations must be confined to the workspace
 * root. These functions are pure so they can be unit-tested without VS Code.
 */

/** Normalize a path for comparison (posix separators, no trailing slash). */
export function normalize(p: string): string {
  const n = path.normalize(p).replace(/\\/g, "/");
  return n.length > 1 && n.endsWith("/") ? n.slice(0, -1) : n;
}

/**
 * Returns true if `target` resolves to a location inside `root`.
 * Guards against `..` traversal and absolute escapes.
 */
export function isInsideWorkspace(root: string, target: string): boolean {
  const absRoot = normalize(path.resolve(root));
  const absTarget = normalize(path.resolve(root, target));
  if (absTarget === absRoot) return true;
  return absTarget.startsWith(absRoot + "/");
}

/**
 * Resolve a user/model-supplied path against the workspace root, throwing if
 * it would escape the workspace.
 */
export function resolveInWorkspace(root: string, target: string): string {
  if (!isInsideWorkspace(root, target)) {
    throw new PathEscapeError(target);
  }
  return path.resolve(root, target);
}

export class PathEscapeError extends Error {
  constructor(public readonly target: string) {
    super(`Path escapes the workspace: ${target}`);
    this.name = "PathEscapeError";
  }
}

/** Relative workspace path with posix separators, useful for display/ignore matching. */
export function toWorkspaceRelative(root: string, target: string): string {
  return normalize(path.relative(path.resolve(root), path.resolve(root, target)));
}
