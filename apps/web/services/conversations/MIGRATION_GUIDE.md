# Conversations Service - Migration Guide

## Quick Start

No migration needed! The refactored service maintains 100% backward compatibility.

```typescript
// Your existing code continues to work
import { conversationsService } from '@/services/conversations.service';

const { conversations } = await conversationsService.getConversations();
```

## What Changed?

### File Structure

**Before:**
```
services/
└── conversations.service.ts (1054 lines)
```

**After:**
```
services/
├── conversations.service.ts (23 lines) ← Legacy wrapper
└── conversations/
    ├── index.ts (237 lines)              ← Main facade
    ├── types.ts (186 lines)              ← Types
    ├── cache.service.ts (156 lines)      ← Caching
    ├── crud.service.ts (183 lines)       ← CRUD ops
    ├── messages.service.ts (161 lines)   ← Messages
    ├── participants.service.ts (164 lines) ← Participants
    ├── links.service.ts (117 lines)      ← Links
    ├── transformers.service.ts (429 lines) ← Transformers
    └── README.md                         ← Documentation
```

## Import Options

### Option 1: No Change (Recommended for existing code)

```typescript
import { conversationsService } from '@/services/conversations.service';
```

### Option 2: New Path (Recommended for new code)

```typescript
import { conversationsService } from '@/services/conversations';
```

### Option 3: Direct Service Access (Advanced)

```typescript
import { conversationsCrudService } from '@/services/conversations/crud.service';
import { messagesService } from '@/services/conversations/messages.service';
import { participantsService } from '@/services/conversations/participants.service';
import { linksService } from '@/services/conversations/links.service';
```

## Available Services

### 1. CRUD Service

```typescript
import { conversationsCrudService } from '@/services/conversations/crud.service';

// Get all conversations
const { conversations, pagination } = await conversationsCrudService.getConversations({
  limit: 20,
  offset: 0,
  type: 'direct',
  withUserId: 'user-123'
});

// Get single conversation
const conversation = await conversationsCrudService.getConversation('conv-id');

// Create conversation
const newConv = await conversationsCrudService.createConversation({
  title: 'My Conversation',
  type: 'group',
  participantIds: ['user1', 'user2']
});

// Update conversation
const updated = await conversationsCrudService.updateConversation('conv-id', {
  title: 'New Title'
});

// Delete conversation
await conversationsCrudService.deleteConversation('conv-id');

// Search conversations
const results = await conversationsCrudService.searchConversations('query');

// Get conversations with specific user
const directConvs = await conversationsCrudService.getConversationsWithUser('user-id');
```

### 2. Messages Service

```typescript
import { messagesService } from '@/services/conversations/messages.service';

// Get messages
const { messages, total, hasMore } = await messagesService.getMessages(
  'conv-id',
  1,  // page
  20  // limit
);

// Send message
const message = await messagesService.sendMessage('conv-id', {
  content: 'Hello!',
  messageType: 'text',
  originalLanguage: 'en'
});

// Mark as read
await messagesService.markAsRead('conv-id');

// Mark all as read
const { markedCount } = await messagesService.markConversationAsRead('conv-id');
```

### 3. Participants Service

```typescript
import { participantsService } from '@/services/conversations/participants.service';

// Get participants
const participants = await participantsService.getParticipants('conv-id', {
  onlineOnly: true,
  role: 'ADMIN',
  search: 'john',
  limit: 10
});

// Get all participants (auth + anonymous)
const { authenticatedParticipants, anonymousParticipants } =
  await participantsService.getAllParticipants('conv-id');

// Add participant
await participantsService.addParticipant('conv-id', 'user-id');

// Remove participant
await participantsService.removeParticipant('conv-id', 'user-id');

// Update role
await participantsService.updateParticipantRole('conv-id', 'user-id', 'ADMIN');
```

### 4. Links Service

```typescript
import { linksService } from '@/services/conversations/links.service';

// Create invite link
const link = await linksService.createInviteLink('conv-id', {
  name: 'My Invite Link',
  description: 'Join our conversation',
  maxUses: 100,
  expiresAt: '2024-12-31',
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  requireNickname: true
});

// Create conversation with link
const conversationLink = await linksService.createConversationWithLink({
  name: 'New Conversation',
  maxUses: 50
});
```

### 5. Cache Service

```typescript
import { cacheService } from '@/services/conversations/cache.service';

// Check cache validity
const isValid = cacheService.isConversationsCacheValid();

// Get from cache
const cached = cacheService.getConversationsFromCache();

// Set cache
cacheService.setConversationsCache(conversations);

// Invalidate caches
cacheService.invalidateConversationsCache();
cacheService.invalidateMessagesCache('conv-id');
cacheService.invalidateParticipantsCache('cache-key');
cacheService.invalidateAllCaches();
```

### 6. Transformers Service

```typescript
import { transformersService } from '@/services/conversations/transformers.service';

// Transform backend data to frontend format
const message = transformersService.transformMessageData(backendMessage);
const conversation = transformersService.transformConversationData(backendConv);

// Map types and roles
const convType = transformersService.mapConversationType('group');
const visibility = transformersService.mapConversationVisibility('public');
const role = transformersService.mapUserRoleToString('ADMIN');
```

