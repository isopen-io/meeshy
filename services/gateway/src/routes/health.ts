/**
 * Health Check Routes
 *
 * Provides comprehensive health monitoring endpoints for:
 * - Basic health check (uptime, status)
 * - Readiness check (dependencies: DB, Redis, Socket.IO)
 * - Liveness check (application responsive)
 * - Detailed metrics (CPU, memory, connections)
 * - Circuit breaker status
 *
 * Endpoints:
 * - GET /health - Basic health check
 * - GET /health/ready - Readiness probe (Kubernetes-compatible)
 * - GET /health/live - Liveness probe (Kubernetes-compatible)
 * - GET /health/metrics - Detailed metrics (auth required)
 *
 * @module routes/health
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../utils/logger-enhanced';
import { circuitBreakerManager } from '../utils/circuitBreaker';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import os from 'os';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version?: string;
  environment?: string;
}

interface ReadinessCheck {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: CheckResult;
    redis?: CheckResult;
    socketio?: CheckResult;
  };
}

interface CheckResult {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  error?: string;
}

interface MetricsData {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    usagePercentage: number;
  };
  cpu: {
    user: number;
    system: number;
    loadAverage: number[];
  };
  process: {
    pid: number;
    platform: string;
    nodeVersion: string;
  };
  circuitBreakers?: Record<string, any>;
  connections?: {
    active: number;
    pending: number;
  };
}

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * GET /health
   * Basic health check - always returns 200 if server is running
   * Use for: Load balancers, basic monitoring
   */
  fastify.get('/health', {
    schema: {
      description: 'Basic health check endpoint that always returns 200 if the server is running. Returns service uptime, version, and environment information. Use this for load balancers and basic monitoring. Does not check dependencies.',
      tags: ['health'],
      summary: 'Basic health check',
      response: {
        200: {
          description: 'Server is healthy and running',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy'],
              description: 'Service health status',
              example: 'healthy'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp in ISO format'
            },
            uptime: {
              type: 'number',
              description: 'Service uptime in seconds'
            },
            version: {
              type: 'string',
              description: 'Application version',
              example: '1.0.0'
            },
            environment: {
              type: 'string',
              description: 'Current environment',
              example: 'production'
            }
          }
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const response: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    return reply.status(200).send(response);
  });

  /**
   * GET /health/ready
   * Readiness probe - checks if application is ready to serve traffic
   * Use for: Kubernetes readiness probes, deployment health
   *
   * Returns 200 if ready, 503 if not ready
   */
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness probe that checks if the application is ready to serve traffic. Validates connectivity to critical dependencies: database, Redis, and Socket.IO. Returns 200 if all checks pass, 503 if any dependency is down. Use this for Kubernetes readiness probes and deployment health monitoring.',
      tags: ['health'],
      summary: 'Readiness probe',
      response: {
        200: {
          description: 'Service is ready to serve traffic',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ready', 'not_ready'],
              description: 'Overall readiness status',
              example: 'ready'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp in ISO format'
            },
            checks: {
              type: 'object',
              description: 'Individual dependency health checks',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['up', 'down', 'degraded'],
                      description: 'Database connection status'
                    },
                    latency: {
                      type: 'number',
                      description: 'Database query latency in milliseconds'
                    },
                    error: {
                      type: 'string',
                      description: 'Error message if database is down'
                    }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['up', 'down', 'degraded'],
                      description: 'Redis connection status'
                    },
                    latency: {
                      type: 'number',
                      description: 'Redis ping latency in milliseconds'
                    },
                    error: {
                      type: 'string',
                      description: 'Error message if Redis is down'
                    }
                  }
                },
                socketio: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['up', 'down', 'degraded'],
                      description: 'Socket.IO server status'
                    },
                    latency: {
                      type: 'number',
                      description: 'Socket.IO latency in milliseconds'
                    },
                    error: {
                      type: 'string',
                      description: 'Error message if Socket.IO is down'
                    }
                  }
                }
              }
            }
          }
        },
        503: {
          description: 'Service is not ready - one or more dependencies are unavailable',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['not_ready'],
              example: 'not_ready'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            checks: {
              type: 'object',
              description: 'Individual dependency health checks showing failures'
            }
          }
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: ReadinessCheck['checks'] = {
      database: await checkDatabase(fastify),
      redis: await checkRedis(fastify),
      socketio: await checkSocketIO(fastify)
    };

    // Determine overall readiness
    const allUp = Object.values(checks).every(
      check => check && check.status === 'up'
    );

    const response: ReadinessCheck = {
      status: allUp ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks
    };

    const statusCode = allUp ? 200 : 503;

    if (!allUp) {
      enhancedLogger.warn('Readiness check failed', {
        checks,
        failedServices: Object.entries(checks)
          .filter(([_, check]) => check && check.status !== 'up')
          .map(([name]) => name)
      });
    }

    return reply.status(statusCode).send(response);
  });

  /**
   * GET /health/live
   * Liveness probe - checks if application is responsive
   * Use for: Kubernetes liveness probes, restart detection
   *
   * Returns 200 if alive, 503 if deadlocked/unresponsive
   */
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness probe that checks if the application is responsive and not deadlocked. Monitors memory heap usage and returns 503 if heap usage exceeds 95% (indicating memory leak or unhealthy state). Use this for Kubernetes liveness probes to trigger container restarts when the application becomes unresponsive.',
      tags: ['health'],
      summary: 'Liveness probe',
      response: {
        200: {
          description: 'Application is alive and responsive',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['alive', 'unhealthy'],
              description: 'Liveness status',
              example: 'alive'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp in ISO format'
            },
            uptime: {
              type: 'number',
              description: 'Service uptime in seconds'
            },
            memoryHeapUsagePercent: {
              type: 'number',
              description: 'Memory heap usage percentage (0-100)'
            }
          }
        },
        503: {
          description: 'Application is unhealthy - memory issues detected',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['unhealthy'],
              example: 'unhealthy'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            uptime: {
              type: 'number',
              description: 'Service uptime in seconds'
            },
            memoryHeapUsagePercent: {
              type: 'number',
              description: 'Memory heap usage percentage (>95% indicates critical state)'
            }
          }
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Simple check - if we can respond, we're alive
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    // Check for memory issues that might indicate a leak
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // Consider unhealthy if heap usage > 95%
    const isHealthy = heapUsagePercent < 95;

    const response = {
      status: isHealthy ? 'alive' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime,
      memoryHeapUsagePercent: Math.round(heapUsagePercent)
    };

    const statusCode = isHealthy ? 200 : 503;

    if (!isHealthy) {
      enhancedLogger.error('Liveness check failed', new Error('High memory usage'), {
        heapUsagePercent,
        memoryUsage
      });
    }

    return reply.status(statusCode).send(response);
  });

  /**
   * GET /health/metrics
   * Detailed metrics - requires authentication
   * Use for: Monitoring dashboards, debugging, ops teams
   */
  fastify.get('/health/metrics', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve detailed application metrics including memory usage, CPU statistics, process information, circuit breaker states, and Socket.IO connections. Requires authentication. Use this endpoint for monitoring dashboards, performance analysis, and operational insights.',
      tags: ['health'],
      summary: 'Get detailed metrics (auth required)',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Detailed metrics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                uptime: {
                  type: 'number',
                  description: 'Service uptime in seconds'
                },
                memory: {
                  type: 'object',
                  description: 'Memory usage statistics',
                  properties: {
                    heapUsed: {
                      type: 'number',
                      description: 'Used heap memory in bytes'
                    },
                    heapTotal: {
                      type: 'number',
                      description: 'Total heap memory in bytes'
                    },
                    external: {
                      type: 'number',
                      description: 'External memory usage in bytes'
                    },
                    rss: {
                      type: 'number',
                      description: 'Resident set size in bytes'
                    },
                    usagePercentage: {
                      type: 'number',
                      description: 'Heap usage percentage (0-100)'
                    }
                  }
                },
                cpu: {
                  type: 'object',
                  description: 'CPU usage statistics',
                  properties: {
                    user: {
                      type: 'number',
                      description: 'User CPU time in microseconds'
                    },
                    system: {
                      type: 'number',
                      description: 'System CPU time in microseconds'
                    },
                    loadAverage: {
                      type: 'array',
                      items: { type: 'number' },
                      description: 'System load average [1min, 5min, 15min]'
                    }
                  }
                },
                process: {
                  type: 'object',
                  description: 'Process information',
                  properties: {
                    pid: {
                      type: 'number',
                      description: 'Process ID'
                    },
                    platform: {
                      type: 'string',
                      description: 'Operating system platform'
                    },
                    nodeVersion: {
                      type: 'string',
                      description: 'Node.js version'
                    }
                  }
                },
                circuitBreakers: {
                  type: 'object',
                  description: 'Circuit breaker statistics for all registered circuit breakers',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      state: {
                        type: 'string',
                        enum: ['closed', 'open', 'half-open'],
                        description: 'Circuit breaker state'
                      },
                      failures: {
                        type: 'number',
                        description: 'Number of failures'
                      },
                      successes: {
                        type: 'number',
                        description: 'Number of successes'
                      }
                    }
                  }
                },
                connections: {
                  type: 'object',
                  description: 'Socket.IO connection statistics',
                  properties: {
                    active: {
                      type: 'number',
                      description: 'Number of active connections'
                    },
                    pending: {
                      type: 'number',
                      description: 'Number of pending connections'
                    }
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const metrics: MetricsData = {
      uptime,
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        usagePercentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: os.loadavg()
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      },
      circuitBreakers: circuitBreakerManager.getAllStats()
    };

    // Add Socket.IO connection count if available
    const io = (fastify as any).io;
    if (io) {
      metrics.connections = {
        active: io.sockets.sockets.size,
        pending: 0 // Placeholder
      };
    }

    return reply.send({
      success: true,
      data: metrics
    });
  });

  /**
   * GET /health/circuit-breakers
   * Circuit breaker status - requires authentication
   * Use for: Monitoring circuit breaker states, debugging failures
   */
  fastify.get('/health/circuit-breakers', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve the current status and statistics of all circuit breakers in the system. Circuit breakers protect against cascading failures by monitoring service calls and automatically opening when failure thresholds are exceeded. Requires authentication. Use this for monitoring circuit breaker health and debugging service failures.',
      tags: ['health'],
      summary: 'Get circuit breaker status (auth required)',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Circuit breaker statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              description: 'Circuit breaker statistics by name',
              additionalProperties: {
                type: 'object',
                properties: {
                  state: {
                    type: 'string',
                    enum: ['closed', 'open', 'half-open'],
                    description: 'Current circuit breaker state. Closed: normal operation, Open: blocking calls due to failures, Half-open: testing if service recovered'
                  },
                  failures: {
                    type: 'number',
                    description: 'Total number of failures recorded'
                  },
                  successes: {
                    type: 'number',
                    description: 'Total number of successful calls'
                  },
                  lastFailureTime: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Timestamp of last failure'
                  },
                  nextAttemptTime: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Timestamp when next attempt will be allowed (for open circuit breakers)'
                  }
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp'
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = circuitBreakerManager.getAllStats();

    return reply.send({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Check database connectivity
 */
async function checkDatabase(fastify: FastifyInstance): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Simple query to check database connectivity (use findFirst as $queryRaw not fully supported on MongoDB)
    await fastify.prisma.user.findFirst({ take: 1 });

    const latency = Date.now() - startTime;

    return {
      status: latency < 1000 ? 'up' : 'degraded',
      latency
    };
  } catch (error) {
    enhancedLogger.error('Database health check failed', error instanceof Error ? error : new Error(String(error)));

    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Redis connectivity (if available)
 */
async function checkRedis(fastify: FastifyInstance): Promise<CheckResult> {
  const redis = (fastify as any).redis;

  if (!redis) {
    return {
      status: 'up', // Redis is optional
      latency: 0
    };
  }

  const startTime = Date.now();

  try {
    await redis.ping();

    const latency = Date.now() - startTime;

    return {
      status: latency < 100 ? 'up' : 'degraded',
      latency
    };
  } catch (error) {
    enhancedLogger.error('Redis health check failed', error instanceof Error ? error : new Error(String(error)));

    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Socket.IO status
 */
async function checkSocketIO(fastify: FastifyInstance): Promise<CheckResult> {
  const io = (fastify as any).io;

  if (!io) {
    return {
      status: 'down',
      error: 'Socket.IO not initialized'
    };
  }

  try {
    // Check if Socket.IO server is running
    const isRunning = io.sockets !== undefined;

    return {
      status: isRunning ? 'up' : 'down',
      latency: 0
    };
  } catch (error) {
    enhancedLogger.error('Socket.IO health check failed', error instanceof Error ? error : new Error(String(error)));

    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
