const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalText: { type: String, default: '' },
  originalLanguage: { type: String, default: 'en' },
  translations: [{
    language: String,
    text: String
  }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Media Attachment (Images, Documents, Audio Voice Notes, Videos)
  media: {
    url: { type: String },
    type: { type: String, enum: ['image', 'file', 'audio', 'video'] },
    name: { type: String },
    size: { type: Number },
    mimeType: { type: String }
  },

  // Inline Emoji Reactions
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true }
  }],

  // Soft Deletion
  isDeleted: { type: Boolean, default: false },

  // Content Moderation Fields
  moderation: {
    status: {
      type: String,
      enum: ['clean', 'warned', 'blocked'],
      default: 'clean'
    },
    score: { type: Number, default: 0 },
    primaryCategory: { type: String },
    wasSanitized: { type: Boolean, default: false },
    violationMessage: { type: String }
  }
}, { timestamps: true });

messageSchema.index({ room: 1, createdAt: 1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
