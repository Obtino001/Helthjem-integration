#!/usr/bin/env node
/**
 * Utility script to safely register the Helthjem CarrierService on Shopify Plus.
 * Uses Shopify GraphQL Admin API version 2026-07.
 * Requires Shopify App scope: write_shipping
 * 
 * Safety mechanism: Checks for existing services with the same name or callback URL
 * before creating to prevent duplicate carrier registrations.
 */

import dotenv from 'dotenv';
import { fetchCarrierServices } from './list-carriers.js';

dotenv.config();

const storeDomain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const carrierName = process.env.SHOPIFY_CARRIER_NAME || 'Helthjem Coverage';

if (!storeDomain || !token) {
  console.error('\n❌ ERROR: Missing Shopify credentials in environment.');
  console.error('Please configure SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in your .env file.\n');
  process.exit(1);
}

if (!publicBaseUrl || publicBaseUrl.includes('localhost') || publicBaseUrl.includes('127.0.0.1')) {
  console.error('\n❌ ERROR: PUBLIC_BASE_URL must be set to a valid public HTTPS URL (e.g. Render production URL).');
  console.error(`Current value: "${publicBaseUrl}"\n`);
  process.exit(1);
}

const callbackUrl = `${publicBaseUrl}/api/shopify/rates`;
const graphqlUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;

const MUTATION = `
  mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService {
        id
        name
        callbackUrl
        active
        supportsServiceDiscovery
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function registerCarrierService() {
  console.log(`\n======================================================`);
  console.log(`Shopify CarrierService Registration`);
  console.log(`======================================================`);
  console.log(`Store:        ${storeDomain}`);
  console.log(`Carrier Name: ${carrierName}`);
  console.log(`Callback URL: ${callbackUrl}`);
  console.log(`API Version:  ${apiVersion}\n`);

  // Step 1: Duplicate check
  console.log('Step 1: Checking for existing CarrierServices to prevent duplicates...');
  let existingCarriers = [];
  try {
    existingCarriers = await fetchCarrierServices();
  } catch (error) {
    console.warn(`⚠️  Warning: Unable to list existing carrier services (${error.message}).`);
    console.warn('Proceeding with caution...\n');
  }

  const nameMatch = existingCarriers.find(c => c.name.toLowerCase() === carrierName.toLowerCase());
  const urlMatch = existingCarriers.find(c => c.callbackUrl === callbackUrl);

  if (nameMatch) {
    console.error(`\n❌ DUPLICATE DETECTED: A CarrierService with name "${nameMatch.name}" already exists.`);
    console.error(`ID: ${nameMatch.id}`);
    console.error(`Callback URL: ${nameMatch.callbackUrl}`);
    console.error('\nRegistration cancelled. If you want to replace it, delete the existing service in Shopify first.\n');
    process.exit(1);
  }

  if (urlMatch) {
    console.error(`\n❌ DUPLICATE DETECTED: A CarrierService pointing to "${urlMatch.callbackUrl}" already exists.`);
    console.error(`Name: ${urlMatch.name} (ID: ${urlMatch.id})`);
    console.error('\nRegistration cancelled to avoid duplicate callbacks.\n');
    process.exit(1);
  }

  console.log('✅ No duplicates found. Proceeding with registration...\n');

  // Step 2: Execute GraphQL mutation
  const variables = {
    input: {
      name: carrierName,
      callbackUrl,
      supportsServiceDiscovery: false,
      active: true
    }
  };

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({
      query: MUTATION,
      variables
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`\n❌ HTTP Error from Shopify (${response.status}):`, errorText.slice(0, 300));
    process.exit(1);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    console.error('\n❌ GraphQL Execution Errors:');
    result.errors.forEach(e => console.error(` - ${e.message}`));
    process.exit(1);
  }

  const payload = result.data?.carrierServiceCreate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length > 0) {
    console.error('\n❌ Shopify CarrierService Registration failed with userErrors:');
    userErrors.forEach(err => console.error(` - Field [${err.field?.join('.') || 'root'}]: ${err.message}`));
    process.exit(1);
  }

  const created = payload?.carrierService;
  console.log('🎉 SUCCESS: CarrierService registered successfully!\n');
  console.log(`ID:           ${created.id}`);
  console.log(`Name:         ${created.name}`);
  console.log(`Callback URL: ${created.callbackUrl}`);
  console.log(`Active:       ${created.active}`);
  console.log('\nNext steps in Shopify Admin:');
  console.log('1. Go to Settings > Shipping and delivery.');
  console.log('2. In your General Shipping Profile, verify that Helthjem Coverage appears under Carrier and app rates.');
  console.log('3. Remember to disable/delete the old manual/static 79 NOK Helthjem rate so only dynamic rates appear at checkout.\n');
}

registerCarrierService().catch(err => {
  console.error('\n❌ Unexpected error:', err.message);
  process.exit(1);
});
