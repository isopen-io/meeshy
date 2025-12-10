# SECURITY TESTS - NOTIFICATION SYSTEM
## Comprehensive Security Test Suite

This document contains security test suites to verify patches and prevent regressions.

---

## Test Suite Structure

```
gateway/
└── tests/
    └── security/
        ├── notifications.security.test.ts
        ├── xss-protection.test.ts
        ├── idor-protection.test.ts
        ├── rate-limiting.test.ts
        ├── input-validation.test.ts
        └── socket-io-security.test.ts

frontend/
└── tests/
    └── security/
        ├── storage-security.test.ts
        ├── xss-rendering.test.ts
        └── socket-validation.test.ts
```

---

## BACKEND SECURITY TESTS

### 1. XSS Protection Tests (`gateway/tests/security/xss-protection.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { build } from '../helper';
import { FastifyInstance } from 'fastify';

describe('XSS Protection Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await build();
    // Create test user and get auth token
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'security-test@meeshy.com',
        password: 'Test123!@#'
      }
    });
    authToken = response.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Script Tag Injection', () => {
    it('should strip <script> tags from notification title', async () => {
      const xssPayload = '<script>alert("XSS")</script>';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: xssPayload,
          content: 'Test content'
        }
      });

      expect(response.statusCode).toBe(201);
      const notification = response.json().data;

      // Script tags should be completely removed
      expect(notification.title).not.toContain('<script>');
      expect(notification.title).not.toContain('</script>');
      expect(notification.title).not.toContain('alert');

      // Should only contain text content if any
      expect(notification.title).toBe('');  // Empty after sanitization
    });

    it('should strip <script> tags from notification content', async () => {
      const xssPayload = 'Safe text <script>alert(document.cookie)</script> more text';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: 'Test',
          content: xssPayload
        }
      });

      const notification = response.json().data;

      // Should only keep safe text
      expect(notification.content).toBe('Safe text  more text');
      expect(notification.content).not.toContain('<script>');
    });
  });

  describe('Event Handler Injection', () => {
    const eventHandlerPayloads = [
      '<img src=x onerror="alert(1)">',
      '<div onload="alert(1)">',
      '<body onload="alert(1)">',
      '<iframe onload="alert(1)">',
      '<svg onload="alert(1)">',
      '<input onfocus="alert(1)" autofocus>',
      '<marquee onstart="alert(1)">',
      '<details open ontoggle="alert(1)">'
    ];

    eventHandlerPayloads.forEach((payload) => {
      it(`should sanitize: ${payload}`, async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/notifications/test',
          headers: {
            authorization: `Bearer ${authToken}`
        },
          payload: {
            type: 'system',
            title: 'Test',
            content: payload
          }
        });

        const notification = response.json().data;

        // Should not contain event handlers
        expect(notification.content).not.toContain('onerror');
        expect(notification.content).not.toContain('onload');
        expect(notification.content).not.toContain('onfocus');
        expect(notification.content).not.toContain('onstart');
        expect(notification.content).not.toContain('ontoggle');
      });
    });
  });

  describe('Encoded XSS Attempts', () => {
    it('should prevent unicode-encoded script injection', async () => {
      const unicodePayload = '\\u003cscript\\u003ealert(1)\\u003c/script\\u003e';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: unicodePayload,
          content: 'Test'
        }
      });

      const notification = response.json().data;

      // Unicode should be decoded and then sanitized
      expect(notification.title).not.toContain('script');
      expect(notification.title).not.toContain('alert');
    });

    it('should prevent HTML entity-encoded injection', async () => {
      const entityPayload = '&lt;script&gt;alert(1)&lt;/script&gt;';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: entityPayload,
          content: 'Test'
        }
      });

      const notification = response.json().data;

      // HTML entities should be decoded and sanitized
      expect(notification.title).not.toContain('<script>');
    });
  });

  describe('Nested XSS Attempts', () => {
    it('should prevent nested tag injection', async () => {
      const nestedPayload = '<scr<script>ipt>alert(1)</scr<script>ipt>';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: nestedPayload,
          content: 'Test'
        }
      });

      const notification = response.json().data;

      expect(notification.title).not.toContain('script');
      expect(notification.title).not.toContain('alert');
    });
  });

  describe('Data URI XSS', () => {
    it('should prevent data: URI in image src', async () => {
      const dataUriPayload = '<img src="data:text/html,<script>alert(1)</script>">';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: dataUriPayload,
          content: 'Test'
        }
      });

      const notification = response.json().data;

      expect(notification.title).not.toContain('data:');
      expect(notification.title).not.toContain('<script>');
    });
  });
});
```

### 2. IDOR Protection Tests (`gateway/tests/security/idor-protection.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { build } from '../helper';
import { FastifyInstance } from 'fastify';

