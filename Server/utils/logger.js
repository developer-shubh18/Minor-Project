const winston = require('winston');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const msg = stack || message;
    return `[${timestamp}] [${level.toUpperCase()}]: ${msg}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          const msg = stack || message;
          return `[${timestamp}] [${level}]: ${msg}`;
        })
      )
    })
  ]
});

// Express request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger.log(logLevel, `${req.method} ${req.originalUrl} ${status} - ${duration}ms`);
  });
  next();
};

module.exports = {
  logger,
  requestLogger
};
