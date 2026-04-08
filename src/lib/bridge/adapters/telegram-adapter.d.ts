/**
 * Telegram Adapter — implements BaseChannelAdapter for Telegram Bot API.
 *
 * Uses long polling to consume updates, persists offset watermark to DB,
 * and routes messages/callbacks through an internal async queue.
 */
import type { ChannelType, InboundMessage, OutboundMessage, PreviewCapabilities, SendResult } from '../types.js';
import { BaseChannelAdapter } from '../channel-adapter.js';
export declare class TelegramAdapter extends BaseChannelAdapter {
    readonly channelType: ChannelType;
    private running;
    private abortController;
    private queue;
    private waiters;
    private typingIntervals;
    private mediaGroupBuffers;
    /** Chat IDs where sendMessageDraft has permanently failed (method not found / 400 / 404). */
    private previewDegraded;
    /** Committed offset — the highest update_id that has been safely enqueued or skipped. */
    private committedOffset;
    /** In-memory set of recently processed update_ids for idempotency on restart. */
    private recentUpdateIds;
    /** Stable bot user ID from Telegram's getMe, used for offset key identity. */
    private botUserId;
    get botToken(): string;
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    consumeOne(): Promise<InboundMessage | null>;
    send(message: OutboundMessage): Promise<SendResult>;
    answerCallback(callbackQueryId: string, text?: string): Promise<void>;
    validateConfig(): string | null;
    isAuthorized(userId: string, chatId: string): boolean;
    /**
     * Start a typing indicator that fires every 5 seconds.
     */
    startTyping(chatId: string): void;
    /**
     * Stop the typing indicator for a chat.
     */
    stopTyping(chatId: string): void;
    /**
     * Acknowledge that an update has been fully processed by the bridge-manager.
     * Only at this point do we advance the committed offset and persist it.
     * This ensures no message is lost if the process crashes between enqueue and processing.
     */
    acknowledgeUpdate(updateId: number): void;
    getPreviewCapabilities(chatId: string): PreviewCapabilities | null;
    sendPreview(chatId: string, text: string, draftId: number): Promise<'sent' | 'skip' | 'degrade'>;
    endPreview(_chatId: string, _draftId: number): void;
    onMessageStart(chatId: string): void;
    onMessageEnd(chatId: string): void;
    /**
     * Register slash commands with Telegram Bot API so they appear in the menu.
     */
    private registerCommands;
    private enqueue;
    /**
     * Return the DB key used to store the offset, scoped to the bot's stable identity.
     * Uses the bot user ID (from getMe) which survives token rotation.
     * Falls back to the token hash if getMe was not successful.
     */
    private offsetKey;
    /**
     * Resolve the bot's stable user ID via Telegram's getMe API.
     * On first startup with bot-ID-based key, migrates the offset from the
     * old token-hash-based key so no messages are re-fetched.
     */
    private resolveBotIdentity;
    /**
     * Mark an update as safely processed (enqueued or intentionally skipped).
     *
     * Uses contiguous watermark advancement: committedOffset only advances when
     * there are no gaps (e.g., media-group updates still buffered) below it.
     * This prevents offset from jumping past un-flushed album messages.
     */
    private markUpdateProcessed;
    /**
     * Persist the committed offset to DB. Safe to call at any time.
     */
    private persistCommittedOffset;
    private pollLoop;
    /**
     * Check if a Telegram document is a supported image type.
     */
    private isDocumentImage;
    /**
     * Process a single image message (no media_group_id).
     * Downloads the image and enqueues a message with attachments.
     * Sends rejection notifications directly to Telegram on failure.
     */
    private processSingleImageMessage;
    /**
     * Buffer a media group update for debounced processing.
     * Resets the 500ms timer on each new update in the same group.
     */
    private bufferMediaGroup;
    /**
     * Flush a media group buffer — download all images and enqueue a single message.
     */
    private flushMediaGroup;
}
//# sourceMappingURL=telegram-adapter.d.ts.map