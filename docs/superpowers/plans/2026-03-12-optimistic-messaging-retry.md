# Optimistic Messaging + Retry/Cancel UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Messages appear instantly in the conversation when the user hits Enter (optimistic UI), with inline retry/cancel on failure — matching the iOS experience. Fix CallManager socket spam. Make REST fallback invisible.

**Architecture:** Add a `_localStatus` field to optimistic messages in the conversation store (`sending | failed`). The `handleSendMessage` in ConversationLayout creates a temporary message immediately, clears the input, then sends via socket. On `message:new` from server, replace the temp message. On failure, mark it `failed` and show an inline retry/cancel bar under the bubble. Fix CallManager by using `useRef` for handlers.

**Tech Stack:** React 19, Zustand, Socket.IO Client, next-intl (i18n JSON files), TypeScript

---

## Chunk 1: Optimistic Messages + Retry/Cancel UI

### Task 1: Add i18n keys for delivery status (4 locales)

**Files:**
- Modify: `apps/web/locales/en/bubbleStream.json`
- Modify: `apps/web/locales/fr/bubbleStream.json`
- Modify: `apps/web/locales/es/bubbleStream.json`
- Modify: `apps/web/locales/pt/bubbleStream.json`

- [ ] **Step 1: Add delivery status keys to EN locale**

Add to `bubbleStream` object in `apps/web/locales/en/bubbleStream.json`:

```json
"delivery": {
  "sending": "Sending...",
  "sent": "Sent",
  "delivered": "Delivered",
  "read": "Read",
  "failed": "Failed to send",
  "retry": "Retry",
  "cancel": "Delete",
  "retrying": "Retrying..."
}
```

- [ ] **Step 2: Add delivery status keys to FR locale**

Add to `bubbleStream` object in `apps/web/locales/fr/bubbleStream.json`:

```json
"delivery": {
  "sending": "Envoi en cours...",
  "sent": "Envoyé",
  "delivered": "Délivré",
  "read": "Lu",
  "failed": "Échec de l'envoi",
  "retry": "Réessayer",
  "cancel": "Supprimer",
  "retrying": "Nouvel essai..."
}
```

- [ ] **Step 3: Add delivery status keys to ES locale**

```json
"delivery": {
  "sending": "Enviando...",
  "sent": "Enviado",
  "delivered": "Entregado",
  "read": "Leído",
  "failed": "Error al enviar",
  "retry": "Reintentar",
  "cancel": "Eliminar",
  "retrying": "Reintentando..."
}
```

- [ ] **Step 4: Add delivery status keys to PT locale**

```json
"delivery": {
  "sending": "Enviando...",
  "sent": "Enviado",
  "delivered": "Entregue",
  "read": "Lido",
  "failed": "Falha ao enviar",
  "retry": "Tentar novamente",
  "cancel": "Excluir",
  "retrying": "Tentando novamente..."
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/locales/*/bubbleStream.json
git commit -m "feat(i18n): add delivery status keys for optimistic messaging"
```

---

### Task 2: Add optimistic message support to conversation store

**Files:**
- Modify: `apps/web/stores/conversation-store.ts`

The store already has `addMessage()` and `updateMessage()`. We need:
- `addOptimisticMessage()` — inserts a message with a temp ID and `_localStatus: 'sending'`
- `replaceOptimisticMessage()` — replaces temp message with server version on `message:new`
- `markMessageFailed()` — sets `_localStatus: 'failed'` on a temp message
- `removeOptimisticMessage()` — removes a failed message (cancel action)

- [ ] **Step 1: Add optimistic message actions to the store**

In `apps/web/stores/conversation-store.ts`, add after the existing `updateMessage` action (around line 280):

```typescript
addOptimisticMessage: (conversationId: string, message: Message & { _localStatus: 'sending'; _tempId: string }) => {
  set((state) => {
    const newMessages = new Map(state.messages);
    const existing = newMessages.get(conversationId) || [];
    // Append to end (messages are newest-first, optimistic goes at index 0)
    newMessages.set(conversationId, [message, ...existing]);
    return { messages: newMessages };
  });
},

replaceOptimisticMessage: (conversationId: string, tempId: string, serverMessage: Message) => {
  set((state) => {
    const newMessages = new Map(state.messages);
    const messages = newMessages.get(conversationId);
    if (!messages) return state;
    newMessages.set(
      conversationId,
      messages.map(m => (m as any)._tempId === tempId ? serverMessage : m)
    );
    return { messages: newMessages };
  });
},

markMessageFailed: (conversationId: string, tempId: string) => {
  set((state) => {
    const newMessages = new Map(state.messages);
    const messages = newMessages.get(conversationId);
    if (!messages) return state;
    newMessages.set(
      conversationId,
      messages.map(m => (m as any)._tempId === tempId ? { ...m, _localStatus: 'failed' } : m)
    );
    return { messages: newMessages };
  });
},

removeOptimisticMessage: (conversationId: string, tempId: string) => {
  set((state) => {
    const newMessages = new Map(state.messages);
    const messages = newMessages.get(conversationId);
    if (!messages) return state;
    newMessages.set(
      conversationId,
      messages.filter(m => (m as any)._tempId !== tempId)
    );
    return { messages: newMessages };
  });
},
```

