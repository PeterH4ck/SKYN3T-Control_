import { Request, Response } from 'express';
import { logger } from '../utils/logger';

export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn('404 Not Found:', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
      statusCode: 404,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    },
  });
};