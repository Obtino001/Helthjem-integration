import config from '../config/env.js';
import { shopifyAuthService } from './shopify-auth.service.js';

export const CARRIERS_QUERY = `query ListCarrierServices($after: String) { carrierServices(first: 50, after: $after) { edges { node { id name callbackUrl active supportsServiceDiscovery } } pageInfo { hasNextPage endCursor } } }`;
export const CREATE_MUTATION = `mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) { carrierServiceCreate(input: $input) { carrierService { id name callbackUrl active supportsServiceDiscovery } userErrors { field message } } }`;

export async function shopifyGraphql(query, variables) {
  const token = await shopifyAuthService.getAccessToken();
  let response;
  try {
    response = await fetch(`https://${config.shopify.shop}.myshopify.com/admin/api/${config.shopify.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables })
    });
  } catch { throw new Error('Shopify Admin API network request failed'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('Invalid Shopify Admin API response'); }
  if (!response.ok) throw new Error(`Shopify Admin API failed (HTTP ${response.status})`);
  if (result?.errors?.length) throw new Error('Shopify Admin API GraphQL query failed');
  if (!result?.data) throw new Error('Invalid Shopify Admin API response');
  return result.data;
}

export async function fetchCarrierServices() {
  const carriers = [];
  let after = null;
  for (;;) {
    const data = await shopifyGraphql(CARRIERS_QUERY, { after });
    const connection = data.carrierServices;
    if (!Array.isArray(connection?.edges) || !connection.pageInfo) throw new Error('Invalid Shopify CarrierService list response');
    carriers.push(...connection.edges.map(edge => edge.node));
    if (!connection.pageInfo.hasNextPage) return carriers;
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error('Invalid Shopify CarrierService pagination response');
  }
}