Also add these to the store's type interface.

- [ ] **Step 2: Commit**

```bash
git add apps/web/stores/conversation-store.ts
git commit -m "feat(store): add optimistic message actions to conversation store"
```

---

### Task 3: Implement optimistic send in ConversationLayout

**Files:**
- Modify: `apps/web/components/conversations/ConversationLayout.tsx`

Rewrite `handleSendMessage` (currently lines 486-560) to:
1. Create a temporary message object immediately
2. Add it to the store via `addOptimisticMessage()`
3. Clear the input, attachments, and reply state IMMEDIATELY (before await)
4. Send via socket in background
5. On failure: `markMessageFailed()` (no toast — the inline bar handles it)

- [ ] **Step 1: Import store actions and create temp message builder**

Add imports at top of file:
```typescript
import { useConversationStore } from '@/stores/conversation-store';
```

Add a helper function inside the component (or outside as a pure function):
```typescript
const createOptimisticMessage = (
  content: string,
  senderId: string,
  conversationId: string,
  language: string,
  replyToId?: string,
  sender?: { id: string; username: string; displayName: string; avatar?: string }
): Message & { _localStatus: 'sending'; _tempId: string } => {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: tempId,
    _tempId: tempId,
    _localStatus: 'sending',
    conversationId,
    senderId,
    content,
    originalLanguage: language,
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    replyToId,
    sender: sender ? {
      id: sender.id,
      username: sender.username,
      displayName: sender.displayName,
      avatar: sender.avatar,
    } : undefined,
  } as any;
};
```

- [ ] **Step 2: Rewrite handleSendMessage for optimistic flow**

Replace the existing `handleSendMessage` (lines 486-560):

```typescript
const handleSendMessage = useCallback(async () => {
  if ((!newMessage.trim() && attachmentIds.length === 0) || !selectedConversation || !user)
    return;

  const content = newMessage.trim();
  const replyToId = useReplyStore.getState().replyingTo?.id;
  const mentionedUserIds = messageComposerRef.current?.getMentionedUserIds?.() || [];
  const hasAttachments = attachmentIds.length > 0;

  if (selectedConversation.id !== effectiveSelectedId) {
    toast.error(t('conversationLayout.conversationChangedError'));
    return;
  }

  const currentAttachmentIds = [...attachmentIds];
  const currentAttachmentMimeTypes = [...attachmentMimeTypes];
  const conversationId = selectedConversation.id;

  // 1. Create optimistic message and add to store IMMEDIATELY
  const optimistic = createOptimisticMessage(
    content,
    user.id,
    conversationId,
    selectedLanguage,
    replyToId,
    { id: user.id, username: user.username, displayName: user.displayName || user.username, avatar: user.avatar }
  );

  const { addOptimisticMessage, markMessageFailed } = useConversationStore.getState();
  addOptimisticMessage(conversationId, optimistic);

  // 2. Clear input IMMEDIATELY (before network call)
  if (isTyping) handleTypingStop();
  clearDraft();
  messageComposerRef.current?.clearAttachments?.();
  messageComposerRef.current?.clearMentionedUserIds?.();
  if (replyToId) useReplyStore.getState().clearReply();

  // 3. Scroll to bottom
  setTimeout(() => {
    messagesScrollRef.current?.scrollTo({
      top: messagesScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, 50);

  // 4. Send via socket in background
  try {
    const success = await sendMessageViaSocket(
      content,
      selectedLanguage,
      replyToId,
      mentionedUserIds,
      hasAttachments ? currentAttachmentIds : undefined,
      hasAttachments ? currentAttachmentMimeTypes : undefined
    );

    if (!success) {
      markMessageFailed(conversationId, optimistic._tempId);
    }

    // Mark as read after send
    if (conversationId) {
      conversationsService.markAsRead(conversationId)
        .then(() => {
          setConversations(prev =>
            prev.map(conv =>
              conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
            )
          );
        })
        .catch(console.error);
    }
  } catch (error) {
    console.error('[ConversationLayout] Send error:', error);
    markMessageFailed(conversationId, optimistic._tempId);
  }
}, [
  newMessage, selectedConversation, user, attachmentIds, attachmentMimeTypes,
  effectiveSelectedId, selectedLanguage, isTyping, handleTypingStop,
  sendMessageViaSocket, clearDraft, setConversations, setAttachmentIds, t,
]);
```

