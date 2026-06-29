/**
 * Daemon entry point for claude-to-im-skill.
 *
 * Assembles all DI implementations and starts the bridge.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { initBridgeContext, setLLMProvider, getBridgeContext, hasBridgeContext } from './lib/bridge/context.js';
import * as bridgeManager from './lib/bridge/bridge-manager.js';
// Side-effect import to trigger adapter self-registration
import './lib/bridge/adapters/index.js';
import './adapters/weixin-adapter.js';

import type { LLMProvider } from './lib/bridge/host.js';
import { loadConfig, configToSettings, CTI_HOME, CONFIG_PATH } from './config.js';
import type { Config } from './config.js';
import { JsonFileStore } from './store.js';
import { SDKLLMProvider, resolveClaudeCliPath, preflightCheck } from './llm-provider.js';
import { PendingPermissions } from './permission-gateway.js';
import { setupLogger } from './logger.js';
import { classifyAndRoute } from './task-router.js';
import { writeHeartbeat, readPeerStatus, selfRuntime } from './peer-status.js';
import { discoverSkills, suggestSkills, sharedMemoryList } from './skill-discovery.js';
import { handleForward } from './forward-handler.js';
import { computeCost, type CostResult } from './pricing.js';
import { DASHBOARD_HTML } from './dashboard.js';

const RUNTIME_DIR = path.join(CTI_HOME, 'runtime');
const STATUS_FILE = path.join(RUNTIME_DIR, 'status.json');
const PID_FILE = path.join(RUNTIME_DIR, 'bridge.pid');

/**
 * Resolve the LLM provider based on the runtime setting.
 * - 'claude' (default): uses Claude Code SDK via SDKLLMProvider
 * - 'codex': uses @openai/codex-sdk via CodexProvider
 * - 'auto': tries Claude first, falls back to Codex
 */
async function resolveProvider(config: Config, pendingPerms: PendingPermissions): Promise<LLMProvider> {
  const runtime = config.runtime;

  if (runtime === 'codex') {
    const { CodexProvider } = await import('./codex-provider.js');
    return new CodexProvider(pendingPerms);
  }

  if (runtime === 'auto') {
    const cliPath = resolveClaudeCliPath();
    if (cliPath) {
      // Auto mode: preflight the resolved CLI before committing to it.
      const check = preflightCheck(cliPath);
      if (check.ok) {
        console.log(`[claude-to-im] Auto: using Claude CLI at ${cliPath} (${check.version})`);
        return new SDKLLMProvider(pendingPerms, cliPath, config.autoApprove);
      }
      // Preflight failed — fall through to Codex instead of silently using a broken CLI
      console.warn(
        `[claude-to-im] Auto: Claude CLI at ${cliPath} failed preflight: ${check.error}\n` +
        `  Falling back to Codex.`,
      );
    } else {
      console.log('[claude-to-im] Auto: Claude CLI not found, falling back to Codex');
    }
    const { CodexProvider } = await import('./codex-provider.js');
    return new CodexProvider(pendingPerms);
  }

  // Default: claude
  const cliPath = resolveClaudeCliPath();
  if (!cliPath) {
    console.error(
      '[claude-to-im] FATAL: Cannot find the `claude` CLI executable.\n' +
      '  Tried: CTI_CLAUDE_CODE_EXECUTABLE env, /usr/local/bin/claude, /opt/homebrew/bin/claude, ~/.npm-global/bin/claude, ~/.local/bin/claude\n' +
      '  Fix: Install Claude Code CLI (https://docs.anthropic.com/en/docs/claude-code) or set CTI_CLAUDE_CODE_EXECUTABLE=/path/to/claude\n' +
      '  Or: Set CTI_RUNTIME=codex to use Codex instead',
    );
    process.exit(1);
  }

  // Preflight: verify the CLI can actually run in the daemon environment.
  // In claude runtime this is fatal — starting with a broken CLI would just
  // defer the error to the first user message, which is harder to diagnose.
  const check = preflightCheck(cliPath);
  if (check.ok) {
    console.log(`[claude-to-im] CLI preflight OK: ${cliPath} (${check.version})`);
  } else {
    console.error(
      `[claude-to-im] FATAL: Claude CLI preflight check failed.\n` +
      `  Path: ${cliPath}\n` +
      `  Error: ${check.error}\n` +
      `  Fix:\n` +
      `    1. Install Claude Code CLI >= 2.x: https://docs.anthropic.com/en/docs/claude-code\n` +
      `    2. Or set CTI_CLAUDE_CODE_EXECUTABLE=/path/to/correct/claude\n` +
      `    3. Or set CTI_RUNTIME=auto to fall back to Codex`,
    );
    process.exit(1);
  }

  return new SDKLLMProvider(pendingPerms, cliPath, config.autoApprove);
}

