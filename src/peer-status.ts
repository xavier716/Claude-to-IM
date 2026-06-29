/**
 * Peer bot heartbeat — lets Claude-Bot and Codex-Bot know if the other
 * instance is alive, so the bridge can offer auto-handoff when one fails.
 *
 * Design:
 *   - Each daemon writes its own heartbeat to <CTI_HOME>/runtime/peer-status.json
 *     with { bot, ok, lastBeat, pid, runtime }.
 *   - The daemon reads the peer's file (different CTI_HOME) and exposes the
 *     peer's status via /peer endpoint.
 *   - When the peer is unreachable for >PEER_TIMEOUT_MS, the local daemon
 *     treats peer as down.
 *
 * Why a file (not HTTP polling):
 *   - Zero network setup, no firewall hassles
 *   - Survives one daemon being offline (last-known status readable)
 *   - Trivially debuggable from the shell
 *
 * Sibling discovery:
 *   - The user's setup pairs ~/.claude-to-im (Claude instance) with
 *     ~/.claude-to-im-codex (Codex instance). These are the only two
 *     expected sibling paths. If a different setup is used, the operator
 *     can override with CTI_PEER_HOME.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface PeerStatus {
  bot: string;
  ok: boolean;
  lastBeat: string;
  pid: number;
  runtime: string;
  port?: number;
}

const PEER_TIMEOUT_MS = 60_000;

function heartbeatFilePath(): string {
  return path.join(process.env.CTI_HOME || '.', 'runtime', 'peer-status.json');
}

/**
 * Compute the sibling daemon's CTI_HOME based on naming convention.
 * Returns null if it can't be inferred (caller falls back to env override).
 *
 * Convention (Windows paths with leading dot for hidden dirs):
 *   C:\Users\DXJJ\.claude-to-im          <-> C:\Users\DXJJ\.claude-to-im-codex
 *   /home/user/.claude-to-im            <-> /home/user/.claude-to-im-codex
 *
 * The leading dot is part of the directory name (hidden dir on POSIX,
 * explicit dot prefix on Windows). Regex matches either form.
 */
function siblingHome(): string | null {
  const override = process.env.CTI_PEER_HOME;
  if (override) return override;

  const our = (process.env.CTI_HOME || '').replace(/[\\/]+$/, '');
  if (!our) return null;

  // Match only the "-codex" tail (keeping the leading "." intact).
  // Paths look like:
  //   C:\Users\DXJJ\.claude-to-im-codex   (we are codex, sibling is claude)
  //   C:\Users\DXJJ\.claude-to-im          (we are claude, sibling is codex)
  //   /home/user/.claude-to-im-codex       (POSIX equivalent)
  //
  // By only matching "-codex$" we preserve the dot prefix in the result.
  const codexTail = /-codex$/;
  const candidates: string[] = [];
  if (codexTail.test(our)) {
    // We are the codex instance — sibling is the same path without "-codex"
    candidates.push(our.replace(codexTail, ''));
  } else {
    // We are the claude instance — sibling is the same path + "-codex"
    candidates.push(our + '-codex');
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* ignore */ }
  }
  return candidates[0] || null;
}

function peerFilePath(): string | null {
  const sib = siblingHome();
  if (!sib) return null;
  return path.join(sib, 'runtime', 'peer-status.json');
}

export function writeHeartbeat(status: PeerStatus): void {
  try {
    const file = heartbeatFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...status, lastBeat: new Date().toISOString() }, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    // Heartbeat failure is not fatal — we just won't be discoverable to peer
  }
}

export function readPeerStatus(): PeerStatus | null {
  const file = peerFilePath();
  if (!file) return null;
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    const lastBeatMs = Date.parse(raw.lastBeat || '');
    const ok = raw.ok === true && Number.isFinite(lastBeatMs) && (Date.now() - lastBeatMs) < PEER_TIMEOUT_MS;
    return { ...raw, ok } as PeerStatus;
  } catch {
    return null;
  }
}

export function selfRuntime(): 'codex' | 'claude' {
  const home = (process.env.CTI_HOME || '').replace(/[\\/]+$/, '');
  if (/[.\\/]claude-to-im-codex$/.test(home)) return 'codex';
  return 'claude';
}