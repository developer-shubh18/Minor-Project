const mongoose = require('mongoose');
const { verifyRoomParticipant, verifyRoomOwner } = require('../middleware/roomAuthMiddleware');
const Room = require('../models/Room');

jest.mock('../models/Room');

describe('Room Authorization & IDOR Mitigation Middleware Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: new mongoose.Types.ObjectId().toString() },
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 400 Bad Request if roomId is malformed / not a valid ObjectId', async () => {
    req.params.roomId = 'invalid-not-an-id';

    await verifyRoomParticipant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Invalid room ID format'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 404 if room does not exist in database', async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    req.params.roomId = validId;
    Room.findById.mockResolvedValue(null);

    await verifyRoomParticipant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Room not found'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 Forbidden (preventing IDOR) if user is not a participant', async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const otherUserId = new mongoose.Types.ObjectId();
    req.params.roomId = validId;

    Room.findById.mockResolvedValue({
      _id: validId,
      participants: [otherUserId] // req.user.id is NOT in here
    });

    await verifyRoomParticipant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: expect.stringContaining('Access denied')
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow access and call next() if user is a valid participant', async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    req.params.roomId = validId;

    const mockRoom = {
      _id: validId,
      participants: [req.user.id]
    };
    Room.findById.mockResolvedValue(mockRoom);

    await verifyRoomParticipant(req, res, next);

    expect(req.room).toBe(mockRoom);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
