import { describe, it, expect } from "vitest";
import {
  isInsideWorkspace,
  resolveInWorkspace,
  toWorkspaceRelative,
  PathEscapeError,
} from "./pathUtils";

const root = process.platform === "win32" ? "C:\\ws" : "/ws";

describe("isInsideWorkspace", () => {
  it("accepts files inside the workspace", () => {
    expect(isInsideWorkspace(root, "src/a.ts")).toBe(true);
    expect(isInsideWorkspace(root, "./src/a.ts")).toBe(true);
    expect(isInsideWorkspace(root, "src/nested/deep/a.ts")).toBe(true);
  });

  it("accepts the root itself", () => {
    expect(isInsideWorkspace(root, ".")).toBe(true);
  });

  it("rejects parent traversal", () => {
    expect(isInsideWorkspace(root, "../outside.ts")).toBe(false);
    expect(isInsideWorkspace(root, "src/../../escape.ts")).toBe(false);
  });

  it("rejects absolute paths outside root", () => {
    const outside = process.platform === "win32" ? "C:\\other\\x.ts" : "/other/x.ts";
    expect(isInsideWorkspace(root, outside)).toBe(false);
  });
});

describe("resolveInWorkspace", () => {
  it("resolves valid paths", () => {
    const resolved = resolveInWorkspace(root, "src/a.ts");
    expect(resolved).toContain("a.ts");
  });

  it("throws PathEscapeError on traversal", () => {
    expect(() => resolveInWorkspace(root, "../evil.ts")).toThrow(PathEscapeError);
  });
});

describe("toWorkspaceRelative", () => {
  it("returns posix relative path", () => {
    expect(toWorkspaceRelative(root, "src/a.ts")).toBe("src/a.ts");
  });
});