## Type Definitions

### Import Types

```typescript
import type {
  ParticipantsFilters,
  GetConversationsOptions,
  GetConversationsResponse,
  GetMessagesResponse,
  AllParticipantsResponse,
  CreateLinkData,
  MarkAsReadResponse,
} from '@/services/conversations/types';
```

### Using Types

```typescript
// Conversations options
const options: GetConversationsOptions = {
  limit: 20,
  offset: 0,
  skipCache: false,
  type: 'direct',
  withUserId: 'user-123'
};

// Participants filters
const filters: ParticipantsFilters = {
  onlineOnly: true,
  role: 'ADMIN',
  search: 'john',
  limit: 10
};

// Link data
const linkData: CreateLinkData = {
  name: 'Invite Link',
  maxUses: 100,
  expiresAt: '2024-12-31',
  allowAnonymousMessages: true
};
```

## Cache Strategy

### Cache TTLs

```typescript
// Conversations: 2 minutes
// Messages: 1 minute
// Participants: 30 seconds
```

### Automatic Cache Invalidation

```typescript
// Conversations cache invalidated on:
- createConversation()
- updateConversation()
- deleteConversation()

// Messages cache invalidated on:
- sendMessage()

// Participants cache invalidated on:
- addParticipant()
- removeParticipant()
- updateParticipantRole()
```

### Manual Cache Control

```typescript
// Via facade
conversationsService.invalidateAllCaches();
conversationsService.invalidateConversationsCache();
conversationsService.invalidateMessagesCache(conversationId);
conversationsService.invalidateParticipantsCache(cacheKey);

// Direct cache service
import { cacheService } from '@/services/conversations/cache.service';
cacheService.invalidateAllCaches();
```

## React Query Integration (Future)

The service is designed to work seamlessly with React Query:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { conversationsCrudService } from '@/services/conversations/crud.service';

// Query conversations
function useConversations(options: GetConversationsOptions) {
  return useQuery({
    queryKey: ['conversations', options],
    queryFn: () => conversationsCrudService.getConversations(options),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Mutation to create conversation
function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: conversationsCrudService.createConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
```

## Error Handling

All services throw standard errors that can be caught and handled:

```typescript
try {
  const conversation = await conversationsService.getConversation('conv-id');
} catch (error) {
  if (error instanceof Error) {
    console.error('Failed to fetch conversation:', error.message);
  }
}
```

### Common Errors

```typescript
// Conversation not found
throw new Error('Conversation non trouvée');

// Permission denied
throw new Error('Vous n\'avez pas les permissions nécessaires');

// Invalid response
throw new Error('Format de réponse invalide');

// Request cancelled
throw new Error('REQUEST_CANCELLED');
```

## Testing

### Mocking Services

```typescript
import { conversationsService } from '@/services/conversations';

jest.mock('@/services/conversations', () => ({
  conversationsService: {
    getConversations: jest.fn(),
    getMessages: jest.fn(),
    // ... other methods
  }
}));

// In test
(conversationsService.getConversations as jest.Mock).mockResolvedValue({
  conversations: [...],
  pagination: { ... }
});
```

### Test Cache Access

```typescript
// Clear cache before tests
beforeEach(() => {
  (conversationsService as any).conversationsCache = null;
  (conversationsService as any).messagesCache?.clear();
  (conversationsService as any).participantsCache?.clear();
});
```

## Best Practices

### 1. Use the Facade for Most Cases

```typescript
// Good
import { conversationsService } from '@/services/conversations';
const conversations = await conversationsService.getConversations();

// Only use direct services when you need fine-grained control
import { messagesService } from '@/services/conversations/messages.service';
```

### 2. Leverage Caching

```typescript
// Good - uses cache
const convs1 = await conversationsService.getConversations();
const convs2 = await conversationsService.getConversations(); // Cached

// Skip cache only when necessary
const fresh = await conversationsService.getConversations({ skipCache: true });
```

### 3. Handle Errors Gracefully

```typescript
try {
  const messages = await conversationsService.getMessages(conversationId);
} catch (error) {
  if (error.message === 'REQUEST_CANCELLED') {
    // User navigated away, ignore
    return;
  }
  // Handle other errors
  toast.error('Failed to load messages');
}
```

### 4. Use Filters to Reduce Load

```typescript
// Good - filter on backend
const directConvs = await conversationsService.getConversations({
  type: 'direct',
  limit: 10
});

// Bad - load all then filter on frontend
const all = await conversationsService.getConversations();
const direct = all.conversations.filter(c => c.type === 'direct');
```

## Breaking Changes

**None.** This refactoring is 100% backward compatible.

## Support

For issues or questions:
1. Check the [README.md](./README.md) for detailed documentation
2. Review the inline code comments in each service
3. Run tests to verify functionality: `npm test -- __tests__/services/conversations.service.test.ts`

## Summary

The conversations service refactoring provides:

✅ Better maintainability through separation of concerns
✅ Improved testability with focused, single-purpose services
✅ Enhanced type safety with centralized type definitions
✅ Optimized performance with smart caching
✅ Future-ready architecture for React Query integration
✅ Zero breaking changes - complete backward compatibility

Continue using the service as before, or gradually adopt the new structure as needed.
