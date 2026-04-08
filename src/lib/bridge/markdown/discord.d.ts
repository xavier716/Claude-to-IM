/**
 * Discord markdown chunking — splits long markdown text into Discord-safe
 * chunks (≤2000 chars) with code fence balancing.
 *
 * Discord supports native markdown, so no IR→HTML conversion is needed.
 * The only concern is the 2000-char message limit.
 */
export interface DiscordChunk {
    text: string;
}
/**
 * Split markdown into Discord-safe chunks.
 * Splits at line boundaries and rebalances open code fences at split points.
 */
export declare function markdownToDiscordChunks(markdown: string, limit?: number): DiscordChunk[];
//# sourceMappingURL=discord.d.ts.map