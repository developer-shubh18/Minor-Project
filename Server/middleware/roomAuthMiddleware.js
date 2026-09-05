const mongoose = require('mongoose');
const Room = require('../models/Room');

/**
 * Middleware: verifyRoomParticipant
 * Ensures that the authenticated user is a registered participant of the requested room.
 * Prevents Insecure Direct Object Reference (IDOR) attacks on messages, pins, and room settings.
 */
exports.verifyRoomParticipant = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid room ID format'
      });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        status: 'error',
        message: 'Room not found'
      });
    }

    const currentUserId = req.user.id.toString();
    const isParticipant = room.participants.some(
      (participantId) => participantId.toString() === currentUserId
    );

    if (!isParticipant) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: You are not a participant in this conversation'
      });
    }

    // Attach resolved room to request for downstream controller efficiency
    req.room = room;
    next();
  } catch (err) {
    console.error('[RoomAuthMiddleware] Error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify room authorization'
    });
  }
};

/**
 * Middleware: verifyRoomOwner
 * Ensures that the authenticated user is the creator/owner of the room (used for group deletions).
 */
exports.verifyRoomOwner = async (req, res, next) => {
  try {
    const room = req.room || await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({
        status: 'error',
        message: 'Room not found'
      });
    }

    const currentUserId = req.user.id.toString();
    const isOwner = room.createdBy && room.createdBy.toString() === currentUserId;

    // For groups, only owner can delete. For DMs, any participant can delete.
    if (room.isGroup && !isOwner) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: Only the group creator can perform this action'
      });
    }

    req.room = room;
    next();
  } catch (err) {
    console.error('[RoomOwnerMiddleware] Error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify room ownership'
    });
  }
};