describe('IDOR Protection Tests', () => {
  let app: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let userANotificationId: string;
  let userBNotificationId: string;

  beforeAll(async () => {
    app = await build();

    // Create two test users
    const userAResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user-a@test.com',
        username: 'userA',
        password: 'Test123!@#',
        firstName: 'User',
        lastName: 'A'
      }
    });
    userAToken = userAResponse.json().token;

    const userBResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user-b@test.com',
        username: 'userB',
        password: 'Test123!@#',
        firstName: 'User',
        lastName: 'B'
      }
    });
    userBToken = userBResponse.json().token;

    // Create notification for each user
    const notifAResponse = await app.inject({
      method: 'POST',
      url: '/notifications/test',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        type: 'system',
        title: 'User A Notification',
        content: 'Private to User A'
      }
    });
    userANotificationId = notifAResponse.json().data.id;

    const notifBResponse = await app.inject({
      method: 'POST',
      url: '/notifications/test',
      headers: { authorization: `Bearer ${userBToken}` },
      payload: {
        type: 'system',
        title: 'User B Notification',
        content: 'Private to User B'
      }
    });
    userBNotificationId = notifBResponse.json().data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Mark as Read IDOR', () => {
    it('should prevent User B from marking User A notification as read', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/notifications/${userANotificationId}/read`,
        headers: {
          authorization: `Bearer ${userBToken}`  // User B's token
        }
      });

      // Should return 404 (not found or access denied)
      expect(response.statusCode).toBe(404);
      expect(response.json().success).toBe(false);
      expect(response.json().message).toContain('access denied');
    });

    it('should allow User A to mark their own notification as read', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/notifications/${userANotificationId}/read`,
        headers: {
          authorization: `Bearer ${userAToken}`  // User A's token
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });
  });

  describe('Delete Notification IDOR', () => {
    it('should prevent User A from deleting User B notification', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/notifications/${userBNotificationId}`,
        headers: {
          authorization: `Bearer ${userAToken}`  // User A's token
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().success).toBe(false);
    });

    it('should allow User B to delete their own notification', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/notifications/${userBNotificationId}`,
        headers: {
          authorization: `Bearer ${userBToken}`  // User B's token
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });
  });

  describe('Notification Enumeration Prevention', () => {
    it('should not reveal if notification exists when unauthorized', async () => {
      // Try to access non-existent notification
      const nonExistentResponse = await app.inject({
        method: 'PATCH',
        url: `/notifications/000000000000000000000000/read`,
        headers: {
          authorization: `Bearer ${userAToken}`
        }
      });

      // Try to access User B's notification as User A
      const unauthorizedResponse = await app.inject({
        method: 'PATCH',
        url: `/notifications/${userBNotificationId}/read`,
        headers: {
          authorization: `Bearer ${userAToken}`
        }
      });

      // Both should return identical response (prevent enumeration)
      expect(nonExistentResponse.statusCode).toBe(404);
      expect(unauthorizedResponse.statusCode).toBe(404);
      expect(nonExistentResponse.json().message).toBe(
        unauthorizedResponse.json().message
      );
    });
  });

  describe('Query Filter IDOR', () => {
    it('should only return current user notifications in GET /notifications', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: {
          authorization: `Bearer ${userAToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const notifications = response.json().data.notifications;

      // All notifications should belong to User A
      notifications.forEach((notif: any) => {
        expect(notif.userId).toBe(userAResponse.json().user.id);
      });

      // Should not include User B's notifications
      const userBNotif = notifications.find(
        (n: any) => n.id === userBNotificationId
      );
      expect(userBNotif).toBeUndefined();
    });
  });
});
```

### 3. Rate Limiting Tests (`gateway/tests/security/rate-limiting.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { build } from '../helper';
import { FastifyInstance } from 'fastify';

describe('Rate Limiting Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'ratelimit-test@meeshy.com',
        password: 'Test123!@#'
      }
    });
    authToken = response.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /notifications Rate Limit', () => {
    it('should block after 30 requests per minute', async () => {
      const requests: Promise<any>[] = [];

      // Make 31 requests (1 over the limit)
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.inject({
            method: 'GET',
            url: '/notifications',
            headers: {
              authorization: `Bearer ${authToken}`
            }
          })
        );
      }

      const responses = await Promise.all(requests);

      // First 30 should succeed
      const successful = responses.filter(r => r.statusCode === 200);
      expect(successful.length).toBeLessThanOrEqual(30);

      // At least one should be rate limited
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Check rate limit response format
      const limitedResponse = rateLimited[0].json();
      expect(limitedResponse.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(limitedResponse.retryAfter).toBeDefined();
    });

    it('should include rate limit headers in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Bulk Operations Rate Limit', () => {
    it('should block PATCH /notifications/read-all after 5 requests', async () => {
      const requests: Promise<any>[] = [];

      for (let i = 0; i < 6; i++) {
        requests.push(
          app.inject({
            method: 'PATCH',
            url: '/notifications/read-all',
            headers: {
              authorization: `Bearer ${authToken}`
            }
          })
        );
      }

      const responses = await Promise.all(requests);

      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should block DELETE /notifications/read after 5 requests', async () => {
      const requests: Promise<any>[] = [];

      for (let i = 0; i < 6; i++) {
        requests.push(
          app.inject({
            method: 'DELETE',
            url: '/notifications/read',
            headers: {
              authorization: `Bearer ${authToken}`
            }
          })
        );
      }

      const responses = await Promise.all(requests);

      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Per-User Rate Limiting', () => {
    it('should enforce separate rate limits per user', async () => {
      // Create second user
      const userBResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'ratelimit-userb@test.com',
          username: 'userB',
          password: 'Test123!@#',
          firstName: 'User',
          lastName: 'B'
        }
      });
      const userBToken = userBResponse.json().token;

      // Exhaust User A's rate limit
      for (let i = 0; i < 30; i++) {
        await app.inject({
          method: 'GET',
          url: '/notifications',
          headers: { authorization: `Bearer ${authToken}` }
        });
      }

      // User A should be rate limited
      const userAResponse = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${authToken}` }
      });
      expect(userAResponse.statusCode).toBe(429);

      // User B should still be able to make requests
      const userBResponse = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${userBToken}` }
      });
      expect(userBResponse.statusCode).toBe(200);
    });
  });
});
```

### 4. Input Validation Tests (`gateway/tests/security/input-validation.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { build } from '../helper';
import { FastifyInstance } from 'fastify';

