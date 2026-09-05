const { body, param, query, validationResult } = require('express-validator');

/**
 * Formats validation errors and returns 400 response if any errors exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Signup Validation Chain
 */
const signupValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('preferredLanguage')
    .optional()
    .isString()
    .isLength({ min: 2, max: 10 }).withMessage('Invalid language code'),
  validate
];

/**
 * Login Validation Chain
 */
const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate
];

/**
 * Profile Update Validation Chain
 */
const profileUpdateValidation = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('about')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('About text cannot exceed 500 characters'),
  body('preferredLanguage')
    .optional()
    .isString()
    .isLength({ min: 2, max: 10 }).withMessage('Invalid language code'),
  validate
];

/**
 * Room Creation Validation Chain
 */
const createRoomValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Room name cannot exceed 50 characters'),
  body('participantIds')
    .isArray({ min: 1, max: 100 }).withMessage('Participant IDs must be an array with 1 to 100 users'),
  body('participantIds.*')
    .isMongoId().withMessage('Invalid participant user ID'),
  body('isGroup')
    .optional()
    .isBoolean().withMessage('isGroup must be a boolean'),
  validate
];

/**
 * Translation Request Validation Chain
 */
const translateValidation = [
  body('text')
    .trim()
    .notEmpty().withMessage('Text to translate is required')
    .isLength({ max: 5000 }).withMessage('Text cannot exceed 5000 characters'),
  body('targetLanguage')
    .trim()
    .notEmpty().withMessage('Target language is required')
    .isLength({ min: 2, max: 10 }).withMessage('Invalid target language code'),
  body('sourceLanguage')
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 }).withMessage('Invalid source language code'),
  validate
];

/**
 * Room ID Parameter Validation
 */
const roomIdParamValidation = [
  param('roomId')
    .isMongoId().withMessage('Invalid room ID format'),
  validate
];

module.exports = {
  validate,
  signupValidation,
  loginValidation,
  profileUpdateValidation,
  createRoomValidation,
  translateValidation,
  roomIdParamValidation
};
