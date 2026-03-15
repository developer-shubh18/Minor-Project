const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const { translateText, detectLanguage, getSupportedLanguages: fetchLanguages } = require('../services/translationService');

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ participants: req.user.id })
      .populate('participants', 'username avatar isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username' }
      })
      .sort('-updatedAt');
    
    // Sort pinned rooms to the top
    const sortedRooms = rooms.sort((a, b) => {
      const aPinned = a.pinnedBy?.includes(req.user.id);
      const bPinned = b.pinnedBy?.includes(req.user.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

    res.json({ status: 'success', rooms: sortedRooms });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ... existing createRoom, getMessages ...

// Clear all messages in a room
exports.clearRoom = async (req, res) => {
  try {
    await Message.deleteMany({ room: req.params.roomId });
    await Room.findByIdAndUpdate(req.params.roomId, { $unset: { lastMessage: 1 } });
    res.json({ status: 'success', message: 'Chat cleared' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// Delete a room and its messages
exports.deleteRoom = async (req, res) => {
  try {
    await Message.deleteMany({ room: req.params.roomId });
    await Room.findByIdAndDelete(req.params.roomId);
    res.json({ status: 'success', message: 'Chat deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// Toggle pin for a room
exports.togglePin = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ status: 'error', message: 'Room not found' });

    const isPinned = room.pinnedBy.includes(req.user.id);
    if (isPinned) {
      room.pinnedBy = room.pinnedBy.filter(id => id.toString() !== req.user.id.toString());
    } else {
      room.pinnedBy.push(req.user.id);
    }
    
    await room.save();
    res.json({ status: 'success', isPinned: !isPinned });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};


exports.createRoom = async (req, res) => {
  try {
    const { participantIds, name, isGroup } = req.body;
    const participants = [req.user.id, ...participantIds];

    if (!isGroup && participants.length === 2) {
      const existing = await Room.findOne({
        isGroup: false,
        participants: { $all: participants, $size: 2 }
      });
      if (existing) return res.json({ status: 'success', room: existing });
    }

    const room = await Room.create({
      name: name || 'Chat',
      participants,
      isGroup: isGroup || false,
      createdBy: req.user.id
    });

    await room.populate('participants', 'username avatar isOnline');
    res.status(201).json({ status: 'success', room });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.roomId })
      .populate('sender', 'username avatar')
      .sort('createdAt')
      .limit(100);
    res.json({ status: 'success', messages });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const users = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { username: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') }
      ]
    }).select('username email avatar isOnline').limit(10);
    res.json({ status: 'success', users });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// Get supported languages from LibreTranslate
exports.getSupportedLanguages = async (req, res) => {
  try {
    const languages = await fetchLanguages();
    res.json({ status: 'success', languages });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// On-demand translate a single message
exports.translateMessage = async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ status: 'error', message: 'text and targetLanguage are required' });
    }

    // Detect source language if not provided
    const detectedSource = sourceLanguage || await detectLanguage(text);
    
    // If source and target are the same, return original
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
    res.status(500).json({ status: 'error', message: err.message });
  }
};

