const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getRooms, getMessages, searchUsers, createRoom } = require('../controllers/chatController');

const router = express.Router();

router.use(protect);

router.get('/rooms', getRooms);
router.post('/rooms', createRoom);
router.get('/rooms/:roomId/messages', getMessages);
router.get('/users/search', searchUsers);

module.exports = router;
