import {
  Provider,
  ProviderId,
  ModelInfo,
  StreamChatOptions,
  StreamChunk,
  ChatMessage,
  RateLimitError,
} from "../types";

/**
 * Google Gemini provider using the generateContent streaming REST endpoint.
 * BYOK: API key from SecretStorage.
 */
export class GeminiProvider implements Provider {
  readonly id: ProviderId = "gemini";
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(private readonly apiKey: string) {}

  supportsToolCalls(): boolean {
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok) throw new Error(`Gemini listModels failed: ${res.status}`);
    const data = (await res.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };
    return (data.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        provider: this.id,
      }));
  }

  private toGeminiContents(messages: ChatMessage[]) {
    // Gemini uses "user" and "model" roles; system prompt is merged into the first user turn.
    const systemParts = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    if (systemParts && contents.length > 0) {
      contents[0].parts.unshift({ text: `[System]\n${systemParts}\n\n` });
    }
    return contents;
  }

  async *streamChat(opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    const url =
      `${this.baseUrl}/models/${opts.model}:streamGenerateContent` +
      `?alt=sse&key=${this.apiKey}`;
    const body = {
      contents: this.toGeminiContents(opts.messages),
      generationConfig: { temperature: opts.temperature ?? 0.2 },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (res.status === 429) throw new RateLimitError(this.id);
    if (!res.ok || !res.body) {
      throw new Error(`Gemini streamChat failed: ${res.status}`);
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
        try {
          const obj = JSON.parse(payload) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };
          const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { delta: text };
        } catch {
          // ignore malformed partial lines
        }
      }
    }
    yield { done: true };
  }
}
