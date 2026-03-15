const express = require('express');
const { signup, login, getMe, updateLanguage } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/language', protect, updateLanguage);

module.exports = router;
