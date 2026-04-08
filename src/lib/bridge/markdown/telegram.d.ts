/**
 * Telegram-specific Markdown renderer.
 *
 * Converts Markdown → IR → Telegram-compatible HTML, with file-reference
 * wrapping and render-first chunking for long messages.
 *
 * Ported from openclaw src/telegram/format.ts.
 */
export type TelegramChunk = {
    html: string;
    text: string;
};
/**
 * Wraps standalone file references (with TLD extensions) in <code> tags.
 * Prevents Telegram from treating them as URLs and generating
 * irrelevant domain registrar previews.
 *
 * Runs AFTER markdown→HTML conversion to avoid modifying HTML attributes.
 * Skips content inside <code>, <pre>, and <a> tags.
 */
export declare function wrapFileReferencesInHtml(html: string): string;
/**
 * Full pipeline: markdown → IR → Telegram HTML with file ref wrapping.
 */
export declare function markdownToTelegramHtml(markdown: string): string;
/**
 * Render-first chunking: markdown → IR → chunk by IR text →
 * render each chunk → re-split if HTML exceeds limit.
 */
export declare function markdownToTelegramChunks(markdown: string, limit: number): TelegramChunk[];
//# sourceMappingURL=telegram.d.ts.map