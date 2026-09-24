import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { HelthjemService } from '../src/services/helthjem.service.js';
import { HelthjemAuthError, HelthjemTimeoutError, HelthjemApiError } from '../src/utils/errors.js';

describe('Helthjem Service Client', () => {
  let originalFetch;
  let service;

  const testConfig = {
    helthjem: {
      baseUrl: 'https://api.pre.helthjem.no',
      shopId: 16,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      transportSolutionId: 2,
      timeoutMs: 1000,
      rateName: 'Helthjem - Hjemlevering | 1-3 virkedager',
      rateCode: 'helthjem_home',
      rateDescription: 'Helthjem standard home delivery',
      ratePrice: '7900',
      rateCurrency: 'NOK'
    }
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    service = new HelthjemService(testConfig);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('OAuth2 Token Management & Caching', () => {
    it('Case 9: caches access token in memory across consecutive calls', async () => {
      let fetchCount = 0;
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          fetchCount++;
          return new Response(JSON.stringify({
            token: 'mock-token-abc',
            expires_in: 86400,
            token_type: 'Bearer'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const token1 = await service.getAccessToken();
      const token2 = await service.getAccessToken();

      assert.equal(token1, 'mock-token-abc');
      assert.equal(token2, 'mock-token-abc');
      assert.equal(fetchCount, 1, 'Expected fetch to be called only once due to token caching');
    });

    it('Case 10: proactively refreshes token when expired or near expiration', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        return new Response(JSON.stringify({
          token: `token-${fetchCount}`,
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const token1 = await service.getAccessToken();
      assert.equal(token1, 'token-1');

      // Manually simulate expiration
      service.tokenExpiresAt = Date.now() - 1000;

      const token2 = await service.getAccessToken();
      assert.equal(token2, 'token-2');
      assert.equal(fetchCount, 2);
    });

    it('prevents concurrent stampede with single-flight locking (authPromise)', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 30));
        return new Response(JSON.stringify({
          token: 'stampede-token',
          expires_in: 86400
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      // Fire 5 concurrent requests simultaneously
      const results = await Promise.all([
        service.getAccessToken(),
        service.getAccessToken(),
        service.getAccessToken(),
        service.getAccessToken(),
        service.getAccessToken()
      ]);

      assert.equal(fetchCount, 1, 'Only one HTTP request should be dispatched for concurrent callers');
      results.forEach(t => assert.equal(t, 'stampede-token'));
    });

    it('throws HelthjemAuthError if token endpoint returns 401/500', async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      await assert.rejects(
        async () => service.getAccessToken(),
        (err) => err instanceof HelthjemAuthError
      );
    });
  });

  describe('Address Coverage Checking', () => {
    it('Case 1: returns covered=true when Helthjem confirms HELTHJEM product', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'tok-123', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response(JSON.stringify({
            productName: 'HELTHJEM',
            routingCode: '1234',
            carrier: 'Helthjem'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const result = await service.checkAddressCoverage({
        address: 'Kongsberggata 18',
        zipCode: '0468',
        postalName: 'Oslo'
      });

      assert.equal(result.covered, true);
      assert.equal(result.productName, 'HELTHJEM');
    });

    it('Case 2: returns covered=false when Helthjem responds 400 with no.carrier.support', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'tok-123', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response(JSON.stringify({
            errorKey: 'no.carrier.support',
            message: 'No carrier coverage for this address'
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const result = await service.checkAddressCoverage({
        address: 'Fjelltopp 1',
        zipCode: '9999',
        postalName: 'Ødemark'
      });

      assert.equal(result.covered, false);
      assert.equal(result.reason, 'no.carrier.support');
    });

    it('Case 11: 401 triggers one token refresh and one retry', async () => {
      let authCalls = 0;
      let coverageCalls = 0;

      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          authCalls++;
          return new Response(JSON.stringify({ token: `token-${authCalls}`, expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          coverageCalls++;
          if (coverageCalls === 1) {
            // First attempt returns 401 (e.g. revoked token)
            return new Response('Unauthorized', { status: 401 });
          }
          // Second attempt succeeds after re-auth
          return new Response(JSON.stringify({ productName: 'HELTHJEM' }), { status: 200 });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const result = await service.checkAddressCoverage({
        address: 'Kongsberggata 18',
        zipCode: '0468',
        postalName: 'Oslo'
      });

      assert.equal(authCalls, 2, 'Should authenticate twice (initial + refresh)');
      assert.equal(coverageCalls, 2, 'Should make exactly 2 coverage calls (initial 401 + retry)');
      assert.equal(result.covered, true);
    });

    it('Case 13: throws HelthjemTimeoutError on abort timeout', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'tok-123', expires_in: 86400 }));
        }
        // Simulate abort timeout
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      };

      await assert.rejects(
        async () => service.checkAddressCoverage({
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo'
        }),
        (err) => err instanceof HelthjemTimeoutError
      );
    });

    it('throws HelthjemApiError on unexpected Helthjem 500', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'tok-123', expires_in: 86400 }));
        }
        return new Response('Internal Server Error', { status: 500 });
      };

      await assert.rejects(
        async () => service.checkAddressCoverage({
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo'
        }),
        (err) => err instanceof HelthjemApiError && err.statusCode === 502
      );
    });

    it('does not treat an unexpected 200 response as no coverage', async () => {
      globalThis.fetch = async (url) => url.includes('/token')
        ? new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }))
        : new Response(JSON.stringify({ productName: 'OTHER' }));
      await assert.rejects(service.checkAddressCoverage({ address: 'A', zipCode: '0468', postalName: 'Oslo' }), HelthjemApiError);
    });

    it('does not treat a 500 carrying no.carrier.support as no coverage', async () => {
      globalThis.fetch = async (url) => url.includes('/token')
        ? new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }))
        : new Response(JSON.stringify({ errorKey: 'no.carrier.support' }), { status: 500 });
      await assert.rejects(service.checkAddressCoverage({ address: 'A', zipCode: '0468', postalName: 'Oslo' }), HelthjemApiError);
    });
  });

  describe('ErrorKey Detection', () => {
    it('detects no.carrier.support in nested structures', () => {
      assert.equal(service.extractErrorKey({ errorKey: 'no.carrier.support' }), 'no.carrier.support');
      assert.equal(service.extractErrorKey({ error: { errorKey: 'no.carrier.support' } }), 'no.carrier.support');
      assert.equal(service.extractErrorKey({ errors: [{ errorKey: 'no.carrier.support' }] }), 'no.carrier.support');
      assert.equal(service.extractErrorKey({ message: 'Error: no.carrier.support found' }), null);
      assert.equal(service.extractErrorKey({ errorKey: 'other.error' }), 'other.error');
      assert.equal(service.extractErrorKey(null), null);
      assert.equal(service.extractErrorKey({}), null);
    });
  });
});
