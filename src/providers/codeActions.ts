/**
 * Code Actions — Right-click context menu for agent interactions.
 *
 * Select code → right-click → Ask Agent / Refactor / Add Tests / Explain
 */

import * as vscode from "vscode";
import { AgentClient } from "../client";

export function registerCodeActions(
  context: vscode.ExtensionContext,
  client: AgentClient
): void {
  const actions = [
    { command: "agentBmm.askAgent", prompt: "Answer this question about the following code:" },
    { command: "agentBmm.refactor", prompt: "Refactor the following code to be cleaner and more idiomatic:" },
    { command: "agentBmm.addTests", prompt: "Write unit tests for the following code:" },
    { command: "agentBmm.explain", prompt: "Explain the following code step by step:" },
  ];

  for (const action of actions) {
    context.subscriptions.push(
      vscode.commands.registerCommand(action.command, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.document.getText(editor.selection);
        if (!selection) {
          vscode.window.showWarningMessage("Select some code first.");
          return;
        }

        if (!client.connected) {
          vscode.window.showErrorMessage("Not connected to agent-bmm server.");
          return;
        }

        const filePath = editor.document.fileName;
        const lang = editor.document.languageId;
        const query = `${action.prompt}\n\nFile: ${filePath}\nLanguage: ${lang}\n\n\`\`\`${lang}\n${selection}\n\`\`\``;

        // Open chat panel and send query
        await vscode.commands.executeCommand("agentBmm.chatPanel.focus");

        try {
          const answer = await client.query(query);
          // Show result in a new editor tab
          const doc = await vscode.workspace.openTextDocument({
            content: answer,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Agent error: ${err.message}`);
        }
      })
    );
  }
}
