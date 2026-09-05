const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  preferredLanguage: { type: String, default: 'en' },
  avatar: { type: String, default: '' },
  about: { type: String, default: 'Hey there! I am using QuickChat' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },

  // Disciplinary & Content Moderation Tracking
  warningCount: { type: Number, default: 0 },
  mutedUntil: { type: Date, default: null },

  // Role-based Access Control
  isAdmin: { type: Boolean, default: false },

  // Soft-deletion flag to protect chat thread integrity
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
