/**
 * File Decorations — Mark agent-modified files in the explorer.
 */

import * as vscode from "vscode";

export class AgentFileDecorationProvider implements vscode.FileDecorationProvider {
  private modifiedFiles = new Set<string>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  markModified(uri: vscode.Uri): void {
    this.modifiedFiles.add(uri.toString());
    this._onDidChange.fire(uri);
  }

  clearAll(): void {
    const uris = [...this.modifiedFiles].map((u) => vscode.Uri.parse(u));
    this.modifiedFiles.clear();
    this._onDidChange.fire(uris);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (this.modifiedFiles.has(uri.toString())) {
      return {
        badge: "A",
        tooltip: "Modified by Agent BMM",
        color: new vscode.ThemeColor("agentBmm.modifiedFile"),
      };
    }
    return undefined;
  }
}
