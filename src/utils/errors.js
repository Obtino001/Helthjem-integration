/**
 * Custom error classes for clean and structured error handling.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class HelthjemApiError extends AppError {
  constructor(message, statusCode = 502, details = null) {
    super(message, statusCode);
    this.name = 'HelthjemApiError';
    this.details = details;
  }
}

export class HelthjemAuthError extends AppError {
  constructor(message = 'Failed to authenticate with Helthjem API') {
    super(message, 502);
    this.name = 'HelthjemAuthError';
  }
}

export class HelthjemTimeoutError extends AppError {
  constructor(message = 'Helthjem API request timed out') {
    super(message, 504);
    this.name = 'HelthjemTimeoutError';
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}
