/**
 * Socket.IO Rate Limiter - Prevents DoS attacks via excessive Socket.IO events
 *
 * CVE-002 Fix: Custom rate limiting for Socket.IO events using in-memory
 * or Redis-backed token bucket algorithm
 */

import { Socket } from 'socket.io';
import { logger } from './logger.js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Socket.IO rate limit configurations
 */
export const SOCKET_RATE_LIMITS = {
  MESSAGE_SEND: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:message:send'
  },
  /**
   * Per-conversation burst guard: prevents a single user from flooding one
   * conversation even while staying within the global 20 msg/min budget.
   * Key = `${keyPrefix}:${userId}:${conversationId}` (constructed by caller).
   */
  MESSAGE_SEND_PER_CONVERSATION: {
    maxRequests: 10,
    windowMs: 10000, // 10 seconds — allows bursts of up to 10 in a conversation
    keyPrefix: 'socket:message:send-conv'
  },
  CALL_INITIATE: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:call:initiate'
  },
  CALL_JOIN: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:call:join'
  },
  CALL_SIGNAL: {
    maxRequests: 100,
    windowMs: 10000, // 10 seconds
    keyPrefix: 'socket:call:signal'
  },
  // Audit gateway prod 2026-07-02 (C2) — 50/5s was tuned for a single steady
  // trickle, but real clients flush a full ICE gathering pass (15-25
  // candidates within milliseconds) AND re-gather on every renegotiation
  // (camera toggle, ICE restart) — a healthy 262s call observed 7 such
  // cycles. The old budget let one gathering flush exhaust the window and
  // throttle a live call (prod: call killed 382ms after connecting).
  // Candidates are redundant by design (loss-tolerant), so widening this is
  // safe — it only prevents legitimate bursts from being mistaken for abuse.
  CALL_ICE_CANDIDATE: {
    maxRequests: 150,
    windowMs: 5000,
    keyPrefix: 'socket:call:ice'
  },
  CALL_LEAVE: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:call:leave'
  },
  MEDIA_TOGGLE: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:call:media'
  },
  CALL_TRANSCRIPTION_SEGMENT: {
    maxRequests: 60,
    windowMs: 10000, // 10 seconds (real-time transcription bursts)
    keyPrefix: 'socket:call:transcription'
  },
  CALL_HEARTBEAT: {
    maxRequests: 12,
    windowMs: 60000, // 1 minute — client heartbeats every ~10s, generous buffer for jitter
    keyPrefix: 'socket:call:heartbeat'
  },
  CALL_QUALITY_REPORT: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute — client reports stats every few seconds
    keyPrefix: 'socket:call:quality'
  },
  REACTION_ADD: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute — prevents emoji spam floods
    keyPrefix: 'socket:reaction:add'
  },
  REACTION_REMOVE: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute — mirrors add limit
    keyPrefix: 'socket:reaction:remove'
  },
  REACTION_SYNC: {
    maxRequests: 120,
    windowMs: 60000, // 1 minute — read-only, triggered on conversation open; must not be
    // blocked by the stricter REACTION_ADD write limit or users can't view reactions after
    // hitting the emoji-send budget.
    keyPrefix: 'socket:reaction:sync'
  },
  SOCKET_AUTH: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute — prevents credential stuffing via WS
    keyPrefix: 'socket:auth'
  },
  MESSAGE_EDIT: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — same budget as send; edits are less frequent
    keyPrefix: 'socket:message:edit'
  },
  MESSAGE_DELETE: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:message:delete'
  },
  TYPING_INDICATOR: {
    maxRequests: 60,
    windowMs: 60000, // 1 minute — global guard; per-conversation 2s throttle is the primary gate
    keyPrefix: 'socket:typing'
  },
  LOCATION_SHARE: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:location:share'
  },
  LOCATION_LIVE_UPDATE: {
    maxRequests: 120,
    windowMs: 60000, // 1 minute — allows ~2 GPS updates/sec (typical accuracy)
    keyPrefix: 'socket:location:live-update'
  },
  LOCATION_LIVE_START: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:location:live-start'
  },
  LOCATION_LIVE_STOP: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:location:live-stop'
  },
  CONVERSATION_JOIN: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:conversation:join'
  }
};

/**
 * In-memory rate limiter for Socket.IO events
 */
export class SocketRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if a request is allowed under rate limits
   *
   * @param userId - User ID making the request
   * @param config - Rate limit configuration
   * @returns True if allowed, false if rate limited
   */
  async checkLimit(userId: string, config: RateLimitConfig): Promise<boolean> {
    const key = `${config.keyPrefix || 'socket'}:${userId}`;
    const now = Date.now();

    let entry = this.limits.get(key);

    // If no entry or expired, create new entry
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.windowMs
      };
      this.limits.set(key, entry);
      return true;
    }

    // Increment counter
    entry.count++;

    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      logger.warn('Socket.IO rate limit exceeded', {
        userId,
        key,
        count: entry.count,
        max: config.maxRequests,
        resetIn: Math.ceil((entry.resetTime - now) / 1000)
      });
      return false;
    }

    return true;
  }

  /**
   * Get rate limit info for a user
   *
   * @param userId - User ID
   * @param config - Rate limit configuration
   * @returns Rate limit status
   */
  getRateLimitInfo(userId: string, config: RateLimitConfig): {
    count: number;
    remaining: number;
    resetTime: number;
    resetIn: number;
  } {
    const key = `${config.keyPrefix || 'socket'}:${userId}`;
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetTime) {
      return {
        count: 0,
        remaining: config.maxRequests,
        resetTime: now + config.windowMs,
        resetIn: config.windowMs
      };
    }

    return {
      count: entry.count,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      resetIn: Math.max(0, entry.resetTime - now)
    };
  }

  /**
   * Reset rate limit for a specific user and event
   *
   * @param userId - User ID
   * @param config - Rate limit configuration
   */
  reset(userId: string, config: RateLimitConfig): void {
    const key = `${config.keyPrefix || 'socket'}:${userId}`;
    this.limits.delete(key);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Socket rate limiter cleanup', {
        cleaned,
        remaining: this.limits.size
      });
    }
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }

  /**
   * Get total number of tracked users
   */
  getTrackedCount(): number {
    return this.limits.size;
  }
}

/**
 * Helper function to check rate limit and emit error if exceeded
 *
 * @param socket - Socket.IO socket
 * @param userId - User ID
 * @param config - Rate limit configuration
 * @param rateLimiter - Rate limiter instance
 * @param errorEvent - Event to emit on rate limit exceeded
 * @returns True if allowed, false if rate limited
 */
export async function checkSocketRateLimit(
  socket: Socket,
  userId: string,
  config: RateLimitConfig,
  rateLimiter: SocketRateLimiter,
  errorEvent: string = 'call:error'
): Promise<boolean> {
  const allowed = await rateLimiter.checkLimit(userId, config);

  if (!allowed) {
    const info = rateLimiter.getRateLimitInfo(userId, config);
    socket.emit(errorEvent, {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again in ${Math.ceil(info.resetIn / 1000)} seconds`,
      retryAfter: Math.ceil(info.resetIn / 1000)
    });
  }

  return allowed;
}

/**
 * Create a singleton rate limiter instance
 */
let rateLimiterInstance: SocketRateLimiter | null = null;

export function getSocketRateLimiter(): SocketRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new SocketRateLimiter();
    logger.info('✅ Socket.IO rate limiter initialized');
  }
  return rateLimiterInstance;
}
