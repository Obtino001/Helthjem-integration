#!/usr/bin/env node
import config from '../src/config/env.js';
import { CREATE_MUTATION, fetchCarrierServices, shopifyGraphql } from '../src/services/shopify-admin.service.js';

try {
  const { publicBaseUrl, carrierName } = config.shopify;
  if (!/^https:\/\/[^/]+$/.test(publicBaseUrl) || /localhost|127\.0\.0\.1/i.test(publicBaseUrl)) throw new Error('PUBLIC_BASE_URL must be a public HTTPS URL');
  const callbackUrl = `${publicBaseUrl}/api/shopify/rates`;
  const carriers = await fetchCarrierServices();
  const existing = carriers.find(c => c.name?.toLowerCase() === carrierName.toLowerCase() || c.callbackUrl === callbackUrl);
  if (existing) {
    console.log(`CarrierService already exists\nID: ${existing.id}\nName: ${existing.name}\nCallback URL: ${existing.callbackUrl}`);
  } else {
    const data = await shopifyGraphql(CREATE_MUTATION, { input: { name: carrierName, callbackUrl, supportsServiceDiscovery: false, active: true } });
    const payload = data.carrierServiceCreate;
    if (payload?.userErrors?.length) throw new Error('Shopify rejected CarrierService registration');
    if (!payload?.carrierService?.id) throw new Error('Invalid CarrierService registration response');
    console.log(`CarrierService registered successfully\nID: ${payload.carrierService.id}\nName: ${payload.carrierService.name}\nCallback URL: ${payload.carrierService.callbackUrl}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
