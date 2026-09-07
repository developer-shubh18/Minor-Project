const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  avatar: { type: String, default: '' },
  description: { type: String, default: '' },
  isGroup: { type: Boolean, default: false },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

roomSchema.index({ participants: 1 });
roomSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Room', roomSchema);