- [ ] **Step 3: Add message:new deduplication for optimistic messages**

In the socket event listener for `message:new` (in `messaging.service.ts` or `presence.service.ts` — wherever `addMessage` is called), check if the incoming message matches a pending optimistic message by matching `content + senderId + conversationId` within a 30s window. If matched, call `replaceOptimisticMessage()` instead of `addMessage()`.

Find where `MESSAGE_NEW` is handled and add dedup logic:

```typescript
// In the MESSAGE_NEW handler:
const store = useConversationStore.getState();
const existingMessages = store.messages.get(message.conversationId) || [];
const optimisticMatch = existingMessages.find(m => {
  const isTemp = (m as any)._tempId;
  if (!isTemp) return false;
  // Match by content + sender within 30s
  const timeDiff = Math.abs(new Date(message.createdAt).getTime() - new Date(m.createdAt).getTime());
  return m.content === message.content && m.senderId === message.senderId && timeDiff < 30000;
});

if (optimisticMatch) {
  store.replaceOptimisticMessage(message.conversationId, (optimisticMatch as any)._tempId, message);
} else {
  store.addMessage(message.conversationId, message);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/conversations/ConversationLayout.tsx apps/web/services/socketio/messaging.service.ts
git commit -m "feat(web): optimistic message send — instant UI feedback on Enter"
```

---

### Task 4: Create FailedMessageBar inline component

**Files:**
- Create: `apps/web/components/messages/FailedMessageBar.tsx`

This is an inline component rendered BELOW a message bubble when `_localStatus === 'failed'`. Modeled after iOS `ConversationView+MessageRow.swift` lines 732-772.

- [ ] **Step 1: Create the FailedMessageBar component**

```typescript
'use client';

import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FailedMessageBarProps {
  tempId: string;
  conversationId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  onRetry: (tempId: string, content: string, language: string, replyToId?: string) => void;
  onCancel: (tempId: string) => void;
  t: (key: string) => string;
}

export const FailedMessageBar = memo(function FailedMessageBar({
  tempId,
  conversationId,
  content,
  originalLanguage,
  replyToId,
  onRetry,
  onCancel,
  t,
}: FailedMessageBarProps) {
  return (
    <div className="flex items-center justify-end gap-1.5 px-4 py-1 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
      <span className="text-red-500 font-medium">
        {t('bubbleStream.delivery.failed')}
      </span>
      <span className="text-[var(--gp-text-muted)]">·</span>
      <button
        onClick={() => onRetry(tempId, content, originalLanguage, replyToId)}
        className="text-[var(--gp-accent)] hover:underline font-medium cursor-pointer"
      >
        {t('bubbleStream.delivery.retry')}
      </button>
      <button
        onClick={() => onCancel(tempId)}
        className="text-[var(--gp-text-muted)] hover:text-red-500 hover:underline cursor-pointer"
      >
        {t('bubbleStream.delivery.cancel')}
      </button>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/messages/FailedMessageBar.tsx
git commit -m "feat(web): add inline FailedMessageBar component for failed messages"
```

---

### Task 5: Integrate FailedMessageBar + sending indicator into message rendering

**Files:**
- Modify: `apps/web/components/common/messages-display.tsx` or the component that renders individual messages in the conversation
- Modify: `apps/web/components/common/BubbleMessage.tsx`

Need to find where individual messages are rendered and:
1. If `_localStatus === 'sending'`, show a subtle clock icon or opacity
2. If `_localStatus === 'failed'`, dim the bubble + show FailedMessageBar below it
3. Wire retry handler (remove failed msg, re-send) and cancel handler (remove msg)

- [ ] **Step 1: Find the message rendering component and add status indicators**

In the message rendering component (likely `BubbleMessage.tsx` or `messages-display.tsx`), wrap each message:

