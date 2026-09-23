# Helthjem Shipping Coverage CarrierService for Shopify Plus

A production-ready Node.js backend integration that calculates dynamic shipping rates for Shopify Plus checkouts using Helthjem's Single Address Coverage Check API.

This service replaces static/manual shipping rates (`Helthjem - Hjemlevering | 1-3 virkedager` at 79 NOK) with a real-time carrier callback. If Helthjem confirms delivery coverage for a customer's address in Norway, the 79 NOK rate is returned. If Helthjem reports no carrier support, the rate is omitted from checkout.

---

## 1. What the Integration Does

1. **Checkout Interception**: When a customer enters their shipping address in Shopify Plus checkout, Shopify dispatches a webhook to `POST /api/shopify/rates`.
2. **Address & Weight Normalization**:
   - Verifies the destination country is Norway (`NO`). Non-Norway destinations immediately receive an empty rates list without making external API calls.
   - Normalizes address lines (`address1` + `address2`), postal code, and city.
   - Calculates total shipment weight from line items (ignoring digital/non-shippable items, with a safe 1g minimum).
3. **Helthjem Coverage Lookup**:
   - Calls Helthjem Single Address Check (`POST /parcels/v1/addresses/find/single`) with `transportSolutionId: 2` (home delivery).
   - Authenticates via OAuth2 client credentials with in-memory token caching (refreshing every 12 hours) and single-flight concurrency locking.
   - Automatically handles 401 token invalidation with an immediate refresh and single retry.
4. **Checkout Rate Response**:
   - **Covered (`productName: "HELTHJEM"`)**: Returns HTTP 200 with the 79 NOK shipping rate.
   - **Not Covered (`errorKey: "no.carrier.support"`)**: Returns HTTP 200 with `{"rates": []}` so the option is hidden from checkout.
   - **Technical Failures (5xx, timeouts, network issues)**: Returns HTTP 5xx so Shopify triggers its native backup rates instead of falsely claiming no coverage.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Shopify Plus Checkout                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ 1. POST /api/shopify/rates
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Helthjem Carrier Web Service                  │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ Destination Validator │       │   Weight Calculator   │  │
│  │ (NO check, completeness)      │   (grams * quantity)  │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              └───────────────┬───────────────┘              │
│                              ▼                              │
│                 ┌─────────────────────────┐                 │
│                 │     Helthjem Client     │                 │
│                 │  - OAuth2 Token Cache   │                 │
│                 │  - Concurrency Lock     │                 │
│                 │  - 401 Auto-Retry       │                 │
│                 │  - AbortController (4s) │                 │
│                 └────────────┬────────────┘                 │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               │ 2. POST /parcels/v1/addresses/find/single
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Helthjem API                         │
│               (Pre-prod or Production URL)                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 ┌──────────────────────┐              ┌──────────────────────┐
 │  productName:        │              │  errorKey:           │
 │  "HELTHJEM"          │              │  "no.carrier.support"│
 └──────────┬───────────┘              └──────────┬───────────┘
            │                                     │
            ▼                                     ▼
 ┌──────────────────────┐              ┌──────────────────────┐
 │ HTTP 200             │              │ HTTP 200             │
 │ Rates: [79.00 NOK]   │              │ Rates: [] (Hidden)   │
 └──────────────────────┘              └──────────────────────┘
```

---

## 3. Local Setup

### Prerequisites
- Node.js 20.0.0 or higher
- npm 10.0.0 or higher

### Installation
```bash
# 1. Clone repository and enter directory
cd "d:/Videos/Helthjem integration"

# 2. Install dependencies
npm install

# 3. Create your local environment file
cp .env.example .env

# 4. Run automated test suite (all mocks, zero external network calls)
npm test

# 5. Start development server with auto-reload
npm run dev
```

The service will start on `http://localhost:3000`.

---

