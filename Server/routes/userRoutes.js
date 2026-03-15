const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getProfile, updateProfile, changePassword, deleteAccount } = require('../controllers/userController');

const router = express.Router();

router.use(protect);

router.get('/me', getProfile);
router.put('/me', updateProfile);
router.put('/me/password', changePassword);
router.delete('/me', deleteAccount);

module.exports = router;
