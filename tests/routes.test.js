import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import helthjemService from '../src/services/helthjem.service.js';
import config from '../src/config/env.js';

describe('API Routes Integration', () => {
  let app;
  let originalFetch;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    originalFetch = globalThis.fetch;
    helthjemService.clearTokenCache();
    app = createApp();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Health Endpoints', () => {
    it('GET / returns service status and environment', async () => {
      const res = await request(app).get('/');
      assert.equal(res.status, 200);
      assert.equal(res.body.service, 'helthjem-shopify-carrier');
      assert.equal(res.body.status, 'ok');
    });

    it('GET /health returns lightweight status 200 without calling external APIs', async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        throw new Error('Health check should never call external fetch!');
      };

      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(fetchCalled, false);
    });
  });

  describe('POST /api/shopify/rates', () => {
    it('Case 1: returns single 79 NOK rate when Helthjem confirms coverage', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response(JSON.stringify({
            productName: 'HELTHJEM',
            routingCode: '9988'
          }), { status: 200 });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const payload = {
        rate: {
          destination: {
            country: 'NO',
            postal_code: '0468',
            city: 'Oslo',
            name: 'Test Customer',
            address1: 'Kongsberggata 18',
            address2: ''
          },
          items: [
            { quantity: 1, grams: 1000, requires_shipping: true }
          ],
          currency: 'NOK',
          locale: 'nb'
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(Array.isArray(res.body.rates), true);
      assert.equal(res.body.rates.length, 1);

      const rate = res.body.rates[0];
      assert.equal(rate.service_name, 'Helthjem - Hjemlevering | 1-3 virkedager');
      assert.equal(rate.service_code, 'helthjem_home');
      assert.equal(rate.description, 'Helthjem standard home delivery');
      assert.equal(rate.total_price, '7900');
      assert.equal(rate.currency, 'NOK');
    });

    it('Case 2: returns HTTP 200 with rates [] when Helthjem reports no coverage', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response(JSON.stringify({
            errorKey: 'no.carrier.support'
          }), { status: 400 });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const payload = {
        rate: {
          destination: {
            country: 'NO',
            postal_code: '9999',
            city: 'Fjell',
            address1: 'Fjellveien 1'
          },
          items: [{ quantity: 1, grams: 500, requires_shipping: true }]
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { rates: [] });
    });

    it('Case 3: returns HTTP 200 with rates [] for non-Norway destination without calling Helthjem', async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        throw new Error('Should not call Helthjem for non-Norway destination');
      };

      const payload = {
        rate: {
          destination: {
            country: 'SE',
            postal_code: '11122',
            city: 'Stockholm',
            address1: 'Sveavagen 10'
          },
          items: [{ quantity: 1, grams: 500, requires_shipping: true }]
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { rates: [] });
      assert.equal(fetchCalled, false);
    });

    it('Case 4: returns HTTP 200 with rates [] when address is missing city or zip', async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
      };

      const payload = {
        rate: {
          destination: {
            country: 'NO',
            postal_code: '',
            city: 'Oslo',
            address1: 'Storgata 1'
          }
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { rates: [] });
      assert.equal(fetchCalled, false);
    });

    it('Case 12: returns 5xx when Helthjem has server error 500 (triggering Shopify backup rate)', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response('Helthjem server outage', { status: 500 });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const payload = {
        rate: {
          destination: {
            country: 'NO',
            postal_code: '0468',
            city: 'Oslo',
            address1: 'Kongsberggata 18'
          },
          items: [{ quantity: 1, grams: 500, requires_shipping: true }]
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status >= 500 && res.status < 600, true);
      assert.equal(res.body.error, 'Unable to verify Helthjem coverage');
    });

    it('Case 13: returns 504 when Helthjem request times out', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }));
        }
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };

      const payload = {
        rate: {
          destination: {
            country: 'NO',
            postal_code: '0468',
            city: 'Oslo',
            address1: 'Kongsberggata 18'
          },
          items: [{ quantity: 1, grams: 500, requires_shipping: true }]
        }
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send(payload);

      assert.equal(res.status, 504);
      assert.equal(res.body.error, 'Unable to verify Helthjem coverage');
    });

    it('Case 14: secrets, client credentials, and stack traces never appear in error responses', async () => {
      globalThis.fetch = async () => {
        // Return simulated error response containing secret-like strings
        return new Response('secret_client_secret_xyz_internal_leak', { status: 500 });
      };

      const res = await request(app)
        .post('/api/shopify/rates')
        .send({
          rate: {
            destination: {
              country: 'NO',
              postal_code: '0468',
              city: 'Oslo',
              address1: 'Kongsberggata 18'
            }
          }
        });

      const responseString = JSON.stringify(res.body);
      assert.equal(responseString.includes('secret_client_secret'), false);
      assert.equal(responseString.includes('client_id'), false);
      assert.equal(responseString.includes('Bearer'), false);
      assert.equal(responseString.includes('node_modules'), false);
    });
  });

  describe('Manual Coverage Test Endpoint POST /api/helthjem/coverage', () => {
    it('Case 15: returns 404 when ENABLE_TEST_ENDPOINT is false', async () => {
      config.testEndpoint.enabled = false;

      const res = await request(app)
        .post('/api/helthjem/coverage')
        .send({
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo'
        });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Test endpoint is disabled');
    });

    it('Case 16: enforces exact match for x-test-api-key when configured', async () => {
      config.testEndpoint.enabled = true;
      config.testEndpoint.apiKey = 'my-super-secret-test-key';

      // 1. Missing header -> 401
      const resNoKey = await request(app)
        .post('/api/helthjem/coverage')
        .send({
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo'
        });
      assert.equal(resNoKey.status, 401);

      // 2. Incorrect header -> 401
      const resWrongKey = await request(app)
        .post('/api/helthjem/coverage')
        .set('x-test-api-key', 'wrong-key')
        .send({
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo'
        });
      assert.equal(resWrongKey.status, 401);

      // 3. Valid header with Helthjem mock -> 200
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/oauth2/v1/token')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_in: 86400 }));
        }
        if (url.includes('/parcels/v1/addresses/find/single')) {
          return new Response(JSON.stringify({ productName: 'HELTHJEM' }), { status: 200 });
        }
        throw new Error(`Unexpected url ${url}`);
      };

      const resValidKey = await request(app)
        .post('/api/helthjem/coverage')
        .set('x-test-api-key', 'my-super-secret-test-key')
        .send({
          customerName: 'Test customer',
          address: 'Kongsberggata 18',
          zipCode: '0468',
          postalName: 'Oslo',
          weight: 1000
        });

      assert.equal(resValidKey.status, 200);
      assert.deepEqual(resValidKey.body, { covered: true, productName: 'HELTHJEM' });
    });
  });
});