## 4. Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | No | `3000` | Port for the Express HTTP server |
| `NODE_ENV` | No | `development` | Environment mode (`development`, `production`, `test`) |
| `HELTHJEM_BASE_URL` | Yes | — | Base URL for Helthjem API (e.g. `https://api.pre.helthjem.no`) |
| `HELTHJEM_SHOP_ID` | Yes | — | Helthjem Shop ID (`16` for Pre-prod, `2439` for Prod) |
| `HELTHJEM_CLIENT_ID` | Yes | — | OAuth2 Client ID from Helthjem |
| `HELTHJEM_CLIENT_SECRET` | Yes | — | OAuth2 Client Secret from Helthjem |
| `HELTHJEM_TRANSPORT_SOLUTION_ID` | No | `2` | 2 = Helthjem Home Delivery |
| `HELTHJEM_RATE_NAME` | No | `Helthjem - Hjemlevering \| 1-3 virkedager` | Rate title shown to customer at checkout |
| `HELTHJEM_RATE_CODE` | No | `helthjem_home` | Internal carrier service rate code |
| `HELTHJEM_RATE_DESCRIPTION`| No | `Helthjem standard home delivery` | Rate description |
| `HELTHJEM_RATE_PRICE` | No | `7900` | Price in subunit cents/øre (`7900` = 79.00 NOK) |
| `HELTHJEM_RATE_CURRENCY` | No | `NOK` | ISO currency code |
| `HELTHJEM_TIMEOUT_MS` | No | `4000` | Upstream request timeout in milliseconds |
| `ENABLE_TEST_ENDPOINT` | No | `true` | Enables `/api/helthjem/coverage` test endpoint |
| `TEST_API_KEY` | No | — | Optional security key required in `x-test-api-key` header |
| `SHOPIFY_STORE_DOMAIN` | For CLI | — | e.g. `my-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | For CLI | — | Shopify Admin API token (`shpat_...`) |
| `SHOPIFY_API_VERSION` | No | `2026-07` | Shopify GraphQL Admin API version |
| `PUBLIC_BASE_URL` | For CLI | — | Public HTTPS URL where this service is hosted (e.g. Render) |
| `SHOPIFY_CARRIER_NAME` | No | `Helthjem Coverage` | Name of the CarrierService registered on Shopify |

---

## 5. Pre-Production Setup

To test against Helthjem's pre-production environment:

```env
HELTHJEM_BASE_URL=https://api.pre.helthjem.no
HELTHJEM_SHOP_ID=16
HELTHJEM_CLIENT_ID=your_preprod_client_id
HELTHJEM_CLIENT_SECRET=your_preprod_client_secret
HELTHJEM_TRANSPORT_SOLUTION_ID=2
```

> [!NOTE]
> Do not guess production hostnames. The production base URL will be provided with your official Helthjem production credentials (`HELTHJEM_SHOP_ID=2439`).

---

## 6. Render Deployment Steps

This repository includes a deployment blueprint in `render.yaml`.

1. Push your repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com/):
   - Click **New** > **Blueprint**.
   - Connect your repository. Render reads `render.yaml` automatically.
   - Alternatively, create a **Web Service**:
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/health`
3. In the Render Dashboard **Environment** tab, fill in the secret variables:
   - `HELTHJEM_BASE_URL`
   - `HELTHJEM_SHOP_ID`
   - `HELTHJEM_CLIENT_ID`
   - `HELTHJEM_CLIENT_SECRET`
   - `PUBLIC_BASE_URL` (Set to your Render URL, e.g., `https://helthjem-carrier.onrender.com`)
   - `TEST_API_KEY` (A random secret string for manual testing)
4. Verify deployment:
   ```bash
   curl https://helthjem-carrier.onrender.com/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

---

## 7. Manual Helthjem Coverage Test

You can manually verify address coverage through the backend before linking to Shopify.

### Documented Helthjem Test Address (Oslo)
```bash
curl -X POST http://localhost:3000/api/helthjem/coverage \
  -H "Content-Type: application/json" \
  -H "x-test-api-key: your_secret_test_key_for_manual_endpoint" \
  -d '{
    "customerName": "Test customer",
    "address": "Kongsberggata 18",
    "zipCode": "0468",
    "postalName": "Oslo",
    "weight": 1000
  }'
