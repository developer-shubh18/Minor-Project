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
    res.json({ status: 'success', rooms });
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

