/**
 * Abstract base class for IM channel adapters.
 *
 * Each adapter (Telegram, Discord, Slack, ...) extends this class to provide
 * platform-specific message consumption and delivery.
 */
export class BaseChannelAdapter {
    /**
     * Answer a callback query (e.g. Telegram inline button press).
     * Not all platforms support this — default implementation is a no-op.
     */
    async answerCallback(_callbackQueryId, _text) {
        // No-op by default; override in adapters that support callback queries
    }
}
// ── Adapter Registry ────────────────────────────────────────────
const adapterFactories = new Map();
export function registerAdapterFactory(channelType, factory) {
    adapterFactories.set(channelType, factory);
}
export function createAdapter(channelType) {
    const factory = adapterFactories.get(channelType);
    return factory ? factory() : null;
}
export function getRegisteredTypes() {
    return Array.from(adapterFactories.keys());
}
//# sourceMappingURL=channel-adapter.js.map