```typescript
// For sending status: subtle opacity + clock icon
const localStatus = (message as any)._localStatus;
const isSending = localStatus === 'sending';
const isFailed = localStatus === 'failed';

// In the message wrapper div:
<div className={cn('...', isSending && 'opacity-70', isFailed && 'opacity-70')}>
  {/* existing message bubble */}
</div>

{/* Failed message bar */}
{isFailed && (
  <FailedMessageBar
    tempId={(message as any)._tempId}
    conversationId={message.conversationId}
    content={message.content}
    originalLanguage={message.originalLanguage}
    replyToId={message.replyToId}
    onRetry={handleRetryMessage}
    onCancel={handleCancelMessage}
    t={t}
  />
)}
```

- [ ] **Step 2: Add retry and cancel handlers in the parent component**

In ConversationLayout or the component rendering messages:

```typescript
const handleRetryMessage = useCallback(async (tempId: string, content: string, language: string, replyToId?: string) => {
  if (!selectedConversation) return;
  const conversationId = selectedConversation.id;
  const store = useConversationStore.getState();

  // Remove the failed message
  store.removeOptimisticMessage(conversationId, tempId);

  // Re-create optimistic message and send again
  const optimistic = createOptimisticMessage(
    content, user!.id, conversationId, language, replyToId,
    { id: user!.id, username: user!.username, displayName: user!.displayName || user!.username, avatar: user!.avatar }
  );
  store.addOptimisticMessage(conversationId, optimistic);

  try {
    const success = await sendMessageViaSocket(content, language, replyToId);
    if (!success) {
      store.markMessageFailed(conversationId, optimistic._tempId);
    }
  } catch {
    store.markMessageFailed(conversationId, optimistic._tempId);
  }
}, [selectedConversation, user, sendMessageViaSocket]);

const handleCancelMessage = useCallback((tempId: string) => {
  if (!selectedConversation) return;
  useConversationStore.getState().removeOptimisticMessage(selectedConversation.id, tempId);
}, [selectedConversation]);
```

- [ ] **Step 3: Pass handlers through to message rendering**

Thread `handleRetryMessage` and `handleCancelMessage` as props through `ConversationMessages` → `MessagesDisplay` → individual message components.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/common/BubbleMessage.tsx apps/web/components/common/messages-display.tsx apps/web/components/conversations/ConversationLayout.tsx apps/web/components/conversations/ConversationMessages.tsx
git commit -m "feat(web): integrate FailedMessageBar and sending indicator in message rendering"
```

---

### Task 6: Make REST fallback transparent

**Files:**
- Modify: `apps/web/services/socketio/messaging.service.ts`

- [ ] **Step 1: Remove REST fallback toast**

In `messaging.service.ts`, find the `sendMessageViaRest()` method (around line 307):

```typescript
// REMOVE this line:
toast.success('Message envoyé (connexion alternative)');
// REPLACE with silent log:
logger.info('[MessagingService]', 'Message sent via REST fallback');
```

- [ ] **Step 2: Remove error toast from sendMessage**

In the `sendMessage()` method catch block (around line 236):

```typescript
// REMOVE:
toast.error('Error sending message');
// The optimistic UI handles failure display now
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/services/socketio/messaging.service.ts
git commit -m "fix(web): make REST fallback transparent — no toast on fallback or failure"
```

---

## Chunk 2: CallManager Socket Fix

### Task 7: Fix CallManager useEffect dependency storm

**Files:**
- Modify: `apps/web/components/video-call/CallManager.tsx`

The problem: 6 `handle*` callbacks in the dependency array cause the useEffect to re-fire on every render, creating dozens of parallel retry chains.

Fix: Store handlers in refs so the useEffect only depends on `user?.id` and `isChecking`. Also listen to socket `connect` event instead of polling.

- [ ] **Step 1: Replace handler dependencies with refs**

At the top of the CallManager component (around line 350), add refs:

```typescript
const handleIncomingCallRef = useRef(handleIncomingCall);
const handleParticipantJoinedRef = useRef(handleParticipantJoined);
const handleParticipantLeftRef = useRef(handleParticipantLeft);
const handleCallEndedRef = useRef(handleCallEnded);
const handleMediaToggleRef = useRef(handleMediaToggle);
const handleCallErrorRef = useRef(handleCallError);

