import type { AgentEvent, AgentState, AgentTool, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

export class HttpAgent {
  sessionId: string;
  streamFn: any;
  getApiKey: (provider: string) => Promise<string | undefined>;
  private _state: HttpAgentState;
  private listeners: Set<(event: AgentEvent, signal: AbortSignal) => void | Promise<void>> = new Set();
  private abortController: AbortController | null = null;
  private _aborted = false; private _isBtw = false;
  chatPanel?: any;

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
    this._state.errorMessage = undefined;

    await this.emit({ type: "agent_start", sessionId: this.sessionId } as any);

    try {
      const res = await fetch(`/api/session/${this.sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, thinkingLevel: this._state.thinkingLevel || "off" }),
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
    let currentThinkingContent = "";
    let currentContentBlocks = [] as any[];

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
                  content: currentContentBlocks,
                  stopReason: null,
                };
                this._state.addMessage(msg);
                await this.emit({ type: "message_start", message: msg });
                break;
              }
              case "message_update": {
                const deltaEvent = raw.assistantMessageEvent || {};
                const deltaType = deltaEvent.type || "";
                const deltaText = deltaEvent.delta || deltaEvent.text || "";
                const thinkingText = deltaEvent.thinkingDelta || deltaEvent.thinking || "";
                const reasoningText = deltaEvent.reasoningDelta || deltaEvent.reasoning || "";

                let chunkUpdated = false;
                const lastMsg = this._state.messages[this._state.messages.length - 1] as any;

                // Handle thinking/reasoning content
                if (thinkingText || reasoningText) {
                  const think = thinkingText || reasoningText;
                  currentThinkingContent += think;
                  chunkUpdated = true;
                }

                // Handle text content
                if (deltaText) {
                  currentAssistantContent += deltaText;
                  chunkUpdated = true;
                }

                // Build content blocks for ChatPanel (supports ThinkingBlock)
                if (chunkUpdated && lastMsg) {
                  const blocks: any[] = [];
                  if (currentThinkingContent) {
                    blocks.push({ type: "thinking", thinking: currentThinkingContent });
                  }
                  if (currentAssistantContent || (!currentThinkingContent && deltaText)) {
                    blocks.push({ type: "text", text: currentAssistantContent || deltaText });
                  }
                  lastMsg.content = blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
                }

                const updateMsg = lastMsg || { role: "assistant", content: [{ type: "text", text: currentAssistantContent }] };
                await this.emit({
                  type: "message_update",
                  message: updateMsg,
                  text: deltaText || currentAssistantContent,
                  delta: deltaText || currentAssistantContent,
                  thinkingDelta: thinkingText || reasoningText || "",
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
              case "tool_execution_update":
                await this.emit({
                  type: "tool_execution_update",
                  toolCallId: raw.toolCallId || raw.tool_call_id || "",
                  toolName: raw.toolName || raw.tool_name || "",
                  partialResult: raw.partialResult || raw.partial_result || null, args: {},

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
              case "wiki_result":
                await this.emit({
                  type: "wiki_result",
                  query: raw.query || "",
                  results: raw.results || [],
                  total: raw.total || 0,
                } as any);
                break;
              case "memory_result":
                await this.emit({
                  type: "memory_result",
                  query: raw.query || "",
                  memories: raw.memories || [],
                } as any);
                break;
              case "hermes_event":
                await this.emit({
                  type: "hermes_event",
                  platform: raw.platform || "",
                  event: raw.event || "",
                  fromUser: raw.fromUser || raw.from_user || "",
                  message: raw.message || "",
                } as any);
                break;
              case "prompt_chain_event":
                await this.emit({
                  type: "prompt_chain_event",
                  chainName: raw.chainName || raw.chain_name || "",
                  step: raw.step || 0,
                  status: raw.status || "",
                } as any);
                break;
              case "auto_compaction_start":
                break;
              case "auto_compaction_end":
                break;
              case "auto_retry_start":
                break;
              case "auto_retry_end":
                break;
            }
          } catch { }
        }
      }

      if (!messageSent && !this._aborted) {
        const msg: any = { role: "assistant", content: [{ type: "text", text: currentAssistantContent || "(no response)" }] };
        if (this._isBtw) { (msg as any).btw = true; this._isBtw = false; }
        this._state.addMessage(msg);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      this._state.errorMessage = err.message;
      this._state.addMessage({ role: "assistant", content: [{ type: "text", text: `Error: ${err.message}` }], stopReason: "error", errorMessage: err.message });
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
      model: (this._state.model as any).label || (this._state.model as any).id,
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
  currentThinkingContent = "";
  private _tools: any[] = [
    { name: "read_file", description: "Read file contents", parameters: {}, label: "Read File", execute: async () => ({}) },
    { name: "write_file", description: "Write file contents", parameters: {}, label: "Write File", execute: async () => ({}) },
    { name: "edit_file", description: "Edit file with search/replace", parameters: {}, label: "Edit File", execute: async () => ({}) },
    { name: "bash", description: "Execute shell command", parameters: {}, label: "Bash", execute: async () => ({}) },
    { name: "glob", description: "Find files by pattern", parameters: {}, label: "Glob", execute: async () => ({}) },
    { name: "grep", description: "Search file contents", parameters: {}, label: "Grep", execute: async () => ({}) },
    { name: "web_fetch", description: "Fetch web page content", parameters: {}, label: "Web Fetch", execute: async () => ({}) },
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
