import { Request, Response, NextFunction } from 'express';
import { providerService } from '../services/providerService';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';

export const providerController = {
  // Get all available providers
  getProviders: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check cache first
      const cacheKey = 'providers:all';
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
        });
        return;
      }

      const providers = await providerService.getAllProvidersInfo();

      // Cache for 5 minutes
      await cache.set(cacheKey, providers, 300);

      res.json({
        success: true,
        data: providers,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get specific provider information
  getProviderInfo: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;

      const info = await providerService.getProviderInfo(provider);

      res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all providers health status
  getProvidersHealth: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check cache first
      const cacheKey = 'providers:health';
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const healthStatus = await providerService.healthCheckAll();

      res.json({
        success: true,
        data: healthStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  // Get specific provider health
  getProviderHealth: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;

      const isHealthy = await providerService.healthCheck(provider);

      res.json({
        success: true,
        data: {
          provider,
          healthy: isHealthy,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get provider statistics
  getProviderStats: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const { startDate, endDate, groupBy = 'day' } = req.query;

      // Check cache
      const cacheKey = `provider:stats:${provider}:${startDate}:${endDate}:${groupBy}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
        });
        return;
      }

      // Get stats from service
      const stats = await providerService.getProviderStats(provider);

      // Cache for 1 hour
      await cache.set(cacheKey, stats, 3600);

      res.json({
        success: true,
        data: {
          provider,
          period: {
            start: startDate || 'all-time',
            end: endDate || 'now',
          },
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Validate provider configuration
  validateProviderConfig: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;

      logger.info(`Validating configuration for provider: ${provider}`, {
        userId: req.user!.id,
      });

      const validation = await providerService.validateProviderConfig(provider);

      res.json({
        success: true,
        data: {
          provider,
          ...validation,
          validatedAt: new Date().toISOString(),
          validatedBy: req.user!.id,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};