describe('Input Validation Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'validation-test@meeshy.com',
        password: 'Test123!@#'
      }
    });
    authToken = response.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('NoSQL Injection Prevention', () => {
    it('should reject MongoDB operator in type filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?type[$ne]=system',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Invalid query parameters');
    });

    it('should reject regex injection in type filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?type[$regex]=.*',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject $where operator injection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?type[$where]=this.isRead==false',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Pagination Limits', () => {
    it('should reject limit > 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?limit=9999',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Limit must be between 1 and 100');
    });

    it('should reject negative page number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?page=-1',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject page number > 1000', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?page=1001',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Type Whitelist Validation', () => {
    it('should reject invalid notification type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications?type=invalid_type',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid notification type', async () => {
      const validTypes = [
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
      ];

      for (const type of validTypes) {
        const response = await app.inject({
          method: 'GET',
          url: `/notifications?type=${type}`,
          headers: {
            authorization: `Bearer ${authToken}`
          }
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('Content Length Limits', () => {
    it('should truncate title longer than 200 characters', async () => {
      const longTitle = 'A'.repeat(300);

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: longTitle,
          content: 'Test'
        }
      });

      expect(response.statusCode).toBe(201);
      const notification = response.json().data;

      expect(notification.title.length).toBeLessThanOrEqual(203);  // 200 + '...'
    });

    it('should truncate content longer than 1000 characters', async () => {
      const longContent = 'B'.repeat(2000);

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/test',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          type: 'system',
          title: 'Test',
          content: longContent
        }
      });

      expect(response.statusCode).toBe(201);
      const notification = response.json().data;

      expect(notification.content.length).toBeLessThanOrEqual(1003);  // 1000 + '...'
    });
  });
});
```

---

## FRONTEND SECURITY TESTS

### 5. Storage Security Tests (`frontend/tests/security/storage-security.test.ts`)

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SecureStorage, sanitizeNotificationForStorage } from '@/utils/secure-storage';

describe('Storage Security Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('session-id', 'test-session-123');
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Encryption', () => {
    it('should encrypt data before storing in localStorage', () => {
      const sensitiveData = {
        password: 'secret123',
        token: 'auth-token-xyz'
      };

      SecureStorage.setItem('test-key', sensitiveData);

      const rawValue = localStorage.getItem('test-key');

      // Raw value should be encrypted (not readable)
      expect(rawValue).not.toContain('secret123');
      expect(rawValue).not.toContain('auth-token-xyz');

      // Should be a base64-encoded ciphertext
      expect(rawValue).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should decrypt data when reading from localStorage', () => {
      const originalData = {
        userId: 'user123',
        username: 'testuser'
      };

      SecureStorage.setItem('user-data', originalData);
      const decryptedData = SecureStorage.getItem<typeof originalData>('user-data');

      expect(decryptedData).toEqual(originalData);
    });

    it('should return null if session key is missing', () => {
      SecureStorage.setItem('test', { data: 'value' });

      // Remove session key
      sessionStorage.removeItem('session-id');

      const result = SecureStorage.getItem('test');

      expect(result).toBeNull();
    });

    it('should clear corrupted data if decryption fails', () => {
      // Manually set corrupted encrypted data
      localStorage.setItem('test-key', 'corrupted-invalid-data');

      const result = SecureStorage.getItem('test-key');

      expect(result).toBeNull();
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });

  describe('Data Sanitization', () => {
    it('should remove sensitive content from notifications before storage', () => {
      const notification = {
        id: 'notif123',
        type: 'new_message',
        title: 'New message from John',  // SENSITIVE
        content: 'Hey, here is my credit card: 4532-1234-5678-9012',  // SENSITIVE
        messagePreview: 'Private conversation content',  // SENSITIVE
        isRead: false,
        priority: 'normal',
        createdAt: new Date(),
        sender: {
          id: 'user456',
          username: 'john_doe',  // SENSITIVE
          avatar: 'https://example.com/avatar.jpg'  // SENSITIVE
        },
        context: {
          conversationId: 'conv789',
          messageId: 'msg101112'
        }
      };

      const sanitized = sanitizeNotificationForStorage(notification);

      // Should keep only non-sensitive fields
      expect(sanitized.id).toBe('notif123');
      expect(sanitized.type).toBe('new_message');
      expect(sanitized.isRead).toBe(false);
      expect(sanitized.priority).toBe('normal');
      expect(sanitized.context.conversationId).toBe('conv789');
      expect(sanitized.context.messageId).toBe('msg101112');

      // Should remove sensitive fields
      expect(sanitized.title).toBeUndefined();
      expect(sanitized.content).toBeUndefined();
      expect(sanitized.messagePreview).toBeUndefined();
      expect(sanitized.sender).toBeUndefined();
    });
  });

  describe('XSS Prevention in Storage', () => {
    it('should not execute XSS when reading from storage', () => {
      const xssPayload = '<img src=x onerror="alert(1)">';

      SecureStorage.setItem('xss-test', { data: xssPayload });
      const retrieved = SecureStorage.getItem<any>('xss-test');

      // Should return the string as-is (not execute)
      expect(retrieved.data).toBe(xssPayload);

      // When rendered in DOM, should be sanitized separately
      // (This is tested in xss-rendering.test.ts)
    });
  });

  describe('Session-based Encryption', () => {
    it('should use different encryption key for different sessions', () => {
      const data = { secret: 'test123' };

      // Session 1
      sessionStorage.setItem('session-id', 'session-1');
      SecureStorage.setItem('data', data);
      const encrypted1 = localStorage.getItem('data');

      // Session 2
      sessionStorage.setItem('session-id', 'session-2');
      SecureStorage.setItem('data', data);
      const encrypted2 = localStorage.getItem('data');

      // Different sessions should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt with wrong session key', () => {
      const data = { secret: 'test123' };

      // Encrypt with session 1
      sessionStorage.setItem('session-id', 'session-1');
      SecureStorage.setItem('data', data);

      // Try to decrypt with session 2
      sessionStorage.setItem('session-id', 'session-2');
      const result = SecureStorage.getItem('data');

      // Should fail and clear the data
      expect(result).toBeNull();
      expect(localStorage.getItem('data')).toBeNull();
    });
  });
});
```

