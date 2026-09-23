/**
 * Validation and normalization utilities for Shopify CarrierService requests.
 */

const NORWAY_COUNTRY_VARIANTS = new Set([
  'no',
  'nor',
  'norway',
  'norge'
]);

/**
 * Checks if the given country string represents Norway.
 * @param {string|null|undefined} country
 * @returns {boolean}
 */
export function isNorway(country) {
  if (!country || typeof country !== 'string') {
    return false;
  }
  const normalized = country.trim().toLowerCase();
  return NORWAY_COUNTRY_VARIANTS.has(normalized);
}

/**
 * Normalizes destination from Shopify carrier rate payload.
 * Returns null if destination is invalid or incomplete.
 * @param {object} destination
 * @returns {{
 *   isValid: boolean,
 *   isNorway: boolean,
 *   address: string,
 *   zipCode: string,
 *   postalName: string,
 *   countryCode: string,
 *   customerName: string
 * }}
 */
export function parseAndValidateDestination(destination) {
  if (!destination || typeof destination !== 'object') {
    return {
      isValid: false,
      isNorway: false,
      address: '',
      zipCode: '',
      postalName: '',
      countryCode: '',
      customerName: 'Shopify customer'
    };
  }

  const country = destination.country || destination.country_code || '';
  const countryIsNorway = isNorway(country);

  if (!countryIsNorway) {
    return {
      isValid: false,
      isNorway: false,
      address: '',
      zipCode: '',
      postalName: '',
      countryCode: typeof country === 'string' ? country.trim() : '',
      customerName: 'Shopify customer'
    };
  }

  const address1 = (destination.address1 || '').trim();
  const address2 = (destination.address2 || '').trim();
  const address = address2 ? `${address1} ${address2}`.trim() : address1;

  const zipCode = ((destination.postal_code || destination.zip || '') + '').trim();
  const postalName = (destination.city || '').trim();

  const customerName = (destination.name && typeof destination.name === 'string' && destination.name.trim().length > 0)
    ? destination.name.trim()
    : 'Shopify customer';

  // Check required fields for Helthjem coverage call
  const isComplete = Boolean(address1 && zipCode && postalName);

  return {
    isValid: isComplete,
    isNorway: true,
    address,
    zipCode,
    postalName,
    countryCode: 'NO',
    customerName
  };
}

/**
 * Calculates total shipment weight in grams from Shopify line items.
 * Rules:
 * - Sum of (item.grams * item.quantity)
 * - Excludes items where requires_shipping === false
 * - Safe numeric conversion (handles undefined, null, NaN)
 * - Non-negative
 * - Minimum 1 gram if result is zero
 * - Never uses price
 * 
 * @param {Array<object>} items
 * @returns {number}
 */
export function calculateShipmentWeight(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 1000; // Default fallback to 1000g (1kg) standard parcel if no items provided
  }

  let totalGrams = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    // Only count items where requires_shipping is not explicitly false
    if (item.requires_shipping === false) {
      continue;
    }

    const rawGrams = Number(item.grams);
    const rawQty = Number(item.quantity);

    const grams = (!isNaN(rawGrams) && rawGrams > 0) ? rawGrams : 0;
    const quantity = (!isNaN(rawQty) && rawQty > 0) ? rawQty : 1;

    totalGrams += grams * quantity;
  }

  // Ensure non-negative and minimum 1g
  totalGrams = Math.max(0, Math.round(totalGrams));
  return totalGrams === 0 ? 1 : totalGrams;
}