interface StatusInfo {
  running: boolean;
  pid?: number;
  runId?: string;
  startedAt?: string;
  channels?: string[];
  lastExitReason?: string;
}

// Module-level references so health/stats endpoints can read runtime config
// without re-parsing config.env on every request.
let _runtimeConfig: Config | undefined;
let _pendingPerms: PendingPermissions | undefined;

function writeStatus(info: StatusInfo): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  // Merge with existing status to preserve fields like lastExitReason
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')); } catch { /* first write */ }
  const merged = { ...existing, ...info };
  const tmp = STATUS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf-8');
  fs.renameSync(tmp, STATUS_FILE);
}

// Module-level reference so the heartbeat setInterval can read the bound port.
let ACTUAL_PORT = 0;

async function main(): Promise<void> {
  const config = loadConfig();
  _runtimeConfig = config;
  _pendingPerms = new PendingPermissions();

  // Set Claude Code executable path from config to environment variable
  // This is needed because llm-provider.ts reads from process.env
  const env = Object.fromEntries(
    fs.readFileSync(CONFIG_PATH, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) return [];
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        // Strip quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
      .filter(([key]) => key)
  );
  if (env.CTI_CLAUDE_CODE_EXECUTABLE) {
    process.env.CTI_CLAUDE_CODE_EXECUTABLE = env.CTI_CLAUDE_CODE_EXECUTABLE;
    console.log(`[claude-to-im] Using Claude Code from: ${env.CTI_CLAUDE_CODE_EXECUTABLE}`);
  } else {
    console.log('[claude-to-im] CTI_CLAUDE_CODE_EXECUTABLE not found in config');
  }

  // Also set CLAUDE_CODE_GIT_BASH_PATH for Windows
  if (env.CLAUDE_CODE_GIT_BASH_PATH) {
    process.env.CLAUDE_CODE_GIT_BASH_PATH = env.CLAUDE_CODE_GIT_BASH_PATH;
    console.log(`[claude-to-im] Using Git Bash from: ${env.CLAUDE_CODE_GIT_BASH_PATH}`);
  } else if (process.platform === 'win32') {
    console.log('[claude-to-im] WARNING: CLAUDE_CODE_GIT_BASH_PATH not found in config, Claude Code may fail on Windows');
  }

  setupLogger();

  const runId = crypto.randomUUID();
  console.log(`[claude-to-im] Starting bridge (run_id: ${runId})`);

  const settings = configToSettings(config);
  const store = new JsonFileStore(settings);
  const pendingPerms = _pendingPerms!;
  const llm = await resolveProvider(config, pendingPerms);
  console.log(`[claude-to-im] Runtime: ${config.runtime}`);

  const gateway = {
    resolvePendingPermission: (id: string, resolution: { behavior: 'allow' | 'deny'; message?: string }) =>
      pendingPerms.resolve(id, resolution),
  };

  initBridgeContext({
    store,
    llm,
    permissions: gateway,
    lifecycle: {
      onBridgeStart: () => {
        // Write authoritative PID from the actual process (not shell $!)
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
        writeStatus({
          running: true,
          pid: process.pid,
          runId,
          startedAt: new Date().toISOString(),
          channels: config.enabledChannels,
        });
        console.log(`[claude-to-im] Bridge started (PID: ${process.pid}, channels: ${config.enabledChannels.join(', ')})`);
      },
      onBridgeStop: () => {
        writeStatus({ running: false });
        console.log('[claude-to-im] Bridge stopped');
      },
    },
  });

  await bridgeManager.start();

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const reason = signal ? `signal: ${signal}` : 'shutdown requested';
    console.log(`[claude-to-im] Shutting down (${reason})...`);
    pendingPerms.denyAll();
    await bridgeManager.stop();
    writeStatus({ running: false, lastExitReason: reason });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // ── Exit diagnostics ──
  process.on('unhandledRejection', (reason) => {
    console.error('[claude-to-im] unhandledRejection:', reason instanceof Error ? reason.stack || reason.message : reason);
    writeStatus({ running: false, lastExitReason: `unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}` });
  });
  process.on('uncaughtException', (err) => {
    console.error('[claude-to-im] uncaughtException:', err.stack || err.message);
    writeStatus({ running: false, lastExitReason: `uncaughtException: ${err.message}` });
    process.exit(1);
  });
  process.on('beforeExit', (code) => {
    console.log(`[claude-to-im] beforeExit (code: ${code})`);
  });
  process.on('exit', (code) => {
    console.log(`[claude-to-im] exit (code: ${code})`);
  });

  // ── Heartbeat to keep event loop alive ──
  // setInterval is ref'd by default, preventing Node from exiting
  // when the event loop would otherwise be empty.
  setInterval(() => { /* keepalive */ }, 45_000);

  // [R3-3] Peer heartbeat: write our own heartbeat every 30s so the sibling
  // daemon can see we're alive. Peer reads it via /peer endpoint.
  setInterval(() => {
    writeHeartbeat({
      bot: process.env.CTI_BOT_NAME || (selfRuntime() === 'codex' ? 'Codex-Bot' : 'Claude-Bot'),
      ok: true,
      lastBeat: new Date().toISOString(),
      pid: process.pid,
      runtime: selfRuntime(),
      port: ACTUAL_PORT,
    });
  }, 30_000);

  // Start HTTP health/stats/server (real observability surface)
  startHealthServer();
}

