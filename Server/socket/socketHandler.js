const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const { detectLanguage, translateForRecipients } = require('../services/translationService');

exports.handleSocketEvents = (io, socket) => {
  const userId = socket.user.id;

  socket.on('join-room', async (roomId) => {
    socket.join(roomId);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.to(roomId).emit('user-joined', { userId, username: socket.user.username });
    io.emit('user-online', { userId });
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
  });

  socket.on('send-message', async ({ roomId, text }) => {
    try {
      const room = await Room.findById(roomId).populate('participants', 'preferredLanguage');
      if (!room) return;

      const originalLanguage = await detectLanguage(text);
      const targetLanguages = room.participants.map(p => p.preferredLanguage);
      const translations = await translateForRecipients(text, originalLanguage, targetLanguages);

      const message = await Message.create({
        room: roomId,
        sender: userId,
        originalText: text,
        originalLanguage,
        translations,
        readBy: [userId]
      });

      await message.populate('sender', 'username avatar');
      await Room.findByIdAndUpdate(roomId, { lastMessage: message._id });

      io.to(roomId).emit('new-message', message);

      // Mark message as read for sender immediately
      await Message.findByIdAndUpdate(message._id, {
        $addToSet: { readBy: userId }
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('user-typing', { userId, username: socket.user.username, isTyping });
  });

  socket.on('mark-read', async ({ messageId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: userId }
      });
      const message = await Message.findById(messageId).select('readBy room');
      io.to(message.room.toString()).emit('message-read', {
        messageId,
        readBy: message.readBy
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', async () => {
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
    io.emit('user-offline', { userId });
  });
};
