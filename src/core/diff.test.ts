import { describe, it, expect } from "vitest";
import { diffLines, diffStats, renderUnifiedDiff } from "./diff";

describe("diffLines", () => {
  it("detects added and removed lines", () => {
    const lines = diffLines("a\nb\nc", "a\nx\nc");
    expect(lines).toEqual([
      { op: "equal", text: "a" },
      { op: "remove", text: "b" },
      { op: "add", text: "x" },
      { op: "equal", text: "c" },
    ]);
  });

  it("handles pure additions", () => {
    const lines = diffLines("a", "a\nb\nc");
    expect(lines.filter((l) => l.op === "add").map((l) => l.text)).toEqual(["b", "c"]);
  });

  it("handles pure removals", () => {
    const lines = diffLines("a\nb\nc", "a");
    expect(lines.filter((l) => l.op === "remove").map((l) => l.text)).toEqual(["b", "c"]);
  });
});

describe("diffStats", () => {
  it("counts added/removed", () => {
    const stats = diffStats("a\nb\nc", "a\nx\ny\nc");
    expect(stats.removed).toBe(1);
    expect(stats.added).toBe(2);
  });

  it("new file counts all as added", () => {
    const stats = diffStats("", "a\nb");
    expect(stats.added).toBeGreaterThanOrEqual(2);
  });
});

describe("renderUnifiedDiff", () => {
  it("renders +/-/space prefixes", () => {
    const out = renderUnifiedDiff("a\nb", "a\nc");
    expect(out).toContain(" a");
    expect(out).toContain("-b");
    expect(out).toContain("+c");
  });
});
