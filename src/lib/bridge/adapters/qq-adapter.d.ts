/**
 * QQ Bot Adapter — implements BaseChannelAdapter for QQ Bot API.
 *
 * C2C (private chat) only. Supports text + image inbound messages
 * and text-only passive reply outbound.
 *
 * Uses WebSocket gateway for real-time events and REST API for sending.
 * QQ Bot API requires passive replies (must reference an inbound message ID).
 */
import type { ChannelType, InboundMessage, OutboundMessage, SendResult } from '../types.js';
import { BaseChannelAdapter } from '../channel-adapter.js';
export declare class QQAdapter extends BaseChannelAdapter {
    readonly channelType: ChannelType;
    private _running;
    private queue;
    private waiters;
    private ws;
    private heartbeatTimer;
    private lastSequence;
    private sessionId;
    private seenMessageIds;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private shouldReconnect;
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    consumeOne(): Promise<InboundMessage | null>;
    private enqueue;
    send(message: OutboundMessage): Promise<SendResult>;
    validateConfig(): string | null;
    isAuthorized(userId: string, _chatId: string): boolean;
    private connectGateway;
    private handleGatewayPayload;
    private handleC2CMessage;
    private downloadImages;
    private startHeartbeat;
    private stopHeartbeat;
    private scheduleReconnect;
}
//# sourceMappingURL=qq-adapter.d.ts.map