/**
 * Feishu CardKit API Client
 *
 * Handles all Feishu CardKit HTTP API operations for card management,
 * including token management, card creation, streaming updates, and finalization.
 */

import { getBridgeContext } from '../../context.js';

/** Card creation response */
interface CardCreateResponse {
  code: number;
  msg?: string;
  data?: {
    card: {
      card_id: string;
    };
  };
}

/** CardKit API Client */
export class CardKitApiClient {
  private tenantAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  /**
   * Get a cached tenant access token, refreshing if expired.
   * CardKit APIs require tenant_access_token for authentication.
   */
  async getTenantAccessToken(): Promise<string | null> {
    // Return cached token if still valid (5 min buffer)
    if (this.tenantAccessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.tenantAccessToken;
    }

    const appId = getBridgeContext().store.getSetting('bridge_feishu_app_id') || '';
    const appSecret = getBridgeContext().store.getSetting('bridge_feishu_app_secret') || '';
    const domainSetting = getBridgeContext().store.getSetting('bridge_feishu_domain') || 'feishu';
    const baseUrl = domainSetting === 'lark'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';

    try {
      const tokenRes = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!tokenRes.ok) {
        console.error('[cardkit-api] Token request failed:', tokenRes.status, tokenRes.statusText);
        return null;
      }

      const tokenData: any = await tokenRes.json();
      if (tokenData.tenant_access_token) {
        this.tenantAccessToken = tokenData.tenant_access_token;
        this.tokenExpiresAt = Date.now() + (tokenData.expire || 7200) * 1000;
        return this.tenantAccessToken;
      }

      console.error('[cardkit-api] Token response missing tenant_access_token:', tokenData);
      return null;
    } catch (err) {
      console.error('[cardkit-api] Token request error:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Create a new CardKit card via HTTP API.
   * POST /open-apis/cardkit/v1/cards
   */
  async createCard(cardBody: Record<string, unknown>): Promise<string | null> {
    const token = await this.getTenantAccessToken();
    if (!token) return null;

    const domainSetting = getBridgeContext().store.getSetting('bridge_feishu_domain') || 'feishu';
    const baseUrl = domainSetting === 'lark'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';

    try {
      const res = await fetch(`${baseUrl}/open-apis/cardkit/v1/cards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardBody),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const responseText = await res.text();
        console.error('[cardkit-api] Create card API error:', res.status, res.statusText);
        console.error('[cardkit-api] Response body:', responseText.substring(0, 500));
        return null;
      }

      const data: CardCreateResponse = await res.json();
      if (data.code !== 0) {
        console.error('[cardkit-api] Create card returned error code:', data.code, 'msg:', data.msg);
        return null;
      }

      const cardId = data.data?.card?.card_id;
      if (!cardId) {
        console.error('[cardkit-api] Create card response missing card_id');
        return null;
      }

      return cardId;
    } catch (err) {
      console.error('[cardkit-api] Create card request failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Update a card message via Feishu Message API.
   * PATCH /open-apis/im/v1/messages/{message_id}
   */
  async updateCardMessage(
    messageId: string,
    cardJson: string,
  ): Promise<boolean> {
    const token = await this.getTenantAccessToken();
    if (!token) return false;

    const domainSetting = getBridgeContext().store.getSetting('bridge_feishu_domain') || 'feishu';
    const baseUrl = domainSetting === 'lark'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';

    try {
      const res = await fetch(`${baseUrl}/open-apis/im/v1/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 'interactive',
          update_key: '',
          content: cardJson,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const responseText = await res.text();
      if (!res.ok) {
        console.error('[cardkit-api] Update card API error:', res.status, res.statusText);
        console.error('[cardkit-api] Response body:', responseText.substring(0, 500));
        return false;
      }

      try {
        const data = JSON.parse(responseText);
        if (data.code !== 0) {
          console.error('[cardkit-api] Update card returned error code:', data.code, 'msg:', data.msg);
          return false;
        }
        return true;
      } catch (parseErr) {
        console.error('[cardkit-api] Failed to parse update card response:', parseErr instanceof Error ? parseErr.message : parseErr);
        return false;
      }
    } catch (err) {
      console.error('[cardkit-api] Update card request failed:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Stream content to a card message via Feishu Message API.
   * PATCH /open-apis/im/v1/messages/{message_id}
   */
  async streamCardContent(
    messageId: string,
    content: string,
    sequence: number,
  ): Promise<boolean> {
    const token = await this.getTenantAccessToken();
    if (!token) return false;

    const domainSetting = getBridgeContext().store.getSetting('bridge_feishu_domain') || 'feishu';
    const baseUrl = domainSetting === 'lark'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';

    try {
      // Build a streaming card with the current content
      const streamingCard = {
        config: { wide_screen_mode: true },
        header: {
          template: process.env.FEISHU_CARD_TEMPLATE || 'turquoise',
          title: { content: '💭 Thinking...', tag: 'plain_text' }
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: content || '...'
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'plain_text',
              content: `⏳ Stream sequence: ${sequence} • ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
            }
          }
        ]
      };

      const res = await fetch(`${baseUrl}/open-apis/im/v1/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 'interactive',
          update_key: '',
          content: JSON.stringify(streamingCard),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const responseText = await res.text();
      if (!res.ok) {
        console.error('[cardkit-api] Stream content API error:', res.status, res.statusText);
        console.error('[cardkit-api] Response body:', responseText.substring(0, 500));
        return false;
      }

      try {
        const data = JSON.parse(responseText);
        if (data.code !== 0) {
          console.error('[cardkit-api] Stream content returned error code:', data.code, 'msg:', data.msg);
          return false;
        }
        return true;
      } catch (parseErr) {
        console.error('[cardkit-api] Failed to parse stream content response:', parseErr instanceof Error ? parseErr.message : parseErr);
        return false;
      }
    } catch (err) {
      console.error('[cardkit-api] Stream content request failed:', err instanceof Error ? err.message : err);
      return false;
    }
  }
}
