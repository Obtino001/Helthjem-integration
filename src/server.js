import config, { validateConfig } from './config/env.js';
import logger from './utils/logger.js';
import app from './app.js';

// Validate environment variables on startup (skips strict credential check in test mode)
try {
  validateConfig();
} catch (error) {
  logger.error('Startup', error.message);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  logger.info('Server', `Helthjem Shopify CarrierService listening on port ${config.port} (${config.nodeEnv})`);
  logger.info('Server', `Health check available at http://localhost:${config.port}/health`);
  logger.info('Server', `Carrier callback endpoint at http://localhost:${config.port}/api/shopify/rates`);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info('Server', `Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Server', 'Closed out remaining connections. Process exiting.');
    process.exit(0);
  });

  // Force close after 10s if connections refuse to terminate
  setTimeout(() => {
    logger.error('Server', 'Forcefully terminating server after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
