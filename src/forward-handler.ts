/**
 * Cross-bot message forwarding.
 *
 * Exposes the conversation engine over HTTP so one bot can ask the other
 * to handle a message — used when this bot's LLM fails and the peer is
 * alive.
 *
 * Flow:
 *   1. Other bot sends POST /forward with {text, channelType, chatId, sessionId}
 *   2. We resolve (or create) a ChannelBinding for the chat
 *   3. We invoke processMessage which runs the LLM through the normal path
 *   4. We return the response text + token usage + error info as JSON
 *
 * Why a dedicated module (not inline in main.ts):
 *   - processMessage is already a long function; adding an HTTP wrapper
 *     inline bloats main.ts
 *   - This module has a single responsibility and is easy to test
 *
 * Security note:
 *   - No authentication by default — anyone on localhost can call /forward.
 *   - This is acceptable because the daemon binds 127.0.0.1 only (not 0.0.0.0).
 *   - If you expose the daemon on a network interface, ADD AUTH.
 */

import { getBridgeContext } from './lib/bridge/context.js';
import { processMessage } from './lib/bridge/conversation-engine.js';
import type { ChannelBinding } from './lib/bridge/types.js';
import type { FileAttachment } from './lib/bridge/host.js';

export interface ForwardRequest {
  text: string;
  channelType: string;     // e.g. "feishu"
  chatId: string;          // e.g. "oc_xxx"
  sessionId?: string;      // optional: explicit session to use
  files?: FileAttachment[];
  // How long to wait for the LLM to respond (ms). Default 5 min.
  // The forwarder typically wants a tight timeout — if peer can't answer
  // in N seconds, just give up and surface an error.
  timeoutMs?: number;
}

export interface ForwardResponse {
  ok: boolean;
  responseText?: string;
  tokenUsage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number } | null;
  hasError?: boolean;
  errorMessage?: string;
  elapsedMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Resolve or create a ChannelBinding for a given chat.
 *
 * Mirrors the logic in channel-router.ts but doesn't require a full
 * BridgeContext — this is a slimmed-down version for the forward path.
 */
async function resolveOrCreateBinding(req: ForwardRequest): Promise<ChannelBinding | null> {
  const { store } = getBridgeContext();
  const channelType = req.channelType as ChannelBinding['channelType'];
  const existing = store.getChannelBinding?.(channelType, req.chatId);
  if (existing) return existing;

  // No binding yet — create one with sensible defaults from settings.
  const workDir =
    process.env.CTI_DEFAULT_WORKDIR ||
    store.getSetting?.('bridge_default_work_dir') ||
    process.cwd();
  // JsonFileStore has upsertChannelBinding — use it if available, else
  // bail out (caller can decide whether to retry without a binding).
  if (typeof store.upsertChannelBinding === 'function') {
    const id = `forwarded-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const binding: ChannelBinding = {
      id,
      channelType,
      chatId: req.chatId,
      codepilotSessionId: req.sessionId || id,
      sdkSessionId: '',
      workingDirectory: workDir,
      model: '',
      mode: 'code',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    try {
      store.upsertChannelBinding(binding);
      return binding;
    } catch (err) {
      console.error('[forward-handler] failed to upsert binding:', err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

/**
 * Process a forward request: run the message through the LLM and return
 * the response. Used both by /forward HTTP endpoint and by the auto-fallback
 * logic in conversation-engine.ts.
 */
export async function handleForward(req: ForwardRequest): Promise<ForwardResponse> {
  const start = Date.now();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Outer timeout — protects against the LLM hanging in uninterruptible I/O.
  // The P0-1 hard-kill layer will SIGKILL the daemon if the LLM doesn't
  // honor the abort, so this timeout is best-effort cleanup.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`forward timeout ${timeoutMs}ms`)), timeoutMs);
  timer.unref();

  try {
    const binding = await resolveOrCreateBinding(req);
    if (!binding) {
      return {
        ok: false,
        hasError: true,
        errorMessage: 'could not resolve or create ChannelBinding for this chat',
        elapsedMs: Date.now() - start,
      };
    }

    const result = await processMessage(
      binding,
      req.text,
      undefined,        // onPermissionRequest — peer doesn't grant permissions
      ac.signal,
      req.files,
      undefined,        // onPartialText — no streaming for forward
      undefined,        // onToolEvent
    );

    clearTimeout(timer);

    return {
      ok: !result.hasError,
      responseText: result.responseText || undefined,
      tokenUsage: result.tokenUsage ? {
        input_tokens: result.tokenUsage.input_tokens,
        output_tokens: result.tokenUsage.output_tokens,
        cache_read_input_tokens: result.tokenUsage.cache_read_input_tokens,
      } : null,
      hasError: result.hasError,
      errorMessage: result.errorMessage,
      elapsedMs: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      hasError: true,
      errorMessage: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    };
  }
}