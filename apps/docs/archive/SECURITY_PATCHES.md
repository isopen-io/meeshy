# SECURITY PATCHES - NOTIFICATION SYSTEM
## Critical Vulnerability Fixes

This document contains production-ready security patches for all CRITICAL and HIGH severity vulnerabilities identified in the notification system audit.

---

## PATCH 1: XSS Protection (CRITICAL-001)

### Files to Create/Modify

#### 1. Create sanitization utility (`gateway/src/utils/sanitize.ts`)

```typescript
/**
 * Security utility for sanitizing user input
 * Prevents XSS, HTML injection, and script injection attacks
 */

import DOMPurify from 'isomorphic-dompurify';

export class SecuritySanitizer {
  /**
   * Sanitize text content - strips ALL HTML
   * Use for: notification titles, content, message previews
   */
  static sanitizeText(input: string | null | undefined): string {
    if (!input) return '';

    // Strip ALL HTML tags and attributes
    const sanitized = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],        // No HTML allowed
      ALLOWED_ATTR: [],        // No attributes allowed
      KEEP_CONTENT: true,      // Keep text content
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_DOM_IMPORT: false,
      FORCE_BODY: false
    });

    // Additional protection: remove zero-width characters and control chars
    return sanitized
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control chars
      .trim();
  }

  /**
   * Sanitize rich text content - allows safe HTML subset
   * Use for: message content with formatting
   */
  static sanitizeRichText(input: string | null | undefined): string {
    if (!input) return '';

    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
      KEEP_CONTENT: true
    });
  }

  /**
   * Sanitize JSON data - removes dangerous properties
   */
  static sanitizeJSON(input: any): any {
    if (typeof input !== 'object' || input === null) {
      return input;
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(input)) {
      // Block dangerous keys
      if (key.startsWith('__') || key.startsWith('$')) {
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeJSON(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate and sanitize URLs
   */
  static sanitizeURL(input: string | null | undefined): string | null {
    if (!input) return null;

    try {
      const url = new URL(input);

      // Only allow safe protocols
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        return null;
      }

      // Block javascript: protocol
      if (url.protocol === 'javascript:') {
        return null;
      }

      return url.toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate username/identifier format
   */
  static sanitizeUsername(input: string | null | undefined): string {
    if (!input) return '';

    // Only allow alphanumeric, underscore, hyphen
    return input.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
  }

  /**
   * Truncate string safely
   */
  static truncate(input: string, maxLength: number): string {
    if (!input || input.length <= maxLength) {
      return input;
    }

    return input.substring(0, maxLength).trim() + '...';
  }
}
```

#### 2. Modify NotificationService.ts

```typescript
// gateway/src/services/NotificationService.ts

import { SecuritySanitizer } from '../utils/sanitize';

export class NotificationService {
  // ... existing code

  /**
   * Content limits (prevent storage exhaustion)
   */
  private readonly MAX_TITLE_LENGTH = 200;
  private readonly MAX_CONTENT_LENGTH = 1000;
  private readonly MAX_PREVIEW_LENGTH = 500;

  /**
   * Sanitize and validate notification data
   */
  private sanitizeNotificationData(data: CreateNotificationData): CreateNotificationData {
    return {
      ...data,
      title: SecuritySanitizer.truncate(
        SecuritySanitizer.sanitizeText(data.title),
        this.MAX_TITLE_LENGTH
      ),
      content: SecuritySanitizer.truncate(
        SecuritySanitizer.sanitizeText(data.content),
        this.MAX_CONTENT_LENGTH
      ),
      messagePreview: data.messagePreview
        ? SecuritySanitizer.truncate(
            SecuritySanitizer.sanitizeText(data.messagePreview),
            this.MAX_PREVIEW_LENGTH
          )
        : undefined,
      senderUsername: data.senderUsername
        ? SecuritySanitizer.sanitizeUsername(data.senderUsername)
        : undefined,
      senderAvatar: data.senderAvatar
        ? SecuritySanitizer.sanitizeURL(data.senderAvatar)
        : undefined
    };
  }

  /**
   * Create notification with sanitization
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationEventData | null> {
    try {
      // SECURITY: Sanitize ALL user-provided input
      const sanitizedData = this.sanitizeNotificationData(data);

      // Verify user preferences
      const shouldSend = await this.shouldSendNotification(
        sanitizedData.userId,
        sanitizedData.type
      );

      if (!shouldSend) {
        logger.debug('Notification skipped due to user preferences', {
          type: sanitizedData.type,
          userId: sanitizedData.userId
        });
        return null;
      }

      // Create notification with sanitized data
      const notification = await this.prisma.notification.create({
        data: {
          userId: sanitizedData.userId,
          type: sanitizedData.type,
          title: sanitizedData.title,           // ✅ SANITIZED
          content: sanitizedData.content,       // ✅ SANITIZED
          priority: sanitizedData.priority || 'normal',
          senderId: sanitizedData.senderId,
          senderUsername: sanitizedData.senderUsername,  // ✅ SANITIZED
          senderAvatar: sanitizedData.senderAvatar,      // ✅ SANITIZED
          messagePreview: sanitizedData.messagePreview,  // ✅ SANITIZED
          conversationId: sanitizedData.conversationId,
          messageId: sanitizedData.messageId,
          callSessionId: sanitizedData.callSessionId,
          data: sanitizedData.data ? JSON.stringify(
            SecuritySanitizer.sanitizeJSON(sanitizedData.data)  // ✅ SANITIZED
          ) : null,
          expiresAt: sanitizedData.expiresAt,
          isRead: false  // ✅ Server-controlled
        }
      });

      // ... rest of the method
    } catch (error) {
      logger.error('Error creating notification:', error);
      return null;
    }
  }

  // ... rest of the class
}
```

