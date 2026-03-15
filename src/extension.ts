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

/** Shared client — single instance, reconnectable. */
const client = new AgentClient();

let statusBar: StatusBarManager;
let fileDecorations: AgentFileDecorationProvider;

async function connectToServer(url: string): Promise<void> {
  client.disconnect();
  client.url = url;
  await client.connect();
  statusBar.update();
}

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("agentBmm");
  const serverUrl = config.get<string>("serverUrl", "ws://localhost:8765");

  // Update client URL from config
  client.url = serverUrl;

  // Status bar
  statusBar = new StatusBarManager(client);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // File decorations
  fileDecorations = new AgentFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorations)
  );

  // Chat panel — uses the shared client
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
        await connectToServer(url);
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
      statusBar.update();
      vscode.window.showInformationMessage("Disconnected from Agent BMM");
    })
  );

  // Open chat panel command
  context.subscriptions.push(
    vscode.commands.registerCommand("agentBmm.openChat", () => {
      vscode.commands.executeCommand("agentBmm.chatPanel.focus");
    })
  );

  // Listen for agent file modifications
  client.on("tool_result", (msg: any) => {
    if (msg.tool === "write" || msg.tool === "edit") {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder && msg.result) {
        const match = msg.result.match(/(?:Written|Edited)\s+.*?(?:to\s+)?(\S+\.?\w+)/);
        if (match) {
          const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, match[1]);
          fileDecorations.markModified(fileUri);
        }
      }
    }
  });

  // Auto-connect
  if (config.get<boolean>("autoConnect", true)) {
    connectToServer(serverUrl).then(() => {
      vscode.window.showInformationMessage(`Agent BMM: connected to ${serverUrl}`);
    }).catch(() => {
      // Server not running — silent, user can connect manually
    });
  }
}

export function deactivate(): void {
  client.disconnect();
}
