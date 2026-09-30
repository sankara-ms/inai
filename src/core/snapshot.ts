/**
 * Snapshot model. A snapshot captures the pre-edit contents of files so an
 * applied change set can be fully reverted. The pure logic here (create /
 * revert plan) is testable without the filesystem; SafeEditService persists
 * snapshots to `.unbound/history`.
 */

export interface FileSnapshot {
  /** Workspace-relative path. */
  path: string;
  /** Contents before the edit; null means the file did not exist. */
  before: string | null;
}

export interface Snapshot {
  id: string;
  label: string;
  timestamp: number;
  files: FileSnapshot[];
}

export interface RevertAction {
  path: string;
  /** New content to write, or null to delete the file. */
  content: string | null;
}

export function createSnapshot(
  label: string,
  files: FileSnapshot[],
  now: number = Date.now(),
): Snapshot {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    timestamp: now,
    files,
  };
}

/**
 * Build the set of write/delete actions needed to restore the workspace to a
 * snapshot's captured state.
 */
export function planRevert(snapshot: Snapshot): RevertAction[] {
  return snapshot.files.map((f) => ({
    path: f.path,
    content: f.before, // null -> delete (file didn't exist before)
  }));
}