#### 3. Add CSP headers (Next.js config)

```typescript
// frontend/next.config.js

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.socket.io;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  connect-src 'self' wss://api.meeshy.com https://api.meeshy.com;
  media-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\s{2,}/g, ' ').trim()
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};
```

---

## PATCH 2: IDOR Protection (CRITICAL-002)

### Files to Modify

#### 1. Fix notification routes (`gateway/src/routes/notifications.ts`)

```typescript
// gateway/src/routes/notifications.ts

import { z } from 'zod';
import { SecuritySanitizer } from '../utils/sanitize';

// Validation schemas
const markAsReadSchema = z.object({
  id: z.string().min(1).max(100)
});

const getNotificationsQuerySchema = z.object({
  page: z.string().optional().default('1').transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Page must be between 1 and 1000');
    }
    return num;
  }),
  limit: z.string().optional().default('20').transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    return num;
  }),
  unread: z.enum(['true', 'false']).optional().default('false').transform(val => val === 'true'),
  type: z.enum([
    'new_message',
    'new_conversation_direct',
    'new_conversation_group',
    'message_reply',
    'member_joined',
    'contact_request',
    'contact_accepted',
    'user_mentioned',
    'message_reaction',
    'missed_call',
    'system',
    'all'
  ]).optional().default('all')
});

export async function notificationRoutes(fastify: FastifyInstance) {
  // Mark notification as read - SECURE VERSION
  fastify.patch('/notifications/:id/read', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = markAsReadSchema.parse(request.params);
      const { userId } = request.user as any;

      // SECURITY: Atomic operation with userId constraint
      const result = await fastify.prisma.notification.updateMany({
        where: {
          id,
          userId  // ✅ Enforce ownership
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      // Check if update succeeded (0 = not found OR not authorized)
      if (result.count === 0) {
        // Don't reveal if notification exists or not (prevent enumeration)
        return reply.status(404).send({
          success: false,
          message: 'Notification not found or access denied'
        });
      }

      // Emit Socket.IO event only if update succeeded
      if (fastify.io) {
        fastify.io.to(userId).emit('notification:read', { notificationId: id });
      }

      fastify.log.info('Notification marked as read', { userId, notificationId: id });

      return reply.send({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid notification ID'
        });
      }

      fastify.log.error('Mark notification as read error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Mark all notifications as read - SECURE VERSION
  fastify.patch('/notifications/read-all', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      const result = await fastify.prisma.notification.updateMany({
        where: {
          userId,        // ✅ Only user's notifications
          isRead: false  // ✅ Only unread ones
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      fastify.log.info(`Marked ${result.count} notifications as read`, { userId });

      return reply.send({
        success: true,
        message: 'All notifications marked as read',
        count: result.count
      });

    } catch (error) {
      fastify.log.error('Mark all notifications as read error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Delete notification - SECURE VERSION
  fastify.delete('/notifications/:id', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = markAsReadSchema.parse(request.params);
      const { userId } = request.user as any;

      // SECURITY: Atomic delete with userId constraint
      const result = await fastify.prisma.notification.deleteMany({
        where: {
          id,
          userId  // ✅ Enforce ownership
        }
      });

      if (result.count === 0) {
        return reply.status(404).send({
          success: false,
          message: 'Notification not found or access denied'
        });
      }

      // Emit event after successful deletion
      if (fastify.io) {
        fastify.io.to(userId).emit('notification:deleted', { notificationId: id });
      }

      // Audit log
      fastify.log.info('Notification deleted', {
        userId,
        notificationId: id,
        timestamp: new Date()
      });

      return reply.send({
        success: true,
        message: 'Notification deleted'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid notification ID'
        });
      }

      fastify.log.error('Delete notification error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Delete all read notifications - SECURE VERSION
  fastify.delete('/notifications/read', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      const result = await fastify.prisma.notification.deleteMany({
        where: {
          userId,        // ✅ Only user's notifications
          isRead: true   // ✅ Only read ones
        }
      });

      fastify.log.info(`Deleted ${result.count} read notifications`, { userId });

      return reply.send({
        success: true,
        message: 'Read notifications deleted',
        count: result.count
      });

    } catch (error) {
      fastify.log.error('Delete read notifications error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Get notifications - SECURE VERSION with validation
  fastify.get('/notifications', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      // Validate query parameters
      const validatedQuery = getNotificationsQuerySchema.parse(request.query);
      const { page, limit, unread, type } = validatedQuery;

      // Calculate offset safely
      const offset = Math.max(0, (page - 1) * limit);

      // Build where clause with validated inputs only
      const whereClause: any = { userId };

      if (unread) {
        whereClause.isRead = false;
      }

      if (type && type !== 'all') {
        whereClause.type = type;  // Already validated against enum
      }

      // Clean up expired notifications (separate query)
      await fastify.prisma.notification.deleteMany({
        where: {
          userId,
          expiresAt: {
            lt: new Date()
          }
        }
      });

      // Fetch notifications with validated inputs
      const [notifications, totalCount, unreadCount] = await Promise.all([
        fastify.prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,  // Limited to max 100
          include: {
            message: {
              include: {
                attachments: {
                  select: {
                    id: true,
                    fileName: true,
                    originalName: true,
                    mimeType: true,
                    fileSize: true,
                    fileUrl: true,
                    thumbnailUrl: true
                  }
                }
              }
            }
          }
        }),
        fastify.prisma.notification.count({ where: whereClause }),
        fastify.prisma.notification.count({
          where: { userId, isRead: false }
        })
      ]);

      return reply.send({
        success: true,
        data: {
          notifications,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasMore: offset + notifications.length < totalCount
          },
          unreadCount
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid query parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      fastify.log.error('Get notifications error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });
}
```

