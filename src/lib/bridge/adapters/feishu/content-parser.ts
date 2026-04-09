/**
 * Feishu Content Parser
 *
 * Handles parsing of various Feishu message content formats,
 * including text, post, and interactive card content.
 */

/**
 * Parse text content from Feishu message.
 */
export function parseTextContent(content: string): string {
  try {
    const data = JSON.parse(content);
    if (data.text) return data.text;
    return content;
  } catch {
    return content;
  }
}

/**
 * Extract file key from Feishu message content.
 */
export function extractFileKey(content: string): string | null {
  try {
    const data = JSON.parse(content);
    return data.file_key || null;
  } catch {
    return null;
  }
}

/**
 * Parse post content from Feishu message.
 * Returns extracted text and any image file keys.
 */
export function parsePostContent(content: string): {
  extractedText: string;
  imageKeys: string[];
} {
  const imageKeys: string[][] = [];
  let extractedText = '';

  try {
    const post = JSON.parse(content);
    if (post.post && post.post.content) {
      for (const section of Object.values(post.post.content) as any[]) {
        if (Array.isArray(section)) {
          for (const item of section) {
            if (item.tag === 'text' && item.text) {
              extractedText += item.text.unescaped || item.text.text || '';
            } else if (item.tag === 'img' && item.image_key) {
              imageKeys.push([item.image_key]);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[content-parser] Failed to parse post content:', err instanceof Error ? err.message : err);
  }

  return { extractedText, imageKeys: imageKeys.flat() };
}

/**
 * Strip mention markers from text (e.g., "@_user_1234567890" -> "").
 */
export function stripMentionMarkers(text: string): string {
  return text.replace(/@_[^ ]+/g, '').trim();
}
