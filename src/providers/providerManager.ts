import * as vscode from "vscode";
import {
  Provider,
  ProviderId,
  ModelInfo,
  StreamChatOptions,
  StreamChunk,
  RateLimitError,
} from "../types";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAICompatProvider } from "./openaiCompatProvider";
import { GeminiProvider } from "./geminiProvider";
import { getConfigValue } from "../services/config";

const SECRET_PREFIX = "inai.apiKey.";
const LEGACY_SECRET_PREFIX = "unboundAI.apiKey.";

/**
 * Builds providers from configuration + SecretStorage and orchestrates
 * requests, including automatic fallback on HTTP 429.
 */
export class ProviderManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(provider: ProviderId): Promise<string | undefined> {
    const current = await this.secrets.get(SECRET_PREFIX + provider);
    if (current) return current;
    // Backwards compatibility: fall back to a legacy `unboundAI.apiKey.*` key.
    return this.secrets.get(LEGACY_SECRET_PREFIX + provider);
  }

  async setApiKey(provider: ProviderId, key: string): Promise<void> {
    await this.secrets.store(SECRET_PREFIX + provider, key);
  }

  async clearApiKey(provider: ProviderId): Promise<void> {
    await this.secrets.delete(SECRET_PREFIX + provider);
    // Also clear any lingering legacy key so it does not resurface.
    await this.secrets.delete(LEGACY_SECRET_PREFIX + provider);
  }

  /** Construct a Provider instance for the given id, or throw if key missing. */
  async build(provider: ProviderId): Promise<Provider> {
    switch (provider) {
      case "ollama":
        return new OllamaProvider(
          getConfigValue<string>("ollama.baseUrl", "http://localhost:11434"),
          getConfigValue<number>("ollama.numCtx", 16384),
        );
      case "gemini": {
        const key = await this.getApiKey("gemini");
        if (!key) throw new Error("Gemini API key not set. Run: INAI: Set Provider API Key");
        return new GeminiProvider(key);
      }
      case "groq": {
        const key = await this.getApiKey("groq");
        if (!key) throw new Error("Groq API key not set. Run: INAI: Set Provider API Key");
        return new OpenAICompatProvider(
          "groq",
          "https://api.groq.com/openai/v1",
          key,
        );
      }
      case "openrouter": {
        const key = await this.getApiKey("openrouter");
        if (!key) throw new Error("OpenRouter API key not set. Run: INAI: Set Provider API Key");
        return new OpenAICompatProvider(
          "openrouter",
          "https://openrouter.ai/api/v1",
          key,
          {
            "HTTP-Referer": "https://github.com/sankara-ms/inai",
            "X-Title": "INAI",
          },
        );
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  activeProviderId(): ProviderId {
    return getConfigValue<ProviderId>("provider", "ollama");
  }

  fallbackProviderId(): ProviderId | undefined {
    const v = getConfigValue<string>("fallbackProvider", "");
    return v ? (v as ProviderId) : undefined;
  }

  async listModels(providerId?: ProviderId): Promise<ModelInfo[]> {
    const id = providerId ?? this.activeProviderId();
    const provider = await this.build(id);
    return provider.listModels();
  }

  /**
   * Stream a chat completion, transparently falling back to the configured
   * fallback provider if the active one returns 429.
   */
  async *streamChat(opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    const activeId = this.activeProviderId();
    try {
      const provider = await this.build(activeId);
      yield* provider.streamChat(opts);
    } catch (err) {
      if (err instanceof RateLimitError) {
        const fbId = this.fallbackProviderId();
        if (fbId && fbId !== activeId) {
          yield {
            delta: `\n\n_[Rate limited on ${activeId}; falling back to ${fbId}]_\n\n`,
          };
          const fb = await this.build(fbId);
          yield* fb.streamChat(opts);
          return;
        }
      }
      throw err;
    }
  }
}
