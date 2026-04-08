/**
 * QQ Bot HTTP / WebSocket protocol helpers.
 *
 * Pure protocol layer — no business logic, no adapter state.
 * Covers token management, gateway discovery, WS frame builders,
 * and message sending via the QQ Bot open-platform API.
 */
import type { SendResult } from '../types.js';
/**
 * Obtain (or return cached) access token for the QQ Bot API.
 * Automatically refreshes 60 s before expiry.
 */
export declare function getAccessToken(appId: string, clientSecret: string): Promise<string>;
/** Clear the cached token (useful on auth errors). */
export declare function clearTokenCache(): void;
/** Fetch the WebSocket gateway URL for QQ Bot events. */
export declare function getGatewayUrl(accessToken: string): Promise<string>;
export declare const OP: {
    readonly DISPATCH: 0;
    readonly HEARTBEAT: 1;
    readonly IDENTIFY: 2;
    readonly RESUME: 6;
    readonly RECONNECT: 7;
    readonly INVALID_SESSION: 9;
    readonly HELLO: 10;
    readonly HEARTBEAT_ACK: 11;
};
export interface GatewayPayload {
    op: number;
    d?: unknown;
    s?: number;
    t?: string;
}
export declare function buildIdentify(token: string, intents: number): GatewayPayload;
export declare function buildHeartbeat(lastSequence: number | null): GatewayPayload;
export declare function buildResume(token: string, sessionId: string, seq: number): GatewayPayload;
export declare const INTENTS: {
    readonly PUBLIC_MESSAGES: number;
};
export interface QQSendMessageParams {
    openid: string;
    content: string;
    msgId: string;
    msgSeq: number;
}
export declare function nextMsgSeq(inboundMsgId: string): number;
/** Send a private (C2C) message to a QQ user. */
export declare function sendPrivateMessage(accessToken: string, params: QQSendMessageParams): Promise<SendResult>;
//# sourceMappingURL=qq-api.d.ts.map