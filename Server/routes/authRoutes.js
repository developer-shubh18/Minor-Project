const express = require('express');
const { signup, login, getMe, updateLanguage } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const { signupValidation, loginValidation } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/signup', authLimiter, signupValidation, signup);
router.post('/login', authLimiter, loginValidation, login);
router.get('/me', protect, getMe);
router.patch('/language', protect, updateLanguage);

module.exports = router;
