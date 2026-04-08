/**
 * Telegram utility functions — shared between the notification bot
 * (telegram-bot.ts) and the bridge adapter (telegram-adapter.ts).
 *
 * Extracted from telegram-bot.ts to avoid duplication.
 */
export interface TelegramSendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
    /** HTTP status code from the Telegram API response. */
    httpStatus?: number;
    /** Retry-after seconds returned by Telegram on 429 responses. */
    retryAfter?: number;
}
export interface TelegramApiResponse {
    ok: boolean;
    result?: {
        message_id?: number;
        [key: string]: unknown;
    };
    description?: string;
    /** Telegram returns retry_after (seconds) on 429 rate limit responses. */
    parameters?: {
        retry_after?: number;
        [key: string]: unknown;
    };
}
/**
 * Call a Telegram Bot API method.
 */
export declare function callTelegramApi(botToken: string, method: string, params: Record<string, unknown>): Promise<TelegramSendResult>;
/**
 * Send a draft message preview via Telegram Bot API 9.5 sendMessageDraft.
 * Plain text only (no parse_mode) — used for streaming preview.
 */
export declare function sendMessageDraft(botToken: string, chatId: string, text: string, draftId: number): Promise<TelegramSendResult>;
/**
 * Escape special HTML characters for Telegram HTML mode.
 */
export declare function escapeHtml(text: string): string;
/**
 * Split a message into chunks that fit within Telegram's message size limit.
 * Tries to split at line boundaries when possible.
 */
export declare function splitMessage(text: string, maxLength: number): string[];
/**
 * Format a session header for notification messages.
 */
export declare function formatSessionHeader(opts?: {
    sessionId?: string;
    sessionTitle?: string;
    workingDirectory?: string;
}): string;
//# sourceMappingURL=telegram-utils.d.ts.map