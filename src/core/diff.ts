/**
 * Minimal line-based diff (LCS) used for change previews and stats.
 * Pure and testable.
 */

export type DiffOp = "equal" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  const n = a.length;
  const m = b.length;

  // LCS length table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ op: "remove", text: a[i] });
      i++;
    } else {
      result.push({ op: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) result.push({ op: "remove", text: a[i++] });
  while (j < m) result.push({ op: "add", text: b[j++] });
  return result;
}

export function diffStats(oldText: string, newText: string): DiffStats {
  const lines = diffLines(oldText, newText);
  return {
    added: lines.filter((l) => l.op === "add").length,
    removed: lines.filter((l) => l.op === "remove").length,
  };
}

export function renderUnifiedDiff(oldText: string, newText: string): string {
  return diffLines(oldText, newText)
    .map((l) =>
      l.op === "add" ? `+${l.text}` : l.op === "remove" ? `-${l.text}` : ` ${l.text}`,
    )
    .join("\n");
}
