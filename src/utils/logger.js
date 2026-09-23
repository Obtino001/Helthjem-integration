/**
 * Structured logger utility with automatic masking of sensitive information.
 * Ensures tokens, secrets, and customer PII are never leaked to logs.
 */

const SENSITIVE_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-.]+/gi,
  /shpat_[a-zA-Z0-9]+/gi,
  /client_secret["']?\s*[:=]\s*["']?[^"',\s]+/gi
];

/**
 * Redacts known sensitive patterns and credentials from a message or object.
 * @param {any} data
 * @returns {any}
 */
export function sanitizeLogData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let sanitized = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }

  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(item => sanitizeLogData(item));
    }

    const copy = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key')
      ) {
        copy[key] = '[REDACTED]';
      } else if (
        lowerKey.includes('address') ||
        lowerKey.includes('street') ||
        lowerKey.includes('customername') ||
        lowerKey.includes('name') ||
        lowerKey.includes('phone') ||
        lowerKey.includes('email')
      ) {
        // Redact PII in production / general logs
        if (typeof value === 'string' && value.length > 0) {
          copy[key] = value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`;
        } else {
          copy[key] = '[PII REDACTED]';
        }
      } else if (typeof value === 'object') {
        copy[key] = sanitizeLogData(value);
      } else {
        copy[key] = value;
      }
    }
    return copy;
  }

  return data;
}

function formatPrefix(prefix) {
  return prefix ? `[${prefix}] ` : '';
}

export const logger = {
  info: (prefix, message, meta) => {
    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} INFO  ${formatPrefix(prefix)}${message}`;
    if (meta !== undefined) {
      console.log(formatted, sanitizeLogData(meta));
    } else {
      console.log(formatted);
    }
  },

  warn: (prefix, message, meta) => {
    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} WARN  ${formatPrefix(prefix)}${message}`;
    if (meta !== undefined) {
      console.warn(formatted, sanitizeLogData(meta));
    } else {
      console.warn(formatted);
    }
  },

  error: (prefix, message, error) => {
    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} ERROR ${formatPrefix(prefix)}${message}`;
    if (error) {
      const sanitizedErr = error instanceof Error
        ? { message: sanitizeLogData(error.message), name: error.name, code: error.code }
        : sanitizeLogData(error);
      console.error(formatted, sanitizedErr);
    } else {
      console.error(formatted);
    }
  },

  debug: (prefix, message, meta) => {
    if (process.env.NODE_ENV === 'production') return;
    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} DEBUG ${formatPrefix(prefix)}${message}`;
    if (meta !== undefined) {
      console.debug(formatted, sanitizeLogData(meta));
    } else {
      console.debug(formatted);
    }
  }
};

export default logger;
