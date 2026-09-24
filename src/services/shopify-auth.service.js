import config from '../config/env.js';

const SHOP_NOT_PERMITTED = 'Shopify Client Credentials Grant is not permitted for this shop. Verify that the Dev Dashboard app and target store belong to the same Shopify organization.';

export class ShopifyAuthService {
  constructor(settings = config.shopify) {
    this.settings = settings;
    this.token = null;
    this.expiresAt = 0;
    this.pending = null;
    this.scopes = [];
  }

  async getAccessToken() {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this.pending) return this.pending;
    this.pending = this.requestToken();
    try { return await this.pending; } finally { this.pending = null; }
  }

  async requestToken() {
    const { shop, clientId, clientSecret } = this.settings;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(shop || '') || !clientId || !clientSecret) throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET are required; SHOPIFY_SHOP must be the myshopify subdomain.');
    let response;
    try {
      response = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
      });
    } catch { throw new Error('Shopify authentication network request failed'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid Shopify authentication response'); }
    if (!response.ok) {
      if (data?.error === 'shop_not_permitted' || data?.error_description?.includes('shop_not_permitted')) throw new Error(SHOP_NOT_PERMITTED);
      throw new Error(`Shopify authentication failed (HTTP ${response.status})`);
    }
    if (typeof data?.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) throw new Error('Invalid Shopify authentication response');
    this.token = data.access_token;
    this.expiresAt = Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000;
    this.scopes = typeof data.scope === 'string' ? data.scope.split(/[\s,]+/).filter(Boolean) : [];
    return this.token;
  }
}

export const shopifyAuthService = new ShopifyAuthService();
