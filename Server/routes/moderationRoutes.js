const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getModerationStats, getModerationLogs } = require('../controllers/moderationController');

const router = express.Router();
router.use(protect);

router.get('/stats', getModerationStats);
router.get('/logs', getModerationLogs);

module.exports = router;
