import * as vscode from "vscode";
import { ChatMessage, ChatMode } from "../types";

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const KEY = "inai.sessions";
const ACTIVE_KEY = "inai.activeSession";
const LEGACY_KEY = "unboundAI.sessions";
const LEGACY_ACTIVE_KEY = "unboundAI.activeSession";

/** Persists chat sessions in workspaceState so history survives reloads. */
export class SessionStore {
  constructor(private readonly state: vscode.Memento) {}

  all(): ChatSession[] {
    const current = this.state.get<ChatSession[]>(KEY);
    if (current !== undefined) return current;
    // Backwards compatibility: fall back to legacy `unboundAI.sessions`.
    return this.state.get<ChatSession[]>(LEGACY_KEY, []);
  }

  activeId(): string | undefined {
    const current = this.state.get<string>(ACTIVE_KEY);
    if (current !== undefined) return current;
    return this.state.get<string>(LEGACY_ACTIVE_KEY);
  }

  async setActive(id: string): Promise<void> {
    await this.state.update(ACTIVE_KEY, id);
  }

  get(id: string): ChatSession | undefined {
    return this.all().find((s) => s.id === id);
  }

  async create(mode: ChatMode = "ask"): Promise<ChatSession> {
    const now = Date.now();
    const session: ChatSession = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: "New chat",
      mode,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    const all = [session, ...this.all()];
    await this.state.update(KEY, all);
    await this.setActive(session.id);
    return session;
  }

  async save(session: ChatSession): Promise<void> {
    session.updatedAt = Date.now();
    if (session.messages.length > 0 && session.title === "New chat") {
      const first = session.messages.find((m) => m.role === "user");
      if (first) session.title = first.content.slice(0, 40);
    }
    const all = this.all().filter((s) => s.id !== session.id);
    await this.state.update(KEY, [session, ...all]);
  }

  async delete(id: string): Promise<void> {
    const all = this.all().filter((s) => s.id !== id);
    await this.state.update(KEY, all);
  }
}