// ── HTTP health server ────────────────────────────────────────────────────
// Exposes /healthz (liveness), /stats (token usage + cost), /config (sanitized
// runtime config), /peer (sibling heartbeat), /skills (auto-discovery),
// /memory (cross-bot shared memory), /switch + /route (runtime ops).
// Default port 7823. Per-instance offset via CTI_HEALTH_PORT_BASE so the
// Codex instance (base=1000) and Claude instance (base=0) don't collide.
import http from 'node:http';

interface HealthSnapshot {
  ok: boolean;
  pid: number;
  startedAt: string;
  uptimeSec: number;
  channels: string[];
  adapterStates: Array<{ channelType: string; running: boolean }>;
  pendingPermissions: number;
}

function buildHealthSnapshot(): HealthSnapshot {
  const ctx = hasBridgeContext() ? getBridgeContext() : undefined;
  const adapters = (() => {
    try { return bridgeManager.getStatus().adapters || []; } catch { return []; }
  })();
  return {
    ok: adapters.some((a: any) => a.running),
    pid: process.pid,
    startedAt: tryReadStartedAt(),
    uptimeSec: Math.round(process.uptime()),
    channels: _runtimeConfig?.enabledChannels || [],
    adapterStates: adapters.map((a: any) => ({ channelType: a.channelType, running: a.running })),
    pendingPermissions: ctx?.permissions && (ctx.permissions as any).size !== undefined ? (ctx.permissions as any).size : 0,
  };
}

function tryReadStartedAt(): string {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')).startedAt || new Date().toISOString(); }
  catch { return new Date().toISOString(); }
}

