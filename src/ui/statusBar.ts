import * as vscode from "vscode";
import { getConfigValue } from "../services/config";

/** Shows the active provider/model in the status bar and offers quick access. */
export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = "inai.pickModel";
    this.update();
    this.item.show();
  }

  update(status?: string): void {
    const provider = getConfigValue<string>("provider", "ollama");
    const model = getConfigValue<string>("model", "") || "auto";
    const suffix = status ? ` — ${status}` : "";
    this.item.text = `$(sparkle) INAI: ${provider}/${model}${suffix}`;
    this.item.tooltip = "INAI — click to pick a model";
  }

  busy(on: boolean): void {
    if (on) {
      this.item.text = `$(sync~spin) INAI: generating…`;
    } else {
      this.update();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
