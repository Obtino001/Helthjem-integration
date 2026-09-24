#!/usr/bin/env node
import { shopifyGraphql } from '../src/services/shopify-admin.service.js';

const UPDATE_MUTATION = `mutation CarrierServiceUpdate($input: DeliveryCarrierServiceUpdateInput!) {
  carrierServiceUpdate(input: $input) {
    carrierService {
      id
      name
      callbackUrl
      active
    }
    userErrors {
      field
      message
    }
  }
}`;

const input = {
  id: "gid://shopify/DeliveryCarrierService/108187615543",
  name: "Helthjem Coverage",
  callbackUrl: "https://wholesale-critical-freedom-taken.trycloudflare.com/api/shopify/rates",
  active: true
};

try {
  const result = await shopifyGraphql(UPDATE_MUTATION, { input });
  if (result.carrierServiceUpdate.userErrors.length > 0) {
    console.error('Errors:', result.carrierServiceUpdate.userErrors);
    process.exitCode = 1;
  } else {
    console.log('Update successful:', result.carrierServiceUpdate.carrierService);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