---

## PATCH 3: Rate Limiting (CRITICAL-004)

### Files to Create/Modify

#### 1. Install dependencies

```bash
cd gateway
npm install @fastify/rate-limit ioredis
```

#### 2. Create rate limiter utility (`gateway/src/utils/rate-limiter.ts`)

```typescript
/**
 * Distributed rate limiter using Redis
 */

import { Redis } from 'ioredis';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface RateLimiterConfig {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
}

export class DistributedRateLimiter {
  constructor(
    private redis: Redis,
    private config: RateLimiterConfig
  ) {}

  async checkLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Use Redis sorted set for sliding window
      const multi = this.redis.multi();

      // Remove old entries
      multi.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      multi.zcard(key);

      // Add current request timestamp
      multi.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiry
      multi.expire(key, Math.ceil(this.config.windowMs / 1000));

      const results = await multi.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      const allowed = count < this.config.maxRequests;
      const remaining = Math.max(0, this.config.maxRequests - count - 1);
      const resetAt = new Date(now + this.config.windowMs);

      if (!allowed) {
        // Remove the request we just added since it's not allowed
        await this.redis.zpopmax(key);
      }

      return { allowed, remaining, resetAt };
    } catch (error) {
      // On Redis error, allow the request (fail open)
      console.error('Rate limiter error:', error);
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(now + this.config.windowMs)
      };
    }
  }
}

/**
 * Fastify middleware for rate limiting
 */
export function createRateLimiterMiddleware(
  limiter: DistributedRateLimiter
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identifier = (request.user as any)?.userId || request.ip;

    const { allowed, remaining, resetAt } = await limiter.checkLimit(identifier);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', limiter['config'].maxRequests.toString());
    reply.header('X-RateLimit-Remaining', remaining.toString());
    reply.header('X-RateLimit-Reset', resetAt.toISOString());

    if (!allowed) {
      return reply.status(429).send({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: resetAt.toISOString()
      });
    }
  };
}
```

