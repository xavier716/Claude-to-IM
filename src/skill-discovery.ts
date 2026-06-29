/**
 * Skill auto-discovery + shared memory helpers.
 *
 * Scans the user skills directory at daemon startup and parses each
 * SKILL.md frontmatter description. These descriptions feed the smart
 * task router so it can suggest which skill is most relevant to an
 * incoming message, saving the LLM a find round-trip.
 *
 * The user has 50+ skills. Without this cache, the LLM has to either
 * (a) read every SKILL.md on every turn (expensive) or
 * (b) guess which skill applies (often wrong).
 *
 * Also exposes /skills endpoint for operator inspection.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SkillMeta {
  name: string;            // directory name (e.g. Claude-to-IM-codex)
  description: string;     // parsed from frontmatter, or no description fallback
  path: string;            // absolute path to SKILL.md
  keywords: string[];      // extracted for fast scoring
}

// YAML frontmatter parser — supports the subset used by SKILL.md:
//   - Simple scalar:           key: value
//   - Folded scalar (YAML `>`):  key: >
//                                 continuation line (indented)
//                                 another continuation
//   - Literal scalar (YAML `|`):  key: |
//                                 line 1
//                                 line 2
//   - Nested mappings are NOT supported (none of the user's 144 skills use them)
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---[\s\n]/);
  if (!match) return {};
  const raw = match[1];
  const lines = raw.split('\n');
  const out: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) { i++; continue; }
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    i++;

    // Block scalar indicator: | or > (optionally with chomping marker - / +)
    const blockMatch = val.match(/^([|>])(\+|-)?\s*$/);
    if (blockMatch) {
      const style = blockMatch[1];      // '|' literal, '>' folded
      const chomp = blockMatch[2] || ''; // '-', '+', or ''
      const indentMatch = lines[i]?.match(/^(\s+)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const blockLines: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        // Stop at first line that's empty or less-indented (block ends)
        if (cur.trim() === '' && cur.length === indent) break;
        if (cur.length < indent && cur.trim() !== '') break;
        // Strip the leading indent from the content line
        blockLines.push(cur.slice(indent));
        i++;
      }
      // Fold `>` joins lines with spaces; `|` preserves newlines.
      let joined = style === '>'
        ? blockLines.join(' ')
        : blockLines.join('\n');
      if (chomp === '-') joined = joined.replace(/\n+$/, '');
      else if (chomp !== '+') joined = joined.replace(/\n+$/, ''); // default clip
      out[key] = joined.trim();
      continue;
    }

    // Strip surrounding quotes on simple scalars
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Extract candidate keywords from a description for cheap scoring.
function extractKeywords(description: string): string[] {
  if (!description) return [];
  return description
    .toLowerCase()
    .split(/[\s,;.()\[\]{}|\\/<>!?:`"'\-_=+]+/)
    .filter((w) => w.length >= 3)
    .filter((w) => !/^[\d.]+$/.test(w));
}

let _skillCache: SkillMeta[] | null = null;
let _skillCacheAt = 0;
const SKILL_CACHE_TTL_MS = 5 * 60_000;

export function discoverSkills(forceRefresh = false): SkillMeta[] {
  const now = Date.now();
  if (!forceRefresh && _skillCache && (now - _skillCacheAt) < SKILL_CACHE_TTL_MS) {
    return _skillCache;
  }
  _skillCache = scanSkills();
  _skillCacheAt = now;
  return _skillCache;
}

function scanSkills(): SkillMeta[] {
  const skillsDir = path.join(os.homedir(), '.claude', 'skills');
  const out: SkillMeta[] = [];
  try {
    if (!fs.existsSync(skillsDir)) return out;
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.')) continue;
      const skillMd = path.join(skillsDir, ent.name, 'SKILL.md');
      try {
        if (!fs.existsSync(skillMd)) continue;
        const content = fs.readFileSync(skillMd, 'utf-8');
        const fm = parseFrontmatter(content);
        const desc = fm.description || '(no description)';
        out.push({
          name: ent.name,
          description: desc.slice(0, 500),
          path: skillMd,
          keywords: extractKeywords(desc),
        });
      } catch { /* skip unreadable skill */ }
    }
  } catch { /* skills dir unreadable */ }
  return out;
}

