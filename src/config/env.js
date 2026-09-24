import dotenv from 'dotenv';

// Load .env file
dotenv.config();

/**
 * Validates that essential environment variables are set.
 * Skips strict validation in test mode (NODE_ENV === 'test').
 */
export function validateConfig() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const required = [
    'HELTHJEM_BASE_URL',
    'HELTHJEM_SHOP_ID',
    'HELTHJEM_CLIENT_ID',
    'HELTHJEM_CLIENT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key] || process.env[key].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required Helthjem configuration environment variables: ${missing.join(', ')}. ` +
      'Please check your .env file or host environment settings.'
    );
  }
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  helthjem: {
    baseUrl: (process.env.HELTHJEM_BASE_URL || 'https://api.pre.helthjem.no').replace(/\/+$/, ''),
    shopId: parseInt(process.env.HELTHJEM_SHOP_ID || '16', 10),
    clientId: process.env.HELTHJEM_CLIENT_ID || '',
    clientSecret: process.env.HELTHJEM_CLIENT_SECRET || '',
    transportSolutionId: parseInt(process.env.HELTHJEM_TRANSPORT_SOLUTION_ID || '2', 10),
    timeoutMs: parseInt(process.env.HELTHJEM_TIMEOUT_MS || '4000', 10),
    rateName: process.env.HELTHJEM_RATE_NAME || 'Helthjem - Hjemlevering | 1-3 virkedager',
    rateCode: process.env.HELTHJEM_RATE_CODE || 'helthjem_home',
    rateDescription: process.env.HELTHJEM_RATE_DESCRIPTION || 'Helthjem standard home delivery',
    ratePrice: process.env.HELTHJEM_RATE_PRICE || '7900',
    rateCurrency: process.env.HELTHJEM_RATE_CURRENCY || 'NOK'
  },

  testEndpoint: {
    enabled: process.env.ENABLE_TEST_ENDPOINT === 'true',
    apiKey: process.env.TEST_API_KEY || ''
  },

  shopify: {
    shop: process.env.SHOPIFY_SHOP || '',
    clientId: process.env.SHOPIFY_CLIENT_ID || '',
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    carrierName: process.env.SHOPIFY_CARRIER_NAME || 'Helthjem Coverage'
  }
};

export default config;
