const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const upload = require('../middleware/uploadMiddleware');
const Room = require('../models/Room');
const User = require('../models/User');
const Message = require('../models/Message');
const chatRoutes = require('../routes/chatRoutes');

jest.mock('../models/User');

describe('Media Upload, Reactions, and Group Admin', () => {
  let app;
  let testUserId;
  let token;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret';
    testUserId = new mongoose.Types.ObjectId().toString();
    token = jwt.sign({ id: testUserId }, 'test_jwt_secret');

    User.findById.mockResolvedValue({ _id: testUserId, username: 'testuser' });

    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRoutes);
  });

  test('POST /api/chat/upload rejects request when no file is uploaded', async () => {
    const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, 'test_jwt_secret');
    const res = await request(app)
      .post('/api/chat/upload')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No file uploaded');
  });

  test('POST /api/chat/upload uploads a text file successfully', async () => {
    const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, 'test_jwt_secret');
    const res = await request(app)
      .post('/api/chat/upload')
      .set('Authorization', `Bearer ${fakeToken}`)
      .attach('file', Buffer.from('hello world content'), 'test_doc.txt');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.media).toBeDefined();
    expect(res.body.media.type).toBe('file');
    expect(res.body.media.url).toContain('/uploads/');
  });

  test('POST /api/chat/upload uploads an audio voice note successfully', async () => {
    const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, 'test_jwt_secret');
    const res = await request(app)
      .post('/api/chat/upload')
      .set('Authorization', `Bearer ${fakeToken}`)
      .attach('file', Buffer.from('fake audio data'), { filename: 'voice_note.webm', contentType: 'audio/webm' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.media.type).toBe('audio');
    expect(res.body.media.name).toBe('voice_note.webm');
  });
});
