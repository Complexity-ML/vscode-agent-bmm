/**
 * Status Bar — Connection status, model, tokens, cost.
 */

import * as vscode from "vscode";
import { AgentClient } from "../client";

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private client: AgentClient;
  private tokenCount = 0;

  constructor(client: AgentClient) {
    this.client = client;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "agentBmm.connect";
    this.update();
    this.item.show();

    client.on("connected", () => this.update());
    client.on("disconnected", () => this.update());
    client.on("token", () => {
      this.tokenCount++;
      this.update();
    });
  }

  update(): void {
    if (this.client.connected) {
      this.item.text = `$(hubot) Agent BMM`;
      this.item.tooltip = `Connected | ${this.tokenCount} tokens`;
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = `$(hubot) Agent BMM (offline)`;
      this.item.tooltip = "Click to connect";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
