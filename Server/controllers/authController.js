const User = require('../models/User');
const jwt = require('jsonwebtoken');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    status: 'success',
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      avatar: user.avatar
    }
  });
};

exports.signup = async (req, res) => {
  try {
    const { username, email, password, preferredLanguage } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: existingUser.email === email ? 'Email already in use' : 'Username already taken'
      });
    }

    const user = await User.create({ username, email, password, preferredLanguage: preferredLanguage || 'en' });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ status: 'error', message: 'Incorrect email or password' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      status: 'success',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        avatar: user.avatar,
        about: user.about,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.updateLanguage = async (req, res) => {
  try {
    const { preferredLanguage } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { preferredLanguage },
      { new: true, runValidators: true }
    );
    res.status(200).json({ status: 'success', user });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};