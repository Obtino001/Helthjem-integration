#!/usr/bin/env node
/**
 * Utility script to list all registered Shopify CarrierServices.
 * Uses Shopify GraphQL Admin API (2026-07).
 * Requires Shopify App scope: read_shipping (or write_shipping).
 */

import dotenv from 'dotenv';
dotenv.config();

const storeDomain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07';

if (!storeDomain || !token) {
  console.error('\n❌ ERROR: Missing Shopify credentials in environment.');
  console.error('Please configure SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in your .env file.\n');
  process.exit(1);
}

const graphqlUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;

const QUERY = `
  query ListCarrierServices {
    deliveryCarrierServices(first: 50) {
      edges {
        node {
          id
          name
          callbackUrl
          active
          supportsServiceDiscovery
        }
      }
    }
  }
`;

export async function fetchCarrierServices() {
  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query: QUERY })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API responded with HTTP ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL Errors: ${result.errors.map(e => e.message).join(', ')}`);
  }

  const edges = result.data?.deliveryCarrierServices?.edges || [];
  return edges.map(edge => edge.node);
}

async function run() {
  console.log(`\n🔍 Fetching registered CarrierServices from ${storeDomain} (API ${apiVersion})...\n`);

  try {
    const carriers = await fetchCarrierServices();

    if (carriers.length === 0) {
      console.log('ℹ️  No CarrierServices currently registered on this store.\n');
      return;
    }

    console.log(`Found ${carriers.length} registered CarrierService(s):\n`);
    console.table(carriers.map(c => ({
      ID: c.id,
      Name: c.name,
      'Callback URL': c.callbackUrl,
      Active: c.active,
      'Service Discovery': c.supportsServiceDiscovery
    })));
    console.log('');
  } catch (error) {
    console.error('\n❌ Failed to query CarrierServices:', error.message);
    console.error('Verify that:');
    console.error(' 1. Your Shopify Custom App has `read_shipping` or `write_shipping` permissions.');
    console.error(' 2. The SHOPIFY_STORE_DOMAIN is correct (e.g. my-store.myshopify.com).');
    console.error(' 3. The SHOPIFY_ADMIN_ACCESS_TOKEN is valid.\n');
    process.exit(1);
  }
}

// Only execute directly when run as CLI script
if (process.argv[1]?.endsWith('list-carriers.js')) {
  run();
}
