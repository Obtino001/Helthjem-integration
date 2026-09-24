import config from '../config/env.js';
import logger from '../utils/logger.js';
import { parseAndValidateDestination, calculateShipmentWeight } from '../utils/validation.js';
import { helthjemService } from './helthjem.service.js';

export class ShopifyRateService {
  constructor(helthjem = helthjemService, customConfig = null) {
    this.helthjem = helthjem;
    this.config = customConfig || config;
  }

  /**
   * Processes a Shopify CarrierService rate request.
   * Returns calculated rates array or empty array if no coverage.
   * Throws on upstream technical failures.
   * 
   * @param {object} ratePayload
   * @returns {Promise<{ rates: Array<object> }>}
   */
  async calculateRates(ratePayload) {
    logger.info('ShopifyRate', 'Request received');

    const rateData = ratePayload?.rate || ratePayload || {};
    const destination = rateData.destination;
    const items = rateData.items || [];

    // Parse and validate destination
    const parsedDest = parseAndValidateDestination(destination);

    // If destination is not Norway, return empty rates immediately (Helthjem is Norway-only)
    if (!parsedDest.isNorway) {
      logger.info('ShopifyRate', `Non-Norway destination (${parsedDest.countryCode || 'unknown'}), returning empty rates`);
      return { rates: [] };
    }

    logger.info('ShopifyRate', 'Norway destination');

    // If destination in Norway is missing required address fields, return empty rates without calling Helthjem
    if (!parsedDest.isValid) {
      logger.info('ShopifyRate', 'Incomplete Norway destination address fields, returning empty rates');
      return { rates: [] };
    }

    // Calculate total billable shipment weight in grams
    const weightGrams = calculateShipmentWeight(items);

    // Check coverage with Helthjem API
    const coverageResult = await this.helthjem.checkAddressCoverage({
      address: parsedDest.address,
      zipCode: parsedDest.zipCode,
      postalName: parsedDest.postalName,
      customerName: parsedDest.customerName,
      weight: weightGrams,
      countryCode: 'NO'
    });

    // If Helthjem confirms coverage, return the configured shipping rate
    if (coverageResult.covered && coverageResult.productName === 'HELTHJEM') {
      logger.info('ShopifyRate', 'Coverage confirmed, returning Helthjem rate');
      return {
        rates: [
          {
            service_name: this.config.helthjem.rateName,
            service_code: this.config.helthjem.rateCode,
            description: this.config.helthjem.rateDescription,
            total_price: String(this.config.helthjem.ratePrice),
            currency: this.config.helthjem.rateCurrency
          }
        ]
      };
    }

    if (coverageResult.reason !== 'no.carrier.support') {
      throw new Error('Unexpected Helthjem coverage result');
    }

    // No coverage confirmed
    logger.info('ShopifyRate', `No Helthjem coverage (${coverageResult.reason || 'unsupported'}), returning empty rates`);
    return { rates: [] };
  }
}

export const shopifyRateService = new ShopifyRateService();
export default shopifyRateService;
