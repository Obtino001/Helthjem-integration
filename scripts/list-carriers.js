#!/usr/bin/env node
import { fetchCarrierServices } from '../src/services/shopify-admin.service.js';

try {
  const carriers = await fetchCarrierServices();
  console.table(carriers.map(({ id, name, callbackUrl, active, supportsServiceDiscovery }) => ({ id, name, callbackUrl, active, supportsServiceDiscovery })));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
