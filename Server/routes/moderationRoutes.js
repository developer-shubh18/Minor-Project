const express = require('express');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { getModerationStats, getModerationLogs } = require('../controllers/moderationController');

const router = express.Router();
router.use(protect);

router.get('/stats', adminOnly, getModerationStats);
router.get('/logs', adminOnly, getModerationLogs);

module.exports = router;
