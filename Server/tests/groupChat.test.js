const mongoose = require('mongoose');
const { createRoom } = require('../controllers/chatController');
const Room = require('../models/Room');

jest.mock('../models/Room');

describe('Group Chat Controller & Creation Tests', () => {
  let req, res, mockIo;

  beforeEach(() => {
    const currentUserId = new mongoose.Types.ObjectId().toString();
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    req = {
      user: { id: currentUserId },
      body: {},
      app: {
        get: jest.fn((key) => key === 'io' ? mockIo : null)
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  it('should create a group room with custom name, createdBy, and broadcast to participants', async () => {
    const participant1 = new mongoose.Types.ObjectId().toString();
    const participant2 = new mongoose.Types.ObjectId().toString();
    req.body = {
      name: 'Engineering Team',
      participantIds: [participant1, participant2],
      isGroup: true
    };

    const mockSavedRoom = {
      _id: new mongoose.Types.ObjectId().toString(),
      name: 'Engineering Team',
      isGroup: true,
      createdBy: req.user.id,
      participants: [req.user.id, participant1, participant2],
      populate: jest.fn().mockResolvedValue(true)
    };

    Room.create.mockResolvedValue(mockSavedRoom);

    await createRoom(req, res);

    expect(Room.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Engineering Team',
      isGroup: true,
      createdBy: req.user.id
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      room: mockSavedRoom
    }));

    // Verify broadcast to all participants
    expect(mockIo.to).toHaveBeenCalledWith(`user:${participant1}`);
    expect(mockIo.to).toHaveBeenCalledWith(`user:${participant2}`);
    expect(mockIo.to).toHaveBeenCalledWith(`user:${req.user.id}`);
    expect(mockIo.emit).toHaveBeenCalledWith('room-created', mockSavedRoom);
  });

  it('should return 400 Bad Request if participantIds is not an array or is empty', async () => {
    req.body = {
      name: 'Solo Group',
      participantIds: 'not-an-array',
      isGroup: true
    };

    await createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'At least one participant must be provided'
    }));
  });
});