```

Expected response:
```json
{
  "covered": true,
  "productName": "HELTHJEM"
}
```

### Client Target Address Verification (Stjørdal)
Address to test:
- **Address**: `Lufthavnveien 11`
- **Postal Code**: `7502`
- **City**: `Stjørdal`
- **Country**: `NO`

```bash
curl -X POST http://localhost:3000/api/helthjem/coverage \
  -H "Content-Type: application/json" \
  -H "x-test-api-key: your_secret_test_key_for_manual_endpoint" \
  -d '{
    "customerName": "Test Customer",
    "address": "Lufthavnveien 11",
    "zipCode": "7502",
    "postalName": "Stjørdal",
    "weight": 1000
  }'
```
*Note: Do not assume whether this address is covered. The Helthjem API response dynamically determines coverage.*

---

## 8. Shopify Custom App Requirements

To register and manage the CarrierService callback, create a Custom App in Shopify:

1. In Shopify Admin, navigate to **Settings** > **Apps and sales channels** > **Develop apps**.
2. Click **Create an app** and name it (e.g. `Helthjem Carrier Integration`).
3. Under **Configuration** > **Admin API integration**, add permissions.

---

## 9. Required Shopify Scopes

The Shopify app requires the following access scopes:
- **`write_shipping`** (Required: to register and manage CarrierServices)
- **`read_shipping`** (Required: to query and list existing CarrierServices)

Install the app and copy the **Admin API access token** (`shpat_...`).

---

## 10. How to Register CarrierService

> [!CAUTION]
> Ensure your service is deployed to a public HTTPS URL (like Render) before running this script. Shopify cannot reach `localhost`.

Set the following in `.env`:
```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_BASE_URL=https://your-service.onrender.com
SHOPIFY_CARRIER_NAME=Helthjem Coverage
```

Run the registration script:
```bash
npm run shopify:register-carrier
```

The script:
1. Queries Shopify first to inspect existing carriers.
2. Refuses to register a duplicate if the carrier name or callback URL already exists.
3. Submits the `carrierServiceCreate` GraphQL mutation (`2026-07`).
4. Prints the created CarrierService ID.

---

## 11. How to List Existing Carrier Services

To view all carrier services registered on your store:
```bash
npm run shopify:list-carriers
```

Output sample:
```text
┌─────────┬────────────────────────────┬────────────────────┬────────────────────────────────────────────────┬────────┬───────────────────┐
│ (index) │             ID             │        Name        │                  Callback URL                  │ Active │ Service Discovery │
├─────────┼────────────────────────────┼────────────────────┼────────────────────────────────────────────────┼────────┼───────────────────┤
│    0    │ 'gid://shopify/Delivery... │ 'Helthjem Coverage'│ 'https://helthjem-carrier.onrender.com/api...' │  true  │       false       │
└─────────┴────────────────────────────┴────────────────────┴────────────────────────────────────────────────┴────────┴───────────────────┘
```

---

## 12. Shopify Shipping-Profile Setup

1. In Shopify Admin, go to **Settings** > **Shipping and delivery**.
2. Click on your **General shipping profile** (or specific product profile).
3. Under **Shipping zones** for Norway:
   - Click **Add rate**.
   - Select **Use carrier or app to calculate rates**.
   - Under the dropdown, select **Helthjem Coverage**.
   - Check the checkbox for the service rate.
4. Save your changes.

---

## 13. Critical Warning: Remove Old Static Rates

> [!WARNING]
> **Disable Old Static Rate Before Final Checkout Testing!**
> 
> If you leave your old static rate (`Helthjem - Hjemlevering | 1-3 virkedager - 79 NOK`) active in Shopify shipping settings alongside the new CarrierService:
> - Addresses **without** Helthjem coverage will still display the static rate!
> - Addresses **with** coverage may show duplicate Helthjem options.
> 
> Always delete or deactivate the manual static rate in your shipping zone once the CarrierService is added.

---

## 14. Testing the Shopify Callback

### Sample Request Fixture
Simulate Shopify checkout calling your local or staging server:

```bash
curl -X POST http://localhost:3000/api/shopify/rates \
  -H "Content-Type: application/json" \
  -d '{
    "rate": {
      "destination": {
        "country": "NO",
        "postal_code": "0468",
        "city": "Oslo",
        "name": "Test Customer",
        "address1": "Kongsberggata 18",
        "address2": ""
      },
      "items": [
        {
          "quantity": 1,
          "grams": 1000,
          "requires_shipping": true
        }
      ],
      "currency": "NOK",
      "locale": "nb"
    }
  }'
