import * as vscode from "vscode";
import { IgnoreMatcher } from "../core/ignoreMatcher";
import {
  chunkText,
  rankChunks,
  shouldIncludeFile,
  RankedChunk,
} from "../core/contextEngine";
import { toWorkspaceRelative } from "../core/pathUtils";
import { getConfigValue } from "./config";

export interface ContextItem {
  /** Workspace-relative path (file) or folder path with trailing marker. */
  label: string;
  relPath: string;
  kind: "file" | "folder" | "selection";
  content?: string;
}

/**
 * Gathers workspace context for prompts. Loads .gitignore and .unboundignore,
 * resolves @file / @folder references, and ranks chunks for a query.
 */
export class ContextService {
  constructor(private readonly root: vscode.Uri) {}

  private async readText(uri: vscode.Uri): Promise<string | null> {
    try {
      const buf = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(buf).toString("utf8");
    } catch {
      return null;
    }
  }

  async buildMatcher(): Promise<IgnoreMatcher> {
    const respect = getConfigValue<boolean>("respectGitignore", true);
    const matcher = new IgnoreMatcher();
    if (!respect) return matcher;
    for (const name of [".gitignore", ".unboundignore"]) {
      const text = await this.readText(vscode.Uri.joinPath(this.root, name));
      if (text) {
        for (const line of text.split(/\r?\n/)) matcher.add(line);
      }
    }
    return matcher;
  }

  /** Read a single file into a ContextItem. */
  async fileItem(uri: vscode.Uri): Promise<ContextItem | null> {
    const content = await this.readText(uri);
    if (content === null) return null;
    const rel = toWorkspaceRelative(this.root.fsPath, uri.fsPath);
    return { label: `@${rel}`, relPath: rel, kind: "file", content };
  }

  /** Recursively collect files under a folder, respecting ignores. */
  async folderItems(
    folder: vscode.Uri,
    matcher: IgnoreMatcher,
    limit = 50,
  ): Promise<ContextItem[]> {
    const items: ContextItem[] = [];
    const walk = async (dir: vscode.Uri): Promise<void> => {
      if (items.length >= limit) return;
      let entries: [string, vscode.FileType][];
      try {
        entries = await vscode.workspace.fs.readDirectory(dir);
      } catch {
        return;
      }
      for (const [name, type] of entries) {
        if (items.length >= limit) return;
        const child = vscode.Uri.joinPath(dir, name);
        const rel = toWorkspaceRelative(this.root.fsPath, child.fsPath);
        if (!shouldIncludeFile(rel, matcher)) continue;
        if (type === vscode.FileType.Directory) {
          await walk(child);
        } else if (type === vscode.FileType.File) {
          const content = await this.readText(child);
          if (content !== null) {
            items.push({ label: `@${rel}`, relPath: rel, kind: "file", content });
          }
        }
      }
    };
    await walk(folder);
    return items;
  }

  /** List candidate files for the @-picker. */
  async listWorkspaceFiles(limit = 500): Promise<string[]> {
    const matcher = await this.buildMatcher();
    const found = await vscode.workspace.findFiles("**/*", undefined, limit * 2);
    const out: string[] = [];
    for (const uri of found) {
      const rel = toWorkspaceRelative(this.root.fsPath, uri.fsPath);
      if (shouldIncludeFile(rel, matcher)) out.push(rel);
      if (out.length >= limit) break;
    }
    return out.sort();
  }

  /** Rank chunks of the provided context items against a query. */
  rankForQuery(query: string, items: ContextItem[], k = 12): RankedChunk[] {
    const chunks = items
      .filter((i) => i.content)
      .flatMap((i) => chunkText(i.relPath, i.content as string));
    return rankChunks(query, chunks, k);
  }
}