// Module-level so the /switch and /peer handlers can read the actual bound
// port. Set inside startHealthServer once server.listen fires.
function startHealthServer(): void {
  const port = parseInt(process.env.CTI_HEALTH_PORT || "7823", 10);
  if (!Number.isFinite(port) || port === 0) {
    console.log('[claude-to-im] Health server disabled (CTI_HEALTH_PORT=0)');
    return;
  }
  const baseOffset = parseInt(process.env.CTI_HEALTH_PORT_BASE || (_runtimeConfig?.runtime === 'codex' ? '1000' : '0'), 10);
  const actualPort = port + baseOffset;
  ACTUAL_PORT = actualPort;
  ACTUAL_PORT = actualPort;

  const server = http.createServer((req, res) => {
    // Strip query string for exact route matching.
    const rawUrl = req.url || '/';
    const queryIdx = rawUrl.indexOf('?');
    const url = queryIdx === -1 ? rawUrl : rawUrl.slice(0, queryIdx);
    // POST endpoints; everything else must be GET/HEAD.
    const isPostEndpoint = url === '/switch' || url === '/route' || url === '/forward';
    if (!isPostEndpoint && req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (isPostEndpoint && req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `use POST for ${url}` }));
      return;
    }

    if (url === '/healthz' || url === '/health') {
      const snap = buildHealthSnapshot();
      res.writeHead(snap.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snap, null, 2));
      return;
    }
    if (url === '/stats') {
      const stats = collectStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
      return;
    }
    if (url === '/config') {
      const safe = {
        runtime: _runtimeConfig?.runtime,
        channels: _runtimeConfig?.enabledChannels,
        botName: process.env.CTI_BOT_NAME,
        autoApprove: _runtimeConfig?.autoApprove,
        workDir: _runtimeConfig?.defaultWorkDir,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(safe, null, 2));
      return;
    }
    if (url === '/switch' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const params = new URLSearchParams(body);
          const target = params.get('runtime');
          if (!target || (target !== 'codex' && target !== 'claude' && target !== 'auto')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'runtime must be codex|claude|auto' }));
            return;
          }
          const switched = await switchRuntime(target as 'codex' | 'claude' | 'auto');
          res.writeHead(switched.ok ? 200 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(switched, null, 2));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }
    if (url === '/route' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const params = new URLSearchParams(body);
          const text = params.get('text') || '';
          const decision = classifyAndRoute(text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ input: text.slice(0, 200), decision }, null, 2));
        } catch (err) {
          console.error('[main] /route handler error:', err instanceof Error ? err.stack || err.message : err);
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          } catch { /* response already sent */ }
        }
      });
      return;
    }
    if (url === '/peer') {
      const peer = readPeerStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        self: { runtime: selfRuntime(), ok: true, pid: process.pid },
        peer: peer ?? { ok: false, note: 'no peer heartbeat found (sibling daemon may not be running)' },
      }, null, 2));
      return;
    }
    if (url === '/skills') {
      const urlObj = new URL(req.url || '/', `http://127.0.0.1:${actualPort}`);
      const suggestText = urlObj.searchParams.get('suggest');
      if (suggestText) {
        const suggestions = suggestSkills(suggestText);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ query: suggestText.slice(0, 200), suggestions }, null, 2));
        return;
      }
      const skills = discoverSkills().map((s) => ({
        name: s.name,
        description: s.description.slice(0, 200),
        keywordCount: s.keywords.length,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: skills.length, skills }, null, 2));
      return;
    }
    if (url === '/memory') {
      sharedMemoryList().then((entries) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: entries.length, entries }, null, 2));
      }).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
      return;
    }
    if (url === '/dashboard' || url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
      return;
    }
    if (url === '/forward' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const response = await handleForward(payload);
          const status = response.ok ? 200 : (response.hasError ? 502 : 400);
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, hasError: true, errorMessage: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', available: ['/healthz', '/stats', '/config', '/peer', '/skills', '/memory', '/switch', '/route', '/forward', '/dashboard'] }));
  });
  server.on('error', (err) => {
    if ((err as any).code === 'EADDRINUSE') {
      console.warn(`[claude-to-im] Health port ${actualPort} in use; skipping`);
    } else {
      console.error('[claude-to-im] Health server error:', err);
    }
  });
  server.listen(actualPort, '127.0.0.1', () => {
    console.log(`[claude-to-im] Health server listening on http://127.0.0.1:${actualPort}/healthz`);
  });
}