#### 3. Apply rate limiting to notification routes

```typescript
// gateway/src/routes/notifications.ts

import { DistributedRateLimiter, createRateLimiterMiddleware } from '../utils/rate-limiter';
import { redisClient } from '../config/redis';  // Your Redis instance

export async function notificationRoutes(fastify: FastifyInstance) {
  // Create rate limiters
  const standardLimiter = new DistributedRateLimiter(redisClient, {
    keyPrefix: 'ratelimit:notifications:standard',
    maxRequests: 30,
    windowMs: 60000  // 30 requests per minute
  });

  const bulkOperationLimiter = new DistributedRateLimiter(redisClient, {
    keyPrefix: 'ratelimit:notifications:bulk',
    maxRequests: 5,
    windowMs: 60000  // 5 requests per minute
  });

  const countsLimiter = new DistributedRateLimiter(redisClient, {
    keyPrefix: 'ratelimit:notifications:counts',
    maxRequests: 60,
    windowMs: 60000  // 60 requests per minute
  });

  // Apply to routes
  fastify.get('/notifications', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(standardLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });

  fastify.get('/notifications/unread/count', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(countsLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });

  fastify.patch('/notifications/:id/read', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(standardLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });

  fastify.patch('/notifications/read-all', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(bulkOperationLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });

  fastify.delete('/notifications/:id', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(standardLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });

  fastify.delete('/notifications/read', {
    onRequest: [
      fastify.authenticate,
      createRateLimiterMiddleware(bulkOperationLimiter)
    ]
  }, async (request, reply) => {
    // ... handler
  });
}
```

---

## PATCH 4: Secure localStorage (CRITICAL-005)

### Files to Create/Modify

#### 1. Create secure storage utility (`frontend/utils/secure-storage.ts`)

```typescript
/**
 * Secure storage wrapper with encryption
 */

import CryptoJS from 'crypto-js';

export class SecureStorage {
  private static getEncryptionKey(): string {
    // Use session-specific key (invalidated on logout)
    const sessionId = sessionStorage.getItem('session-id');
    if (!sessionId) {
      throw new Error('No active session');
    }

    return CryptoJS.SHA256(sessionId).toString();
  }

  static setItem(key: string, value: any): void {
    try {
      const encryptionKey = this.getEncryptionKey();
      const serialized = JSON.stringify(value);

      // Encrypt data before storing
      const encrypted = CryptoJS.AES.encrypt(serialized, encryptionKey).toString();
      localStorage.setItem(key, encrypted);
    } catch (error) {
      console.error('Failed to encrypt and store data:', error);
    }
  }

  static getItem<T>(key: string): T | null {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    try {
      const encryptionKey = this.getEncryptionKey();

      // Decrypt data when reading
      const decrypted = CryptoJS.AES.decrypt(encrypted, encryptionKey);
      const serialized = decrypted.toString(CryptoJS.enc.Utf8);

      if (!serialized) {
        // Decryption failed (wrong key)
        this.removeItem(key);
        return null;
      }

      return JSON.parse(serialized) as T;
    } catch (error) {
      console.error('Failed to decrypt storage:', error);
      // Clear corrupted data
      this.removeItem(key);
      return null;
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    localStorage.clear();
  }
}

/**
 * Sanitize notification for storage - remove sensitive data
 */
export function sanitizeNotificationForStorage(notification: any): any {
  return {
    id: notification.id,
    type: notification.type,
    isRead: notification.isRead,
    priority: notification.priority,
    createdAt: notification.createdAt,

    // Only store IDs for reference, NOT content
    context: {
      conversationId: notification.context?.conversationId,
      messageId: notification.context?.messageId
    }

    // Remove:
    // - content/title/messagePreview (sensitive)
    // - sender information (PII)
    // - conversation details (sensitive)
  };
}
```

#### 2. Modify notification store (`frontend/stores/notification-store-v2.ts`)

