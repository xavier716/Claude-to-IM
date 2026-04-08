/**
 * Telegram Media — download and process images from Telegram messages.
 *
 * Handles photo[] size selection, file download via Bot API, base64 conversion,
 * and document-type image validation. Produces FileAttachment objects that plug
 * directly into the existing streamClaude vision pipeline.
 */
import type { FileAttachment } from '../types.js';
export interface TelegramPhotoSize {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
}
export interface TelegramDocument {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
}
export type MediaRejectCode = 'too_large' | 'unsupported_type' | 'download_failed';
/** Unified result for all media download attempts. */
export interface MediaDownloadResult {
    attachment: FileAttachment | null;
    /** Rejection code — set when attachment is null and failure is user-actionable. */
    rejected?: MediaRejectCode;
    /** Human-readable rejection message for display in Telegram. */
    rejectedMessage?: string;
}
/**
 * Check whether the Telegram image feature is enabled.
 */
export declare function isImageEnabled(): boolean;
/**
 * Check if a MIME type is a supported image format.
 */
export declare function isSupportedImageMime(mime: string): boolean;
/**
 * Infer MIME type from a file path/name extension.
 * Returns undefined if the extension is not a recognized image type.
 */
export declare function inferMimeType(filePath: string): string | undefined;
/**
 * Select the optimal photo size from Telegram's photo[] array.
 *
 * Strategy: sort by long edge ascending, pick the smallest version whose
 * long edge >= OPTIMAL_LONG_EDGE (1568px, Claude vision optimal). If none
 * are large enough, take the largest available.
 */
export declare function selectOptimalPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize;
/**
 * Download a photo from Telegram's photo[] array.
 *
 * Selects the optimal size, calls getFile API, downloads the binary,
 * and converts to base64.
 */
export declare function downloadPhoto(botToken: string, photos: TelegramPhotoSize[], messageId: string): Promise<MediaDownloadResult>;
/**
 * Download a document-type image from Telegram.
 *
 * Pre-checks file_size against the max limit before initiating download.
 */
export declare function downloadDocumentImage(botToken: string, doc: TelegramDocument, messageId: string): Promise<MediaDownloadResult>;
//# sourceMappingURL=telegram-media.d.ts.map