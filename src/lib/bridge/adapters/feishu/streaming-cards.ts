/**
 * Feishu Streaming Card Manager
 *
 * Manages the lifecycle of streaming cards for real-time AI responses,
 * including creation, throttled updates, tool progress tracking, and finalization.
 */

import type { ToolCallInfo } from '../../types.js';
import { CardKitApiClient } from './cardkit-api.js';
import {
  buildStreamingContent,
  buildFinalCardJson,
  formatElapsed,
} from '../../markdown/feishu.js';

/** Streaming card throttle interval (ms). */
const CARD_THROTTLE_MS = 200;

/** State for an active streaming card. */
export interface FeishuCardState {
  messageId: string;
  cardId: string;
  sequence: number;
  startTime: number;
  toolCalls: ToolCallInfo[];
  thinking: boolean;
  pendingText: string | null;
  lastUpdateAt: number;
  throttleTimer: ReturnType<typeof setTimeout> | null;
}

/** Streaming card manager options */
export interface StreamingCardManagerOptions {
  apiClient: CardKitApiClient;
  onSend?: (cardJson: string, replyToMessageId?: string) => Promise<{ ok: boolean; messageId?: string }>;
}

/** Streaming Card Manager */
export class StreamingCardManager {
  private activeCards = new Map<string, FeishuCardState>();
  private cardCreatePromises = new Map<string, Promise<boolean>>();

  constructor(private options: StreamingCardManagerOptions) {}

  /**
   * Get the active card state for a chat.
   */
  getCardState(chatId: string): FeishuCardState | undefined {
    return this.activeCards.get(chatId);
  }

  /**
   * Check if a card creation is in progress.
   */
  isCreatingCard(chatId: string): boolean {
    return this.cardCreatePromises.has(chatId);
  }

  /**
   * Create a new streaming card for a chat.
   */
  async createCard(
    chatId: string,
    replyToMessageId?: string
  ): Promise<{ ok: boolean; messageId?: string }> {
    // Prevent duplicate card creation
    if (this.cardCreatePromises.has(chatId)) {
      console.log(`[streaming-cards] Card creation already in progress for ${chatId}, waiting`);
      return this.cardCreatePromises.get(chatId)!.then(() => {
        const state = this.activeCards.get(chatId);
        return state ? { ok: true, messageId: state.messageId } : { ok: false };
      });
    }

    const createPromise = this._doCreateCard(chatId, replyToMessageId);
    this.cardCreatePromises.set(chatId, createPromise);

    try {
      await createPromise;
      const state = this.activeCards.get(chatId);
      return state ? { ok: true, messageId: state.messageId } : { ok: false };
    } finally {
      this.cardCreatePromises.delete(chatId);
    }
  }

