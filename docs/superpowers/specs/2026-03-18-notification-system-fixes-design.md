# Notification System — 4 Correctness Fixes Design

**Date:** 2026-03-18
**Scope:** Gateway notification pipeline — 4 bugs preventing mentions, push notifications, and immediate emails from working

---

## Problem Statement

Only reaction notifications work correctly. Messages, mentions, push, and email are broken or non-functional due to 4 independent bugs:

1. Mentioned users receive zero notifications (excluded from `new_message` but never sent `user_mentioned`)
2. `MessageProcessor.sendMentionNotifications()` looks up a Participant.id as if it were a User.id
3. `PushNotificationService` is never called from the notification pipeline
4. Email notifications are only sent as a daily digest, no immediate email for high-priority events

## Fix 1: Mention Notifications in `_createMessageNotifications()`

**File:** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
**Method:** `_createMessageNotifications()` (~line 3040)

**Current behavior:**
```
1. Fetch all conversation participants (excluding sender + anonymous)
2. Fetch mention records for the message → collect mentionedUserIds
3. Filter out mentionedUserIds from generic recipients
4. Send `createMessageNotification()` to remaining recipients
5. mentionedUserIds → NOTHING (dropped)
```

**Fixed behavior:**
```
1-4. Same as above
5. For each mentionedUserId: call notificationService.createMentionNotification({
     mentionedUserId,
     senderId: senderUserIdForNotif,  // already resolved User.id
     conversationId,
     messageId: message.id,
     messageContent: message.content
   })
```

The `senderUserIdForNotif` is already resolved from `Participant.id → User.id` at line ~3201 of the method. The mention notification gets `priority: 'high'` from `NotificationService.createMentionNotification()`.

## Fix 2: senderId Mismatch in `MessageProcessor.sendMentionNotifications()`

**File:** `services/gateway/src/services/messaging/MessageProcessor.ts`
**Method:** `sendMentionNotifications()` (~line 500)

**Current behavior:**
```typescript
// senderId here is a Participant.id, NOT a User.id
async sendMentionNotifications(mentionedUserIds, senderId, conversationId, messageId) {
  const sender = await this.prisma.user.findUnique({ where: { id: senderId } });
  // sender is null because senderId is a Participant.id → returns early
}
```

**Fix:** Resolve Participant.id → User.id before the user lookup:
```typescript
async sendMentionNotifications(mentionedUserIds, senderId, conversationId, messageId) {
  // Resolve participant ID to user ID
  const participant = await this.prisma.participant.findUnique({
    where: { id: senderId },
    select: { userId: true }
  });
  const senderUserId = participant?.userId ?? senderId;
  const sender = await this.prisma.user.findUnique({ where: { id: senderUserId } });
  // Now sender is found correctly
}
```

This is a defensive fix — if `senderId` is already a User.id (future callers), the participant lookup returns null and we fall back to `senderId` directly.

## Fix 3: Wire PushNotificationService into Notification Pipeline

**File:** `services/gateway/src/services/notifications/NotificationService.ts`
**Method:** `createNotification()` (~line 165)

**Current flow:**
```
1. Validate + sanitize
2. Check user preferences
3. prisma.notification.create()
4. io.to(userId).emit(NOTIFICATION_NEW, ...)
5. return notification
```

**Fixed flow:**
```
1-4. Same
5. Check if user has active sockets: io.in(userId).fetchSockets()
6. If NO active sockets → pushNotificationService.sendToUser(userId, notification) [fire-and-forget]
7. return notification
```

**Integration:** `NotificationService` needs a `setPushNotificationService()` setter (same pattern as `setSocketIO()`). Called during `MeeshySocketIOManager.initialize()` after constructing `PushNotificationService`.

**`fetchSockets()` check:** Socket.IO `io.in(roomName).fetchSockets()` returns connected sockets in that room. If empty → user is offline → send push. This avoids duplicate notifications (Socket.IO + push) for online users.

## Fix 4: Immediate Email for High-Priority Notifications

**File:** `services/gateway/src/services/notifications/NotificationService.ts`
**Method:** `createNotification()` (same method as Fix 3)

**After the push notification step, add:**
```
7. If priority === 'high' AND user has email notifications enabled AND user is offline:
   emailService.sendImmediateNotification(userId, notification) [fire-and-forget]
8. return notification
```

**High-priority types:** `user_mentioned`, `missed_call`, `password_changed`, `two_factor_enabled`, `two_factor_disabled`, `login_new_device`

**Integration:** `NotificationService` needs a `setEmailService()` setter. The `EmailService` already exists and is used by the digest job.

**Rate protection:** Max 1 immediate email per user per 5 minutes (use CacheStore with `setnx` to throttle). Prevents email spam during rapid mention storms.

## Non-Goals

- Refactoring `MeeshySocketIOManager` to use `MessageHandler` class (dead code cleanup is separate)
- Fixing `FirebaseNotificationService` (replaced by `PushNotificationService`)
- Changing the daily digest job
- Adding new notification types

## Testing

- Fix 1: Verify mention notification created when user is mentioned in a message
- Fix 2: Verify `sendMentionNotifications` resolves participant ID correctly
- Fix 3: Verify `PushNotificationService.sendToUser()` called when user offline
- Fix 4: Verify immediate email sent for high-priority notifications when user offline