---

## INTEGRATION TESTS

### 6. End-to-End Security Tests (`gateway/tests/security/e2e-security.test.ts`)

```typescript
import { describe, it, expect } from '@jest/globals';
import { chromium, Browser, Page } from 'playwright';

describe('End-to-End Security Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:3000/signin');
  });

  afterEach(async () => {
    await page.close();
  });

  describe('XSS in Real Browser', () => {
    it('should not execute XSS in notification rendering', async () => {
      // Login
      await page.fill('input[name="email"]', 'test@meeshy.com');
      await page.fill('input[name="password"]', 'Test123!@#');
      await page.click('button[type="submit"]');

      // Wait for dashboard
      await page.waitForURL('**/dashboard');

      // Inject XSS via API call (simulating malicious notification)
      const xssPayload = '<img src=x onerror="window.xssTriggered=true">';

      await page.evaluate(async (payload) => {
        await fetch('/api/notifications/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
          },
          body: JSON.stringify({
            type: 'system',
            title: payload,
            content: 'Test'
          })
        });
      }, xssPayload);

      // Wait for notification to appear
      await page.waitForSelector('[data-testid="notification-item"]', { timeout: 5000 });

      // Check if XSS was triggered
      const xssTriggered = await page.evaluate(() => (window as any).xssTriggered);

      expect(xssTriggered).toBeUndefined();  // XSS should NOT be triggered
    });
  });

  describe('CSRF Protection', () => {
    it('should reject requests without CSRF token', async () => {
      // Login to get auth cookie
      await page.fill('input[name="email"]', 'test@meeshy.com');
      await page.fill('input[name="password"]', 'Test123!@#');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/dashboard');

      // Try to make API request without CSRF token
      const response = await page.evaluate(async () => {
        return fetch('/api/notifications/read-all', {
          method: 'PATCH',
          credentials: 'include'
          // NO CSRF token
        }).then(r => r.status);
      });

      expect(response).toBe(403);  // Should be rejected
    });
  });

  describe('Session Security', () => {
    it('should clear localStorage on logout', async () => {
      // Login
      await page.fill('input[name="email"]', 'test@meeshy.com');
      await page.fill('input[name="password"]', 'Test123!@#');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/dashboard');

      // Check localStorage has data
      const beforeLogout = await page.evaluate(() => {
        return Object.keys(localStorage).length;
      });
      expect(beforeLogout).toBeGreaterThan(0);

      // Logout
      await page.click('[data-testid="logout-button"]');

      // Check localStorage is cleared
      const afterLogout = await page.evaluate(() => {
        return Object.keys(localStorage).length;
      });
      expect(afterLogout).toBe(0);
    });
  });
});
```