  /**
   * Internal card creation implementation.
   */
  private async _doCreateCard(chatId: string, replyToMessageId?: string): Promise<boolean> {
    const cardBody = {
      config: { wide_screen_mode: true },
      header: {
        template: process.env.FEISHU_CARD_TEMPLATE || 'turquoise',
        title: { content: '💭 Thinking...', tag: 'plain_text' }
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '...' }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '⏳ Starting...' }
        }
      ]
    };

    const cardId = await this.options.apiClient.createCard(cardBody);
    if (!cardId) {
      console.error(`[streaming-cards] Failed to create card for ${chatId}`);
      return false;
    }

    console.log(`[streaming-cards] Created card ${cardId} for ${chatId}`);

    // Send the card to get a message ID
    if (!this.options.onSend) {
      console.error(`[streaming-cards] No onSend handler provided`);
      return false;
    }

    const sendResult = await this.options.onSend(JSON.stringify(cardBody), replyToMessageId);
    if (!sendResult.ok || !sendResult.messageId) {
      console.error(`[streaming-cards] Failed to send card for ${chatId}`);
      return false;
    }

    // Initialize card state
    this.activeCards.set(chatId, {
      messageId: sendResult.messageId,
      cardId,
      sequence: 0,
      startTime: Date.now(),
      toolCalls: [],
      thinking: true,
      pendingText: null,
      lastUpdateAt: Date.now(),
      throttleTimer: null,
    });

    return true;
  }

  /**
   * Update card content with throttling.
   */
  updateContent(chatId: string, text: string): void {
    const state = this.activeCards.get(chatId);
    if (!state) return;

    state.pendingText = text;
    state.thinking = false;

    const elapsed = Date.now() - state.lastUpdateAt;
    if (elapsed < CARD_THROTTLE_MS) {
      if (!state.throttleTimer) {
        state.throttleTimer = setTimeout(() => {
          state.throttleTimer = null;
          this.flushUpdate(chatId);
        }, CARD_THROTTLE_MS - elapsed);
      }
      return;
    }

    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }
    this.flushUpdate(chatId);
  }

  /**
   * Update tool progress in the streaming card.
   */
  updateToolProgress(chatId: string, tools: ToolCallInfo[]): void {
    const state = this.activeCards.get(chatId);
    if (!state) return;
    state.toolCalls = tools;
    this.updateContent(chatId, state.pendingText || '');
  }

  /**
   * Flush pending card update to Feishu API.
   */
  private flushUpdate(chatId: string): void {
    const state = this.activeCards.get(chatId);
    if (!state) return;

    const content = buildStreamingContent(state.pendingText || '', state.toolCalls);

    state.sequence++;
    const seq = state.sequence;
    const messageId = state.messageId;

    // Fire-and-forget — streaming updates are non-critical
    this.options.apiClient.streamCardContent(messageId, content, seq).then(() => {
      state.lastUpdateAt = Date.now();
    }).catch((err: unknown) => {
      console.warn('[streaming-cards] streamContent failed:', err instanceof Error ? err.message : err);
    });
  }

  /**
   * Finalize the streaming card with final content and status.
   */
  async finalizeCard(
    chatId: string,
    status: 'completed' | 'interrupted' | 'error',
    responseText: string,
  ): Promise<boolean> {
    // Wait for in-flight card creation to complete
    const pending = this.cardCreatePromises.get(chatId);
    if (pending) {
      try { await pending; } catch { /* creation failed */ }
    }

    const state = this.activeCards.get(chatId);
    if (!state) return false;

    // Clear any pending throttle timer
    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }

    try {
      // Build and apply final card
      const statusLabels: Record<string, string> = {
        completed: '✅ Completed',
        interrupted: '⚠️ Interrupted',
        error: '❌ Error',
      };
      const elapsedMs = Date.now() - state.startTime;
      const footer = {
        status: statusLabels[status] || status,
        elapsed: formatElapsed(elapsedMs),
      };

      const finalCardJson = buildFinalCardJson(responseText, state.toolCalls, footer);

      state.sequence++;
      await this.options.apiClient.updateCardMessage(state.messageId, finalCardJson);

      console.log(`[streaming-cards] Card finalized: messageId=${state.messageId}, status=${status}, elapsed=${formatElapsed(elapsedMs)}`);
      return true;
    } catch (err) {
      console.warn('[streaming-cards] Card finalize failed:', err instanceof Error ? err.message : err);
      return false;
    } finally {
      this.cleanupCard(chatId);
    }
  }

  /**
   * Clean up card state for a chat.
   */
  cleanupCard(chatId: string): void {
    const state = this.activeCards.get(chatId);
    if (state?.throttleTimer) {
      clearTimeout(state.throttleTimer);
    }
    this.activeCards.delete(chatId);
  }

  /**
   * Clean up all card states.
   */
  cleanupAll(): void {
    for (const [chatId, state] of this.activeCards) {
      if (state.throttleTimer) {
        clearTimeout(state.throttleTimer);
      }
    }
    this.activeCards.clear();
    this.cardCreatePromises.clear();
  }
}
