import * as vscode from "vscode";
import { ToolSchema } from "../types";
import { SafeEditService } from "../services/safeEditService";
import { ContextService } from "../services/contextService";
import { classifyCommand, SafetyLevel } from "../core/commandClassifier";
import { resolveInWorkspace, toWorkspaceRelative } from "../core/pathUtils";

export interface ToolResult {
  ok: boolean;
  output: string;
  /** For edit/create tools, the staged edit awaits user accept/reject. */
  requiresApproval?: boolean;
  safety?: SafetyLevel;
}

/**
 * Agent tools: read, search, edit, create, terminal, tests.
 * Every mutating/executing tool is safety-classified. Edits are staged via
 * SafeEditService (never applied directly). Terminal commands are classified
 * and never auto-run at DANGEROUS level.
 */
export class AgentTools {
  constructor(
    private readonly root: vscode.Uri,
    private readonly edits: SafeEditService,
    private readonly context: ContextService,
  ) {}

  static schemas(): ToolSchema[] {
    return [
      {
        name: "read_file",
        description: "Read a workspace file's contents.",
        parameters: { path: { type: "string" } },
      },
      {
        name: "search",
        description: "Search workspace files for a text/regex pattern.",
        parameters: { query: { type: "string" } },
      },
      {
        name: "edit_file",
        description: "Propose an edit to an existing file (staged for review).",
        parameters: { path: { type: "string" }, content: { type: "string" } },
      },
      {
        name: "create_file",
        description: "Propose creating a new file (staged for review).",
        parameters: { path: { type: "string" }, content: { type: "string" } },
      },
      {
        name: "run_terminal",
        description: "Run a shell command (classified for safety).",
        parameters: { command: { type: "string" } },
      },
      {
        name: "run_tests",
        description: "Run the project's test suite.",
        parameters: {},
      },
    ];
  }

  async read_file(path: string): Promise<ToolResult> {
    try {
      const abs = resolveInWorkspace(this.root.fsPath, path);
      const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
      return { ok: true, output: Buffer.from(buf).toString("utf8"), safety: "SAFE" };
    } catch (e) {
      return { ok: false, output: String(e), safety: "SAFE" };
    }
  }

  async search(query: string): Promise<ToolResult> {
    const files = await this.context.listWorkspaceFiles();
    const matches: string[] = [];
    let re: RegExp;
    try {
      re = new RegExp(query, "i");
    } catch {
      re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    for (const rel of files) {
      try {
        const abs = resolveInWorkspace(this.root.fsPath, rel);
        const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
        const text = Buffer.from(buf).toString("utf8");
        const lines = text.split(/\r?\n/);
        lines.forEach((line, i) => {
          if (re.test(line)) matches.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      } catch {
        // skip unreadable
      }
      if (matches.length >= 100) break;
    }
    return { ok: true, output: matches.join("\n") || "(no matches)", safety: "SAFE" };
  }

  async edit_file(path: string, content: string): Promise<ToolResult> {
    const edit = await this.edits.stageEdit(path, content);
    if (edit.before === null) {
      return {
        ok: false,
        output: `File does not exist: ${path}. Use create_file.`,
        safety: "REVIEW",
      };
    }
    return {
      ok: true,
      output: `Staged edit for ${edit.relPath} (+${edit.added}/-${edit.removed}). Awaiting review.`,
      requiresApproval: true,
      safety: "REVIEW",
    };
  }

  async create_file(path: string, content: string): Promise<ToolResult> {
    const edit = await this.edits.stageEdit(path, content);
    return {
      ok: true,
      output: `Staged new file ${edit.relPath}. Awaiting review.`,
      requiresApproval: true,
      safety: "REVIEW",
    };
  }

  /**
   * Classify a terminal command. Actual execution is gated by the UI, which
   * must pass `approved=true` for REVIEW/DANGEROUS commands.
   */
  async run_terminal(command: string, approved: boolean): Promise<ToolResult> {
    const cls = classifyCommand(command);
    if (cls.level !== "SAFE" && !approved) {
      return {
        ok: false,
        output: `Command classified ${cls.level}: ${cls.reason}. Awaiting explicit approval.`,
        requiresApproval: true,
        safety: cls.level,
      };
    }
    if (cls.level === "DANGEROUS" && !approved) {
      return {
        ok: false,
        output: `Refused DANGEROUS command: ${cls.reason}.`,
        safety: "DANGEROUS",
      };
    }
    const terminal = vscode.window.createTerminal({
      name: "INAI",
      cwd: this.root.fsPath,
    });
    terminal.show();
    terminal.sendText(command, true);
    return {
      ok: true,
      output: `Executed in terminal (${cls.level}): ${command}`,
      safety: cls.level,
    };
  }

  async run_tests(): Promise<ToolResult> {
    return this.run_terminal("npm test", true);
  }

  /** Return a human-readable relative path (used in tool output). */
  rel(path: string): string {
    return toWorkspaceRelative(this.root.fsPath, path);
  }
}
