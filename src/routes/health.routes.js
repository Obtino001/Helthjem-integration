import { Router } from 'express';
import config from '../config/env.js';

const router = Router();

/**
 * Root service status endpoint
 * GET /
 */
router.get('/', (req, res) => {
  res.status(200).json({
    service: 'helthjem-shopify-carrier',
    status: 'ok',
    environment: config.nodeEnv
  });
});

/**
 * Lightweight health check endpoint for monitoring/Render
 * GET /health
 * Note: Never invokes Helthjem or performs external authentication.
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

export default router;
