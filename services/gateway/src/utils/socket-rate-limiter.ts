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
  // Fire-and-forget lifecycle telemetry emitted once per finished call —
  // a handful per minute covers normal use with headroom for retries.
  CALL_ANALYTICS: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:call:analytics'
  },
  CALL_SCREEN_CAPTURE: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — start/stop toggles only, not a steady stream
    keyPrefix: 'socket:call:screen-capture'
  },
  // Audit calling-feature routine 2026-07-03 — RECONNECTING/RECONNECTED/
  // REQUEST_ICE_SERVERS were the only call:* handlers left unrate-limited
  // (unlike every sibling: HEARTBEAT, QUALITY_REPORT, TRANSCRIPTION_SEGMENT,
  // ANALYTICS, SCREEN_CAPTURE). Each triggers a DB write or HMAC credential
  // mint, so a flooding client could still amplify load onto the DB/TURN
  // secret even though authorization was already enforced.
  CALL_RECONNECTING: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — one ICE-restart attempt notification per retry, generous buffer
    keyPrefix: 'socket:call:reconnecting'
  },
  CALL_RECONNECTED: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — mirrors CALL_RECONNECTING
    keyPrefix: 'socket:call:reconnected'
  },
  CALL_ICE_SERVERS_REFRESH: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute — client refreshes at ~80% of TTL (minutes apart), not a steady stream
    keyPrefix: 'socket:call:ice-servers-refresh'
  },
  // Calling-stack audit 2026-07-05 — BACKGROUNDED/FOREGROUNDED were the last
  // call:* handlers left unrate-limited (every sibling lifecycle event does
  // check). Each triggers a full nested Prisma call-session lookup, so a
  // flooding client could still amplify DB load even though authorization
  // (resolveActiveCallParticipantId) was already enforced.
  CALL_BACKGROUNDED: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — one app-lifecycle transition notification per background, generous buffer
    keyPrefix: 'socket:call:backgrounded'
  },
  CALL_FOREGROUNDED: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — mirrors CALL_BACKGROUNDED
    keyPrefix: 'socket:call:foregrounded'
  },
  // Calling-stack audit 2026-07-05 (2) — `call:check-active` was the one
  // remaining call:* handler with NO rate limit at all (registered as a raw
  // string literal in CallEventsHandler.ts rather than a CALL_EVENTS
  // constant, which let it slide past the 2026-07-03 sweep above). It fans
  // out into 2-4 Prisma queries plus one `generateIceServers()` TURN-secret
  // HMAC mint PER matching in-progress call, with no payload required to
  // trigger it — a bigger amplification surface per call than the
  // already-limited CALL_ICE_SERVERS_REFRESH. Bound to one per socket
  // connect in normal operation (fired from `onConnect`), so a generous
  // per-minute budget only catches abusive/scripted flooding.
  CALL_CHECK_ACTIVE: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute — mirrors CALL_RECONNECTING/CALL_RECONNECTED
    keyPrefix: 'socket:call:check-active'
  },
  // Gateway calling-stack audit 2026-07-08 — `presence:app-state` was the one
  // remaining call-adjacent handler with zero throttling (no getUserId check
  // either, unlike every sibling). Impact per-event is minimal (sets a flag
  // on the socket, no DB write, no broadcast), but scenePhase transitions can
  // fire in bursts on a flaky device — a generous per-minute budget only
  // catches scripted flooding, not normal foreground/background churn.
  PRESENCE_APP_STATE: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute
    keyPrefix: 'socket:presence:app-state'
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
    // Clean up expired entries every minute. unref: ce timer d'hygiène ne
    // doit jamais maintenir le process en vie (jest/outillage) — même
    // pattern que les intervals de CallEventsHandler/NotificationService.
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    this.cleanupInterval.unref?.();
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