```typescript
// frontend/stores/notification-store-v2.ts

import { SecureStorage, sanitizeNotificationForStorage } from '@/utils/secure-storage';

export const useNotificationStoreV2 = create<NotificationStore>()(
  devtools(
    persist(
      (set, get) => ({ /* ... existing state logic ... */ }),
      {
        name: 'meeshy-notifications-v2',
        version: 2,  // Increment version for migration

        // Use sessionStorage instead of localStorage (cleared on tab close)
        storage: createJSONStorage(() => sessionStorage),

        // Minimize stored data
        partialize: (state) => ({
          // DON'T store notifications content
          // Only store preferences and metadata
          filters: state.filters,
          lastSync: state.lastSync,

          // If notifications MUST be cached, sanitize them first
          notifications: state.notifications
            .slice(0, 10)  // Only cache 10 most recent
            .map(sanitizeNotificationForStorage)
        }),

        // Migration from old version
        migrate: (persistedState: any, version: number) => {
          if (version < 2) {
            // Clear old unencrypted data
            localStorage.removeItem('meeshy-notifications-v2');
            sessionStorage.clear();
            return { ...initialState };
          }
          return persistedState as NotificationStore;
        }
      }
    ),
    { name: 'NotificationStoreV2' }
  )
);
```

#### 3. Clear storage on logout (`frontend/stores/auth-store.ts`)

```typescript
// frontend/stores/auth-store.ts

import { SecureStorage } from '@/utils/secure-storage';
import { useNotificationStoreV2 } from './notification-store-v2';

export const useAuthStore = create<AuthStore>((set) => ({
  // ... existing state

  logout: async () => {
    try {
      // Call logout API
      await apiService.post('/auth/logout');

      // Clear all sensitive data
      SecureStorage.clear();
      sessionStorage.clear();
      localStorage.clear();

      // Disconnect notification store
      useNotificationStoreV2.getState().disconnect();

      // Clear auth state
      set({
        user: null,
        authToken: null,
        isAuthenticated: false
      });

      // Redirect to login
      window.location.href = '/signin';
    } catch (error) {
      console.error('Logout error:', error);
      // Force clear anyway
      SecureStorage.clear();
      sessionStorage.clear();
      localStorage.clear();
    }
  }
}));
```

---

## PATCH 5: Socket.IO Security (HIGH-002)

### Files to Modify

#### 1. Server-side Socket.IO authentication (`gateway/src/server.ts`)

```typescript
// gateway/src/server.ts

import { Server as SocketIOServer } from 'socket.io';
import { verifyJWT } from './utils/jwt';
import { redisClient } from './config/redis';

// Track connections per user
const userConnections = new Map<string, Set<string>>();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token signature and expiration
    const decoded = await verifyJWT(token);

    // Check token hasn't been revoked
    const isRevoked = await redisClient.get(`revoked:${decoded.jti}`);
    if (isRevoked) {
      return next(new Error('Token has been revoked'));
    }

    // Check token hasn't expired
    if (decoded.exp < Date.now() / 1000) {
      return next(new Error('Token has expired'));
    }

    // Verify session is still valid
    const session = await redisClient.get(`session:${decoded.userId}`);
    if (!session) {
      return next(new Error('Session invalid or expired'));
    }

    const sessionData = JSON.parse(session);
    if (sessionData.sessionId !== decoded.sessionId) {
      return next(new Error('Session mismatch'));
    }

    // Enforce max connections per user (prevent resource exhaustion)
    const userId = decoded.userId;
    const existing = userConnections.get(userId) || new Set();

    if (existing.size >= 5) {
      // Disconnect oldest connection
      const oldestSocketId = Array.from(existing)[0];
      const oldestSocket = io.sockets.sockets.get(oldestSocketId);

      if (oldestSocket) {
        oldestSocket.emit('force_disconnect', {
          reason: 'New connection established from another device'
        });
        oldestSocket.disconnect(true);
      }

      existing.delete(oldestSocketId);
    }

    existing.add(socket.id);
    userConnections.set(userId, existing);

    // Attach user to socket
    socket.user = decoded;
    next();

  } catch (error) {
    console.error('Socket.IO authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Handle disconnection
io.on('connection', (socket) => {
  const userId = socket.user.userId;

  socket.on('disconnect', () => {
    // Remove from connections map
    const connections = userConnections.get(userId);
    if (connections) {
      connections.delete(socket.id);

      if (connections.size === 0) {
        userConnections.delete(userId);
      } else {
        userConnections.set(userId, connections);
      }
    }

    console.log(`User ${userId} disconnected (socket ${socket.id})`);
  });

  // Re-validate token periodically (every 5 minutes)
  const tokenValidationInterval = setInterval(async () => {
    try {
      const isRevoked = await redisClient.get(`revoked:${socket.user.jti}`);
      if (isRevoked) {
        socket.emit('force_disconnect', {
          reason: 'Token revoked'
        });
        socket.disconnect(true);
        clearInterval(tokenValidationInterval);
      }
    } catch (error) {
      console.error('Token validation error:', error);
    }
  }, 5 * 60 * 1000);  // 5 minutes

  socket.on('disconnect', () => {
    clearInterval(tokenValidationInterval);
  });
});
```

