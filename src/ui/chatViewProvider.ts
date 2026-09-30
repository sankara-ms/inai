import * as vscode from "vscode";
import { ProviderManager } from "../providers/providerManager";
import { ContextService, ContextItem } from "../services/contextService";
import { SafeEditService } from "../services/safeEditService";
import { SessionStore, ChatSession } from "../services/sessionStore";
import { AgentTools } from "../agent/tools";
import { StatusBar } from "./statusBar";
import { ChatMessage, ChatMode } from "../types";
import { toWorkspaceRelative } from "../core/pathUtils";
import { getConfigValue } from "../services/config";

type InMsg =
  | { type: "ready" }
  | { type: "send"; text: string; mode: ChatMode }
  | { type: "stop" }
  | { type: "newChat" }
  | { type: "pickModel" }
  | { type: "addContextPick" }
  | { type: "removeContext"; relPath: string }
  | { type: "acceptEdit"; relPath: string }
  | { type: "rejectEdit"; relPath: string }
  | { type: "acceptAll" }
  | { type: "rejectAll" }
  | { type: "showDiff"; relPath: string }
  | { type: "runTool"; name: string; args: Record<string, unknown>; approved?: boolean };

/** Implements the sidebar chat webview and all message handling. */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "inai.chat";

  private view?: vscode.WebviewView;
  private abort?: AbortController;
  private contextItems: ContextItem[] = [];
  private session!: ChatSession;

  constructor(
    private readonly extUri: vscode.Uri,
    private readonly providers: ProviderManager,
    private readonly context: ContextService,
    private readonly edits: SafeEditService,
    private readonly sessions: SessionStore,
    private readonly tools: AgentTools,
    private readonly status: StatusBar,
    private readonly root: vscode.Uri,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extUri, "dist", "webview")],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: InMsg) => this.onMessage(m));
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  async addSelectionToContext(text: string, file: string): Promise<void> {
    const rel = toWorkspaceRelative(this.root.fsPath, file);
    this.contextItems.push({
      label: `@selection ${rel}`,
      relPath: rel,
      kind: "selection",
      content: text,
    });
    this.postContext();
    this.reveal();
  }

  async addFileToContext(uri: vscode.Uri): Promise<void> {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.Directory) {
      const matcher = await this.context.buildMatcher();
      const items = await this.context.folderItems(uri, matcher);
      this.contextItems.push(...items);
    } else {
      const item = await this.context.fileItem(uri);
      if (item) this.contextItems.push(item);
    }
    this.postContext();
    this.reveal();
  }

  private post(msg: unknown): void {
    void this.view?.webview.postMessage(msg);
  }

  private postContext(): void {
    this.post({
      type: "context",
      items: this.contextItems.map((i) => ({ label: i.label, relPath: i.relPath, kind: i.kind })),
    });
  }

  private postEdits(): void {
    this.post({ type: "edits", edits: this.edits.listStaged() });
  }

  private async ensureSession(): Promise<void> {
    const id = this.sessions.activeId();
    const existing = id ? this.sessions.get(id) : undefined;
    this.session = existing ?? (await this.sessions.create("ask"));
    this.post({ type: "session", session: this.session });
  }

  private async onMessage(m: InMsg): Promise<void> {
    switch (m.type) {
      case "ready":
        await this.ensureSession();
        this.postContext();
        this.postEdits();
        break;
      case "send":
        await this.handleSend(m.text, m.mode);
        break;
      case "stop":
        this.abort?.abort();
        break;
      case "newChat":
        this.session = await this.sessions.create(this.session?.mode ?? "ask");
        this.contextItems = [];
        this.post({ type: "session", session: this.session });
        this.postContext();
        break;
      case "pickModel":
        await vscode.commands.executeCommand("inai.pickModel");
        break;
      case "addContextPick":
        await this.pickContext();
        break;
      case "removeContext":
        this.contextItems = this.contextItems.filter((i) => i.relPath !== m.relPath);
        this.postContext();
        break;
      case "acceptEdit":
        await this.edits.acceptEdit(m.relPath);
        this.postEdits();
        break;
      case "rejectEdit":
        this.edits.rejectEdit(m.relPath);
        this.postEdits();
        break;
      case "acceptAll":
        await this.edits.acceptAll();
        this.postEdits();
        break;
      case "rejectAll":
        this.edits.rejectAll();
        this.postEdits();
        break;
      case "showDiff":
        await this.edits.showDiff(m.relPath);
        break;
      case "runTool":
        await this.runTool(m.name, m.args, m.approved ?? false);
        break;
    }
  }

  private async pickContext(): Promise<void> {
    const files = await this.context.listWorkspaceFiles();
    const picks = await vscode.window.showQuickPick(files, {
      canPickMany: true,
      placeHolder: "Select files to add to context",
    });
    if (!picks) return;
    for (const rel of picks) {
      const uri = vscode.Uri.joinPath(this.root, rel);
      const item = await this.context.fileItem(uri);
      if (item) this.contextItems.push(item);
    }
    this.postContext();
  }

  /** Resolve inline @file / @folder references in the user's text. */
  private async resolveInlineRefs(text: string): Promise<void> {
    const refs = [...text.matchAll(/@([^\s]+)/g)].map((mm) => mm[1]);
    for (const ref of refs) {
      const uri = vscode.Uri.joinPath(this.root, ref);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.Directory) {
          const matcher = await this.context.buildMatcher();
          this.contextItems.push(...(await this.context.folderItems(uri, matcher)));
        } else {
          const item = await this.context.fileItem(uri);
          if (item) this.contextItems.push(item);
        }
      } catch {
        // not a path; ignore
      }
    }
  }

  private buildSystemPrompt(mode: ChatMode): string {
    const base =
      "You are INAI, a coding assistant embedded in VS Code. Be concise and correct.";
    if (mode === "ask") {
      return `${base} Answer questions about the code. Do not propose file edits.`;
    }
    if (mode === "edit") {
      return (
        `${base} Propose edits as fenced code blocks labeled with the target path, e.g.\n` +
        "```edit path=src/foo.ts\n<full new file contents>\n```\n" +
        "Edits are staged for user review and never applied directly."
      );
    }
    return (
      `${base} You are in AGENT mode with tools: read_file, search, edit_file, ` +
      "create_file, run_terminal, run_tests. To call a tool, emit a single line:\n" +
      "TOOL: <name> <json-args>\n" +
      "Edits are staged for review; terminal commands are safety-classified."
    );
  }

  private assembleContext(userText: string): string {
    if (this.contextItems.length === 0) return "";
    const ranked = this.context.rankForQuery(userText, this.contextItems, 12);
    const parts: string[] = [];
    // Always include selection items verbatim.
    for (const it of this.contextItems.filter((i) => i.kind === "selection")) {
      parts.push(`# Selection: ${it.relPath}\n${it.content}`);
    }
    for (const c of ranked) {
      parts.push(`# ${c.file}:${c.startLine}-${c.endLine}\n${c.content}`);
    }
    return `\n\n<context>\n${parts.join("\n\n")}\n</context>`;
  }

  private async handleSend(text: string, mode: ChatMode): Promise<void> {
    if (this.abort) return; // already generating
    await this.ensureSession();
    this.session.mode = mode;
    await this.resolveInlineRefs(text);
    this.postContext();

    const contextBlock = this.assembleContext(text);
    const userMsg: ChatMessage = { role: "user", content: text };
    this.session.messages.push(userMsg);
    this.post({ type: "userMessage", content: text });

    const messages: ChatMessage[] = [
      { role: "system", content: this.buildSystemPrompt(mode) },
      ...this.session.messages.slice(0, -1),
      { role: "user", content: text + contextBlock },
    ];

    this.abort = new AbortController();
    this.status.busy(true);
    this.post({ type: "assistantStart" });

    let full = "";
    try {
      const model = getConfigValue<string>("model", "") || (await this.defaultModel());
      for await (const chunk of this.providers.streamChat({
        model,
        messages,
        temperature: getConfigValue<number>("temperature", 0.2),
        numCtx: getConfigValue<number>("ollama.numCtx", 16384),
        signal: this.abort.signal,
        tools: mode === "agent" ? AgentTools.schemas() : undefined,
      })) {
        if (chunk.delta) {
          full += chunk.delta;
          this.post({ type: "assistantDelta", delta: chunk.delta });
        }
        if (chunk.done) break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.post({ type: "assistantDelta", delta: `\n\n**Error:** ${msg}` });
      full += `\n\n[Error] ${msg}`;
    } finally {
      this.abort = undefined;
      this.status.busy(false);
      this.post({ type: "assistantEnd" });
    }

    this.session.messages.push({ role: "assistant", content: full });
    await this.sessions.save(this.session);

    if (mode === "edit") await this.parseEditBlocks(full);
    if (mode === "agent") await this.parseAgentTools(full);
  }

  private async defaultModel(): Promise<string> {
    try {
      const models = await this.providers.listModels();
      return models[0]?.id ?? "";
    } catch {
      return "";
    }
  }

  /** Parse ```edit path=... blocks and stage them. */
  private async parseEditBlocks(text: string): Promise<void> {
    const re = /```edit\s+path=([^\s\n]+)\n([\s\S]*?)```/g;
    let mm: RegExpExecArray | null;
    let staged = false;
    while ((mm = re.exec(text))) {
      const path = mm[1].trim();
      const content = mm[2];
      await this.edits.stageEdit(path, content);
      staged = true;
    }
    if (staged) this.postEdits();
  }

  /** Parse `TOOL: name {json}` lines from agent output and execute. */
  private async parseAgentTools(text: string): Promise<void> {
    const re = /^TOOL:\s*(\w+)\s*(\{.*\})?\s*$/gm;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text))) {
      const name = mm[1];
      let args: Record<string, unknown> = {};
      if (mm[2]) {
        try {
          args = JSON.parse(mm[2]) as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      await this.runTool(name, args, false);
    }
  }

  private async runTool(
    name: string,
    args: Record<string, unknown>,
    approved: boolean,
  ): Promise<void> {
    let result;
    switch (name) {
      case "read_file":
        result = await this.tools.read_file(String(args.path ?? ""));
        break;
      case "search":
        result = await this.tools.search(String(args.query ?? ""));
        break;
      case "edit_file":
        result = await this.tools.edit_file(String(args.path ?? ""), String(args.content ?? ""));
        this.postEdits();
        break;
      case "create_file":
        result = await this.tools.create_file(String(args.path ?? ""), String(args.content ?? ""));
        this.postEdits();
        break;
      case "run_terminal":
        result = await this.tools.run_terminal(String(args.command ?? ""), approved);
        break;
      case "run_tests":
        result = await this.tools.run_tests();
        break;
      default:
        result = { ok: false, output: `Unknown tool: ${name}` };
    }
    this.post({ type: "toolResult", name, result });
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const uri = (f: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extUri, "dist", "webview", f));
    const csp =
      `default-src 'none'; style-src ${webview.cspSource}; ` +
      `script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${uri("main.css")}" />
<title>INAI</title>
</head>
<body>
<div id="app">
  <header id="toolbar">
    <select id="mode" title="Chat mode">
      <option value="ask">Ask</option>
      <option value="edit">Edit</option>
      <option value="agent">Agent</option>
    </select>
    <button id="model" title="Pick model">Model</button>
    <button id="addContext" title="Add files to context">@ Context</button>
    <button id="newChat" title="New chat">New</button>
  </header>
  <div id="contextBar"></div>
  <div id="editsBar"></div>
  <main id="messages"></main>
  <footer>
    <textarea id="input" rows="3" placeholder="Ask, edit, or run the agent…  Use @file to reference files."></textarea>
    <div id="controls">
      <button id="send">Send</button>
      <button id="stop" disabled>Stop</button>
    </div>
  </footer>
</div>
<script nonce="${nonce}" src="${uri("main.js")}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
