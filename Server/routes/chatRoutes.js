const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { verifyRoomParticipant, verifyRoomOwner } = require('../middleware/roomAuthMiddleware');
const { translateLimiter } = require('../middleware/rateLimiter');
const { 
  createRoomValidation, 
  translateValidation, 
  roomIdParamValidation 
} = require('../middleware/validationMiddleware');
const upload = require('../middleware/uploadMiddleware');
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
  deleteMessage,
  uploadMedia,
  updateGroup,
  removeMember,
  toggleAdmin,
  leaveGroup
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

// Media and File upload
router.post('/upload', upload.single('file'), uploadMedia);

// Group management routes
router.patch('/groups/:roomId', roomIdParamValidation, verifyRoomParticipant, updateGroup);
router.post('/groups/:roomId/members/remove', roomIdParamValidation, verifyRoomParticipant, removeMember);
router.patch('/groups/:roomId/admins', roomIdParamValidation, verifyRoomParticipant, toggleAdmin);
router.post('/groups/:roomId/leave', roomIdParamValidation, verifyRoomParticipant, leaveGroup);

// Translation endpoints
router.get('/languages', getSupportedLanguages);
router.post('/translate', translateLimiter, translateValidation, translateMessage);

module.exports = router;
