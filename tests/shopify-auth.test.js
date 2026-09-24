import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ShopifyAuthService } from '../src/services/shopify-auth.service.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const settings = { shop: 'test-shop', clientId: 'private-id', clientSecret: 'private-secret' };

describe('Shopify client credentials', () => {
  it('shares a pending request and caches its token', async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://test-shop.myshopify.com/admin/oauth/access_token');
      assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(new URLSearchParams(options.body).get('grant_type'), 'client_credentials');
      return new Response(JSON.stringify({ access_token: 'private-token', scope: 'read_shipping,write_shipping', expires_in: 3600 }));
    };
    const service = new ShopifyAuthService(settings);
    assert.deepEqual(await Promise.all([service.getAccessToken(), service.getAccessToken()]), ['private-token', 'private-token']);
    assert.equal(await service.getAccessToken(), 'private-token');
    assert.equal(calls, 1);
    assert(service.scopes.includes('write_shipping'));
  });

  it('refreshes within the 60-second safety buffer', async () => {
    let calls = 0;
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: `token-${++calls}`, scope: 'write_shipping', expires_in: 61 }));
    const service = new ShopifyAuthService(settings);
    await service.getAccessToken();
    service.expiresAt = Date.now() - 1;
    await service.getAccessToken();
    assert.equal(calls, 2);
  });

  it('reports shop_not_permitted safely', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'shop_not_permitted', detail: 'private-secret' }), { status: 403 });
    const service = new ShopifyAuthService(settings);
    await assert.rejects(service.getAccessToken(), error => error.message.includes('same Shopify organization') && !error.message.includes('private-secret'));
  });

  it('sanitizes other authentication failures', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'private-secret' }), { status: 401 });
    await assert.rejects(new ShopifyAuthService(settings).getAccessToken(), error => error.message === 'Shopify authentication failed (HTTP 401)');
  });
});