---

## RUNNING THE TESTS

### Setup

```bash
# Install test dependencies
npm install --save-dev @jest/globals playwright @types/jest

# Backend tests
cd gateway
npm run test:security

# Frontend tests
cd frontend
npm run test:security

# E2E tests
npm run test:e2e:security
```

### Test Scripts (package.json)

```json
{
  "scripts": {
    "test:security": "jest --testMatch='**/*.security.test.ts'",
    "test:security:watch": "jest --testMatch='**/*.security.test.ts' --watch",
    "test:e2e:security": "playwright test tests/security/e2e-security.test.ts",
    "test:coverage:security": "jest --testMatch='**/*.security.test.ts' --coverage"
  }
}
```

---

## CI/CD INTEGRATION

### GitHub Actions Workflow (`.github/workflows/security-tests.yml`)

```yaml
name: Security Tests

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  security-tests:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

      mongodb:
        image: mongo:7
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd gateway && npm ci
          cd ../frontend && npm ci

      - name: Run backend security tests
        run: |
          cd gateway
          npm run test:security
        env:
          DATABASE_URL: mongodb://localhost:27017/meeshy_test
          REDIS_URL: redis://localhost:6379

      - name: Run frontend security tests
        run: |
          cd frontend
          npm run test:security

      - name: Run E2E security tests
        run: |
          npm run test:e2e:security

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

      - name: Security test report
        if: always()
        run: |
          echo "Security test results uploaded to artifacts"

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: security-test-results
          path: |
            gateway/test-results/
            frontend/test-results/
```

