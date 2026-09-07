const mongoose = require('mongoose');
const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const ModerationLog = require('../models/ModerationLog');
const { detectLanguage, translateForRecipients } = require('../services/translationService');
const { moderateMessage, getViolationMessage } = require('../services/contentModerationService');

// In-memory active sockets map: userId -> Set of socketIds (supports multi-device/multi-tab)
const activeSockets = new Map();

// Per-socket message rate limiter tracker: socketId -> Array of timestamps
const socketMessageTimestamps = new Map();
const MESSAGE_RATE_LIMIT_WINDOW_MS = 2000;
const MAX_MESSAGES_PER_WINDOW = 10;

exports.handleSocketEvents = (io, socket) => {
  const userId = socket.user.id.toString();

  // 1. Register socket and manage presence
  if (!activeSockets.has(userId)) {
    activeSockets.set(userId, new Set());
  }
  activeSockets.get(userId).add(socket.id);

  // Automatically join the user's private notification channel
  socket.join(`user:${userId}`);

  // Send the current list of online users to the newly connected client
  socket.emit('initial-online-users', Array.from(activeSockets.keys()));

  // Broadcast user-online event on first connection
  if (activeSockets.get(userId).size === 1) {
    User.findByIdAndUpdate(userId, { isOnline: true }).catch(err =>
      console.error('[SocketHandler] Presence update error:', err)
    );
    io.emit('user-online', { userId });
  }

  /**
   * join-room
   * Validates room existence and user membership before granting channel access
   */
  socket.on('join-room', async (roomId) => {
    try {
      if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) return;

      const room = await Room.findById(roomId);
      if (!room) return;

      const isParticipant = room.participants.some(p => p.toString() === userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'Unauthorized room access' });
        return;
      }

      socket.join(roomId);
    } catch (err) {
      console.error('[SocketHandler.join-room] Error:', err);
    }
  });

  /**
   * leave-room
   */
  socket.on('leave-room', (roomId) => {
    if (roomId) socket.leave(roomId);
  });

  /**
   * mark-read
   * Marks unread messages in the room as read by this user and emits messages-read
   */
  socket.on('mark-read', async ({ roomId }) => {
    try {
      if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) return;

      const room = await Room.findById(roomId);
      if (!room || !room.participants.some(p => p.toString() === userId)) return;

      await Message.updateMany(
        { room: roomId, readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } }
      );

      io.to(roomId).emit('messages-read', {
        roomId,
        userId,
        readAt: new Date()
      });
    } catch (err) {
      console.error('[SocketHandler.mark-read] Error:', err);
    }
  });

  /**
   * delete-message
   * Broadcasts real-time deletion of a single message and synchronizes room preview
   */
  socket.on('delete-message', async ({ messageId, roomId }) => {
    try {
      if (!messageId || !roomId || !mongoose.Types.ObjectId.isValid(roomId)) return;

      io.to(roomId).emit('message-deleted', { messageId, roomId });

      const room = await Room.findById(roomId).populate('participants');
      if (room) {
        const lastMsg = await Message.findOne({ room: roomId })
          .populate('sender', 'username avatar')
          .sort('-createdAt');

        room.participants.forEach(p => {
          const pId = (p._id || p).toString();
          io.to(`user:${pId}`).emit('room-updated', {
            roomId: roomId.toString(),
            lastMessage: lastMsg || null
          });
        });
      }
    } catch (err) {
      console.error('[SocketHandler.delete-message] Error:', err);
    }
  });

  /**
   * send-message
   * Disciplinary checks -> AI Moderation -> Language Detection -> Parallel Translation -> Delivery
   */
  socket.on('send-message', async ({ roomId, text, media }) => {
    try {
      const hasText = Boolean(text && text.trim());
      const hasMedia = Boolean(media && media.url);

      if (!roomId || (!hasText && !hasMedia) || !mongoose.Types.ObjectId.isValid(roomId)) return;

      const cleanText = hasText ? text.trim() : '';

      if (cleanText.length > 5000) {
        socket.emit('error', { message: 'Message exceeds maximum length of 5000 characters' });
        return;
      }

      // --- Socket Rate Limiting Check ---
      const now = Date.now();
      const userTimestamps = (socketMessageTimestamps.get(socket.id) || []).filter(
        t => now - t < MESSAGE_RATE_LIMIT_WINDOW_MS
      );
      if (userTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        socket.emit('error', { message: 'You are sending messages too quickly. Please slow down.' });
        return;
      }
      userTimestamps.push(now);
      socketMessageTimestamps.set(socket.id, userTimestamps);

      const room = await Room.findById(roomId).populate('participants', 'preferredLanguage');
      if (!room) return;

      const isParticipant = room.participants.some(p => p._id.toString() === userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'Unauthorized: You are not a member of this chat' });
        return;
      }

      // --- Disciplinary Check: Mute status & Warning Cooldown ---
      const user = await User.findById(userId);
      if (user && user.mutedUntil) {
        if (new Date(user.mutedUntil) > new Date()) {
          const remainingMs = new Date(user.mutedUntil).getTime() - Date.now();
          const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
          socket.emit('message-moderated', {
            action: 'muted',
            message: `⛔ You are temporarily muted due to multiple policy violations. Time remaining: ${remainingMinutes} minute(s).`,
            remainingMinutes,
            warningCount: user.warningCount || 3,
            maxWarnings: 3
          });
          return;
        } else {
          // Mute period has elapsed: reset disciplinary record
          user.mutedUntil = null;
          user.warningCount = 0;
          await user.save();
        }
      }

      let modResult = { action: 'clean', confidence: 0, label: 'clean' };
      const MAX_WARNINGS = 3;

      if (hasText) {
        // --- In-Process AI Content Moderation ---
        modResult = await moderateMessage(cleanText);

        console.log(`[Moderation] ${socket.user.username}: "${cleanText.substring(0, 30)}..." -> ${modResult.action} (${modResult.label}, ${(modResult.confidence * 100).toFixed(0)}%)`);

        // BLOCKED Content
        if (modResult.action === 'blocked') {
          user.warningCount = (user.warningCount || 0) + 1;
          let action = 'blocked';
          let alertMsg = getViolationMessage(modResult);

          if (user.warningCount >= MAX_WARNINGS) {
            user.mutedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute mute
            action = 'muted';
            alertMsg = `⛔ Maximum violations reached (${MAX_WARNINGS}/${MAX_WARNINGS}). You have been muted for 15 minutes.`;
          }
          await user.save();

          await ModerationLog.create({
            room: roomId, sender: userId, originalText: cleanText,
            action: action, score: modResult.confidence,
            primaryCategory: modResult.label,
          });

          socket.emit('message-moderated', {
            action: action,
            message: alertMsg,
            warningCount: user.warningCount,
            maxWarnings: MAX_WARNINGS
          });
          return;
        }

        // WARNED Content
        if (modResult.action === 'warned') {
          user.warningCount = (user.warningCount || 0) + 1;
          let action = 'warned';
          let alertMsg = getViolationMessage(modResult);

          if (user.warningCount >= MAX_WARNINGS) {
            user.mutedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute mute
            action = 'muted';
            alertMsg = `⛔ Maximum warnings reached (${MAX_WARNINGS}/${MAX_WARNINGS}). You have been muted for 15 minutes.`;
            await user.save();

            await ModerationLog.create({
              room: roomId, sender: userId, originalText: cleanText,
              action: 'muted', score: modResult.confidence,
              primaryCategory: modResult.label,
            });

            socket.emit('message-moderated', {
              action: 'muted',
              message: alertMsg,
              warningCount: user.warningCount,
              maxWarnings: MAX_WARNINGS
            });
            return;
          }

          await user.save();

          await ModerationLog.create({
            room: roomId, sender: userId, originalText: cleanText,
            action: 'warned', score: modResult.confidence,
            primaryCategory: modResult.label,
          });

          socket.emit('message-moderated', {
            action: 'warned',
            message: alertMsg,
            warningCount: user.warningCount,
            maxWarnings: MAX_WARNINGS
          });
        }
      }

      // --- Multilingual Translation Processing ---
      let originalLanguage = 'en';
      let translations = [];
      if (hasText) {
        originalLanguage = await detectLanguage(cleanText);
        const targetLanguages = room.participants.map(p => p.preferredLanguage).filter(Boolean);
        translations = await translateForRecipients(cleanText, originalLanguage, targetLanguages);
      }

      const message = await Message.create({
        room: roomId,
        sender: userId,
        originalText: cleanText,
        originalLanguage,
        translations,
        readBy: [userId],
        media: hasMedia ? {
          url: media.url,
          type: media.type || 'file',
          name: media.name || 'Attachment',
          size: media.size || 0,
          mimeType: media.mimeType || ''
        } : undefined,
        moderation: {
          status: modResult.action,
          score: modResult.confidence,
          primaryCategory: modResult.label,
          violationMessage: getViolationMessage(modResult)
        }
      });

      await message.populate('sender', 'username avatar isOnline');
      await Room.findByIdAndUpdate(roomId, { lastMessage: message._id });

      // 1. Broadcast to everyone actively viewing the room
      io.to(roomId).emit('new-message', message);

      // 2. Broadcast room-updated to personal user channels for sidebar updates
      room.participants.forEach(p => {
        const pId = (p._id || p).toString();
        io.to(`user:${pId}`).emit('room-updated', {
          roomId: roomId.toString(),
          lastMessage: message
        });
      });
    } catch (err) {
      console.error('[SocketHandler.send-message] Error:', err);
      socket.emit('error', { message: err.message });
    }
  });

  /**
   * toggle-reaction
   * Adds, removes, or toggles an emoji reaction for the user on a message
   */
  socket.on('toggle-reaction', async ({ messageId, roomId, emoji }) => {
    try {
      if (!messageId || !roomId || !emoji || !mongoose.Types.ObjectId.isValid(messageId)) return;

      const message = await Message.findById(messageId);
      if (!message || message.room.toString() !== roomId) return;

      const existingIndex = message.reactions.findIndex(
        r => r.user.toString() === userId && r.emoji === emoji
      );

      if (existingIndex > -1) {
        // Remove reaction (toggle off)
        message.reactions.splice(existingIndex, 1);
      } else {
        // Remove previous reaction from this user and add new emoji
        message.reactions = message.reactions.filter(r => r.user.toString() !== userId);
        message.reactions.push({ user: userId, emoji });
      }

      await message.save();
      await message.populate('reactions.user', 'username avatar');

      io.to(roomId).emit('reaction-updated', {
        messageId: messageId.toString(),
        roomId: roomId.toString(),
        reactions: message.reactions
      });
    } catch (err) {
      console.error('[SocketHandler.toggle-reaction] Error:', err);
    }
  });

  /**
   * typing
   */
  socket.on('typing', ({ roomId, isTyping }) => {
    if (roomId) {
      socket.to(roomId).emit('user-typing', { userId, username: socket.user.username, isTyping });
    }
  });

  /**
   * disconnect
   */
  socket.on('disconnect', async () => {
    socketMessageTimestamps.delete(socket.id);
    const userSockets = activeSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        activeSockets.delete(userId);
        const now = new Date();
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: now });
        io.emit('user-offline', { userId, lastSeen: now });
      }
    }
  });
};
