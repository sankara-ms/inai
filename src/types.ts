// Shared types across the extension.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  /** Optional tool call name that produced this message (role === "tool"). */
  toolName?: string;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  /** Optional context window size in tokens, if known. */
  contextLength?: number;
}

export type ProviderId = "ollama" | "gemini" | "groq" | "openrouter";

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** num_ctx for Ollama; other providers ignore. */
  numCtx?: number;
  signal?: AbortSignal;
  /** Tool definitions the model may call. */
  tools?: ToolSchema[];
}

/** A streamed chunk from a provider. */
export interface StreamChunk {
  /** Text delta. */
  delta?: string;
  /** Tool call requested by the model. */
  toolCall?: ToolCallRequest;
  done?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON-schema-ish parameter description. */
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Provider abstraction: every provider implements this. */
export interface Provider {
  readonly id: ProviderId;
  listModels(): Promise<ModelInfo[]>;
  streamChat(opts: StreamChatOptions): AsyncIterable<StreamChunk>;
  /** Whether this provider natively supports tool/function calling. */
  supportsToolCalls(): boolean;
}

/** Raised when a provider is rate limited (HTTP 429). */
export class RateLimitError extends Error {
  constructor(
    public readonly provider: ProviderId,
    message = "Rate limited",
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export type ChatMode = "ask" | "edit" | "agent";