---

## MONITORING & ALERTING

### Security Metrics to Track

```typescript
// gateway/src/middleware/security-metrics.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { prometheus } from './prometheus';

// Metrics counters
const xssAttempts = new prometheus.Counter({
  name: 'security_xss_attempts_total',
  help: 'Total XSS injection attempts detected'
});

const idorAttempts = new prometheus.Counter({
  name: 'security_idor_attempts_total',
  help: 'Total IDOR attempts detected'
});

const rateLimitHits = new prometheus.Counter({
  name: 'security_rate_limit_hits_total',
  help: 'Total rate limit violations',
  labelNames: ['endpoint', 'user_id']
});

const injectionAttempts = new prometheus.Counter({
  name: 'security_injection_attempts_total',
  help: 'Total injection attempts (SQL/NoSQL)',
  labelNames: ['type']
});

// Export metrics endpoint
export function setupSecurityMetrics(fastify: FastifyInstance) {
  fastify.get('/metrics/security', async (request, reply) => {
    const metrics = await prometheus.register.metrics();
    reply.type('text/plain').send(metrics);
  });
}

// Track XSS attempts
export function trackXSSAttempt() {
  xssAttempts.inc();
}

// Track IDOR attempts
export function trackIDORAttempt() {
  idorAttempts.inc();
}

// Track rate limit hits
export function trackRateLimitHit(endpoint: string, userId: string) {
  rateLimitHits.inc({ endpoint, user_id: userId });
}

// Track injection attempts
export function trackInjectionAttempt(type: 'sql' | 'nosql') {
  injectionAttempts.inc({ type });
}
```

---

## CONCLUSION

These security tests provide comprehensive coverage of:

1. XSS Protection (script injection, event handlers, encoded payloads)
2. IDOR Protection (unauthorized access, enumeration prevention)
3. Rate Limiting (per-endpoint, per-user, bulk operations)
4. Input Validation (NoSQL injection, pagination limits, type validation)
5. Storage Security (encryption, sanitization, session-based keys)
6. End-to-End Security (real browser XSS, CSRF, session management)

**Test Coverage Target**: 95%+ for security-critical code

**CI/CD Integration**: Run on every PR and commit to main/dev

**Monitoring**: Track security metrics in production with alerts on anomalies
