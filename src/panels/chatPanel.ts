/**
 * Chat Panel — Webview sidebar for chatting with the agent.
 *
 * Streams tokens in real-time, shows thinking/routing/tool status.
 */

import * as vscode from "vscode";
import { AgentClient, AgentEvent } from "../client";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "agentBmm.chatPanel";
  private view?: vscode.WebviewView;
  private client: AgentClient;

  constructor(
    private readonly extensionUri: vscode.Uri,
    client: AgentClient
  ) {
    this.client = client;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    // Handle messages from the webview
    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "query") {
        await this.handleQuery(msg.text);
      }
    });
  }

  private async handleQuery(text: string): Promise<void> {
    if (!this.client.connected) {
      this.postMessage({ type: "error", text: "Not connected to agent-bmm server" });
      return;
    }

    this.postMessage({ type: "userMessage", text });
    this.postMessage({ type: "agentStart" });

    const onEvent = (event: AgentEvent) => {
      this.postMessage({
        type: "agentEvent",
        eventType: event.type,
        data: event.data ?? event.result ?? "",
        tool: event.tool,
        step: event.step,
      });
    };

    this.client.on("event", onEvent);

    try {
      await this.client.send({ type: "query", text });
    } catch (err: any) {
      this.postMessage({ type: "error", text: err.message });
    }

    // Clean up listener when done
    const cleanup = (event: AgentEvent) => {
      if (event.type === "done" || event.type === "error") {
        this.client.removeListener("event", onEvent);
        this.client.removeListener("event", cleanup);
      }
    };
    this.client.on("event", cleanup);
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .msg {
      margin: 4px 0;
      padding: 6px 10px;
      border-radius: 6px;
      max-width: 90%;
      word-wrap: break-word;
    }
    .msg.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: auto;
    }
    .msg.agent {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .msg.status {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      font-style: italic;
    }
    .msg.error {
      color: var(--vscode-errorForeground);
    }
    #input-area {
      display: flex;
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    #input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 10px;
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
    }
    #input:focus { outline: 1px solid var(--vscode-focusBorder); }
    #send {
      margin-left: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
    }
    #send:hover { background: var(--vscode-button-hoverBackground); }
    #token-stream { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <input id="input" placeholder="Ask the agent..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    let currentStream = null;

    function addMessage(text, cls) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    send.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'query', text });
      input.value = '';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send.click();
      }
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'userMessage':
          addMessage(msg.text, 'user');
          break;
        case 'agentStart':
          currentStream = addMessage('', 'agent');
          currentStream.id = 'token-stream';
          break;
        case 'agentEvent':
          if (msg.eventType === 'token' && currentStream) {
            currentStream.textContent += msg.data;
            messages.scrollTop = messages.scrollHeight;
          } else if (msg.eventType === 'thinking') {
            addMessage('Thinking: ' + msg.data.substring(0, 100), 'status');
          } else if (msg.eventType === 'tool_start') {
            addMessage('Tool: ' + msg.tool + '...', 'status');
          } else if (msg.eventType === 'tool_result') {
            addMessage(msg.tool + ' → ' + msg.data.substring(0, 150), 'status');
          } else if (msg.eventType === 'answer') {
            if (currentStream) {
              currentStream.textContent = msg.data;
            } else {
              addMessage(msg.data, 'agent');
            }
            currentStream = null;
          } else if (msg.eventType === 'done') {
            currentStream = null;
          }
          break;
        case 'error':
          addMessage('Error: ' + msg.text, 'error');
          currentStream = null;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
