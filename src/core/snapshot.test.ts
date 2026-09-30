import { describe, it, expect } from "vitest";
import { createSnapshot, planRevert } from "./snapshot";

describe("createSnapshot", () => {
  it("captures files with a unique id and timestamp", () => {
    const snap = createSnapshot(
      "Edit foo",
      [{ path: "src/foo.ts", before: "old" }],
      1000,
    );
    expect(snap.label).toBe("Edit foo");
    expect(snap.timestamp).toBe(1000);
    expect(snap.id.startsWith("1000-")).toBe(true);
    expect(snap.files).toHaveLength(1);
  });
});

describe("planRevert", () => {
  it("restores prior contents for modified files", () => {
    const snap = createSnapshot("edit", [
      { path: "a.ts", before: "original a" },
      { path: "b.ts", before: "original b" },
    ]);
    const actions = planRevert(snap);
    expect(actions).toEqual([
      { path: "a.ts", content: "original a" },
      { path: "b.ts", content: "original b" },
    ]);
  });

  it("plans deletion for files that did not exist before (before=null)", () => {
    const snap = createSnapshot("create", [{ path: "new.ts", before: null }]);
    const actions = planRevert(snap);
    expect(actions).toEqual([{ path: "new.ts", content: null }]);
  });

  it("mixes restore and delete actions", () => {
    const snap = createSnapshot("mixed", [
      { path: "kept.ts", before: "was here" },
      { path: "created.ts", before: null },
    ]);
    const actions = planRevert(snap);
    expect(actions[0].content).toBe("was here");
    expect(actions[1].content).toBeNull();
  });
});
