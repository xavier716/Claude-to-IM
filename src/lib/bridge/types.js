/**
 * Bridge system types — shared across all bridge modules.
 *
 * The bridge connects external IM channels (Telegram, Discord, Slack)
 * to CodePilot chat sessions, allowing users to interact with Claude
 * from their preferred messaging platform.
 */
// ── Config ─────────────────────────────────────────────────────
/** Platform-specific message length limits */
export const PLATFORM_LIMITS = {
    telegram: 4096,
    discord: 2000,
    slack: 40000,
    feishu: 30000,
    qq: 2000,
    weixin: 4000,
};
//# sourceMappingURL=types.js.map