/**
 * Score a message against discovered skills. Returns the top N skill names
 * with scores. Cheap, no LLM call.
 */
export function suggestSkills(message: string, topN = 3): Array<{ name: string; score: number; description: string }> {
  const skills = discoverSkills();
  if (skills.length === 0) return [];
  const lower = message.toLowerCase();
  const scored = skills.map((s) => {
    let score = 0;
    for (const kw of s.keywords) {
      if (lower.includes(kw)) score += 1;
    }
    if (lower.includes(s.name.toLowerCase())) score += 2;
    return { name: s.name, score, description: s.description };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, topN);
}

// ── Shared memory ──────────────────────────────────────────────────────
// Lets Claude-Bot and Codex-Bot share short-lived context via JSON in the
// vault. File is small, per-process write mutex prevents corruption.

import fsPromises from 'node:fs/promises';

const SHARED_MEMORY_FILE = 'shared-memory.json';
const SHARED_MEMORY_MAX_KEYS = 100;

function sharedMemoryPath(): string | null {
  const vaultDir =
    process.env.CTI_VAULT_DIR ||
    (process.platform === 'win32' ? 'D:\\WorkStation\\Obsidian\\AHua' : null);
  if (!vaultDir) return null;
  return path.join(vaultDir, '.claude-to-im-shared', SHARED_MEMORY_FILE);
}

interface SharedMemoryStore {
  entries: Record<string, { value: string; writtenBy: string; writtenAt: string; ttl?: number }>;
}

let _memoryQueue: Promise<void> = Promise.resolve();

export async function sharedMemorySet(key: string, value: string, ttlSec?: number): Promise<void> {
  const file = sharedMemoryPath();
  if (!file) throw new Error('CTI_VAULT_DIR not set; cannot use shared memory');
  _memoryQueue = _memoryQueue.then(async () => {
    await fsPromises.mkdir(path.dirname(file), { recursive: true });
    let store: SharedMemoryStore = { entries: {} };
    try {
      const raw = await fsPromises.readFile(file, 'utf-8');
      store = JSON.parse(raw);
      if (!store.entries) store.entries = {};
    } catch { /* fresh file */ }
    const now = Date.now();
    for (const [k, v] of Object.entries(store.entries)) {
      if (v.ttl && Date.parse(v.writtenAt) + v.ttl * 1000 < now) {
        delete store.entries[k];
      }
    }
    const keys = Object.keys(store.entries);
    if (keys.length >= SHARED_MEMORY_MAX_KEYS && !store.entries[key]) {
      keys.sort((a, b) => Date.parse(store.entries[a].writtenAt) - Date.parse(store.entries[b].writtenAt));
      delete store.entries[keys[0]];
    }
    store.entries[key] = {
      value,
      writtenBy: process.env.CTI_BOT_NAME || 'unknown',
      writtenAt: new Date().toISOString(),
      ...(ttlSec ? { ttl: ttlSec } : {}),
    };
    await fsPromises.writeFile(file, JSON.stringify(store, null, 2), 'utf-8');
  }).catch(() => {});
  return _memoryQueue;
}

export async function sharedMemoryGet(key: string): Promise<string | null> {
  const file = sharedMemoryPath();
  if (!file) return null;
  try {
    const raw = await fsPromises.readFile(file, 'utf-8');
    const store = JSON.parse(raw) as SharedMemoryStore;
    const entry = store.entries?.[key];
    if (!entry) return null;
    if (entry.ttl && Date.parse(entry.writtenAt) + entry.ttl * 1000 < Date.now()) {
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export async function sharedMemoryList(): Promise<Array<{ key: string; value: string; writtenBy: string; writtenAt: string; ttl?: number }>> {
  const file = sharedMemoryPath();
  if (!file) return [];
  try {
    const raw = await fsPromises.readFile(file, 'utf-8');
    const store = JSON.parse(raw) as SharedMemoryStore;
    const now = Date.now();
    return Object.entries(store.entries || {})
      .filter(([, v]) => !v.ttl || Date.parse(v.writtenAt) + v.ttl * 1000 > now)
      .map(([key, v]) => ({ key, ...v }));
  } catch {
    return [];
  }
}