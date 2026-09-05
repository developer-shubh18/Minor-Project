const mongoose = require('mongoose');

/**
 * ModerationLog — Audit trail of flagged messages.
 */
const moderationLogSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalText: { type: String, required: true },
  action: { type: String, enum: ['warned', 'blocked'], required: true },
  score: { type: Number, required: true },
  primaryCategory: { type: String },
}, { timestamps: true });

moderationLogSchema.index({ sender: 1, createdAt: -1 });
moderationLogSchema.index({ action: 1 });

module.exports = mongoose.model('ModerationLog', moderationLogSchema);
