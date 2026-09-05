const ModerationLog = require('../models/ModerationLog');

/**
 * GET /api/moderation/stats — Simple moderation stats
 */
exports.getModerationStats = async (req, res) => {
  try {
    const [total, blocked, warned] = await Promise.all([
      ModerationLog.countDocuments(),
      ModerationLog.countDocuments({ action: 'blocked' }),
      ModerationLog.countDocuments({ action: 'warned' }),
    ]);

    const categoryStats = await ModerationLog.aggregate([
      { $group: { _id: '$primaryCategory', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({ status: 'success', stats: { total, blocked, warned, categoryStats } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * GET /api/moderation/logs — Paginated logs
 */
exports.getModerationLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const [logs, total] = await Promise.all([
      ModerationLog.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('sender', 'username avatar'),
      ModerationLog.countDocuments()
    ]);

    res.json({ status: 'success', logs, pagination: { page, limit, total } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
