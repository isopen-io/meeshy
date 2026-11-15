# Fix: Message Deletion from /conversations

**Date**: October 18, 2025  
**Issue**: Message deletion wasn't working from the /conversations page  
**Root Cause**: Mismatch between user role enum values

## Problem Analysis

The message deletion and editing features weren't working from `/conversations` due to **two distinct issues**:

### Issue 1: Role Name Mismatch (Permissions)
- **Prisma Schema** defines user roles as: `USER`, `ADMIN`, `MODO`, `AUDIT`, `ANALYST`, `BIGBOSS`
- **Frontend/Backend Code** was checking for: `MODERATOR`, `ADMIN`, `CREATOR`, `BIGBOSS`
- The actual role stored in the database is `MODO`, but the code was checking for `MODERATOR`, which never matched

### Issue 2: UI Not Updating After Edit/Delete
- When clicking edit/delete buttons in `/conversations`, the API calls succeeded
- However, the UI didn't update immediately because the code was calling `refreshMessages()` instead of updating local state
- The page at `/` (BubbleStreamPage) worked because it uses WebSocket events that call `removeMessage()` and `updateMessage()` directly
- In `/conversations`, the handlers were only reloading all messages from the API, which was slow and didn't work properly

## Files Modified

### 1. Frontend - BubbleMessage Component
**File**: `frontend/components/common/bubble-message.tsx`

**Changes**:
- Updated `canModifyMessage()` to check for both `'MODO'` and `'MODERATOR'`
- Updated `canDeleteMessage()` to check for both `'MODO'` and `'MODERATOR'`

```typescript
// Before:
const canModifyMessage = () => {
  if (isOwnMessage) return true;
  if (conversationType === 'group' || conversationType === 'public' || conversationType === 'global') {
    return ['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole);
  }
  return false;
};

const canDeleteMessage = () => {
  if (['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(userRole)) return true;
  // ...
};

// After:
const canModifyMessage = () => {
  if (isOwnMessage) return true;
  if (conversationType === 'group' || conversationType === 'public' || conversationType === 'global') {
    return ['MODERATOR', 'MODO', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole);
  }
  return false;
};

const canDeleteMessage = () => {
  if (['BIGBOSS', 'ADMIN', 'MODERATOR', 'MODO'].includes(userRole)) return true;
  // ...
};
```

### 2. Backend - Conversations Routes (DELETE)
**File**: `gateway/src/routes/conversations.ts`

**Changes**: Added support for both `MODO` and `MODERATOR` in the delete message route (line ~1705)

```typescript
// Before:
canDelete = userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';

// After:
// Support both MODO and MODERATOR for backward compatibility
canDelete = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';
```

### 3. Frontend - ConversationLayout (Instant Updates)
**File**: `frontend/components/conversations/ConversationLayout.tsx`

**Changes**: Modified `handleDeleteMessage` and `handleEditMessage` to update local state immediately instead of reloading all messages

**handleDeleteMessage** (line ~557):
```typescript
// Before:
const handleDeleteMessage = useCallback(async (messageId: string) => {
  if (!selectedConversation) return;
  try {
    await messageService.deleteMessage(selectedConversation.id, messageId);
    // Recharger les messages pour afficher la suppression
    await refreshMessages();
    toast.success(tCommon('messages.messageDeleted'));
  } catch (error) {
    // ...
  }
}, [selectedConversation, refreshMessages, tCommon]);

// After:
const handleDeleteMessage = useCallback(async (messageId: string) => {
  if (!selectedConversation) return;
  try {
    // Supprimer immédiatement de l'état local pour une UI réactive
    removeMessage(messageId);
    // Appeler l'API pour supprimer sur le serveur
    await messageService.deleteMessage(selectedConversation.id, messageId);
    toast.success(tCommon('messages.messageDeleted'));
  } catch (error) {
    // En cas d'erreur, recharger les messages pour restaurer l'état correct
    await refreshMessages();
    // ...
  }
}, [selectedConversation, removeMessage, refreshMessages, tCommon]);
```

**handleEditMessage** (line ~538):
```typescript
// Before:
const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
  if (!selectedConversation) return;
  try {
    await messageService.editMessage(selectedConversation.id, messageId, {
      content: newContent,
      originalLanguage: selectedLanguage
    });
    // Recharger les messages pour afficher la modification
    await refreshMessages();
    toast.success(tCommon('messages.messageEdited'));
  } catch (error) {
    // ...
  }
}, [selectedConversation, selectedLanguage, refreshMessages, tCommon]);

// After:
const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
  if (!selectedConversation) return;
  try {
    // Mettre à jour immédiatement l'état local pour une UI réactive
    updateMessage(messageId, (prev) => ({
      ...prev,
      content: newContent,
      isEdited: true,
      editedAt: new Date()
    }));
    // Appeler l'API pour mettre à jour sur le serveur
    await messageService.editMessage(selectedConversation.id, messageId, {
      content: newContent,
      originalLanguage: selectedLanguage
    });
    toast.success(tCommon('messages.messageEdited'));
  } catch (error) {
    // En cas d'erreur, recharger les messages pour restaurer l'état correct
    await refreshMessages();
    // ...
  }
}, [selectedConversation, selectedLanguage, updateMessage, refreshMessages, tCommon]);
```

### 4. Backend - Conversations Routes (EDIT)
**File**: `gateway/src/routes/conversations.ts`

**Changes**: Added support for both `MODO` and `MODERATOR` in two places in the edit message route:

**Location 1**: Time restriction check (line ~1482)
```typescript
// Support both MODO and MODERATOR for backward compatibility
const hasSpecialPrivileges = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';
```

