/**
 * Discord Adapter — implements BaseChannelAdapter for Discord Bot API.
 *
 * Uses discord.js v14 Client with Gateway intents for real-time message
 * consumption, and REST API for message sending. Routes messages through
 * an internal async queue (same pattern as Telegram and Feishu).
 *
 * IMPORTANT: discord.js is loaded via dynamic import() to avoid Next.js
 * bundler trying to resolve native modules (zlib-sync, bufferutil) at
 * build time. All discord.js types are referenced via `any` at the class
 * level and resolved at runtime in start().
 */
import type { ChannelType, InboundMessage, OutboundMessage, PreviewCapabilities, SendResult } from '../types.js';
import { BaseChannelAdapter } from '../channel-adapter.js';
export declare class DiscordAdapter extends BaseChannelAdapter {
    readonly channelType: ChannelType;
    private running;
    private client;
    private queue;
    private waiters;
    private seenMessageIds;
    private botUserId;
    private typingIntervals;
    /** Temporary storage for Interaction objects (for answerCallback). */
    private pendingInteractions;
    /** Preview: store message IDs per chat for edit-based streaming. */
    private previewMessages;
    /** Chats where preview has permanently failed. */
    private previewDegraded;
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    consumeOne(): Promise<InboundMessage | null>;
    private enqueue;
    onMessageStart(chatId: string): void;
    onMessageEnd(chatId: string): void;
    private stopTyping;
    send(message: OutboundMessage): Promise<SendResult>;
    private sendToChannel;
    answerCallback(callbackQueryId: string, text?: string): Promise<void>;
    getPreviewCapabilities(chatId: string): PreviewCapabilities | null;
    sendPreview(chatId: string, text: string, _draftId: number): Promise<'sent' | 'skip' | 'degrade'>;
    endPreview(chatId: string, _draftId: number): void;
    validateConfig(): string | null;
    isAuthorized(userId: string, chatId: string): boolean;
    private handleMessageCreate;
    private processMessage;
    private handleInteraction;
    private addToDedup;
    private cleanupExpiredInteractions;
    /**
     * Convert simple HTML tags to Discord markdown.
     * Handles the common tags used in bridge-manager command responses.
     */
    private htmlToDiscordMarkdown;
}
//# sourceMappingURL=discord-adapter.d.ts.map