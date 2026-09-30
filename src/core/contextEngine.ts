import { IgnoreMatcher } from "./ignoreMatcher";

/**
 * Context engine: splits file contents into chunks and ranks them against a
 * query using a lightweight TF-based scorer. Pure logic (no VS Code / fs) so
 * it is fully unit-testable. The extension host wires it to real files.
 */

export interface Chunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface RankedChunk extends Chunk {
  score: number;
}

/** Split text into line-based chunks of up to `maxLines` lines. */
export function chunkText(
  file: string,
  text: string,
  maxLines = 60,
): Chunk[] {
  const lines = text.split(/\r?\n/);
  const chunks: Chunk[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    const slice = lines.slice(i, i + maxLines);
    if (slice.join("").trim() === "") continue;
    chunks.push({
      file,
      startLine: i + 1,
      endLine: Math.min(i + maxLines, lines.length),
      content: slice.join("\n"),
    });
  }
  return chunks;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

/** Score a chunk against query tokens using term-frequency overlap. */
export function scoreChunk(query: string, chunk: Chunk): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const cTokens = tokenize(chunk.content);
  if (cTokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of cTokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  let score = 0;
  const seen = new Set<string>();
  for (const q of qTokens) {
    const c = counts.get(q) ?? 0;
    if (c > 0) {
      // diminishing returns per repeated token
      score += 1 + Math.log(1 + c);
      seen.add(q);
    }
  }
  // reward coverage of distinct query terms
  const coverage = seen.size / new Set(qTokens).size;
  return score * (0.5 + 0.5 * coverage);
}

/** Rank chunks by relevance to query, returning the top `k`. */
export function rankChunks(
  query: string,
  chunks: Chunk[],
  k = 10,
): RankedChunk[] {
  return chunks
    .map((c) => ({ ...c, score: scoreChunk(query, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Decide whether a workspace-relative path should be included in context,
 * honoring the combined ignore matcher.
 */
export function shouldIncludeFile(
  relPath: string,
  matcher: IgnoreMatcher,
): boolean {
  // Always skip common binary/heavy dirs even without ignore files.
  const alwaysSkip = [
    "node_modules/",
    ".git/",
    "dist/",
    "out/",
    ".unbound/",
  ];
  const p = relPath.replace(/\\/g, "/");
  if (alwaysSkip.some((s) => p.startsWith(s) || p.includes("/" + s))) {
    return false;
  }
  return !matcher.ignores(p);
}
