import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from './config';

// Redis client instance
export let redis: Redis;

// Redis connection options
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  keyPrefix: config.redis.keyPrefix,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      logger.error('Redis READONLY error, reconnecting...');
      return true;
    }
    return false;
  },
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  lazyConnect: false,
};

// Connect to Redis
export const connectRedis = async (): Promise<void> => {
  try {
    redis = new Redis(redisOptions);

    // Event handlers
    redis.on('connect', () => {
      logger.info('Redis client connected');
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redis.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Test connection
    await redis.ping();
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Disconnect from Redis
export const disconnectRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
};

// Redis health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!redis) {
      return false;
    }
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

// Cache utilities
export const cache = {
  // Get value with automatic JSON parsing
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  },

  // Set value with automatic JSON stringification
  set: async <T>(
    key: string, 
    value: T, 
    ttl?: number
  ): Promise<boolean> => {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  },

  // Delete key
  del: async (key: string | string[]): Promise<number> => {
    try {
      return await redis.del(key);
    } catch (error) {
      logger.error(`Error deleting cache key(s) ${key}:`, error);
      return 0;
    }
  },

  // Check if key exists
  exists: async (key: string): Promise<boolean> => {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking cache key ${key}:`, error);
      return false;
    }
  },

  // Get TTL for key
  ttl: async (key: string): Promise<number> => {
    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  },

  // Clear all cache with prefix
  clearPrefix: async (prefix: string): Promise<number> => {
    try {
      const keys = await redis.keys(`${config.redis.keyPrefix}${prefix}*`);
      if (keys.length === 0) return 0;
      
      // Remove the key prefix before deletion
      const keysWithoutPrefix = keys.map(key => 
        key.replace(config.redis.keyPrefix, '')
      );
      
      return await redis.del(...keysWithoutPrefix);
    } catch (error) {
      logger.error(`Error clearing cache prefix ${prefix}:`, error);
      return 0;
    }
  },
};

// Distributed lock implementation
export const lock = {
  // Acquire lock
  acquire: async (
    key: string, 
    ttl: number = 30
  ): Promise<boolean> => {
    try {
      const lockKey = `lock:${key}`;
      const result = await redis.set(
        lockKey, 
        '1', 
        'EX', 
        ttl, 
        'NX'
      );
      return result === 'OK';
    } catch (error) {
      logger.error(`Error acquiring lock ${key}:`, error);
      return false;
    }
  },

  // Release lock
  release: async (key: string): Promise<boolean> => {
    try {
      const lockKey = `lock:${key}`;
      const result = await redis.del(lockKey);
      return result === 1;
    } catch (error) {
      logger.error(`Error releasing lock ${key}:`, error);
      return false;
    }
  },

  // Execute with lock
  withLock: async <T>(
    key: string,
    callback: () => Promise<T>,
    ttl: number = 30,
    retries: number = 3
  ): Promise<T | null> => {
    for (let i = 0; i < retries; i++) {
      const acquired = await lock.acquire(key, ttl);
      
      if (acquired) {
        try {
          const result = await callback();
          return result;
        } finally {
          await lock.release(key);
        }
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
    
    logger.error(`Failed to acquire lock ${key} after ${retries} retries`);
    return null;
  },
};

// Session management
export const session = {
  // Store session
  set: async (
    sessionId: string, 
    data: any, 
    ttl: number = 3600
  ): Promise<void> => {
    await cache.set(`session:${sessionId}`, data, ttl);
  },

  // Get session
  get: async <T>(sessionId: string): Promise<T | null> => {
    return await cache.get<T>(`session:${sessionId}`);
  },

  // Delete session
  del: async (sessionId: string): Promise<boolean> => {
    const result = await cache.del(`session:${sessionId}`);
    return result === 1;
  },

  // Extend session TTL
  extend: async (sessionId: string, ttl: number = 3600): Promise<boolean> => {
    try {
      const result = await redis.expire(`${config.redis.keyPrefix}session:${sessionId}`, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Error extending session ${sessionId}:`, error);
      return false;
    }
  },
};

// Rate limiting
export const rateLimiter = {
  // Check rate limit
  check: async (
    key: string, 
    limit: number, 
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    const now = Date.now();
    const windowStart = now - window;
    const rateLimitKey = `ratelimit:${key}`;

    try {
      // Remove old entries
      await redis.zremrangebyscore(rateLimitKey, '-inf', windowStart);
      
      // Count requests in window
      const count = await redis.zcard(rateLimitKey);
      
      if (count < limit) {
        // Add current request
        await redis.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
        await redis.expire(rateLimitKey, Math.ceil(window / 1000));
        
        return {
          allowed: true,
          remaining: limit - count - 1,
          resetAt: now + window,
        };
      }
      
      // Get oldest entry to determine reset time
      const oldestEntries = await redis.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
      const resetAt = oldestEntries.length > 1 
        ? parseInt(oldestEntries[1]) + window 
        : now + window;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    } catch (error) {
      logger.error(`Error checking rate limit for ${key}:`, error);
      // Allow request on error
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + window,
      };
    }
  },
};