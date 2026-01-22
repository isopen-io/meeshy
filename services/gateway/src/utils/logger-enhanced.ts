/**
 * Enhanced Structured Logger
 *
 * Format unifié Gateway : YYYY-MM-DD HH:MM:SS UTC [LEVEL] [GWY] [Module] Message {context}
 *
 * Provides production-grade structured logging with:
 * - Pino for high-performance JSON logging
 * - Log levels: trace, debug, info, warn, error, fatal
 * - PII hashing for security compliance
 * - Sampling in production (reduces log volume)
 * - Context enrichment (request ID, user ID, etc.)
 * - Error stack traces
 * - Unified format with [GWY] prefix for log aggregation
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
 * Custom formatter for Gateway logs
 * Format: YYYY-MM-DD HH:MM:SS UTC [LEVEL] [GWY] [Module] Message {context}
 */
function customGatewayFormatter(logObject: any): string {
  const timestamp = new Date(logObject.time).toISOString().replace('T', ' ').replace('Z', ' UTC');
  const level = logObject.level === 30 ? 'INFO'
    : logObject.level === 40 ? 'WARN'
    : logObject.level === 50 ? 'ERROR'
    : logObject.level === 60 ? 'FATAL'
    : logObject.level === 20 ? 'DEBUG'
    : logObject.level === 10 ? 'TRACE'
    : 'INFO';

  const module = logObject.module || 'Gateway';
  const message = logObject.msg || '';

  // Extract context (exclude standard fields)
  const contextFields = { ...logObject };
  delete contextFields.time;
  delete contextFields.level;
  delete contextFields.msg;
  delete contextFields.pid;
  delete contextFields.hostname;
  delete contextFields.module;
  delete contextFields.env;
  delete contextFields.service;

  // Build context string
  let contextStr = '';
  if (Object.keys(contextFields).length > 0) {
    contextStr = ' ' + JSON.stringify(contextFields);
  }

  return `${timestamp} [${level}] [GWY] [${module}] ${message}${contextStr}`;
}

/**
 * Create Pino logger instance with custom formatting
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Custom formatter in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino/file',
        options: {
          destination: 1, // stdout
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

  // Custom formatters
  formatters: {
    log(object: any) {
      if (isDevelopment) {
        // In development, print custom format to console
        const formatted = customGatewayFormatter({ ...object, time: Date.now() });
        return object; // Return object for pino, but we'll handle printing
      }
      return object;
    }
  },

  // Timestamp format
  timestamp: () => `,"time":${Date.now()}`
});

// Override console methods in development to use custom format
if (isDevelopment) {
  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any, encoding?: any, callback?: any) => {
    try {
      if (typeof chunk === 'string' && chunk.startsWith('{')) {
        const logObj = JSON.parse(chunk);
        if (logObj.time && logObj.level) {
          const formatted = customGatewayFormatter(logObj);
          return originalWrite(formatted + '\n', encoding, callback);
        }
      }
    } catch (e) {
      // If parsing fails, use original
    }
    return originalWrite(chunk, encoding, callback);
  };
}

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
 * Helper function for direct console.log replacement
 * Usage: gwLog('info', 'RedisWrapper', 'Message', { context: 'data' })
 */
export function gwLog(
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  module: string,
  message: string,
  context?: Record<string, any>
) {
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
  const levelUpper = level.toUpperCase();

  let contextStr = '';
  if (context && Object.keys(context).length > 0) {
    contextStr = ' ' + JSON.stringify(context);
  }

  console.log(`${timestamp} [${levelUpper}] [GWY] [${module}] ${message}${contextStr}`);
}

/**
 * Export default logger
 */
export default enhancedLogger;

/**
 * Backwards compatibility: expose logger methods directly
 */
export const { trace, debug, info, warn, error, fatal } = enhancedLogger;
