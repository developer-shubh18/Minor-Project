const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { verifyRoomParticipant, verifyRoomOwner } = require('../middleware/roomAuthMiddleware');
const { translateLimiter } = require('../middleware/rateLimiter');
const { 
  createRoomValidation, 
  translateValidation, 
  roomIdParamValidation 
} = require('../middleware/validationMiddleware');
const { 
  getRooms, 
  getMessages, 
  searchUsers, 
  createRoom, 
  getSupportedLanguages, 
  translateMessage,
  clearRoom,
  deleteRoom,
  togglePin,
  deleteMessage
} = require('../controllers/chatController');

const router = express.Router();

router.use(protect);

router.get('/rooms', getRooms);
router.post('/rooms', createRoomValidation, createRoom);
router.delete('/rooms/:roomId', roomIdParamValidation, verifyRoomParticipant, verifyRoomOwner, deleteRoom);
router.delete('/rooms/:roomId/messages', roomIdParamValidation, verifyRoomParticipant, clearRoom);
router.post('/rooms/:roomId/pin', roomIdParamValidation, verifyRoomParticipant, togglePin);

router.get('/rooms/:roomId/messages', roomIdParamValidation, verifyRoomParticipant, getMessages);
router.delete('/messages/:messageId', deleteMessage);
router.get('/users/search', searchUsers);

// Translation endpoints
router.get('/languages', getSupportedLanguages);
router.post('/translate', translateLimiter, translateValidation, translateMessage);

module.exports = router;
