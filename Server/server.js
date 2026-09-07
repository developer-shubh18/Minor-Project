const express = require('express');
const http = require('http');
const path = require('path');
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
const { apiLimiter } = require('./middleware/rateLimiter');
const { logger, requestLogger } = require('./utils/logger');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);

// Allowed origins for CORS (supports localhost, vercel deployments, and custom CLIENT_URL)
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:5001',
  'https://chattingapp-sable.vercel.app',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(s => s.trim().replace(/\/$/, '')) : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests or matching origins
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(cleanOrigin) || /\.vercel\.app$/.test(new URL(origin).hostname)) {
      return callback(null, true);
    }
    // Permissive fallback
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

const io = new Server(server, {
  cors: corsOptions
});

// Redis Adapter Configuration for Multi-Instance Scaling (Optional)
if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.IO Redis Adapter connected (multi-instance cluster mode)');
    })
    .catch(err => {
      logger.error('❌ Redis Adapter connection failed, falling back to memory adapter:', err);
    });
}

app.set('io', io);

// Middleware
app.use(requestLogger);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);

// REST Routes
app.get('/', (req, res) => res.json({ status: 'OK', message: 'QuickChat API is running' }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Server is running' }));

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/moderation', moderationRoutes);

// 404 Wildcard Handler
app.use('*', (req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

// Socket.IO Auth Middleware
io.use(verifySocketToken);

// Socket.IO Events
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.user.username} (${socket.id})`);
  handleSocketEvents(io, socket);
});

// MongoDB Connection + AI Model Load
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(mongoUri)
  .then(async () => {
    logger.info('✅ MongoDB connected');

    // Load AI moderation model
    await loadModel();

    server.listen(process.env.PORT || 5001, () => {
      logger.info(`🚀 Server running on port ${process.env.PORT || 5001}`);
    });
  })
  .catch(err => {
    logger.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = { io, logger };