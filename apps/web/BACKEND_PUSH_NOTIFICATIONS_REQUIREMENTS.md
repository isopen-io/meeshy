# Backend Push Notifications Requirements

Documentation for implementing the backend API endpoints and Firebase integration for push notifications.

## Table of Contents

- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Firebase Admin Setup](#firebase-admin-setup)
- [Sending Notifications](#sending-notifications)
- [Security Considerations](#security-considerations)
- [Testing](#testing)

---

## Overview

The backend needs to:

1. **Store FCM tokens** for each user/device
2. **Provide API endpoints** for token management
3. **Send push notifications** via Firebase Cloud Messaging
4. **Handle token expiration** and refresh
5. **Respect user preferences** for notification types

---

## API Endpoints

### 1. Register Push Token

**Endpoint**: `POST /api/users/push-token`

**Authentication**: Required (session cookie or JWT)

**Request Body**:
```typescript
{
  token: string;              // FCM registration token
  deviceInfo?: {              // Optional device information
    userAgent: string;
    platform: string;
    language: string;
  };
}
```

**Response**:
```typescript
{
  success: boolean;
  message?: string;
}
```

**Implementation** (Express example):

```typescript
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/api/users/push-token', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, deviceInfo } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid token',
      });
    }

    // Check if token already exists
    const existingToken = await prisma.pushToken.findFirst({
      where: {
        userId,
        token,
      },
    });

    if (existingToken) {
      // Update last active timestamp
      await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: {
          lastActiveAt: new Date(),
          deviceInfo: deviceInfo || existingToken.deviceInfo,
        },
      });

      return res.json({
        success: true,
        message: 'Token updated',
      });
    }

    // Create new token
    await prisma.pushToken.create({
      data: {
        userId,
        token,
        deviceInfo,
        lastActiveAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Token registered',
    });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
```

### 2. Delete Push Token

**Endpoint**: `DELETE /api/users/push-token`

**Authentication**: Required

**Request Body**:
```typescript
{
  token?: string;  // Optional: specific token to delete
}
```

**Response**:
```typescript
{
  success: boolean;
  message?: string;
}
```

**Implementation**:

```typescript
router.delete('/api/users/push-token', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (token) {
      // Delete specific token
      await prisma.pushToken.deleteMany({
        where: {
          userId,
          token,
        },
      });
    } else {
      // Delete all tokens for user
      await prisma.pushToken.deleteMany({
        where: { userId },
      });
    }

    res.json({
      success: true,
      message: 'Token(s) deleted',
    });
  } catch (error) {
    console.error('Delete push token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});
```

### 3. Get User's Push Tokens (Optional)

**Endpoint**: `GET /api/users/push-tokens`

**Authentication**: Required

**Response**:
```typescript
{
  success: boolean;
  tokens: Array<{
    id: string;
    token: string;
    deviceInfo: any;
    createdAt: Date;
    lastActiveAt: Date;
  }>;
}
```

---

## Database Schema

### Prisma Schema

Add to your `schema.prisma`:

```prisma
model PushToken {
  id           String   @id @default(cuid())
  userId       String
  token        String   @unique
  deviceInfo   Json?
  createdAt    DateTime @default(now())
  lastActiveAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
  @@map("push_tokens")
}

// Update User model to include relation
model User {
  // ... existing fields
  pushTokens PushToken[]
}
```

### SQL Migration (Alternative)

If not using Prisma:

```sql
CREATE TABLE push_tokens (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  device_info JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_token (token)
);
```

---

## Firebase Admin Setup

### 1. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### 2. Initialize Firebase Admin

Create `lib/firebase-admin.ts`:

```typescript
import * as admin from 'firebase-admin';
import { Message, MulticastMessage } from 'firebase-admin/messaging';

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const messaging = admin.messaging();

export { messaging, admin };
```

### 3. Environment Variables

Add to `.env`:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
# Or use individual fields:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Sending Notifications

### 1. Create Notification Service

Create `services/PushNotificationService.ts`:

```typescript
import { messaging } from '../lib/firebase-admin';
import { prisma } from '../lib/prisma';
import { MulticastMessage } from 'firebase-admin/messaging';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, string>;
  url?: string;
}

export class PushNotificationService {
  /**
   * Send notification to a single user
   */
  static async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      // Get user's push tokens
      const tokens = await prisma.pushToken.findMany({
        where: {
          userId,
          // Optionally filter by last active (remove stale tokens)
          lastActiveAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: { token: true, id: true },
      });

      if (tokens.length === 0) {
        console.log(`No push tokens found for user ${userId}`);
        return;
      }

      const message: MulticastMessage = {
        tokens: tokens.map(t => t.token),
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.image,
        },
        data: {
          ...(payload.data || {}),
          icon: payload.icon || '/icons/icon-192x192.png',
          badge: payload.badge || '/icons/badge-72x72.png',
          url: payload.url || '/',
        },
        webpush: {
          notification: {
            icon: payload.icon || '/icons/icon-192x192.png',
            badge: payload.badge || '/icons/badge-72x72.png',
            requireInteraction: false,
            vibrate: [200, 100, 200],
          },
          fcmOptions: {
            link: payload.url || '/',
          },
        },
      };

      const response = await messaging.sendEachForMulticast(message);

      console.log(`Sent notification to ${response.successCount}/${tokens.length} devices`);

      // Remove failed tokens
      if (response.failureCount > 0) {
        const failedTokenIds: string[] = [];

        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            // Check if token is invalid or unregistered
            const errorCode = (resp.error as any)?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              failedTokenIds.push(tokens[idx].id);
            }
          }
        });

        // Delete invalid tokens
        if (failedTokenIds.length > 0) {
          await prisma.pushToken.deleteMany({
            where: { id: { in: failedTokenIds } },
          });
          console.log(`Removed ${failedTokenIds.length} invalid tokens`);
        }
      }
    } catch (error) {
      console.error('Push notification error:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple users
   */
  static async sendToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
    await Promise.allSettled(
      userIds.map(userId => this.sendToUser(userId, payload))
    );
  }

  /**
   * Send notification for a new message
   */
  static async sendNewMessageNotification(
    recipientUserId: string,
    senderName: string,
    messagePreview: string,
    conversationId: string
  ): Promise<void> {
    await this.sendToUser(recipientUserId, {
      title: senderName,
      body: messagePreview,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        type: 'new_message',
        conversationId,
        senderId: senderName,
      },
      url: `/chat/${conversationId}`,
    });
  }

  /**
   * Send notification for a group mention
   */
  static async sendMentionNotification(
    mentionedUserId: string,
    senderName: string,
    groupName: string,
    messagePreview: string,
    conversationId: string
  ): Promise<void> {
    await this.sendToUser(mentionedUserId, {
      title: `${senderName} mentioned you in ${groupName}`,
      body: messagePreview,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        type: 'mention',
        conversationId,
        senderId: senderName,
        groupName,
      },
      url: `/chat/${conversationId}`,
    });
  }
}
```

### 2. Integrate with Message Creation

Update your message creation endpoint:

```typescript
router.post('/api/conversations/:id/messages', authenticateUser, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const senderId = req.user.id;
    const { content, attachments } = req.body;

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content,
        attachments,
      },
      include: {
        sender: true,
      },
    });

    // Get conversation participants
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          where: {
            userId: { not: senderId }, // Exclude sender
          },
          select: { userId: true },
        },
      },
    });

    // Send push notifications to participants
    if (conversation) {
      const recipientIds = conversation.participants.map(p => p.userId);

      await PushNotificationService.sendToUsers(recipientIds, {
        title: message.sender.name,
        body: content.substring(0, 100), // Preview
        icon: message.sender.avatar || '/icons/icon-192x192.png',
        url: `/chat/${conversationId}`,
        data: {
          type: 'new_message',
          conversationId,
          messageId: message.id,
        },
      });
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});
```

---

## Security Considerations

### 1. Token Validation

```typescript
function isValidFCMToken(token: string): boolean {
  // FCM tokens are typically 152-200+ characters
  return token.length >= 100 && token.length <= 300;
}
```

### 2. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const tokenRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 token registrations per 15 min
  message: 'Too many token registrations, please try again later',
});

router.post('/api/users/push-token', tokenRegistrationLimiter, authenticateUser, ...);
```

### 3. Token Cleanup

Periodically clean up stale tokens:

```typescript
// Cron job or scheduled task
async function cleanupStaleTokens() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const deleted = await prisma.pushToken.deleteMany({
    where: {
      lastActiveAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  console.log(`Cleaned up ${deleted.count} stale push tokens`);
}
```

### 4. User Preferences

Allow users to control notification types:

```prisma
model User {
  // ... existing fields
  notificationPreferences Json? @default("{\"newMessages\":true,\"mentions\":true,\"groupActivity\":true}")
}
```

Check preferences before sending:

```typescript
const user = await prisma.user.findUnique({
  where: { id: recipientUserId },
  select: { notificationPreferences: true },
});

const prefs = user?.notificationPreferences as any || {};

if (prefs.newMessages !== false) {
  await PushNotificationService.sendNewMessageNotification(...);
}
```

---

## Testing

### 1. Test Token Registration

```bash
curl -X POST http://localhost:3000/api/users/push-token \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{
    "token": "test-fcm-token-here",
    "deviceInfo": {
      "userAgent": "Mozilla/5.0...",
      "platform": "Win32",
      "language": "en-US"
    }
  }'
```

### 2. Test Sending Notification

```typescript
// In your code or API endpoint
await PushNotificationService.sendToUser('user-id-here', {
  title: 'Test Notification',
  body: 'This is a test',
  url: '/notifications',
});
```

### 3. Test with Firebase Console

1. Go to Firebase Console > Cloud Messaging
2. Click "Send test message"
3. Add your FCM token
4. Send notification

### 4. Monitor Delivery

Check Firebase Console > Cloud Messaging > Reports for:
- Sent count
- Opened count
- Error rate
- Invalid tokens

---

## Error Handling

### Common Firebase Errors

```typescript
const handleFCMError = (error: any) => {
  switch (error.code) {
    case 'messaging/invalid-registration-token':
    case 'messaging/registration-token-not-registered':
      // Token is invalid, remove from database
      return 'REMOVE_TOKEN';

    case 'messaging/message-rate-exceeded':
      // Rate limit exceeded, retry later
      return 'RETRY_LATER';

    case 'messaging/third-party-auth-error':
      // Firebase auth issue
      return 'AUTH_ERROR';

    default:
      return 'UNKNOWN_ERROR';
  }
};
```

---

## Performance Considerations

### 1. Batch Notifications

For large user groups:

```typescript
// Send in batches of 500 (FCM limit)
async function sendToManyUsers(userIds: string[], payload: NotificationPayload) {
  const batchSize = 500;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    await PushNotificationService.sendToUsers(batch, payload);
  }
}
```

### 2. Queue System

For high volume, use a queue (Redis, Bull, etc.):

```typescript
import { Queue } from 'bull';

const notificationQueue = new Queue('push-notifications', {
  redis: { host: 'localhost', port: 6379 },
});

notificationQueue.process(async (job) => {
  const { userId, payload } = job.data;
  await PushNotificationService.sendToUser(userId, payload);
});

// Add to queue
await notificationQueue.add({ userId, payload });
```

---

## Summary

### Checklist

- [ ] Create `push_tokens` table in database
- [ ] Implement POST `/api/users/push-token` endpoint
- [ ] Implement DELETE `/api/users/push-token` endpoint
- [ ] Set up Firebase Admin SDK
- [ ] Create `PushNotificationService`
- [ ] Integrate with message creation
- [ ] Add rate limiting
- [ ] Implement token cleanup
- [ ] Add user preferences
- [ ] Test notifications end-to-end

### Priority Order

1. **High**: Token registration/deletion endpoints
2. **High**: Firebase Admin setup
3. **High**: Basic notification sending
4. **Medium**: Token cleanup
5. **Medium**: User preferences
6. **Low**: Queue system (for scale)

---

**Last Updated**: 2025-11-21
**Version**: 1.0.0
