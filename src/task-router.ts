/**
 * Smart task router — classify inbound messages by intent and pick the
 * best LLM runtime for the job (Claude vs Codex).
 *
 * Real value: removes the friction of the user manually prefixing every
 * message with `!codex` or `!claude`. Instead, the bridge looks at the
 * message content + any attached files and decides.
 *
 * Algorithm (cheap heuristic, no LLM call — runs on every message):
 *   1. EXPLICIT OVERRIDE: if the message starts with `!codex` / `!claude`,
 *      honor it. Strip the prefix and return the target runtime.
 *   2. FILE HINTS: code files (.ts/.py/.go/.rs/.java) → Codex (better at code).
 *   3. KEYWORD HEURISTIC: code/regex/git/bash keywords → Codex;
 *      writing/reasoning/emotion keywords → Claude.
 *   4. TIE-BREAK: default to Claude (general reasoning model).
 *
 * The classification is logged via console so the user can audit decisions
 * in the bridge log and tune the heuristic if it's wrong on their domain.
 *
 * Tuning: override the keyword lists via env vars
 *   CTI_ROUTER_CODEX_KEYWORDS  (comma-separated, additional code keywords)
 *   CTI_ROUTER_CLAUDE_KEYWORDS (comma-separated, additional reasoning keywords)
 */

export type RouterDecision = {
  runtime: 'codex' | 'claude';
  reason: string;       // human-readable explanation for the log
  confidence: number;   // 0..1 — how sure we are
  strippedPrompt?: string; // if a `!codex` prefix was stripped
};

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|c|cpp|h|hpp|rb|php|sh|bash|zsh|ps1|scala|clj|ex|exs|sql|html|css|scss|vue|svelte|lua|pl|r|dart)\b/i;

const DEFAULT_CODEX_KEYWORDS = [
  'code', 'bug', 'fix', 'refactor', 'implement', 'function', 'class', 'method',
  'compile', 'build', 'test', 'debug', 'git', 'commit', 'merge', 'branch',
  'install', 'package', 'dependency', 'import', 'export', 'module', 'API',
  'regex', 'shell', 'bash', 'cmd', 'powershell', 'docker', 'kubernetes',
  'npm', 'pnpm', 'yarn', 'cargo', 'mvn', 'gradle', 'make', 'cmake',
  'deploy', 'CI', 'CD', 'pipeline', 'lint', 'type', 'error', 'stacktrace',
  'stack trace', 'null pointer', 'undefined', 'NaN', 'race condition',
  'hash', 'encrypt', 'decrypt', 'base64', 'JSON', 'YAML', 'TOML', 'CSV',
  'SQL', 'query', 'database', 'migration', 'schema', 'ORM', 'index',
  'algorithm', 'complexity', 'O(n)', 'O(log', 'recursion', 'iterate',
  '写代码', '改代码', '写函数', '修复', '重构', '编译', '运行',
];

const DEFAULT_CLAUDE_KEYWORDS = [
  'think', 'reason', 'analyze', 'explain', 'summarize', 'summary',
  'opinion', 'perspective', 'view', 'compare', 'contrast', 'evaluate',
  'why', 'how', 'what', 'when', 'where', 'who',
  'write', 'draft', 'essay', 'article', 'blog', 'story', 'poem',
  'translate', '翻译', 'review', 'critique', 'feedback',
  'plan', 'strategy', 'design', 'architect',
  'feel', 'emotion', 'feeling', 'empathy', 'relationship',
  'story', 'narrative', 'persuade', 'argue', 'debate',
  '学习', '思考', '分析', '解释', '总结', '观点', '看法',
  '写作', '翻译', '写文章', '计划', '策略', '设计', '情感',
];

function getAdditionalKeywords(envName: string, base: string[]): string[] {
  const extra = process.env[envName];
  if (!extra) return base;
  return base.concat(extra.split(',').map((s) => s.trim()).filter(Boolean));
}

function countMatches(text: string, keywords: string[]): { count: number; matches: string[] } {
  const lower = text.toLowerCase();
  const matches: string[] = [];
  for (const kw of keywords) {
    // Always escape regex special chars, even in CJK keywords — some of our
    // default code keywords contain parens like "O(log" / "O(n)" which would
    // otherwise produce an invalid regex. Add word boundaries only for
    // pure-ASCII keywords (word boundary doesn't make sense for CJK).
    const escaped = kw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const isAscii = /^[A-Za-z0-9 \-_]+$/.test(kw);
    const re = isAscii ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped, 'i');
    if (re.test(lower)) matches.push(kw);
  }
  return { count: matches.length, matches };
}

export function classifyAndRoute(rawText: string, files: Array<{ name?: string; type?: string }> = []): RouterDecision {
  // 1. Explicit override
  const explicitMatch = rawText.match(/^\s*!(codex|claude)\s+([\s\S]*)$/i);
  if (explicitMatch) {
    return {
      runtime: explicitMatch[1].toLowerCase() as 'codex' | 'claude',
      reason: `explicit !${explicitMatch[1].toLowerCase()} prefix`,
      confidence: 1.0,
      strippedPrompt: explicitMatch[2].trim(),
    };
  }

  // 2. File hints
  const codeFiles = files.filter((f) => f.name && CODE_FILE_RE.test(f.name));
  if (codeFiles.length > 0) {
    return {
      runtime: 'codex',
      reason: `${codeFiles.length} code file(s) attached: ${codeFiles.slice(0, 3).map((f) => f.name).join(', ')}`,
      confidence: 0.85,
    };
  }

  // 3. Keyword heuristic
  const codexKeywords = getAdditionalKeywords('CTI_ROUTER_CODEX_KEYWORDS', DEFAULT_CODEX_KEYWORDS);
  const claudeKeywords = getAdditionalKeywords('CTI_ROUTER_CLAUDE_KEYWORDS', DEFAULT_CLAUDE_KEYWORDS);

  const codexHits = countMatches(rawText, codexKeywords);
  const claudeHits = countMatches(rawText, claudeKeywords);

  const codexScore = codexHits.count;
  const claudeScore = claudeHits.count;

  if (codexScore > claudeScore && codexScore > 0) {
    return {
      runtime: 'codex',
      reason: `code-keyword match: ${codexHits.matches.slice(0, 5).join(', ')} (${codexScore} vs claude ${claudeScore})`,
      confidence: Math.min(1.0, codexScore / (codexScore + claudeScore + 1)),
    };
  }
  if (claudeScore > codexScore && claudeScore > 0) {
    return {
      runtime: 'claude',
      reason: `reasoning-keyword match: ${claudeHits.matches.slice(0, 5).join(', ')} (${claudeScore} vs codex ${codexScore})`,
      confidence: Math.min(1.0, claudeScore / (codexScore + claudeScore + 1)),
    };
  }

  // 4. Tie-break: default to Claude
  return {
    runtime: 'claude',
    reason: 'no strong signal; defaulting to claude (general reasoning)',
    confidence: 0.3,
  };
}