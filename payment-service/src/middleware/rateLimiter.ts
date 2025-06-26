import { Request, Response, NextFunction } from 'express';
import { rateLimiter as redisRateLimiter } from '../config/redis';
import { config } from '../config/config';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export const createRateLimiter = (options: RateLimitOptions = {}) => {
  const {
    windowMs = config.rateLimiting.windowMs,
    maxRequests = config.rateLimiting.maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate rate limit key
      const key = keyGenerator(req);

      // Check rate limit
      const result = await redisRateLimiter.check(key, maxRequests, windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

      if (!result.allowed) {
        // Rate limit exceeded
        res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
        
        logger.warn('Rate limit exceeded', {
          key,
          ip: req.ip,
          path: req.path,
          method: req.method,
        });

        throw new AppError('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED');
      }

      // Handle response to potentially skip counting
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(data: any) {
          const shouldSkip = 
            (skipSuccessfulRequests && res.statusCode < 400) ||
            (skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            // Decrement the counter
            redisRateLimiter.check(key + ':decrement', maxRequests, windowMs);
          }

          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 429) {
        next(error);
      } else {
        // Log error but don't block request on rate limiter failure
        logger.error('Rate limiter error:', error);
        next();
      }
    }
  };
};

// Default key generator
const defaultKeyGenerator = (req: Request): string => {
  // Use user ID if authenticated, otherwise use IP
  const userId = (req as any).user?.id;
  return userId ? `user:${userId}` : `ip:${req.ip}`;
};

// Pre-configured rate limiters
export const rateLimiter = createRateLimiter();

export const strictRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyGenerator: (req) => `webhook:${req.ip}:${req.path}`,
});

export const authRateLimiter = createRateLimiter({
  windowMs: 900000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (req) => `auth:${req.ip}:${req.body?.email || req.body?.username || ''}`,
  skipSuccessfulRequests: true,
});