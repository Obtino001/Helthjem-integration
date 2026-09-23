import express from 'express';
import logger from './utils/logger.js';
import healthRoutes from './routes/health.routes.js';
import shopifyRoutes from './routes/shopify.routes.js';
import helthjemRoutes from './routes/helthjem.routes.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Disable x-powered-by header for security
  app.disable('x-powered-by');

  // Request logger in non-test mode
  if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      logger.info('Http', `${req.method} ${req.path}`);
      next();
    });
  }

  // Mount routes
  app.use('/', healthRoutes);
  app.use('/api/shopify', shopifyRoutes);
  app.use('/api/helthjem', helthjemRoutes);

  // 404 Handler for unmatched routes
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.originalUrl
    });
  });

  // Centralized Error Handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('App', 'Unhandled application error', err);
    const statusCode = err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';

    res.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error' : err.message,
      ...(isProd ? {} : { details: err.message })
    });
  });

  return app;
}

export const app = createApp();
export default app;
