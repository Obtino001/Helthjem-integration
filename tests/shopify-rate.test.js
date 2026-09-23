import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShipmentWeight, parseAndValidateDestination, isNorway } from '../src/utils/validation.js';
import { ShopifyRateService } from '../src/services/shopify-rate.service.js';

describe('Shopify Rate Calculation & Validation', () => {
  describe('Weight Calculation', () => {
    it('Case 5: calculates weight as grams * quantity', () => {
      const items = [
        { grams: 500, quantity: 3, requires_shipping: true }
      ];
      const weight = calculateShipmentWeight(items);
      assert.equal(weight, 1500);
    });

    it('Case 6: calculates total weight across multiple line items', () => {
      const items = [
        { grams: 250, quantity: 2, requires_shipping: true }, // 500g
        { grams: 1200, quantity: 1, requires_shipping: true }, // 1200g
        { grams: 100, quantity: 5, requires_shipping: true }   // 500g
      ];
      const weight = calculateShipmentWeight(items);
      assert.equal(weight, 2200);
    });

    it('Case 7: ignores items where requires_shipping is false', () => {
      const items = [
        { grams: 800, quantity: 1, requires_shipping: true },
        { grams: 5000, quantity: 1, requires_shipping: false } // Digital product
      ];
      const weight = calculateShipmentWeight(items);
      assert.equal(weight, 800);
    });

    it('enforces minimum 1 gram when total weight is zero', () => {
      const items = [
        { grams: 0, quantity: 1, requires_shipping: true }
      ];
      const weight = calculateShipmentWeight(items);
      assert.equal(weight, 1);
    });

    it('safely handles non-numeric or missing weight values', () => {
      const items = [
        { grams: null, quantity: 'abc', requires_shipping: true },
        { grams: -50, quantity: 2, requires_shipping: true }
      ];
      const weight = calculateShipmentWeight(items);
      assert.equal(weight, 1);
    });
  });

  describe('Destination Parsing and Validation', () => {
    it('Case 8: appends address2 to address1 when present', () => {
      const destination = {
        country: 'NO',
        address1: 'Storgata 10',
        address2: 'Leil. 402',
        postal_code: '0182',
        city: 'Oslo',
        name: 'Ola Nordmann'
      };
      const parsed = parseAndValidateDestination(destination);
      assert.equal(parsed.isValid, true);
      assert.equal(parsed.address, 'Storgata 10 Leil. 402');
      assert.equal(parsed.zipCode, '0182');
      assert.equal(parsed.postalName, 'Oslo');
      assert.equal(parsed.customerName, 'Ola Nordmann');
    });

    it('leaves address1 unchanged if address2 is empty or omitted', () => {
      const destination = {
        country: 'NO',
        address1: 'Storgata 10',
        postal_code: '0182',
        city: 'Oslo'
      };
      const parsed = parseAndValidateDestination(destination);
      assert.equal(parsed.isValid, true);
      assert.equal(parsed.address, 'Storgata 10');
      assert.equal(parsed.customerName, 'Shopify customer');
    });

    it('supports destination.zip as fallback for postal_code', () => {
      const destination = {
        country: 'NO',
        address1: 'Storgata 10',
        zip: '0182',
        city: 'Oslo'
      };
      const parsed = parseAndValidateDestination(destination);
      assert.equal(parsed.isValid, true);
      assert.equal(parsed.zipCode, '0182');
    });

    it('identifies Norway country variations (NO, NOR, Norway, Norge)', () => {
      assert.equal(isNorway('NO'), true);
      assert.equal(isNorway('no'), true);
      assert.equal(isNorway('NOR'), true);
      assert.equal(isNorway('Norway'), true);
      assert.equal(isNorway('Norge'), true);
      assert.equal(isNorway('SE'), false);
      assert.equal(isNorway('DK'), false);
      assert.equal(isNorway('US'), false);
      assert.equal(isNorway(null), false);
    });

    it('Case 4: marks destination as invalid if address1, zip, or city is missing', () => {
      const missingZip = {
        country: 'NO',
        address1: 'Storgata 10',
        city: 'Oslo'
      };
      assert.equal(parseAndValidateDestination(missingZip).isValid, false);

      const missingCity = {
        country: 'NO',
        address1: 'Storgata 10',
        postal_code: '0182'
      };
      assert.equal(parseAndValidateDestination(missingCity).isValid, false);

      const missingAddress = {
        country: 'NO',
        postal_code: '0182',
        city: 'Oslo'
      };
      assert.equal(parseAndValidateDestination(missingAddress).isValid, false);
    });
  });

  describe('ShopifyRateService Orchestration', () => {
    it('Case 3: returns rates [] for non-Norway destination without calling Helthjem', async () => {
      let helthjemCalled = false;
      const mockHelthjem = {
        checkAddressCoverage: async () => {
          helthjemCalled = true;
          return { covered: true, productName: 'HELTHJEM' };
        }
      };

      const service = new ShopifyRateService(mockHelthjem);
      const result = await service.calculateRates({
        rate: {
          destination: {
            country: 'SE',
            address1: 'Kungsgatan 1',
            postal_code: '11122',
            city: 'Stockholm'
          },
          items: [{ grams: 500, quantity: 1, requires_shipping: true }]
        }
      });

      assert.equal(helthjemCalled, false);
      assert.deepEqual(result, { rates: [] });
    });

    it('Case 4: returns rates [] when required address fields are missing without calling Helthjem', async () => {
      let helthjemCalled = false;
      const mockHelthjem = {
        checkAddressCoverage: async () => {
          helthjemCalled = true;
          return { covered: true, productName: 'HELTHJEM' };
        }
      };

      const service = new ShopifyRateService(mockHelthjem);
      const result = await service.calculateRates({
        rate: {
          destination: {
            country: 'NO',
            address1: '',
            postal_code: '0182',
            city: 'Oslo'
          }
        }
      });

      assert.equal(helthjemCalled, false);
      assert.deepEqual(result, { rates: [] });
    });

    it('Case 1: returns 79 NOK rate when Norway address has HELTHJEM coverage', async () => {
      const mockHelthjem = {
        checkAddressCoverage: async (params) => {
          assert.equal(params.countryCode, 'NO');
          assert.equal(params.address, 'Kongsberggata 18');
          assert.equal(params.zipCode, '0468');
          assert.equal(params.postalName, 'Oslo');
          return { covered: true, productName: 'HELTHJEM' };
        }
      };

      const service = new ShopifyRateService(mockHelthjem);
      const result = await service.calculateRates({
        rate: {
          destination: {
            country: 'NO',
            address1: 'Kongsberggata 18',
            postal_code: '0468',
            city: 'Oslo',
            name: 'Test Customer'
          },
          items: [{ grams: 1000, quantity: 1, requires_shipping: true }]
        }
      });

      assert.equal(result.rates.length, 1);
      assert.equal(result.rates[0].service_name, 'Helthjem - Hjemlevering | 1-3 virkedager');
      assert.equal(result.rates[0].service_code, 'helthjem_home');
      assert.equal(result.rates[0].total_price, '7900');
      assert.equal(result.rates[0].currency, 'NOK');
    });

    it('Case 2: returns rates [] when Helthjem reports no coverage', async () => {
      const mockHelthjem = {
        checkAddressCoverage: async () => {
          return { covered: false, reason: 'no.carrier.support' };
        }
      };

      const service = new ShopifyRateService(mockHelthjem);
      const result = await service.calculateRates({
        rate: {
          destination: {
            country: 'NO',
            address1: 'Fjellveien 999',
            postal_code: '9999',
            city: 'Fjellbygda'
          },
          items: [{ grams: 1000, quantity: 1, requires_shipping: true }]
        }
      });

      assert.deepEqual(result, { rates: [] });
    });
  });
});
