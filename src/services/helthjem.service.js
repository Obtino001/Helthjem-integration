import config from '../config/env.js';
import logger from '../utils/logger.js';
import { HelthjemApiError, HelthjemAuthError, HelthjemTimeoutError } from '../utils/errors.js';

export class HelthjemService {
  constructor(customConfig = null) {
    this.config = customConfig || config;
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.authPromise = null;
  }

  /**
   * Clears the in-memory cached token.
   */
  clearTokenCache() {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Retrieves a valid OAuth2 Bearer token from Helthjem.
   * Caches token in memory with proactive refresh (<= 12h) and deduplicates concurrent calls.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    const now = Date.now();

    // Check if current cached token is still valid with safety buffer
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    // Single-flight lock: if token request already pending, reuse promise
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = (async () => {
      try {
        logger.info('Helthjem', 'Authenticating with OAuth2 client_credentials endpoint');
        const tokenUrl = `${this.config.helthjem.baseUrl}/auth/oauth2/v1/token`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.helthjem.timeoutMs);

        let response;
        try {
          response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              client_id: this.config.helthjem.clientId,
              client_secret: this.config.helthjem.clientSecret,
              grant_type: 'client_credentials'
            }),
            signal: controller.signal
          });
        } catch (err) {
          if (err.name === 'AbortError') {
            throw new HelthjemTimeoutError('Authentication request timed out');
          }
          throw new HelthjemAuthError(`Network error during authentication: ${err.message}`);
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const status = response.status;
          let errorText = '';
          try {
            errorText = await response.text();
          } catch {
            // Ignore text read error
          }
          logger.error('Helthjem', `Authentication failed with HTTP ${status}`);
          throw new HelthjemAuthError(`Helthjem authentication failed with status ${status}`);
        }

        const data = await response.json();
        if (!data || !data.token) {
          throw new HelthjemAuthError('Helthjem auth response missing access token');
        }

        this.cachedToken = data.token;

        // Token lifetime: 24h default. Refresh proactively no later than 12h.
        // Also subtract a 5-minute safety buffer.
        const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0
          ? data.expires_in
          : 86400; // default 24 hours

        const maxTtlSec = 12 * 3600; // Proactively refresh no later than 12 hours
        const safetyBufferSec = 300; // 5 minute buffer

        const effectiveTtlSec = Math.max(60, Math.min(expiresInSec - safetyBufferSec, maxTtlSec));
        this.tokenExpiresAt = Date.now() + effectiveTtlSec * 1000;

        logger.info('Helthjem', `Authentication successful (token cached for ${effectiveTtlSec}s)`);
        return this.cachedToken;
      } finally {
        this.authPromise = null;
      }
    })();

    return this.authPromise;
  }

  /**
   * Helper to inspect response body for errorKey: 'no.carrier.support'
   * @param {any} data
   * @returns {string|null}
   */
  extractErrorKey(data) {
    if (!data || typeof data !== 'object') return null;

    if (data.errorKey && typeof data.errorKey === 'string') {
      return data.errorKey;
    }
    if (data.error && typeof data.error === 'object' && typeof data.error.errorKey === 'string') {
      return data.error.errorKey;
    }
    if (Array.isArray(data.errors) && data.errors.length > 0 && typeof data.errors[0]?.errorKey === 'string') {
      return data.errors[0].errorKey;
    }
    if (typeof data.message === 'string' && data.message.includes('no.carrier.support')) {
      return 'no.carrier.support';
    }

    return null;
  }

  /**
   * Calls Helthjem Single Address Check API.
   * Retries once on 401 Unauthorized after refreshing token.
   * 
   * @param {object} params
   * @param {string} params.address
   * @param {string} params.zipCode
   * @param {string} params.postalName
   * @param {string} [params.customerName]
   * @param {number} [params.weight]
   * @param {string} [params.countryCode]
   * @param {boolean} [isRetry=false]
   * @returns {Promise<{ covered: boolean, productName?: string, reason?: string, raw?: any }>}
   */
  async checkAddressCoverage(params, isRetry = false) {
    const {
      address,
      zipCode,
      postalName,
      customerName = 'Shopify customer',
      weight = 1000,
      countryCode = 'NO'
    } = params;

    const token = await this.getAccessToken();
    const url = `${this.config.helthjem.baseUrl}/parcels/v1/addresses/find/single`;

    const requestBody = {
      shopId: Number(this.config.helthjem.shopId),
      transportSolutionId: Number(this.config.helthjem.transportSolutionId || 2),
      customerName,
      address,
      zipCode,
      postalName,
      countryCode,
      weight: Number(weight) || 1000,
      volume: null
    };

    logger.info('Helthjem', 'Checking coverage', {
      zipCode,
      postalName,
      weight: requestBody.weight,
      transportSolutionId: requestBody.transportSolutionId
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.helthjem.timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.error('Helthjem', 'API timeout during address check');
        throw new HelthjemTimeoutError('Helthjem coverage check timed out');
      }
      logger.error('Helthjem', `Network error during address check: ${err.message}`);
      throw new HelthjemApiError(`Network error communicating with Helthjem: ${err.message}`, 502);
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 401 Unauthorized: clear cache, refresh once, retry request
    if (response.status === 401) {
      logger.warn('Helthjem', 'Received 401 Unauthorized from coverage endpoint');
      this.clearTokenCache();

      if (!isRetry) {
        logger.info('Helthjem', 'Attempting token refresh and single retry');
        return this.checkAddressCoverage(params, true);
      }

      logger.error('Helthjem', '401 Unauthorized persisted after token refresh retry');
      throw new HelthjemAuthError('Helthjem rejected re-authenticated token (401)');
    }

    let responseData = null;
    const responseText = await response.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Non-JSON response
    }

    // Check for success (HTTP 200)
    if (response.ok) {
      if (responseData && responseData.productName === 'HELTHJEM') {
        logger.info('Helthjem', 'Coverage available', { productName: responseData.productName });
        return {
          covered: true,
          productName: responseData.productName,
          raw: responseData
        };
      }

      // Check if 200 payload actually indicates no carrier support
      const errorKey = this.extractErrorKey(responseData);
      if (errorKey === 'no.carrier.support') {
        logger.info('Helthjem', 'No coverage (no.carrier.support in 200 response)');
        return {
          covered: false,
          reason: 'no.carrier.support',
          raw: responseData
        };
      }

      // 200 OK but productName is not HELTHJEM (e.g. unexpected product)
      logger.info('Helthjem', `Response received but productName is not HELTHJEM: ${responseData?.productName || 'unknown'}`);
      return {
        covered: false,
        reason: responseData?.productName ? `unsupported_product_${responseData.productName}` : 'no.carrier.support',
        raw: responseData
      };
    }

    // Helthjem often returns HTTP 400 with { "errorKey": "no.carrier.support" } for unsupported addresses
    const errorKey = this.extractErrorKey(responseData);
    if (errorKey === 'no.carrier.support') {
      logger.info('Helthjem', 'No coverage (no.carrier.support in error response)');
      return {
        covered: false,
        reason: 'no.carrier.support',
        raw: responseData
      };
    }

    // Any other error (5xx, unknown 4xx, unexpected error)
    logger.error('Helthjem', `API error HTTP ${response.status}`, {
      status: response.status,
      errorKey,
      body: responseData || responseText.slice(0, 150)
    });

    throw new HelthjemApiError(
      `Helthjem API returned HTTP ${response.status}`,
      response.status >= 500 ? 502 : response.status,
      responseData
    );
  }
}

export const helthjemService = new HelthjemService();
export default helthjemService;
