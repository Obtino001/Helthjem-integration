import { Router } from 'express';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { helthjemService } from '../services/helthjem.service.js';

const router = Router();

/**
 * Middleware: Verify test endpoint is enabled and check optional API key.
 */
function verifyTestEndpointAccess(req, res, next) {
  if (!config.testEndpoint.enabled) {
    return res.status(404).json({
      error: 'Test endpoint is disabled'
    });
  }

  // If a test API key is configured, enforce exact match
  if (config.testEndpoint.apiKey) {
    const providedKey = req.headers['x-test-api-key'];
    if (!providedKey || providedKey !== config.testEndpoint.apiKey) {
      logger.warn('HelthjemTest', 'Unauthorized attempt to access manual coverage test endpoint');
      return res.status(401).json({
        error: 'Unauthorized: Invalid or missing x-test-api-key header'
      });
    }
  }

  next();
}

/**
 * Manual Helthjem Coverage Verification Endpoint
 * POST /api/helthjem/coverage
 * 
 * Payload:
 * {
 *   "customerName": "Test customer",
 *   "address": "Kongsberggata 18",
 *   "zipCode": "0468",
 *   "postalName": "Oslo",
 *   "weight": 1000
 * }
 */
router.post('/coverage', verifyTestEndpointAccess, async (req, res) => {
  const { customerName, address, zipCode, postalName, weight } = req.body || {};

  if (!address || !zipCode || !postalName) {
    return res.status(400).json({
      error: 'Missing required address fields: address, zipCode, and postalName are required.'
    });
  }

  try {
    const result = await helthjemService.checkAddressCoverage({
      customerName: customerName || 'Test customer',
      address,
      zipCode,
      postalName,
      weight: Number(weight) || 1000,
      countryCode: 'NO'
    });

    if (result.covered) {
      return res.status(200).json({
        covered: true,
        productName: result.productName || 'HELTHJEM'
      });
    }

    return res.status(200).json({
      covered: false,
      reason: result.reason
    });
  } catch (error) {
    logger.error('HelthjemTest', 'Coverage check failed with error', error);
    const statusCode = error.statusCode || 502;
    return res.status(statusCode).json({
      error: 'Failed to verify Helthjem coverage',
      message: 'Helthjem request failed'
    });
  }
});

export default router;
