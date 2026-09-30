/**
 * Command safety classifier for the agent terminal tool.
 * Classifies a shell command into SAFE, REVIEW, or DANGEROUS so the UI can
 * gate execution with the appropriate level of user control.
 */

export type SafetyLevel = "SAFE" | "REVIEW" | "DANGEROUS";

export interface Classification {
  level: SafetyLevel;
  reason: string;
}

/** Read-only / clearly harmless command prefixes. */
const SAFE_PREFIXES = [
  "ls",
  "dir",
  "cat",
  "type",
  "echo",
  "pwd",
  "whoami",
  "node --version",
  "npm --version",
  "git status",
  "git diff",
  "git log",
  "git branch",
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run build",
  "vitest",
  "tsc",
];

/** Patterns that are outright dangerous / destructive. */
const DANGEROUS_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+-rf?\b/, reason: "Recursive/forced deletion" },
  { re: /\brmdir\b/, reason: "Directory removal" },
  { re: /\bdel\s+\/[sq]/i, reason: "Recursive Windows delete" },
  { re: /\bformat\b/i, reason: "Disk format" },
  { re: /\bmkfs\b/, reason: "Filesystem creation" },
  { re: /\bdd\s+if=/, reason: "Raw disk write" },
  { re: /:\(\)\s*\{.*\};:/, reason: "Fork bomb" },
  { re: /\bgit\s+push\b.*--force|\bgit\s+push\b.*\s-f\b/, reason: "Force push" },
  { re: /\bgit\s+reset\s+--hard\b/, reason: "Hard reset" },
  { re: /\bgit\s+clean\s+-[a-z]*f/, reason: "Force clean" },
  { re: /\bshutdown\b|\breboot\b/, reason: "System power control" },
  { re: /\bchmod\s+-R\b|\bchown\s+-R\b/, reason: "Recursive permission change" },
  { re: /\bcurl\b.*\|\s*(sh|bash)\b/, reason: "Pipe remote script to shell" },
  { re: /\bwget\b.*\|\s*(sh|bash)\b/, reason: "Pipe remote script to shell" },
  { re: /\bsudo\b/, reason: "Elevated privileges" },
  { re: /\bnpm\s+publish\b/, reason: "Package publish" },
  { re: />\s*\/dev\/sd/, reason: "Write to block device" },
];

export function classifyCommand(command: string): Classification {
  const cmd = command.trim();
  if (!cmd) return { level: "SAFE", reason: "Empty command" };

  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(cmd)) return { level: "DANGEROUS", reason };
  }

  // Chaining/substitution escalates to REVIEW *before* the SAFE shortcut so a
  // benign-looking prefix (e.g. "echo hi && rm file") cannot smuggle in a
  // second unreviewed command.
  if (/[;&|]|\$\(|`/.test(cmd)) {
    return { level: "REVIEW", reason: "Contains chaining/substitution" };
  }

  const lower = cmd.toLowerCase();
  for (const prefix of SAFE_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix + " ")) {
      return { level: "SAFE", reason: `Recognized safe command: ${prefix}` };
    }
  }

  return { level: "REVIEW", reason: "Unrecognized command; manual review advised" };
}