```

Expected Response:
```json
{
  "rates": [
    {
      "service_name": "Helthjem - Hjemlevering | 1-3 virkedager",
      "service_code": "helthjem_home",
      "description": "Helthjem standard home delivery",
      "total_price": "7900",
      "currency": "NOK"
    }
  ]
}
```

### Automated Test Matrix
Run the comprehensive test suite:
```bash
npm test
```

Verified scenarios (35 automated assertions):
- [x] Norway + HELTHJEM coverage => returns 79 NOK rate (`total_price: "7900"`).
- [x] `no.carrier.support` => returns HTTP 200 with `rates: []`.
- [x] Non-Norway destination => returns HTTP 200 `rates: []` without calling Helthjem.
- [x] Incomplete destination fields => returns HTTP 200 `rates: []`.
- [x] Weight formula: `sum(grams * quantity)`.
- [x] Multi-item weight aggregation.
- [x] `requires_shipping: false` items excluded from weight.
- [x] `address2` safely appended to `address1`.
- [x] OAuth2 token cached in memory across calls.
- [x] Proactive token refresh when expired (< 12 hours).
- [x] Single-flight concurrency lock (no token request stampede).
- [x] HTTP 401 triggers token invalidation and single retry.
- [x] Helthjem 500 error triggers HTTP 502 to preserve Shopify backup rates.
- [x] Helthjem timeout (4000ms) triggers HTTP 504 to preserve Shopify backup rates.
- [x] Secrets, tokens, and PII are never returned in error responses.
- [x] Manual test endpoint disabled when `ENABLE_TEST_ENDPOINT=false` (404).
- [x] Manual test endpoint API key validation enforced (`x-test-api-key`).

---

## 15. Production Checklist

- [ ] Production credentials set in Render: `HELTHJEM_SHOP_ID=2439`, production `HELTHJEM_CLIENT_ID`, `HELTHJEM_CLIENT_SECRET`, and official production `HELTHJEM_BASE_URL`.
- [ ] `PUBLIC_BASE_URL` set to production HTTPS domain (Render URL or custom domain).
- [ ] Render Health Check configured to `/health`.
- [ ] `ENABLE_TEST_ENDPOINT` set to `false` or protected with a strong `TEST_API_KEY`.
- [ ] CarrierService registered on Shopify using `npm run shopify:register-carrier`.
- [ ] Shopify Shipping Profile updated to include **Helthjem Coverage**.
- [ ] Old static 79 NOK Helthjem shipping rate removed from Shopify.
- [ ] Backup shipping rate configured in Shopify (in case of carrier service outage).

---

## 16. Security Checklist

- [ ] `.env` is listed in `.gitignore` and never committed.
- [ ] Secrets (client secrets, OAuth tokens, Shopify admin tokens) are never printed to console logs or returned in HTTP error payloads.
- [ ] PII (street address, names) is masked in application logs.
- [ ] `express.disable('x-powered-by')` enabled.
- [ ] Input payload size limits enforced (1MB max).

---

## 17. Troubleshooting

### 1. Rates do not appear at checkout
- Verify the shipping address has country set to Norway (`NO`).
- Check if the address has carrier support using `/api/helthjem/coverage`.
- Verify CarrierService status in Shopify using `npm run shopify:list-carriers` (must be `active: true`).
- Ensure the CarrierService is enabled inside the Norway Shipping Zone in Shopify Admin.

### 2. Helthjem returns 401 Unauthorized
- Verify `HELTHJEM_CLIENT_ID` and `HELTHJEM_CLIENT_SECRET`.
- Check if `HELTHJEM_BASE_URL` matches the credential environment (pre-prod vs prod).

### 3. Shopify checkout is slow
- The Helthjem client defaults to a 4000ms timeout (`HELTHJEM_TIMEOUT_MS=4000`).
- Ensure your Render service is deployed in a region close to Norway / Shopify Europe (e.g. Frankfurt).
