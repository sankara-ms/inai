import * as vscode from "vscode";
import { ProviderManager } from "./providers/providerManager";
import { ContextService } from "./services/contextService";
import { SafeEditService } from "./services/safeEditService";
import { SessionStore } from "./services/sessionStore";
import { AgentTools } from "./agent/tools";
import { ChatViewProvider } from "./ui/chatViewProvider";
import { StatusBar } from "./ui/statusBar";
import { CloudSync } from "./cloud/cloudSync";
import { migrateLegacyState } from "./services/migration";
import { ProviderId } from "./types";

export function activate(context: vscode.ExtensionContext): void {
  const folders = vscode.workspace.workspaceFolders;
  const root = folders?.[0]?.uri ?? vscode.Uri.file(process.cwd());

  const providers = new ProviderManager(context.secrets);
  const contextSvc = new ContextService(root);
  const edits = new SafeEditService(root);
  const sessions = new SessionStore(context.workspaceState);
  const tools = new AgentTools(root, edits, contextSvc);
  const status = new StatusBar();
  const cloud = new CloudSync(context.secrets);

  // Best-effort, one-time migration of legacy `unboundAI.*` secrets and
  // workspaceState keys to the `inai.*` namespace. Config settings are
  // resolved with a live fallback at read time (see ProviderManager, etc.).
  void migrateLegacyState(context);

  const chat = new ChatViewProvider(
    context.extensionUri,
    providers,
    contextSvc,
    edits,
    sessions,
    tools,
    status,
    root,
  );

  context.subscriptions.push(
    status,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // --- Commands ---------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("inai.openChat", () => {
      void vscode.commands.executeCommand("inai.chat.focus");
    }),

    vscode.commands.registerCommand("inai.addSelectionToContext", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const sel = editor.document.getText(editor.selection) || editor.document.getText();
      await chat.addSelectionToContext(sel, editor.document.uri.fsPath);
    }),

    vscode.commands.registerCommand(
      "inai.addFileToContext",
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) await chat.addFileToContext(target);
      },
    ),

    vscode.commands.registerCommand("inai.newChat", async () => {
      await sessions.create();
      chat.reveal();
    }),

    vscode.commands.registerCommand("inai.stop", () => {
      // The provider tracks its own AbortController; the webview relays stop.
      void vscode.commands.executeCommand("inai.chat.focus");
    }),

    vscode.commands.registerCommand("inai.pickModel", async () => {
      await pickModel(providers, status);
    }),

    vscode.commands.registerCommand("inai.setApiKey", async () => {
      const provider = await pickProvider();
      if (!provider) return;
      const key = await vscode.window.showInputBox({
        prompt: `Enter API key for ${provider}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await providers.setApiKey(provider, key);
        void vscode.window.showInformationMessage(`Saved ${provider} API key.`);
      }
    }),

    vscode.commands.registerCommand("inai.clearApiKey", async () => {
      const provider = await pickProvider();
      if (!provider) return;
      await providers.clearApiKey(provider);
      void vscode.window.showInformationMessage(`Cleared ${provider} API key.`);
    }),

    vscode.commands.registerCommand("inai.revertSnapshot", async () => {
      const snaps = await edits.listSnapshots();
      if (snaps.length === 0) {
        void vscode.window.showInformationMessage("No snapshots to revert.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        snaps.map((s) => ({
          label: s.label,
          description: new Date(s.timestamp).toLocaleString(),
          detail: `${s.files.length} file(s)`,
          id: s.id,
        })),
        { placeHolder: "Select a snapshot to revert to" },
      );
      if (!pick) return;
      const confirm = await vscode.window.showWarningMessage(
        `Revert "${pick.label}"? This will overwrite/delete affected files.`,
        { modal: true },
        "Revert",
      );
      if (confirm === "Revert") {
        await edits.revert(pick.id);
        void vscode.window.showInformationMessage("Reverted to snapshot.");
      }
    }),
  );

  // Configuration changes update the status bar.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("inai") || e.affectsConfiguration("unboundAI"))
        status.update();
    }),
  );

  // Optional cloud sync surface (inert unless configured).
  if (cloud.isConfigured()) {
    void vscode.window.setStatusBarMessage("INAI cloud sync configured.", 3000);
  }
}

async function pickProvider(): Promise<ProviderId | undefined> {
  const pick = await vscode.window.showQuickPick(
    ["gemini", "groq", "openrouter"],
    { placeHolder: "Select provider for the API key" },
  );
  return pick as ProviderId | undefined;
}

async function pickModel(
  providers: ProviderManager,
  status: StatusBar,
): Promise<void> {
  let models;
  try {
    models = await providers.listModels();
  } catch (e) {
    void vscode.window.showErrorMessage(
      `Could not list models: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }
  if (models.length === 0) {
    void vscode.window.showWarningMessage("No models found for the active provider.");
    return;
  }
  const pick = await vscode.window.showQuickPick(
    models.map((m) => m.id),
    { placeHolder: "Select a model" },
  );
  if (pick) {
    await vscode.workspace
      .getConfiguration("inai")
      .update("model", pick, vscode.ConfigurationTarget.Global);
    status.update();
  }
}

export function deactivate(): void {
  // no-op
}
