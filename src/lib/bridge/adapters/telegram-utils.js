/**
 * Telegram utility functions — shared between the notification bot
 * (telegram-bot.ts) and the bridge adapter (telegram-adapter.ts).
 *
 * Extracted from telegram-bot.ts to avoid duplication.
 */
const TELEGRAM_API = 'https://api.telegram.org';
/**
 * Call a Telegram Bot API method.
 */
export async function callTelegramApi(botToken, method, params) {
    try {
        const url = `${TELEGRAM_API}/bot${botToken}/${method}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const httpStatus = res.status;
        const data = await res.json();
        if (!data.ok) {
            return {
                ok: false,
                error: data.description || 'Unknown Telegram API error',
                httpStatus,
                retryAfter: data.parameters?.retry_after,
            };
        }
        return {
            ok: true,
            messageId: data.result?.message_id != null ? String(data.result.message_id) : undefined,
            httpStatus,
        };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
}
/**
 * Send a draft message preview via Telegram Bot API 9.5 sendMessageDraft.
 * Plain text only (no parse_mode) — used for streaming preview.
 */
export async function sendMessageDraft(botToken, chatId, text, draftId) {
    const truncated = text.length > 4096 ? text.slice(0, 4096) : text;
    return callTelegramApi(botToken, 'sendMessageDraft', {
        chat_id: chatId,
        text: truncated,
        draft_id: draftId,
    });
}
/**
 * Escape special HTML characters for Telegram HTML mode.
 */
export function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/**
 * Split a message into chunks that fit within Telegram's message size limit.
 * Tries to split at line boundaries when possible.
 */
export function splitMessage(text, maxLength) {
    if (text.length <= maxLength)
        return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        let splitIdx = remaining.lastIndexOf('\n', maxLength);
        if (splitIdx <= 0 || splitIdx < maxLength * 0.5) {
            splitIdx = maxLength;
        }
        chunks.push(remaining.slice(0, splitIdx));
        remaining = remaining.slice(splitIdx).replace(/^\n/, '');
    }
    return chunks;
}
/**
 * Format a session header for notification messages.
 */
export function formatSessionHeader(opts) {
    const parts = [];
    if (opts?.sessionTitle) {
        parts.push(`<b>${escapeHtml(opts.sessionTitle)}</b>`);
    }
    if (opts?.workingDirectory) {
        parts.push(`<code>${escapeHtml(opts.workingDirectory)}</code>`);
    }
    return parts.join('\n');
}
//# sourceMappingURL=telegram-utils.js.map