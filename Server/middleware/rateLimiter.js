const rateLimit = require('express-rate-limit');

/**
 * Authentication Rate Limiter (Login / Signup)
 * Protects against brute-force attacks and credential stuffing
 * Max 20 attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: {
    status: 'error',
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
  }
});

/**
 * Translation API Rate Limiter
 * Protects translation service from high volume abuse
 * Max 30 requests per minute per IP
 */
const translateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: {
    status: 'error',
    message: 'Too many translation requests. Please slow down.'
  }
});

/**
 * General API Rate Limiter
 * Max 300 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: {
    status: 'error',
    message: 'Too many requests from this IP. Please slow down.'
  }
});

module.exports = {
  authLimiter,
  translateLimiter,
  apiLimiter
};
