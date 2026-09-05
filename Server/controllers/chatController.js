const mongoose = require('mongoose');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const { translateText, detectLanguage, getSupportedLanguages: fetchLanguages } = require('../services/translationService');

/**
 * GET /api/chat/rooms
 * Retrieves all rooms for the authenticated user, with pinned rooms prioritized.
 */
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ participants: req.user.id })
      .populate('participants', 'username avatar isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username avatar' }
      })
      .sort('-updatedAt');
    
    // Sort pinned rooms to the top
    const currentUserId = req.user.id.toString();
    const sortedRooms = rooms.sort((a, b) => {
      const aPinned = a.pinnedBy?.some(id => id.toString() === currentUserId);
      const bPinned = b.pinnedBy?.some(id => id.toString() === currentUserId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    res.json({ status: 'success', rooms: sortedRooms });
  } catch (err) {
    console.error('[ChatController.getRooms] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * POST /api/chat/rooms
 * Creates a new direct or group conversation with deduplicated participants.
 */
exports.createRoom = async (req, res) => {
  try {
    const { participantIds, name, isGroup } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one participant must be provided'
      });
    }

    // Validate and deduplicate participant IDs
    const rawIds = [req.user.id.toString(), ...participantIds.map(id => id ? id.toString() : '')];
    const uniqueIds = Array.from(new Set(rawIds.filter(id => id && mongoose.Types.ObjectId.isValid(id))));

    if (uniqueIds.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'A chat requires at least two unique participants'
      });
    }

    // Check if DM already exists between these 2 users
    const isGroupChat = Boolean(isGroup);
    if (!isGroupChat && uniqueIds.length === 2) {
      const existing = await Room.findOne({
        isGroup: false,
        participants: { $all: uniqueIds, $size: 2 }
      }).populate('participants', 'username avatar isOnline lastSeen');

      if (existing) {
        return res.json({ status: 'success', room: existing });
      }
    }

    const room = await Room.create({
      name: isGroupChat ? (name?.trim() || 'New Group') : 'Direct Message',
      participants: uniqueIds,
      isGroup: isGroupChat,
      createdBy: req.user.id
    });

    await room.populate('participants', 'username avatar isOnline lastSeen');

    // Broadcast real-time room creation event to all members' personal notification channels
    const io = req.app.get('io');
    if (io) {
      uniqueIds.forEach(pId => {
        io.to(`user:${pId}`).emit('room-created', room);
      });
    }

    res.status(201).json({ status: 'success', room });
  } catch (err) {
    console.error('[ChatController.createRoom] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * GET /api/chat/rooms/:roomId/messages
 * Retrieves paginated messages for a room (guarded by verifyRoomParticipant).
 * Query params:
 *  - before: ISO timestamp string for fetching messages prior to this date
 *  - limit: number of messages to fetch (default: 50, max: 100)
 */
exports.getMessages = async (req, res) => {
  try {
    const roomId = req.room ? req.room._id : req.params.roomId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before;

    const query = { room: roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Fetch descending from latest (or cursor) to get latest N messages
    const messages = await Message.find(query)
      .populate('sender', 'username avatar isOnline')
      .sort({ createdAt: -1 })
      .limit(limit);

    // Chronological order for client chat timeline
    const chronologicalMessages = messages.reverse();
    const hasMore = messages.length === limit;

    res.json({
      status: 'success',
      messages: chronologicalMessages,
      hasMore,
      oldestTimestamp: chronologicalMessages.length > 0 ? chronologicalMessages[0].createdAt : null
    });
  } catch (err) {
    console.error('[ChatController.getMessages] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * DELETE /api/chat/rooms/:roomId/messages
 * Clears all messages in a room (guarded by verifyRoomParticipant).
 */
exports.clearRoom = async (req, res) => {
  try {
    const roomId = req.room ? req.room._id : req.params.roomId;
    await Message.deleteMany({ room: roomId });
    await Room.findByIdAndUpdate(roomId, { $unset: { lastMessage: 1 } });
    res.json({ status: 'success', message: 'Chat cleared successfully' });
  } catch (err) {
    console.error('[ChatController.clearRoom] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * DELETE /api/chat/rooms/:roomId
 * Deletes a room and all associated messages (guarded by verifyRoomParticipant & verifyRoomOwner).
 */
exports.deleteRoom = async (req, res) => {
  try {
    const roomId = req.room ? req.room._id : req.params.roomId;
    await Message.deleteMany({ room: roomId });
    await Room.findByIdAndDelete(roomId);
    res.json({ status: 'success', message: 'Chat deleted successfully' });
  } catch (err) {
    console.error('[ChatController.deleteRoom] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * DELETE /api/chat/messages/:messageId
 * Deletes a single message (only sender can delete).
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid message ID format' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ status: 'error', message: 'Message not found' });
    }

    const currentUserId = req.user.id.toString();
    const isSender = message.sender.toString() === currentUserId;

    if (!isSender) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: You can only delete your own messages'
      });
    }

    const roomId = message.room;
    await Message.findByIdAndDelete(messageId);

    // If this was the room's lastMessage, update it to the previous latest message
    const room = await Room.findById(roomId);
    if (room && room.lastMessage && room.lastMessage.toString() === messageId.toString()) {
      const prevMessage = await Message.findOne({ room: roomId }).sort('-createdAt');
      room.lastMessage = prevMessage ? prevMessage._id : null;
      await room.save();
    }

    res.json({
      status: 'success',
      message: 'Message deleted successfully',
      messageId,
      roomId
    });
  } catch (err) {
    console.error('[ChatController.deleteMessage] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * POST /api/chat/rooms/:roomId/pin
 * Toggles room pin for the authenticated user (guarded by verifyRoomParticipant).
 */
exports.togglePin = async (req, res) => {
  try {
    const room = req.room || await Room.findById(req.params.roomId);
    const userId = req.user.id.toString();

    const isPinned = room.pinnedBy?.some(id => id.toString() === userId);
    if (isPinned) {
      room.pinnedBy = room.pinnedBy.filter(id => id.toString() !== userId);
    } else {
      if (!room.pinnedBy) room.pinnedBy = [];
      room.pinnedBy.push(req.user.id);
    }
    
    await room.save();
    res.json({ status: 'success', isPinned: !isPinned });
  } catch (err) {
    console.error('[ChatController.togglePin] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * GET /api/chat/users/search?q=
 * Searches users by username or email.
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ status: 'success', users: [] });
    }

    // Escape regex special characters to prevent ReDoS
    const sanitizedQuery = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { username: new RegExp(sanitizedQuery, 'i') },
        { email: new RegExp(sanitizedQuery, 'i') }
      ]
    }).select('username email avatar isOnline lastSeen').limit(10);

    res.json({ status: 'success', users });
  } catch (err) {
    console.error('[ChatController.searchUsers] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * GET /api/chat/languages
 * Returns supported languages list for UI selectors.
 */
exports.getSupportedLanguages = async (req, res) => {
  try {
    const languages = await fetchLanguages();
    res.json({ status: 'success', languages });
  } catch (err) {
    console.error('[ChatController.getSupportedLanguages] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * POST /api/chat/translate
 * On-demand translation of a specific message.
 */
exports.translateMessage = async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        status: 'error',
        message: 'text and targetLanguage are required'
      });
    }

    const detectedSource = sourceLanguage || await detectLanguage(text);
    
    if (detectedSource === targetLanguage) {
      return res.json({
        status: 'success',
        translation: {
          translatedText: text,
          detectedLanguage: detectedSource,
          targetLanguage
        }
      });
    }

    const translatedText = await translateText(text, targetLanguage, detectedSource);
    
    res.json({
      status: 'success',
      translation: {
        translatedText,
        detectedLanguage: detectedSource,
        targetLanguage
      }
    });
  } catch (err) {
    console.error('[ChatController.translateMessage] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
