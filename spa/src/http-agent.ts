import type { AgentEvent, AgentState, AgentTool, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

export class HttpAgent {
  sessionId: string;
  streamFn: any;
  getApiKey: (provider: string) => Promise<string | undefined>;
  private _state: HttpAgentState;
  private listeners: Set<(event: AgentEvent, signal: AbortSignal) => void | Promise<void>> = new Set();
  private abortController: AbortController | null = null;
  private _aborted = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this._state = new HttpAgentState();
    this.getApiKey = async () => undefined;
  }

  get state(): AgentState {
    return this._state;
  }

  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => void | Promise<void>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(event: AgentEvent) {
    const signal = this.abortController?.signal ?? new AbortController().signal;
    for (const listener of this.listeners) {
      await listener(event, signal);
    }
  }

  async prompt(input: string | any, _images?: any[]): Promise<void> {
    this._aborted = false;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let messageText: string;
    if (typeof input === "string") {
      messageText = input;
    } else if (input?.content) {
      messageText = typeof input.content === "string" ? input.content : "";
    } else {
      messageText = "";
    }

    this._state.addMessage({ role: "user", content: messageText });
    this._state.isStreaming = true;
    this._state.errorMessage = undefined;

    await this.emit({ type: "agent_start", sessionId: this.sessionId } as any);

    try {
      const res = await fetch(`/api/session/${this.sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown error");
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentAssistantContent = "";
      let messageSent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const raw = JSON.parse(jsonStr);
            const eventType = raw.type as string;

            switch (eventType) {
              case "message_start": {
                const msgRole = raw.message?.role;
                if (msgRole === "user") break;

                messageSent = true;
                currentAssistantContent = "";
                const msg: any = {
                  id: raw.message?.id || crypto.randomUUID(),
                  sessionID: this.sessionId,
                  role: "assistant",
                  content: "",
                };
                this._state.addMessage(msg);
                await this.emit({ type: "message_start", message: msg });
                break;
              }
              case "message_update": {
                const deltaEvent = raw.assistantMessageEvent || {};
                const delta = deltaEvent.delta || deltaEvent.text || "";
                if (delta) {
                  currentAssistantContent += delta;
                  if (this._state.messages.length > 0) {
                    const lastMsg = this._state.messages[this._state.messages.length - 1] as any;
                    lastMsg.content = currentAssistantContent;
                  }
                }
                const updateMsg = this._state.messages[this._state.messages.length - 1] || { role: "assistant", content: currentAssistantContent };
                await this.emit({
                  type: "message_update",
                  message: updateMsg,
                  assistantMessageEvent: deltaEvent,
                } as any);
                break;
              }
              case "message_end": {
                const msgRole = raw.message?.role;
                if (msgRole === "user") break;
                const endMsg = this._state.messages[this._state.messages.length - 1] || { role: "assistant", content: currentAssistantContent };
                await this.emit({ type: "message_end", message: endMsg });
                break;
              }
              case "tool_execution_start":
                this._state.pendingToolCalls.add(raw.toolCallId || raw.tool_call_id || "");
                await this.emit({
                  type: "tool_execution_start",
                  toolCallId: raw.toolCallId || raw.tool_call_id || "",
                  toolName: raw.toolName || raw.tool_name || "",
                  args: raw.args || {},
                });
                break;
              case "tool_execution_end":
                this._state.pendingToolCalls.delete(raw.toolCallId || raw.tool_call_id || "");
                await this.emit({
                  type: "tool_execution_end",
                  toolCallId: raw.toolCallId || raw.tool_call_id || "",
                  toolName: raw.toolName || raw.tool_name || "",
                  result: raw.result || null,
                  isError: raw.is_error || raw.isError || false,
                });
                break;
              case "agent_end": {
                const finalMsg = this._state.messages[this._state.messages.length - 1];
                await this.emit({
                  type: "agent_end",
                  messages: finalMsg ? [finalMsg] : [],
                });
                break;
              }
              case "error":
                this._state.errorMessage = raw.error || "Unknown error";
                await this.emit({ type: "error" } as any);
                break;
            }
          } catch { }
        }
      }

      if (!messageSent && !this._aborted) {
        this._state.addMessage({ role: "assistant", content: currentAssistantContent || "(no response)" });
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      this._state.errorMessage = err.message;
      this._state.addMessage({ role: "assistant", content: `Error: ${err.message}` });
    } finally {
      this._state.isStreaming = false;
      this.abortController = null;
      if (!this._aborted) {
        await this.emit({ type: "agent_end", messages: [...this._state.messages] });
      }
    }
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    this._state.model = { provider, id: modelId, label: modelId } as any;
    await fetch(`/api/session/${this.sessionId}/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, modelId }),
    }).catch(() => {});
  }

  abort() {
    this._aborted = true;
    this.abortController?.abort();
    fetch(`/api/session/${this.sessionId}/abort`, { method: "POST" }).catch(() => {});
  }

  get signal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }
}

class HttpAgentState implements AgentState {
  systemPrompt = "";
  thinkingLevel: ThinkingLevel = "off";
  private _tools: AgentTool<any>[] = [];
  private _messages: any[] = [];
  isStreaming = false;
  pendingToolCalls: Set<string> = new Set();
  streamingMessage?: any;
  errorMessage?: string;
  model: Model<any> = { provider: "deepseek", id: "deepseek-chat", label: "DeepSeek Chat" } as any;

  get tools(): AgentTool<any>[] {
    return this._tools;
  }

  set tools(t: AgentTool<any>[]) {
    this._tools = [...t];
  }

  get messages(): any[] {
    return this._messages;
  }

  set messages(m: any[]) {
    this._messages = [...m];
  }

  addMessage(msg: any) {
    this._messages = [...this._messages, msg];
  }
}
