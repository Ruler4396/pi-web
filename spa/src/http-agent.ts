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
    this._state.loadModels().catch(() => {});
    this.getApiKey = async () => undefined;
    this.chatPanel = null as any;
  }

  get state(): AgentState {
    return this._state;
  }

  get recognized(): boolean {
    return true;
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

    this._state.addMessage({ role: "user", content: [{ type: "text", text: messageText }] });
    this._state.isStreaming = true;
    this.chatPanel?.agentInterface?.requestUpdate();
    // Directly show streaming container
    const sc = document.querySelector("streaming-message-container");
    if (sc) sc.classList.remove("hidden");
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
                  content: [{ type: "text", text: "" }] as any[],
                  stopReason: null,
                };
                this._state.addMessage(msg);
                // Directly update DOM assistant message for reliability
                try {
                  const am = document.querySelector("assistant-message");
                  if (am) {
                    const markdownBlock = am.querySelector("markdown-block");
                    if (markdownBlock) {
                      (markdownBlock as any).content = currentAssistantContent;
                    }
                    // Also try setting message property if available
                    if (typeof (am as any).message === "object") {
                      (am as any).message = { ...(am as any).message, content: [{ type: "text", text: currentAssistantContent }] };
                    }
                    (am as any).requestUpdate?.();
                  }
                } catch {}
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
                    // Content must be an array of {type, text} chunks for ChatPanel
                    lastMsg.content = [{ type: "text", text: currentAssistantContent }];
                  // Force array reference change so ChatPanel detects update
                  this._state.messages = this._state.messages;
                  }
                }
                const updateMsg = this._state.messages[this._state.messages.length - 1] || { role: "assistant", content: [{ type: "text", text: currentAssistantContent }] };
                await this.emit({
                  type: "message_update",
                  message: updateMsg,
                  text: delta || currentAssistantContent,
                  delta: delta || currentAssistantContent,
                  content: currentAssistantContent,
                  assistantMessageEvent: deltaEvent,
                } as any);
                break;
              }
              case "message_end": {
                const msgRole = raw.message?.role;
                if (msgRole === "user") break;
                const endMsg = this._state.messages[this._state.messages.length - 1];
                if (endMsg) {
                  (endMsg as any).stopReason = "end_turn";
                }
                await this.emit({ type: "message_end", message: endMsg || { role: "assistant", content: [{ type: "text", text: currentAssistantContent }] } });
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
                if (finalMsg) (finalMsg as any).stopReason = "end_turn";
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
        this._state.addMessage({ role: "assistant", content: [{ type: "text", text: currentAssistantContent || "(no response)" }] });
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      this._state.errorMessage = err.message;
      this._state.addMessage({ role: "assistant", content: [{ type: "text", text: `Error: ${err.message}` }], stopReason: "error", errorMessage: err.message });
    } finally {
      this._state.isStreaming = false;
      this.chatPanel?.agentInterface?.requestUpdate();
      // Hide streaming container
      const sc2 = document.querySelector("streaming-message-container");
      if (sc2) sc2.classList.add("hidden");
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

  async setThinking(level: string): Promise<void> {
    this._state.thinkingLevel = level as any;
    await fetch(`/api/session/${this.sessionId}/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: this._state.model.provider,
        modelId: this._state.model.id,
        thinkingLevel: level,
      }),
    }).catch(() => {});
  }

  getStats() {
    return {
      messageCount: this._state.messages.length,
      isStreaming: this._state.isStreaming,
      model: this._state.model.label || this._state.model.id,
      thinkingLevel: this._state.thinkingLevel,
    };
  }

  exportMarkdown(): string {
    const lines = ["# Session Export\n"];
    for (const msg of this._state.messages) {
      const role = msg.role || "unknown";
      const content = Array.isArray(msg.content)
        ? msg.content.map((c: any) => c.text || "").join("\n")
        : String(msg.content || "");
      lines.push(`### ${role}\n${content}\n`);
    }
    return lines.join("\n");
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
  systemPrompt = "You are a helpful AI assistant. Use tools when appropriate to read, write, edit files and run commands.";
  thinkingLevel: ThinkingLevel = "off";
  private _tools: AgentTool<any>[] = [
    { name: "read_file", description: "Read file contents", parameters: {} },
    { name: "write_file", description: "Write file contents", parameters: {} },
    { name: "edit_file", description: "Edit file with search/replace", parameters: {} },
    { name: "bash", description: "Execute shell command", parameters: {} },
    { name: "glob", description: "Find files by pattern", parameters: {} },
    { name: "grep", description: "Search file contents", parameters: {} },
    { name: "web_fetch", description: "Fetch web page content", parameters: {} },
  ];
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

  availableModels: { provider: string; id: string; label: string }[] = [
    { provider: "deepseek", id: "deepseek-chat", label: "DeepSeek Chat" },
    { provider: "deepseek", id: "deepseek-reasoner", label: "DeepSeek R1" },
    { provider: "anthropic", id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { provider: "anthropic", id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ];

  async loadModels() {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const models = await res.json();
        if (Array.isArray(models) && models.length > 0) {
          this.availableModels = models;
        }
      }
    } catch {}
  }
}
