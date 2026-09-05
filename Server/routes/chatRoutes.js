const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { verifyRoomParticipant, verifyRoomOwner } = require('../middleware/roomAuthMiddleware');
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
router.delete('/rooms/:roomId', verifyRoomParticipant, verifyRoomOwner, deleteRoom);
router.delete('/rooms/:roomId/messages', verifyRoomParticipant, clearRoom);
router.post('/rooms/:roomId/pin', verifyRoomParticipant, togglePin);

router.get('/rooms/:roomId/messages', verifyRoomParticipant, getMessages);
router.get('/users/search', searchUsers);

// Translation endpoints
router.get('/languages', getSupportedLanguages);
router.post('/translate', translateMessage);

module.exports = router;
