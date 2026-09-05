const mongoose = require('mongoose');
const { deleteMessage } = require('../controllers/chatController');
const Message = require('../models/Message');
const Room = require('../models/Room');

jest.mock('../models/Message');
jest.mock('../models/Room');

describe('Single Message Deletion Controller Tests', () => {
  let req, res;
  const currentUserId = new mongoose.Types.ObjectId().toString();
  const otherUserId = new mongoose.Types.ObjectId().toString();
  const validMessageId = new mongoose.Types.ObjectId().toString();
  const validRoomId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    req = {
      user: { id: currentUserId },
      params: { messageId: validMessageId }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  it('should return 400 Bad Request if messageId is invalid', async () => {
    req.params.messageId = 'invalid-id';
    await deleteMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Invalid message ID format'
    }));
  });

  it('should return 404 Not Found if message does not exist', async () => {
    Message.findById.mockResolvedValue(null);
    await deleteMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Message not found'
    }));
  });

  it('should return 403 Forbidden if user is NOT the sender of the message', async () => {
    Message.findById.mockResolvedValue({
      _id: validMessageId,
      sender: otherUserId, // Not currentUserId!
      room: validRoomId
    });

    await deleteMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: expect.stringContaining('You can only delete your own messages')
    }));
  });

  it('should delete message and update room lastMessage if user is the sender', async () => {
    Message.findById.mockResolvedValue({
      _id: validMessageId,
      sender: currentUserId,
      room: validRoomId
    });

    Room.findById.mockResolvedValue({
      _id: validRoomId,
      lastMessage: validMessageId,
      save: jest.fn().mockResolvedValue(true)
    });

    const previousMessageId = new mongoose.Types.ObjectId();
    Message.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ _id: previousMessageId })
    });
    Message.findByIdAndDelete.mockResolvedValue(true);

    await deleteMessage(req, res);

    expect(Message.findByIdAndDelete).toHaveBeenCalledWith(validMessageId);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      message: 'Message deleted successfully',
      messageId: validMessageId
    }));
  });
});
