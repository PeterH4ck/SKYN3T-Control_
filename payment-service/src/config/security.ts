import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Express } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

/**
 * Configuración de seguridad para el Payment Service
 */
export class SecurityConfig {
  /**
   * Aplicar todas las configuraciones de seguridad
   */
  static applyAll(app: Express): void {
    // Aplicar configuraciones individuales
    this.applyHelmet(app);
    this.applyCORS(app);
    this.applyRateLimiting(app);
    this.applySlowDown(app);
    this.applySanitization(app);
    this.applySecurityHeaders(app);
    this.applyContentSecurityPolicy(app);
    
    logger.info('[SecurityConfig] Todas las configuraciones de seguridad aplicadas');
  }

  /**
   * Configurar Helmet para headers de seguridad
   */
  static applyHelmet(app: Express): void {
    app.use(helmet({
      contentSecurityPolicy: false, // Lo configuramos por separado
      crossOriginEmbedderPolicy: false, // Para permitir embeds si es necesario
    }));

    // Headers adicionales
    app.use(helmet.frameguard({ action: 'deny' }));
    app.use(helmet.hidePoweredBy());
    app.use(helmet.hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }));
    app.use(helmet.ieNoOpen());
    app.use(helmet.noSniff());
    app.use(helmet.originAgentCluster());
    app.use(helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }));
    app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
    app.use(helmet.xssFilter());
  }

  /**
   * Configurar CORS
   */
  static applyCORS(app: Express): void {
    const corsOptions: cors.CorsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = this.getAllowedOrigins();
        
        // Permitir requests sin origin (ej. Postman, apps móviles)
        if (!origin) {
          return callback(null, true);
        }

        // Verificar si el origin está permitido
        if (allowedOrigins.includes(origin) || this.isOriginAllowed(origin, allowedOrigins)) {
          callback(null, true);
        } else {
          logger.warn('[CORS] Origin bloqueado', { origin });
          callback(new AppError('No permitido por CORS', 403));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Request-ID',
        'X-Idempotency-Key',
        'X-Community-ID',
        'Accept',
        'Accept-Language',
        'Accept-Encoding'
      ],
      exposedHeaders: [
        'X-Total-Count',
        'X-Page',
        'X-Per-Page',
        'X-Request-ID',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ],
      maxAge: 86400, // 24 horas
      preflightContinue: false,
      optionsSuccessStatus: 204
    };

    app.use(cors(corsOptions));
  }

  /**
   * Configurar rate limiting
   */
  static applyRateLimiting(app: Express): void {
    // Rate limit general
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100, // 100 requests por ventana
      message: 'Demasiadas peticiones desde esta IP, intente más tarde',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn('[RateLimit] Límite excedido', {
          ip: req.ip,
          path: req.path
        });
        res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: 'Demasiadas peticiones, intente más tarde',
          retryAfter: req.rateLimit?.resetTime
        });
      }
    });

    // Rate limit estricto para pagos
    const paymentLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 20, // 20 pagos por ventana
      skipSuccessfulRequests: false,
      message: 'Límite de pagos excedido',
      keyGenerator: (req) => {
        // Usar user ID si está autenticado, sino IP
        return req.user?.id || req.ip;
      }
    });

    // Rate limit para webhooks
    const webhookLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minuto
      max: 50, // 50 webhooks por minuto
      skipSuccessfulRequests: true
    });

    // Rate limit para login/auth
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 5, // 5 intentos de login
      skipSuccessfulRequests: true
    });

    // Aplicar limitadores
    app.use('/api/v1/', generalLimiter);
    app.use('/api/v1/payments', paymentLimiter);
    app.use('/api/v1/webhooks', webhookLimiter);
    app.use('/api/v1/auth', authLimiter);
  }

  /**
   * Configurar slow down para prevenir ataques
   */
  static applySlowDown(app: Express): void {
    const speedLimiter = slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutos
      delayAfter: 50, // Empezar a ralentizar después de 50 requests
      delayMs: 500, // Agregar 500ms de delay por request
      maxDelayMs: 20000, // Máximo 20 segundos de delay
      skipSuccessfulRequests: true
    });

    app.use('/api/v1/', speedLimiter);
  }

  /**
   * Aplicar sanitización de datos
   */
  static applySanitization(app: Express): void {
    // Prevenir NoSQL injection
    app.use(mongoSanitize({
      replaceWith: '_',
      onSanitize: ({ req, key }) => {
        logger.warn('[Sanitization] Intento de inyección detectado', {
          ip: req.ip,
          key
        });
      }
    }));

    // Prevenir HTTP Parameter Pollution
    app.use(hpp({
      whitelist: ['sort', 'fields', 'page', 'limit', 'filter']
    }));

    // Limitar tamaño de payloads
    app.use((req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (contentLength > maxSize) {
        return res.status(413).json({
          success: false,
          error: 'Payload Too Large',
          message: 'El tamaño de la petición excede el límite permitido'
        });
      }

      next();
    });
  }

  /**
   * Aplicar headers de seguridad adicionales
   */
  static applySecurityHeaders(app: Express): void {
    app.use((req, res, next) => {
      // Headers de seguridad adicionales
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader('X-Download-Options', 'noopen');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      
      // Headers para prevenir sniffing
      res.setHeader('X-DNS-Prefetch-Control', 'off');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      
      // Feature policy
      res.setHeader('Permissions-Policy', 
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
      );

      // Remover headers sensibles
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

      next();
    });
  }

  /**
   * Configurar Content Security Policy
   */
  static applyContentSecurityPolicy(app: Express): void {
    const cspDirectives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.stripe.com', 'https://api.paypal.com'],
      mediaSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://js.stripe.com', 'https://www.paypal.com'],
      workerSrc: ["'self'"],
      childSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : undefined
    };

    app.use(helmet.contentSecurityPolicy({
      directives: cspDirectives,
      reportOnly: false
    }));
  }

  /**
   * Obtener origins permitidos según ambiente
   */
  private static getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // Agregar origins por defecto según ambiente
    if (process.env.NODE_ENV === 'development') {
      origins.push(
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3005',
        'http://127.0.0.1:3000'
      );
    }

    if (process.env.NODE_ENV === 'production') {
      origins.push(
        'https://app.skyn3t.com',
        'https://admin.skyn3t.com',
        'https://api.skyn3t.com'
      );
    }

    return [...new Set(origins)]; // Eliminar duplicados
  }

  /**
   * Verificar si un origin está permitido (soporta wildcards)
   */
  private static isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
    return allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp('^' + allowed.replace('*', '.*') + '$');
        return regex.test(origin);
      }
      return allowed === origin;
    });
  }

  /**
   * Middleware para validar API keys
   */
  static validateApiKey(req: any, res: any, next: any): void {
    const apiKey = req.headers['x-api-key'];
    
    // Skip para rutas públicas
    const publicRoutes = ['/health', '/metrics', '/api-docs'];
    if (publicRoutes.some(route => req.path.includes(route))) {
      return next();
    }

    // Skip para webhooks (tienen su propia autenticación)
    if (req.path.includes('/webhooks')) {
      return next();
    }

    // Validar API key si está presente
    if (apiKey && !this.isValidApiKey(apiKey)) {
      logger.warn('[Security] API key inválida', { 
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip 
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API Key',
        message: 'API key inválida o expirada'
      });
    }

    next();
  }

  /**
   * Validar API key
   */
  private static isValidApiKey(apiKey: string): boolean {
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    return validApiKeys.includes(apiKey);
  }

  /**
   * Middleware para prevenir timing attacks
   */
  static preventTimingAttacks(req: any, res: any, next: any): void {
    // Agregar delay aleatorio para operaciones sensibles
    const sensitivePaths = ['/auth', '/payments', '/refunds'];
    
    if (sensitivePaths.some(path => req.path.includes(path))) {
      const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms
      setTimeout(next, delay);
    } else {
      next();
    }
  }
}

// Exportar middleware functions para uso directo
export const securityMiddleware = {
  validateApiKey: SecurityConfig.validateApiKey,
  preventTimingAttacks: SecurityConfig.preventTimingAttacks
};