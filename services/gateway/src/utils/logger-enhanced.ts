/**
 * Enhanced Structured Logger
 *
 * Provides production-grade structured logging with:
 * - Pino for high-performance JSON logging
 * - Log levels: trace, debug, info, warn, error, fatal
 * - PII hashing for security compliance
 * - Sampling in production (reduces log volume)
 * - Context enrichment (request ID, user ID, etc.)
 * - Error stack traces
 *
 * @module logger-enhanced
 */

import pino from 'pino';
import { createHash } from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * PII (Personally Identifiable Information) fields to hash
 */
const PII_FIELDS = ['userId', 'email', 'ipAddress', 'phoneNumber', 'username'];

/**
 * Hash sensitive data for compliance
 */
function hashPII(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Recursively redact PII from log objects
 */
function redactPII(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactPII(item));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.includes(key) && typeof value === 'string') {
      redacted[key] = `${value.substring(0, 4)}...${hashPII(value)}`;
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactPII(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Create Pino logger instance
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Pretty print in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: true
        }
      }
    : undefined,

  // Base configuration
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'meeshy-gateway'
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'secret',
      'apiKey'
    ],
    remove: true
  },

  // Serializers for common objects
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  },

  // Timestamp format
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

/**
 * Sampling helper for production (log only X% of debug messages)
 */
function shouldSample(level: string): boolean {
  if (!isProduction || level !== 'debug') {
    return true;
  }

  // Sample 10% of debug logs in production
  const samplingRate = parseFloat(process.env.LOG_SAMPLING_RATE || '0.1');
  return Math.random() < samplingRate;
}

/**
 * Enhanced logger with additional features
 */
export const enhancedLogger = {
  /**
   * Trace level - very detailed, disabled in production
   */
  trace(message: string, context?: Record<string, any>) {
    if (shouldSample('trace')) {
      logger.trace(context ? redactPII(context) : {}, message);
    }
  },

  /**
   * Debug level - detailed information for debugging
   */
  debug(message: string, context?: Record<string, any>) {
    if (shouldSample('debug')) {
      logger.debug(context ? redactPII(context) : {}, message);
    }
  },

  /**
   * Info level - general informational messages
   */
  info(message: string, context?: Record<string, any>) {
    logger.info(context ? redactPII(context) : {}, message);
  },

  /**
   * Warn level - warning messages
   */
  warn(message: string, context?: Record<string, any>) {
    logger.warn(context ? redactPII(context) : {}, message);
  },

  /**
   * Error level - error messages with stack traces
   */
  error(message: string, error?: Error | unknown, context?: Record<string, any>) {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    };

    logger.error(redactPII(errorContext), message);
  },

  /**
   * Fatal level - application-breaking errors
   */
  fatal(message: string, error?: Error | unknown, context?: Record<string, any>) {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    };

    logger.fatal(redactPII(errorContext), message);
  },

  /**
   * Child logger with additional context
   */
  child(bindings: Record<string, any>) {
    const childLogger = logger.child(redactPII(bindings));

    // Return enhanced logger interface wrapping the child logger
    return {
      trace(message: string, context?: Record<string, any>) {
        if (shouldSample('trace')) {
          childLogger.trace(context ? redactPII(context) : {}, message);
        }
      },
      debug(message: string, context?: Record<string, any>) {
        if (shouldSample('debug')) {
          childLogger.debug(context ? redactPII(context) : {}, message);
        }
      },
      info(message: string, context?: Record<string, any>) {
        childLogger.info(context ? redactPII(context) : {}, message);
      },
      warn(message: string, context?: Record<string, any>) {
        childLogger.warn(context ? redactPII(context) : {}, message);
      },
      error(message: string, error?: Error | unknown, context?: Record<string, any>) {
        const errorContext = {
          ...context,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error
        };
        childLogger.error(redactPII(errorContext), message);
      },
      fatal(message: string, error?: Error | unknown, context?: Record<string, any>) {
        const errorContext = {
          ...context,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error
        };
        childLogger.fatal(redactPII(errorContext), message);
      }
    };
  }
};

/**
 * Notification-specific logger
 */
export const notificationLogger = enhancedLogger.child({
  module: 'notifications'
});

/**
 * Security audit logger (always logged, never sampled)
 */
export const securityLogger = {
  logAttempt(action: string, context: Record<string, any>) {
    logger.warn(
      {
        ...redactPII(context),
        action,
        type: 'SECURITY_ATTEMPT'
      },
      `Security attempt: ${action}`
    );
  },

  logViolation(action: string, context: Record<string, any>) {
    logger.error(
      {
        ...redactPII(context),
        action,
        type: 'SECURITY_VIOLATION'
      },
      `Security violation: ${action}`
    );
  },

  logSuccess(action: string, context: Record<string, any>) {
    logger.info(
      {
        ...redactPII(context),
        action,
        type: 'SECURITY_SUCCESS'
      },
      `Security action: ${action}`
    );
  }
};

/**
 * Performance logger for tracking slow operations
 */
export const performanceLogger = {
  start(operationName: string) {
    const startTime = Date.now();

    return {
      end: (context?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        const level = duration > 1000 ? 'warn' : 'info';

        logger[level](
          {
            ...redactPII(context || {}),
            operation: operationName,
            durationMs: duration
          },
          `Operation completed: ${operationName}`
        );
      }
    };
  }
};

/**
 * Request logger middleware for Fastify
 */
export function requestLogger() {
  return async (request: any, reply: any) => {
    const startTime = Date.now();
    const requestId = request.id || `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Attach request ID
    request.requestId = requestId;

    // Log incoming request
    enhancedLogger.info('Incoming request', {
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip
    });

    // Log response when finished
    reply.addHook('onSend', async () => {
      const duration = Date.now() - startTime;
      const level = reply.statusCode >= 400 ? 'warn' : 'info';

      enhancedLogger[level]('Request completed', {
        requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: duration
      });
    });
  };
}

/**
 * Export default logger
 */
export default enhancedLogger;

/**
 * Backwards compatibility: expose logger methods directly
 */
export const { trace, debug, info, warn, error, fatal } = enhancedLogger;
