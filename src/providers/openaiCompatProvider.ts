import {
  Provider,
  ProviderId,
  ModelInfo,
  StreamChatOptions,
  StreamChunk,
  RateLimitError,
} from "../types";

/**
 * Provider for OpenAI-compatible Chat Completions APIs.
 * Groq and OpenRouter both implement this shape.
 */
export class OpenAICompatProvider implements Provider {
  constructor(
    readonly id: ProviderId,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  supportsToolCalls(): boolean {
    return true;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
    });
    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok) throw new Error(`${this.id} listModels failed: ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => ({ id: m.id, provider: this.id }));
  }

  async *streamChat(opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    const body = {
      model: opts.model,
      messages: opts.messages.map((m) => ({
        role: m.role === "tool" ? "assistant" : m.role,
        content: m.content,
      })),
      temperature: opts.temperature ?? 0.2,
      stream: true,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok || !res.body) {
      throw new Error(`${this.id} streamChat failed: ${res.status}`);
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
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          yield { done: true };
          return;
        }
        try {
          const obj = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        } catch {
          // ignore malformed partial lines
        }
      }
    }
    yield { done: true };
  }
}
