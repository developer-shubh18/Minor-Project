const User = require('../models/User');

/**
 * GET /api/users/me
 * Retrieves current user's complete profile.
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ status: 'error', message: 'User account not found' });
    }

    res.json({
      status: 'success',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        preferredLanguage: user.preferredLanguage,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        about: user.about || '',
        warningCount: user.warningCount || 0,
        mutedUntil: user.mutedUntil || null,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('[UserController.getProfile] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * PUT /api/users/me
 * Updates profile fields with duplicate validation and input sanitization.
 */
exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = ['username', 'email', 'avatar', 'preferredLanguage', 'about'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
      }
    }

    // Check for unique conflicts before updating
    if (updates.email || updates.username) {
      const orConditions = [];
      if (updates.email) orConditions.push({ email: updates.email.toLowerCase() });
      if (updates.username) orConditions.push({ username: updates.username });

      const existingConflict = await User.findOne({
        _id: { $ne: req.user.id },
        $or: orConditions
      });

      if (existingConflict) {
        const isEmailConflict = updates.email && existingConflict.email.toLowerCase() === updates.email.toLowerCase();
        return res.status(400).json({
          status: 'error',
          message: isEmailConflict
            ? 'Email is already registered to another account'
            : 'Username is already taken'
        });
      }
    }

    if (updates.email) updates.email = updates.email.toLowerCase();

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true
    });

    res.json({
      status: 'success',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        preferredLanguage: user.preferredLanguage,
        about: user.about || '',
        warningCount: user.warningCount || 0,
        mutedUntil: user.mutedUntil || null,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('[UserController.updateProfile] Error:', err);
    // Graceful handling for MongoDB duplicate key error code 11000
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'credential';
      return res.status(400).json({
        status: 'error',
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} is already in use`
      });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * PUT /api/users/me/password
 * Changes user password with length validation and hash encryption.
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide both current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters in length'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.isDeleted) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({ status: 'success', message: 'Password updated successfully' });
  } catch (err) {
    console.error('[UserController.changePassword] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * DELETE /api/users/me
 * Soft-deletes user account to safeguard message thread integrity.
 */
exports.deleteAccount = async (req, res) => {
  try {
    const anonymizedEmail = `deleted_${req.user.id}_${Date.now()}@quickchat.local`;
    await User.findByIdAndUpdate(req.user.id, {
      username: 'Deleted User',
      email: anonymizedEmail,
      avatar: '',
      about: 'This account has been deactivated.',
      isOnline: false,
      isDeleted: true
    });

    res.json({
      status: 'success',
      message: 'Account deactivated successfully'
    });
  } catch (err) {
    console.error('[UserController.deleteAccount] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
