#!/usr/bin/env node
import { shopifyAuthService } from '../src/services/shopify-auth.service.js';
import { shopifyGraphql } from '../src/services/shopify-admin.service.js';

try {
  await shopifyAuthService.getAccessToken();
  if (!shopifyAuthService.scopes.includes('write_shipping')) throw new Error('write_shipping scope was not granted');
  const data = await shopifyGraphql('query TestShopifyAuth { shop { id } }');
  if (!data.shop?.id) throw new Error('Shopify Admin API test query returned no shop');
  console.log('Shopify authentication successful\nwrite_shipping: granted');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