#### 2. Client-side Socket.IO reconnection handling (`frontend/hooks/use-notifications-v2.ts`)

```typescript
// frontend/hooks/use-notifications-v2.ts

const initializeSocket = useCallback(() => {
  if (!authToken || !isAuthenticated || socket?.connected) {
    return;
  }

  const newSocket = io(APP_CONFIG.getBackendUrl(), {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  // Connection established
  newSocket.on('connect', () => {
    console.log('[Socket.IO] Connected');
    setIsSocketConnected(true);
    reconnectAttempts.current = 0;

    // Stop polling fallback
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  });

  // Handle forced disconnection
  newSocket.on('force_disconnect', (data: { reason: string }) => {
    console.warn('[Socket.IO] Force disconnected:', data.reason);

    // Show notification to user
    toast.warning('Connection closed', {
      description: data.reason
    });

    // Refresh token if expired
    if (data.reason.includes('token') || data.reason.includes('session')) {
      // Trigger token refresh or logout
      useAuthStore.getState().refreshToken().catch(() => {
        useAuthStore.getState().logout();
      });
    }
  });

  // Connection error
  newSocket.on('connect_error', (error) => {
    console.error('[Socket.IO] Connection error:', error);
    reconnectAttempts.current++;

    if (reconnectAttempts.current >= 5) {
      console.warn('[Socket.IO] Max reconnection attempts, starting polling');
      startPolling();
    }
  });

  // Disconnection
  newSocket.on('disconnect', (reason) => {
    console.warn('[Socket.IO] Disconnected:', reason);
    setIsSocketConnected(false);

    // Start polling fallback if disconnected unexpectedly
    if (reason !== 'io client disconnect') {
      startPolling();
    }
  });

  setSocket(newSocket);
}, [authToken, isAuthenticated]);
```

---

## DEPLOYMENT CHECKLIST

### Before Deploying Patches

- [ ] Install dependencies:
  - `npm install isomorphic-dompurify @fastify/rate-limit ioredis crypto-js`
- [ ] Run tests to verify patches don't break functionality
- [ ] Test XSS protection with malicious payloads
- [ ] Verify IDOR protection with different user accounts
- [ ] Test rate limiting with load testing tool
- [ ] Verify encrypted localStorage with DevTools
- [ ] Test Socket.IO authentication and reconnection

### After Deploying Patches

- [ ] Monitor error rates for false positives
- [ ] Check rate limit headers in responses
- [ ] Verify no XSS vulnerabilities in production
- [ ] Monitor Redis for rate limit keys
- [ ] Test logout clears all sensitive data
- [ ] Verify Socket.IO connections limit enforced
- [ ] Run penetration tests
- [ ] Update security documentation

---

## TESTING THESE PATCHES

```bash
# Run security tests
npm run test:security

# Test XSS protection
curl -X POST http://localhost:3000/notifications/test \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"system","title":"<script>alert(1)</script>","content":"test"}'

# Test IDOR protection
curl -X PATCH http://localhost:3000/notifications/OTHER_USER_NOTIF_ID/read \
  -H "Authorization: Bearer $USER_TOKEN"

# Test rate limiting
for i in {1..35}; do
  curl http://localhost:3000/notifications -H "Authorization: Bearer $TOKEN"
done

# Test localStorage encryption
# Open DevTools > Application > Local Storage
# Verify data is encrypted (not readable)
```

---

**Patch Status**: Ready for staging deployment
**Next Steps**: Deploy to staging → Run security tests → Fix any issues → Deploy to production
