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
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
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
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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
