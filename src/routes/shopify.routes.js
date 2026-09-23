import { Router } from 'express';
import logger from '../utils/logger.js';
import { shopifyRateService } from '../services/shopify-rate.service.js';
import { HelthjemTimeoutError } from '../utils/errors.js';

const router = Router();

/**
 * Shopify CarrierService Rates Callback
 * POST /api/shopify/rates
 * 
 * Success coverage: HTTP 200 { "rates": [...] }
 * No coverage:      HTTP 200 { "rates": [] }
 * Technical error:  HTTP 5xx { "error": "Unable to verify Helthjem coverage" }
 */
router.post('/rates', async (req, res, next) => {
  try {
    const result = await shopifyRateService.calculateRates(req.body);
    return res.status(200).json(result);
  } catch (error) {
    logger.error('ShopifyRate', 'Failed to calculate shipping rates due to technical error', error);

    // Differentiate timeout vs general upstream error
    const statusCode = error instanceof HelthjemTimeoutError ? 504 : 502;

    // Return 5xx to Shopify so checkout can trigger its backup shipping rate
    return res.status(statusCode).json({
      error: 'Unable to verify Helthjem coverage'
    });
  }
});

export default router;