**Location 2**: Permission check (line ~1510)
```typescript
// Support both MODO and MODERATOR for backward compatibility
canModify = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';
```

## How Message Deletion Works

### Frontend Flow:
1. User clicks the delete button on a message (three-dot menu → Delete)
2. `BubbleMessage.handleDeleteMessage()` is called
3. Confirmation dialog is shown
4. If confirmed, `onDeleteMessage(message.id)` callback is triggered
5. This calls `ConversationLayout.handleDeleteMessage()`
6. Which calls `messageService.deleteMessage(conversationId, messageId)`
7. Frontend makes DELETE request to `/api/conversations/${conversationId}/messages/${messageId}`

### Backend Flow:
1. Gateway receives DELETE request at `/api/conversations/:id/messages/:messageId`
2. Authenticates user via `requiredAuth` middleware
3. Checks if message exists and is not deleted
4. Verifies permissions:
   - Author can delete (within 12 hours for regular users)
   - MODO/MODERATOR/ADMIN/BIGBOSS can always delete
5. Deletes message attachments from storage
6. Deletes message translations from database
7. Soft deletes the message (sets `isDeleted: true`)
8. Broadcasts deletion via Socket.IO to conversation participants
9. Returns success response

### Permission Rules:

**Can Delete Message if**:
- User is BIGBOSS, ADMIN, MODERATOR/MODO (any time)
- User is the message author AND:
  - Message is less than 12 hours old (regular users)
  - OR user has elevated privileges (no time limit)

**Can Edit Message if**:
- User is BIGBOSS, ADMIN, MODERATOR/MODO (any time)
- User is the message author AND:
  - Message is less than 1 hour old (regular users)
  - OR user has elevated privileges (no time limit)

## Database Schema Reference

From `shared/schema.prisma`:
```prisma
model User {
  /// USER, ADMIN, MODO, AUDIT, ANALYST, BIGBOSS
  role String @default("USER")
}
```

## Type System Reference

From `shared/types/index.ts`:
```typescript
export enum UserRoleEnum {
  BIGBOSS = 'BIGBOSS',
  ADMIN = 'ADMIN',
  MODO = 'MODO',        // Moderator global (schema.prisma)
  AUDIT = 'AUDIT',
  ANALYST = 'ANALYST',
  USER = 'USER',
  // Aliases pour rétrocompatibilité
  MODERATOR = 'MODO',   // Alias de MODO
  CREATOR = 'ADMIN',    // Alias de ADMIN
  MEMBER = 'USER'       // Alias de USER
}
```

## Testing

To test the fix:

1. **As Message Author (Regular User)**:
   - Send a message in a conversation
   - Click the three-dot menu on your message
   - Click "Delete"
   - Confirm deletion
   - ✅ Message should be deleted

2. **As Moderator/Admin**:
   - Open a conversation with messages from other users
   - Click the three-dot menu on any message
   - You should see the "Delete" option
   - Click "Delete" and confirm
   - ✅ Message should be deleted

3. **Old Messages (>12 hours)**:
   - As regular user, messages older than 12 hours should not show delete option
   - As MODO/ADMIN/BIGBOSS, all messages should be deletable

## Why Was `/` Working But Not `/conversations`?

The homepage (`/`) uses `BubbleStreamPage` which has WebSocket event handlers that directly call `removeMessage()` and `updateMessage()`:

```typescript
// From useMessaging hook - these WebSocket events work instantly
onMessageEdited: useCallback((message: any) => {
  updateMessage(message.id, message);  // Direct state update
  toast.info(tCommon('messages.messageEditedByOther'));
}, [updateMessage, tCommon]),

onMessageDeleted: useCallback((messageId: string) => {
  removeMessage(messageId);  // Direct state update  
  toast.info(tCommon('messages.messageDeletedByOther'));
}, [removeMessage, tCommon]),
```

The `/conversations` page was only reloading all messages with `refreshMessages()`, which was:
1. Slower (full API request)
2. Didn't work properly (timing issues, potential race conditions)
3. Didn't provide instant feedback to the user

**The Fix**: Make `/conversations` behave like `/` by updating local state immediately, then syncing with the server.

## Build Status

- ✅ Frontend built successfully (version: 1.0.41-alpha)
- ✅ Gateway built successfully (version: 1.0.40-alpha)
- ✅ TypeScript compilation successful
- ✅ Prisma client generated
- ✅ Instant UI updates implemented

## Deployment Notes

After deploying these changes:
1. Restart the gateway service
2. Clear browser cache or hard refresh (Ctrl+F5) to load new frontend code
3. Test message deletion in conversations
4. Verify that Socket.IO broadcasts deletion events correctly

## Related Files

- Frontend:
  - `/apps/web/components/common/bubble-message.tsx` - Message UI component with delete button
  - `/apps/web/components/common/messages-display.tsx` - Messages container
  - `/apps/web/components/conversations/ConversationLayout.tsx` - Conversation page logic
  - `/apps/web/services/message.service.ts` - API client for message operations

- Backend:
  - `/gateway/src/routes/conversations.ts` - DELETE/PUT message routes
  - `/gateway/src/middleware/auth.ts` - Authentication middleware
  - `/shared/schema.prisma` - Database schema with User.role definition
  - `/shared/types/index.ts` - TypeScript type definitions

## Future Improvements

1. Consider standardizing on `MODO` everywhere instead of supporting both `MODO` and `MODERATOR`
2. Add database migration to update any existing `MODERATOR` values to `MODO`
3. Add unit tests for role permission checks
4. Add E2E tests for message deletion flow
