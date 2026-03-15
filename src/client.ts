/**
 * WebSocket client for agent-bmm server.
 *
 * Thin client — all agent logic stays server-side on GPU.
 * This just sends queries and receives events.
 */

import WebSocket from "ws";
import { EventEmitter } from "events";

export interface AgentEvent {
  type: string;
  data?: string;
  step?: number;
  query?: string;
  tool?: string;
  result?: string;
  expert_ids?: number[];
  time_ms?: number;
}

export class AgentClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(url: string = "ws://localhost:8765") {
    super();
    this.url = url;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (raw: WebSocket.RawData) => {
        try {
          const msg: AgentEvent = JSON.parse(raw.toString());
          this.emit("event", msg);
          this.emit(msg.type, msg);
        } catch {
          // ignore malformed messages
        }
      });

      this.ws.on("close", () => {
        this.emit("disconnected");
        this.ws = null;
      });

      this.ws.on("error", (err: Error) => {
        this.emit("error", err);
        reject(err);
      });
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async send(data: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to agent-bmm server");
    }
    this.ws.send(JSON.stringify(data));
  }

  async query(text: string): Promise<string> {
    await this.send({ type: "query", text });

    return new Promise((resolve, reject) => {
      const onEvent = (msg: AgentEvent) => {
        if (msg.type === "answer") {
          this.removeListener("event", onEvent);
          resolve(msg.data ?? "");
        } else if (msg.type === "error") {
          this.removeListener("event", onEvent);
          reject(new Error(msg.data ?? "Server error"));
        } else if (msg.type === "done") {
          this.removeListener("event", onEvent);
          resolve("");
        }
      };
      this.on("event", onEvent);
    });
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    await this.send({ type: "tools" });

    return new Promise((resolve) => {
      const onEvent = (msg: AgentEvent) => {
        if (msg.type === "tools") {
          this.removeListener("event", onEvent);
          resolve((msg as any).data ?? []);
        }
      };
      this.on("event", onEvent);
    });
  }

  async ping(): Promise<boolean> {
    await this.send({ type: "ping" });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.removeListener("event", onEvent);
        resolve(false);
      }, 5000);

      const onEvent = (msg: AgentEvent) => {
        if (msg.type === "pong") {
          clearTimeout(timeout);
          this.removeListener("event", onEvent);
          resolve(true);
        }
      };
      this.on("event", onEvent);
    });
  }
}
