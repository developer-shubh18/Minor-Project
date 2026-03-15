const User = require('../models/User');

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
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
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const allowedFields = ['username', 'email', 'avatar', 'preferredLanguage', 'about'];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

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
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ status: 'error', message: 'Please provide both current and new password' });
        }

        const user = await User.findById(req.user.id).select('+password');
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ status: 'success', message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.user.id);
        res.json({ status: 'success', message: 'Account deleted successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
