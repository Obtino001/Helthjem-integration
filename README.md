# Helthjem Shopify CarrierService

This existing Express service returns the 79 NOK **Helthjem - Hjemlevering | 1-3 virkedager** rate for Norwegian addresses when Helthjem Single Address Check confirms `productName: "HELTHJEM"`. An explicit `errorKey: "no.carrier.support"` returns HTTP 200 with `{"rates":[]}`. Technical or unexpected upstream responses return a sanitized 5xx.

## Local setup

Use Node.js 20 or newer. Run `npm install`, create a private `.env` from `.env.example`, then run `npm test` and `npm start`. The `.env` file is Git ignored. `/` and `/health` are local health endpoints; `/api/shopify/rates` is the Shopify callback. `/api/helthjem/coverage` is a manual test endpoint controlled by `ENABLE_TEST_ENDPOINT` and `TEST_API_KEY`. Disable it for production.

Use Helthjem PRE-PROD credentials with `HELTHJEM_BASE_URL=https://api.pre.helthjem.no`, `HELTHJEM_SHOP_ID=16`, and `HELTHJEM_TRANSPORT_SOLUTION_ID=2`. The rate price is expressed in øre: `HELTHJEM_RATE_PRICE=7900`.

## Shopify authentication and registration

The Shopify Dev Dashboard app must be released, installed on the target store, and granted `read_shipping` and `write_shipping`. Set `SHOPIFY_SHOP` to the exact **subdomain** of the store's `*.myshopify.com` domain, plus `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`. The service obtains short lived Admin API tokens with the client credentials grant and caches them in memory. It does not use a static Admin access token.

Run `npm run shopify:test-auth` to check authentication, `write_shipping`, and a harmless Admin GraphQL query. Run `npm run shopify:list-carriers` to see existing carrier services. After live callback verification, set `PUBLIC_BASE_URL` to the public HTTPS origin and run `npm run shopify:register-carrier`. The registration script checks for an existing service by name or callback URL and refuses to create a duplicate if listing fails.

The callback is `${PUBLIC_BASE_URL}/api/shopify/rates` and the carrier name defaults to `Helthjem Coverage`. A Cloudflare Quick Tunnel is temporary for local checkout testing. Use a stable HTTPS URL for production registration.

In Shopify Admin, add the carrier or app rate to the Norway shipping profile and remove or disable the old static 79 NOK Helthjem rate before checkout verification.