// Keep refs in sync
useEffect(() => {
  handleIncomingCallRef.current = handleIncomingCall;
  handleParticipantJoinedRef.current = handleParticipantJoined;
  handleParticipantLeftRef.current = handleParticipantLeft;
  handleCallEndedRef.current = handleCallEnded;
  handleMediaToggleRef.current = handleMediaToggle;
  handleCallErrorRef.current = handleCallError;
});
```

- [ ] **Step 2: Rewrite the useEffect with stable dependencies**

Replace the entire useEffect (lines 391-542) with a version that:
- Only depends on `user?.id` and `isChecking`
- Uses `.current` refs for handlers
- Listens to socket `connect` event to know when it's ready (no polling)
- Uses a single attempt + socket event listener instead of a retry loop

```typescript
useEffect(() => {
  if (isChecking || !user?.id) return;

  let isSubscribed = true;
  let debugListenerRef: ((eventName: string, ...args: any[]) => void) | null = null;

  const attachListeners = (socket: any) => {
    if (!isSubscribed || !socket?.connected) return;

    // Cleanup existing listeners
    socket.off(SERVER_EVENTS.CALL_INITIATED);
    socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
    socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT);
    socket.off(SERVER_EVENTS.CALL_ENDED);
    socket.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED);
    socket.off(SERVER_EVENTS.CALL_ERROR);
    if (debugListenerRef) socket.offAny(debugListenerRef);

    // Debug listener
    debugListenerRef = (eventName: string, ...args: any[]) => {
      if (eventName.startsWith('call:')) {
        console.log('📡 [CallManager] Socket event:', eventName, args);
      }
    };
    socket.onAny(debugListenerRef);

    // Attach via refs (stable references)
    socket.on(SERVER_EVENTS.CALL_INITIATED, (...args: any[]) => handleIncomingCallRef.current(...args));
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, (...args: any[]) => handleParticipantJoinedRef.current(...args));
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, (...args: any[]) => handleParticipantLeftRef.current(...args));
    socket.on(SERVER_EVENTS.CALL_ENDED, (...args: any[]) => handleCallEndedRef.current(...args));
    socket.on(SERVER_EVENTS.CALL_MEDIA_TOGGLED, (...args: any[]) => handleMediaToggleRef.current(...args));
    socket.on(SERVER_EVENTS.CALL_ERROR, (...args: any[]) => handleCallErrorRef.current(...args));

    console.log('✅ [CallManager] All call listeners registered', {
      socketId: socket.id,
      userId: user?.id,
      listenersCount: 6
    });
  };

  // Try immediately if socket already connected
  const socket = meeshySocketIOService.getSocket();
  if (socket?.connected) {
    attachListeners(socket);
  }

  // Listen for future connections
  const onConnect = () => {
    const s = meeshySocketIOService.getSocket();
    if (s) attachListeners(s);
  };
  socket?.on('connect', onConnect);

  return () => {
    isSubscribed = false;
    const s = meeshySocketIOService.getSocket();
    if (s) {
      s.off('connect', onConnect);
      if (debugListenerRef) s.offAny(debugListenerRef);
      s.off(SERVER_EVENTS.CALL_INITIATED);
      s.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
      s.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT);
      s.off(SERVER_EVENTS.CALL_ENDED);
      s.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED);
      s.off(SERVER_EVENTS.CALL_ERROR);
    }
  };
}, [user?.id, isChecking]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/video-call/CallManager.tsx
git commit -m "fix(web): stabilize CallManager socket listeners — eliminate retry spam"
```

---

## Chunk 3: Remove hardcoded strings in messaging service

### Task 8: i18n for messaging service error messages

**Files:**
- Modify: `apps/web/services/socketio/messaging.service.ts`

- [ ] **Step 1: Remove all hardcoded toast messages**

Search for hardcoded strings in `messaging.service.ts` and either remove them (since optimistic UI handles display now) or replace with logger calls:

- Line ~156: `"Socket not connected"` → logger only (no toast)
- Line ~236: `"Error sending message"` → remove toast (optimistic UI)
- Line ~307: `"Message envoyé (connexion alternative)"` → remove toast (already done in Task 6)
- Line ~327: `"Timeout: Server did not respond in time"` → logger only

- [ ] **Step 2: Commit**

```bash
git add apps/web/services/socketio/messaging.service.ts
git commit -m "fix(web): remove hardcoded toast messages from messaging service"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run TypeScript type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 2: Run tests**

```bash
cd apps/web && npm test
```

- [ ] **Step 3: Manual verification checklist**
- Open browser, navigate to conversation
- Type a message and hit Enter
- Verify: message appears IMMEDIATELY in conversation with slight opacity
- Verify: input field is cleared
- Verify: attachments are cleared
- Disconnect network / stop gateway
- Send a message
- Verify: message appears then shows failed bar (⚠️ Échec · Réessayer · Supprimer)
- Click Retry → message is re-sent
- Click Supprimer → message is removed
- Verify: no CallManager retry spam in console
- Verify: no toast on REST fallback

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(web): optimistic messaging with inline retry/cancel — complete"
```