async function switchRuntime(target: 'codex' | 'claude' | 'auto'): Promise<{
  ok: boolean;
  from: string;
  to: string;
  error?: string;
}> {
  if (!_pendingPerms) throw new Error('daemon not yet initialized');
  const from = hasBridgeContext() ? ((getBridgeContext().llm as any).constructor?.name || 'unknown') : 'unknown';
  try {
    let newLLM: LLMProvider;
    if (target === 'codex') {
      const { CodexProvider } = await import('./codex-provider.js');
      newLLM = new CodexProvider(_pendingPerms);
    } else if (target === 'claude') {
      const { resolveClaudeCliPath, preflightCheck } = await import('./llm-provider.js');
      const cliPath = resolveClaudeCliPath();
      if (!cliPath) throw new Error('Claude CLI not found on PATH; cannot switch to claude');
      const check = preflightCheck(cliPath);
      if (!check.ok) throw new Error(`Claude CLI preflight failed: ${check.error}`);
      const { SDKLLMProvider } = await import('./llm-provider.js');
      newLLM = new SDKLLMProvider(_pendingPerms, cliPath, _runtimeConfig?.autoApprove);
    } else {
      // 'auto' — try Claude first, fall back to Codex
      const { resolveClaudeCliPath, preflightCheck } = await import('./llm-provider.js');
      const cliPath = resolveClaudeCliPath();
      if (cliPath && preflightCheck(cliPath).ok) {
        const { SDKLLMProvider } = await import('./llm-provider.js');
        newLLM = new SDKLLMProvider(_pendingPerms, cliPath, _runtimeConfig?.autoApprove);
      } else {
        const { CodexProvider } = await import('./codex-provider.js');
        newLLM = new CodexProvider(_pendingPerms);
      }
    }
    setLLMProvider(newLLM);
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(path.join(RUNTIME_DIR, 'runtime-override'), target, 'utf-8');
    console.log(`[claude-to-im] Hot-switched runtime: ${from} -> ${target}`);
    return { ok: true, from, to: target };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[claude-to-im] Runtime switch failed (${from} -> ${target}):`, msg);
    return { ok: false, from, to: target, error: msg };
  }
}

/**
 * Aggregate token usage + per-channel message counts for the /stats endpoint.
 */
function collectStats(): {
  totalInbound: number;
  totalOutbound: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalErrors: number;
  totalCostUSD: number;
  costByModel: Record<string, { costUSD: number; tokens: { input: number; output: number }; isKnown: boolean }>;
  perChannel: Record<string, { inbound: number; outbound: number }>;
  perChat: Array<{ chatId: string; messages: number; lastAt?: string }>;
} {
  let totalInbound = 0;
  let totalOutbound = 0;
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let totalErrors = 0;
  let totalCostUSD = 0;
  const costByModel: Record<string, { costUSD: number; tokens: { input: number; output: number }; isKnown: boolean }> = {};
  const perChannel: Record<string, { inbound: number; outbound: number }> = {};
  const perChatMap = new Map<string, { messages: number; lastAt?: string }>();

  try {
    const auditPath = path.join(CTI_HOME, 'data', 'audit.json');
    if (fs.existsSync(auditPath)) {
      const entries = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const dir = e.direction === 'inbound' ? 'inbound' : (e.direction === 'outbound' ? 'outbound' : null);
          if (!dir) continue;
          const ch = e.channelType || 'unknown';
          if (!perChannel[ch]) perChannel[ch] = { inbound: 0, outbound: 0 };
          perChannel[ch][dir]++;
          if (dir === 'inbound') totalInbound++; else totalOutbound++;
          if (typeof e.summary === 'string' && (e.summary.includes('Error') || e.summary.startsWith('<b>Error'))) {
            totalErrors++;
          }
          if (e.chatId) {
            const k = e.chatId;
            const cur = perChatMap.get(k) || { messages: 0 };
            cur.messages++;
            if (!cur.lastAt || (e.createdAt && e.createdAt > cur.lastAt)) cur.lastAt = e.createdAt;
            perChatMap.set(k, cur);
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Walk session JSON files for token totals (R3-0)
  try {
    const msgsDir = path.join(CTI_HOME, 'data', 'messages');
    if (fs.existsSync(msgsDir)) {
      for (const f of fs.readdirSync(msgsDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const arr = JSON.parse(fs.readFileSync(path.join(msgsDir, f), 'utf-8'));
          if (!Array.isArray(arr)) continue;
          for (const m of arr) {
            if (m && m.tokenUsage) {
              try {
                const u = typeof m.tokenUsage === 'string' ? JSON.parse(m.tokenUsage) : m.tokenUsage;
                const input = u.input_tokens || u.input || 0;
                const output = u.output_tokens || u.output || 0;
                totalTokensInput += input;
                totalTokensOutput += output;
                // R6-2: Cost aggregation
                const model = u.model || m.model || _runtimeConfig?.defaultModel || 'unknown';
                const cost = computeCost(model, u);
                if (!costByModel[model]) {
                  costByModel[model] = { costUSD: 0, tokens: { input: 0, output: 0 }, isKnown: cost.isKnown };
                }
                costByModel[model].tokens.input += input;
                costByModel[model].tokens.output += output;
                if (cost.isKnown) {
                  costByModel[model].costUSD += cost.totalCost;
                  costByModel[model].isKnown = true;
                  totalCostUSD += cost.totalCost;
                }
              } catch { /* malformed, skip */ }
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* ignore */ }

  const perChat = Array.from(perChatMap.entries())
    .map(([chatId, v]) => ({ chatId, ...v }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 10);

  return { totalInbound, totalOutbound, totalTokensInput, totalTokensOutput, totalErrors, totalCostUSD, costByModel, perChannel, perChat };
}

main().catch((err) => {
  console.error('[claude-to-im] Fatal error:', err instanceof Error ? err.stack || err.message : err);
  try { writeStatus({ running: false, lastExitReason: `fatal: ${err instanceof Error ? err.message : String(err)}` }); } catch { /* ignore */ }
  process.exit(1);
});
