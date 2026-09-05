const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const userRoutes = require('./routes/userRoutes');
const moderationRoutes = require('./routes/moderationRoutes');
const { verifySocketToken } = require('./middleware/authMiddleware');
const { handleSocketEvents } = require('./socket/socketHandler');
const { loadModel } = require('./services/contentModerationService');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:4200',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/moderation', moderationRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Server is running' }));

// Socket.IO Auth Middleware
io.use(verifySocketToken);

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.user.username} (${socket.id})`);
  handleSocketEvents(io, socket);
});

// MongoDB Connection + AI Model Load
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Load AI moderation model
    await loadModel();

    server.listen(process.env.PORT || 5001, () => {
      console.log(`🚀 Server running on port ${process.env.PORT || 5001}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = { io };