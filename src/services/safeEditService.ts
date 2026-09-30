import * as vscode from "vscode";
import { resolveInWorkspace, toWorkspaceRelative } from "../core/pathUtils";
import { diffStats } from "../core/diff";
import {
  Snapshot,
  FileSnapshot,
  createSnapshot,
  planRevert,
} from "../core/snapshot";

const HISTORY_DIR = ".unbound/history";

/** A proposed change to a single file, awaiting user accept/reject. */
export interface ProposedEdit {
  relPath: string;
  before: string | null;
  after: string;
  added: number;
  removed: number;
}

/**
 * SafeEditService guarantees edits are never applied directly. Every change is
 * staged as a ProposedEdit, previewed via VS Code diff, and only committed
 * through a WorkspaceEdit after the user accepts. Applied change sets are
 * snapshotted to `.unbound/history` for revert.
 */
export class SafeEditService {
  private staged = new Map<string, ProposedEdit>();

  constructor(private readonly root: vscode.Uri) {}

  private abs(rel: string): vscode.Uri {
    const p = resolveInWorkspace(this.root.fsPath, rel);
    return vscode.Uri.file(p);
  }

  private async readFileIfExists(uri: vscode.Uri): Promise<string | null> {
    try {
      const buf = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(buf).toString("utf8");
    } catch {
      return null;
    }
  }

  /** Stage a proposed edit (create or modify). Does NOT write to disk. */
  async stageEdit(relPath: string, after: string): Promise<ProposedEdit> {
    const uri = this.abs(relPath);
    const before = await this.readFileIfExists(uri);
    const stats = diffStats(before ?? "", after);
    const edit: ProposedEdit = {
      relPath: toWorkspaceRelative(this.root.fsPath, relPath),
      before,
      after,
      added: stats.added,
      removed: stats.removed,
    };
    this.staged.set(edit.relPath, edit);
    return edit;
  }

  listStaged(): ProposedEdit[] {
    return [...this.staged.values()];
  }

  rejectEdit(relPath: string): void {
    this.staged.delete(toWorkspaceRelative(this.root.fsPath, relPath));
  }

  rejectAll(): void {
    this.staged.clear();
  }

  /** Open a native VS Code diff view for a staged edit. */
  async showDiff(relPath: string): Promise<void> {
    const rel = toWorkspaceRelative(this.root.fsPath, relPath);
    const edit = this.staged.get(rel);
    if (!edit) return;
    const original = await this.virtualDoc(edit.before ?? "");
    const modified = await this.virtualDoc(edit.after);
    await vscode.commands.executeCommand(
      "vscode.diff",
      original,
      modified,
      `INAI: ${rel} (proposed)`,
    );
  }

  private async virtualDoc(content: string): Promise<vscode.Uri> {
    const doc = await vscode.workspace.openTextDocument({ content });
    return doc.uri;
  }

  /**
   * Accept a single staged edit: apply via WorkspaceEdit and record snapshot
   * entry. Returns the FileSnapshot captured for the change.
   */
  async acceptEdit(relPath: string): Promise<FileSnapshot | undefined> {
    const rel = toWorkspaceRelative(this.root.fsPath, relPath);
    const edit = this.staged.get(rel);
    if (!edit) return undefined;
    const snap = await this.applyEdits([edit], `Edit ${rel}`);
    this.staged.delete(rel);
    return snap.files[0];
  }

  /** Accept all staged edits atomically and snapshot them. */
  async acceptAll(label = "Apply all edits"): Promise<Snapshot | undefined> {
    const edits = this.listStaged();
    if (edits.length === 0) return undefined;
    const snap = await this.applyEdits(edits, label);
    this.staged.clear();
    return snap;
  }

  /** Apply edits with a single WorkspaceEdit and persist a snapshot. */
  private async applyEdits(
    edits: ProposedEdit[],
    label: string,
  ): Promise<Snapshot> {
    const files: FileSnapshot[] = edits.map((e) => ({
      path: e.relPath,
      before: e.before,
    }));
    const snapshot = createSnapshot(label, files);

    const wsEdit = new vscode.WorkspaceEdit();
    for (const e of edits) {
      const uri = this.abs(e.relPath);
      if (e.before === null) {
        wsEdit.createFile(uri, {
          overwrite: false,
          ignoreIfExists: true,
          contents: Buffer.from(e.after, "utf8"),
        });
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        wsEdit.replace(uri, fullRange, e.after);
      }
    }
    const ok = await vscode.workspace.applyEdit(wsEdit);
    if (!ok) throw new Error("WorkspaceEdit failed to apply");

    // Save modified files.
    for (const e of edits) {
      if (e.before !== null) {
        const doc = await vscode.workspace.openTextDocument(this.abs(e.relPath));
        await doc.save();
      }
    }

    await this.persistSnapshot(snapshot);
    return snapshot;
  }

  private historyDir(): vscode.Uri {
    return vscode.Uri.joinPath(this.root, ".unbound", "history");
  }

  private async persistSnapshot(snapshot: Snapshot): Promise<void> {
    const dir = this.historyDir();
    await vscode.workspace.fs.createDirectory(dir);
    const file = vscode.Uri.joinPath(dir, `${snapshot.id}.json`);
    await vscode.workspace.fs.writeFile(
      file,
      Buffer.from(JSON.stringify(snapshot, null, 2), "utf8"),
    );
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const dir = this.historyDir();
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      const snaps: Snapshot[] = [];
      for (const [name, type] of entries) {
        if (type === vscode.FileType.File && name.endsWith(".json")) {
          const buf = await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(dir, name),
          );
          snaps.push(JSON.parse(Buffer.from(buf).toString("utf8")) as Snapshot);
        }
      }
      return snaps.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  /** Revert the workspace to the state captured by a snapshot. */
  async revert(snapshotId: string): Promise<void> {
    const snaps = await this.listSnapshots();
    const snap = snaps.find((s) => s.id === snapshotId);
    if (!snap) throw new Error(`Snapshot not found: ${snapshotId}`);
    const actions = planRevert(snap);
    const wsEdit = new vscode.WorkspaceEdit();
    for (const a of actions) {
      const uri = this.abs(a.path);
      if (a.content === null) {
        // File did not exist before -> delete it (with confirmation upstream).
        wsEdit.deleteFile(uri, { ignoreIfNotExists: true });
      } else {
        const exists = (await this.readFileIfExists(uri)) !== null;
        if (exists) {
          const doc = await vscode.workspace.openTextDocument(uri);
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
          );
          wsEdit.replace(uri, fullRange, a.content);
        } else {
          wsEdit.createFile(uri, {
            overwrite: true,
            contents: Buffer.from(a.content, "utf8"),
          });
        }
      }
    }
    const ok = await vscode.workspace.applyEdit(wsEdit);
    if (!ok) throw new Error("Revert WorkspaceEdit failed");
  }

  /** Delete a file, requiring explicit confirmation from the caller/UI. */
  async deleteFile(relPath: string, confirmed: boolean): Promise<void> {
    if (!confirmed) {
      throw new Error("File deletion requires explicit confirmation");
    }
    const uri = this.abs(relPath);
    const before = await this.readFileIfExists(uri);
    const snapshot = createSnapshot(`Delete ${relPath}`, [
      { path: toWorkspaceRelative(this.root.fsPath, relPath), before },
    ]);
    await this.persistSnapshot(snapshot);
    await vscode.workspace.fs.delete(uri, { useTrash: true });
  }

  static historyDirName(): string {
    return HISTORY_DIR;
  }
}
