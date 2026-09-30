import {
  Provider,
  ProviderId,
  ModelInfo,
  StreamChatOptions,
  StreamChunk,
  RateLimitError,
} from "../types";

/**
 * Local-first provider talking to an Ollama server (default localhost:11434).
 * Uses the /api/chat streaming endpoint (newline-delimited JSON).
 */
export class OllamaProvider implements Provider {
  readonly id: ProviderId = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly numCtx: number,
  ) {}

  supportsToolCalls(): boolean {
    // Ollama supports tools for some models; we advertise true and let the
    // model decide. The agent loop also has a text-fallback parser.
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok) throw new Error(`Ollama listModels failed: ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      provider: this.id,
    }));
  }

  async *streamChat(opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    const body = {
      model: opts.model,
      messages: opts.messages.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: opts.temperature ?? 0.2,
        num_ctx: opts.numCtx ?? this.numCtx,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok || !res.body) {
      throw new Error(`Ollama streamChat failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (obj.message?.content) {
            yield { delta: obj.message.content };
          }
          if (obj.done) {
            yield { done: true };
          }
        } catch {
          // ignore malformed partial lines
        }
      }
    }
    yield { done: true };
  }
}
