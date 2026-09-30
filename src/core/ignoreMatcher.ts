/**
 * Minimal gitignore-style matcher. Supports the common subset:
 *  - blank lines and `#` comments ignored
 *  - `!` negation
 *  - trailing `/` for directory-only patterns
 *  - `*` and `**` wildcards, leading `/` anchoring
 * Pure and testable; no filesystem access.
 */

interface Rule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

function patternToRegex(pattern: string, anchored: boolean): RegExp {
  // Escape regex specials except the glob ones we handle.
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$+.()[]{}|".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  const prefix = anchored ? "^" : "(^|/)";
  return new RegExp(`${prefix}${re}(/|$)`);
}

export class IgnoreMatcher {
  private rules: Rule[] = [];

  constructor(patterns: string[] = []) {
    for (const raw of patterns) this.add(raw);
  }

  add(raw: string): void {
    let line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.startsWith("/");
    if (anchored) line = line.slice(1);
    this.rules.push({ regex: patternToRegex(line, anchored), negated, dirOnly });
  }

  /** Returns true if the given workspace-relative path should be ignored. */
  ignores(relPath: string, isDir = false): boolean {
    const p = relPath.replace(/\\/g, "/");
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir && !rule.regex.test(p + "/")) {
        // dir-only rules still match files inside the dir via the regex trailing (/|$)
      }
      if (rule.regex.test(p)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }
}
