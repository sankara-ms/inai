import { describe, it, expect } from "vitest";
import {
  chunkText,
  scoreChunk,
  rankChunks,
  shouldIncludeFile,
} from "./contextEngine";
import { IgnoreMatcher } from "./ignoreMatcher";

describe("chunkText", () => {
  it("splits into line-based chunks", () => {
    const text = Array.from({ length: 130 }, (_, i) => `line${i}`).join("\n");
    const chunks = chunkText("a.ts", text, 60);
    expect(chunks.length).toBe(3);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(60);
    expect(chunks[2].endLine).toBe(130);
  });

  it("skips empty chunks", () => {
    const chunks = chunkText("a.ts", "\n\n\n", 60);
    expect(chunks.length).toBe(0);
  });
});

describe("scoreChunk / rankChunks", () => {
  const chunks = [
    { file: "a.ts", startLine: 1, endLine: 1, content: "function login(user) { authenticate(user); }" },
    { file: "b.ts", startLine: 1, endLine: 1, content: "const color = 'red';" },
    { file: "c.ts", startLine: 1, endLine: 1, content: "login login authenticate token" },
  ];

  it("scores relevant chunks higher", () => {
    const s1 = scoreChunk("login authenticate", chunks[0]);
    const s2 = scoreChunk("login authenticate", chunks[1]);
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBe(0);
  });

  it("ranks and limits results", () => {
    const ranked = rankChunks("login authenticate token", chunks, 2);
    expect(ranked.length).toBe(2);
    expect(ranked[0].file).toBe("c.ts");
    expect(ranked.every((r) => r.score > 0)).toBe(true);
  });

  it("returns empty for empty query", () => {
    expect(rankChunks("", chunks)).toEqual([]);
  });
});

describe("shouldIncludeFile", () => {
  it("always skips heavy dirs", () => {
    const m = new IgnoreMatcher();
    expect(shouldIncludeFile("node_modules/x.js", m)).toBe(false);
    expect(shouldIncludeFile(".git/config", m)).toBe(false);
    expect(shouldIncludeFile("dist/out.js", m)).toBe(false);
  });

  it("respects ignore matcher", () => {
    const m = new IgnoreMatcher(["*.log", "secrets/"]);
    expect(shouldIncludeFile("app.log", m)).toBe(false);
    expect(shouldIncludeFile("secrets/key.txt", m)).toBe(false);
    expect(shouldIncludeFile("src/app.ts", m)).toBe(true);
  });
});

describe("IgnoreMatcher", () => {
  it("handles negation", () => {
    const m = new IgnoreMatcher(["*.log", "!keep.log"]);
    expect(m.ignores("a.log")).toBe(true);
    expect(m.ignores("keep.log")).toBe(false);
  });

  it("ignores comments and blanks", () => {
    const m = new IgnoreMatcher(["# comment", "", "*.tmp"]);
    expect(m.ignores("x.tmp")).toBe(true);
    expect(m.ignores("x.ts")).toBe(false);
  });
});
