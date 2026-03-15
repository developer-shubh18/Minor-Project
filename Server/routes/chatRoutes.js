const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { 
  getRooms, 
  getMessages, 
  searchUsers, 
  createRoom, 
  getSupportedLanguages, 
  translateMessage,
  clearRoom,
  deleteRoom,
  togglePin
} = require('../controllers/chatController');

const router = express.Router();

router.use(protect);

router.get('/rooms', getRooms);
router.post('/rooms', createRoom);
router.delete('/rooms/:roomId', deleteRoom);
router.delete('/rooms/:roomId/messages', clearRoom);
router.post('/rooms/:roomId/pin', togglePin);

router.get('/rooms/:roomId/messages', getMessages);
router.get('/users/search', searchUsers);

// Translation endpoints
router.get('/languages', getSupportedLanguages);
router.post('/translate', translateMessage);

module.exports = router;
