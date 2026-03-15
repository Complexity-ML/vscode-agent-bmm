/**
 * Agent BMM — VS Code Extension
 *
 * Thin client that connects to `agent-bmm serve` via WebSocket.
 * All agent logic (BMM routing, LLM, tools) runs server-side on GPU.
 * VS Code only renders results.
 */

import * as vscode from "vscode";
import { AgentClient } from "./client";
import { ChatPanelProvider } from "./panels/chatPanel";
import { registerCodeActions } from "./providers/codeActions";
import { StatusBarManager } from "./providers/statusBar";
import { AgentFileDecorationProvider } from "./providers/fileDecorations";

let client: AgentClient;
let statusBar: StatusBarManager;
let fileDecorations: AgentFileDecorationProvider;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("agentBmm");
  const serverUrl = config.get<string>("serverUrl", "ws://localhost:8765");

  // Create client
  client = new AgentClient(serverUrl);

  // Status bar
  statusBar = new StatusBarManager(client);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // File decorations
  fileDecorations = new AgentFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorations)
  );

  // Chat panel
  const chatProvider = new ChatPanelProvider(context.extensionUri, client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatProvider)
  );

  // Code actions (right-click menu)
  registerCodeActions(context, client);

  // Connect command
  context.subscriptions.push(
    vscode.commands.registerCommand("agentBmm.connect", async () => {
      const url = await vscode.window.showInputBox({
        prompt: "Agent BMM server URL",
        value: serverUrl,
        placeHolder: "ws://localhost:8765",
      });
      if (!url) return;

      try {
        client.disconnect();
        client = new AgentClient(url);
        await client.connect();
        statusBar = new StatusBarManager(client);
        vscode.window.showInformationMessage(`Connected to ${url}`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to connect: ${err.message}`);
      }
    })
  );

  // Disconnect command
  context.subscriptions.push(
    vscode.commands.registerCommand("agentBmm.disconnect", () => {
      client.disconnect();
      vscode.window.showInformationMessage("Disconnected from Agent BMM");
    })
  );

  // Open chat panel command
  context.subscriptions.push(
    vscode.commands.registerCommand("agentBmm.openChat", () => {
      vscode.commands.executeCommand("agentBmm.chatPanel.focus");
    })
  );

  // Auto-connect
  if (config.get<boolean>("autoConnect", true)) {
    client.connect().catch(() => {
      // Server not running — silent fail, user can connect manually
    });
  }

  // Listen for agent file modifications
  client.on("tool_result", (msg: any) => {
    if (msg.tool === "write" || msg.tool === "edit") {
      // Try to find the file URI and mark it
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder && msg.result) {
        // Parse file path from result (e.g., "Written 42 chars to hello.py")
        const match = msg.result.match(/(?:Written|Edited)\s+.*?(?:to\s+)?(\S+\.?\w+)/);
        if (match) {
          const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, match[1]);
          fileDecorations.markModified(fileUri);
        }
      }
    }
  });
}

export function deactivate(): void {
  client?.disconnect();
}
