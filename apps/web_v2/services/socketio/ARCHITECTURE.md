# Socket.IO Services Architecture

## Overview
This document describes the refactored Socket.IO service architecture for Meeshy.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    meeshy-socketio.service.ts                   │
│                  (Backward Compatibility Facade)                │
│                                                                  │
│  • Maintains existing public API                                │
│  • Delegates all operations to SocketIOOrchestrator             │
│  • Converts SocketIOMessage → Message                           │
│  • Handles auto-join logic                                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ delegates to
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SocketIOOrchestrator                         │
│                  (Service Coordination Layer)                   │
│                                                                  │
│  • Coordinates all specialized services                         │
│  • Provides unified API                                         │
│  • Manages message converter                                    │
│  • Handles service lifecycle                                    │
└───────────┬─────────────────────────────────────────────────────┘
            │
            │ manages
            ▼
┌───────────────────────────────────────────────────────────────────┐
│                      Specialized Services                         │
└───────────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│  ConnectionService   │  │  MessagingService    │
├──────────────────────┤  ├──────────────────────┤
│ • Socket lifecycle   │  │ • Send messages      │
│ • Authentication     │  │ • Edit messages      │
│ • Reconnection       │  │ • Delete messages    │
│ • Join/leave conv    │  │ • Encryption/decrypt │
│ • Event listeners    │  │ • Message listeners  │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│   TypingService      │  │  PresenceService     │
├──────────────────────┤  ├──────────────────────┤
│ • Start typing       │  │ • User status        │
│ • Stop typing        │  │ • Conversation stats │
│ • Typing timeouts    │  │ • Online users       │
│ • Typing users map   │  │ • Reactions          │
│ • Event listeners    │  │ • Read receipts      │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐
│ TranslationService   │
├──────────────────────┤
│ • Text translations  │
│ • Audio translations │
│ • Translation cache  │
│ • Deduplication      │
│ • Event listeners    │
└──────────────────────┘
```

## Service Responsibilities

### ConnectionService (624 lines)
**Domain**: Socket.IO connection lifecycle

**Responsibilities**:
- Initialize Socket.IO connection with authentication
- Handle connection/disconnection events
- Manage reconnection with exponential backoff
- Join/leave conversations
- Handle authentication failures
- Manage current user and conversation state

**Key Methods**:
- `initializeConnection()`: Create and configure socket
- `connect()`: Start connection
- `disconnect()`: Close connection
- `reconnect()`: Force reconnection
- `joinConversation()`: Join conversation room
- `leaveConversation()`: Leave conversation room
- `getConnectionStatus()`: Get connection state
- `getConnectionDiagnostics()`: Get detailed diagnostics

### MessagingService (361 lines)
**Domain**: Message operations

**Responsibilities**:
- Send messages (with/without attachments)
- Edit messages
- Delete messages
- Encrypt/decrypt messages (E2EE)
- Listen to message events (new, edited, deleted)
- Handle message conversion

**Key Methods**:
- `sendMessage()`: Send message with optional encryption
- `editMessage()`: Edit existing message
- `deleteMessage()`: Delete message
- `setEncryptionHandlers()`: Configure E2EE
- `onNewMessage()`: Listen for new messages
- `onMessageEdited()`: Listen for edited messages
- `onMessageDeleted()`: Listen for deleted messages

### TypingService (187 lines)
**Domain**: Typing indicators

**Responsibilities**:
- Start typing indicator
- Stop typing indicator
- Manage typing timeouts
- Track typing users per conversation
- Listen to typing events

**Key Methods**:
- `startTyping()`: Start typing indicator
- `stopTyping()`: Stop typing indicator
- `getTypingUsers()`: Get users typing in conversation
- `onTyping()`: Listen for typing events

**Special Features**:
- 3-second delay before hiding indicator after last keystroke
- 15-second safety timeout to prevent stuck indicators
- Per-user, per-conversation timeout tracking

### PresenceService (166 lines)
**Domain**: User presence and statistics

**Responsibilities**:
- Track user online/offline status
- Monitor conversation statistics
- Handle reactions (add/remove)
- Manage read receipts
- Track conversation joined events

**Key Methods**:
- `onUserStatus()`: Listen for user status changes
- `onConversationStats()`: Listen for conversation statistics
- `onReactionAdded()`: Listen for reaction additions
- `onReactionRemoved()`: Listen for reaction removals
- `onConversationJoined()`: Listen for conversation join events

### TranslationService (163 lines)
**Domain**: Message translations

**Responsibilities**:
- Handle text translation events
- Handle audio translation events
- Cache translations
- Deduplicate translation events
- Support both singular and plural translation formats

**Key Methods**:
- `onTranslation()`: Listen for text translations
- `onAudioTranslation()`: Listen for audio translations
- `getCachedTranslation()`: Get cached translation
- `clearCache()`: Clear translation cache

**Special Features**:
- Event deduplication (prevents duplicate translation events)
- LRU-like cache cleanup (keeps last 100 events)
- Support for legacy and new translation event formats

### SocketIOOrchestrator (387 lines)
**Domain**: Service coordination

**Responsibilities**:
- Coordinate all specialized services
- Provide unified API to consumers
- Manage service initialization
- Setup message converter
- Handle auto-join callback
- Aggregate diagnostics

**Key Methods**:
- All public methods from MeeshySocketIOService
- Delegates to appropriate specialized service
- Provides diagnostic aggregation

## Data Flow

### Message Sending Flow
```
User Action
    │
    ▼
meeshySocketIOService.sendMessage()
    │
    ▼
orchestrator.sendMessage()
    │
    ├─> connectionService.ensureConnection()
    │   └─> Initialize if needed
    │
    ├─> connectionService.getSocket()
    │   └─> Get TypedSocket instance
    │
    └─> messagingService.sendMessage()
        ├─> Check encryption
        ├─> Encrypt if needed
        ├─> Emit to server
        └─> Return success/failure
```

### Message Reception Flow
```
Server Event (message:new)
    │
    ▼
messagingService listener
    │
    ├─> Decrypt if encrypted
    │
    ├─> Convert to Message format
    │
    └─> Notify all message listeners
            │
            ▼
        Application components update
```

### Connection Flow
```
setCurrentUser(user)
    │
    ▼
orchestrator.setCurrentUser()
    │
    ▼
connectionService.setCurrentUser()
    │
    ├─> Detect user change
    │   └─> Cleanup old connection if changed
    │
    └─> initializeConnection()
        ├─> Create Socket.IO instance
        ├─> Setup connection listeners
        ├─> Setup all service listeners
        └─> Connect socket
            │
            ▼
        Server authenticates
            │
            ▼
        AUTHENTICATED event
            │
            ▼
        Auto-join conversation
```

## Event Listener Pattern

Each service uses a Set-based listener pattern:

```typescript
// Service maintains listeners
private messageListeners: Set<MessageListener> = new Set();

// Subscribe method returns unsubscribe function
public onNewMessage(listener: MessageListener): UnsubscribeFn {
  this.messageListeners.add(listener);
  return () => this.messageListeners.delete(listener);
}

// Notify all listeners
private notifyListeners(message: Message): void {
  this.messageListeners.forEach(listener => listener(message));
}
```

**Benefits**:
- Automatic unsubscribe via closure
- No memory leaks
- Type-safe listeners
- Easy to count listeners for diagnostics

## Type Safety

### Typed Socket
```typescript
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
```

All services use `TypedSocket` for full type safety on Socket.IO events.

### Listener Types
```typescript
export type MessageListener = (message: Message) => void;
export type TypingListener = (event: TypingEvent) => void;
export type UserStatusListener = (event: UserStatusEvent) => void;
// ... etc
```

Type-safe listener signatures prevent runtime errors.

### Unsubscribe Function
```typescript
export type UnsubscribeFn = () => void;
```

Standard pattern for all event listeners.

## Error Handling

### Connection Errors
- Exponential backoff for reconnection attempts
- Maximum retry attempts (5 by default)
- Authentication failure handling with logout
- Timeout protection for stuck connections

### Message Errors
- Encryption failures fallback to plaintext indicator
- Decryption failures show error message
- Timeout protection for message sending (10 seconds)
- Toast notifications for user feedback

### Service Isolation
Each service handles its own errors without affecting others:
- MessagingService: Handles message send/edit/delete failures
- TypingService: Handles typing timeout cleanup
- TranslationService: Handles cache errors
- PresenceService: Handles stats update failures

## Performance Considerations

### Lazy Initialization
- Services created on first use
- Socket connection delayed until needed
- Message converter set up once

### Memory Management
- Listeners stored in Sets (O(1) add/remove)
- Translation cache has size limit (100 events)
- Timeouts properly cleaned up
- Event deduplication prevents duplicate processing

### Bundle Size
- Tree-shakeable architecture
- Specialized services can be imported individually
- No circular dependencies
- Smaller initial bundle (backward compat wrapper is small)

## Testing Strategy

### Unit Tests
Each service can be tested in isolation:

```typescript
describe('MessagingService', () => {
  let service: MessagingService;
  let mockSocket: jest.Mocked<TypedSocket>;

  beforeEach(() => {
    service = new MessagingService();
    mockSocket = createMockSocket();
  });

  it('should send message with encryption', async () => {
    // Test implementation
  });
});
```

### Integration Tests
Test orchestrator coordination:

```typescript
describe('SocketIOOrchestrator', () => {
  it('should coordinate message sending across services', async () => {
    // Test implementation
  });
});
```

## Migration Path

### Phase 1: Current (Backward Compatible)
```typescript
// Existing code continues to work
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
meeshySocketIOService.sendMessage(...);
```

### Phase 2: Future (Direct Orchestrator)
```typescript
// New code can use orchestrator directly
import { SocketIOOrchestrator } from '@/services/socketio';
const orchestrator = SocketIOOrchestrator.getInstance();
orchestrator.sendMessage(...);
```

### Phase 3: Specialized Services (Optional)
```typescript
// For advanced use cases
import { MessagingService, TypingService } from '@/services/socketio';
const messaging = new MessagingService();
const typing = new TypingService();
```

## Extensibility

### Adding New Domains
1. Create new service in `socketio/`
2. Implement service with single responsibility
3. Add to orchestrator
4. Export from `index.ts`
5. Add backward compat methods if needed

### Adding New Events
1. Add event to appropriate specialized service
2. Add listener method to service
3. Expose via orchestrator if public API
4. Update types in `types.ts`

## Monitoring & Observability

### Diagnostics Available
```typescript
const diagnostics = orchestrator.getConnectionDiagnostics();
// Returns:
// {
//   isConnected: boolean,
//   hasSocket: boolean,
//   hasToken: boolean,
//   url: string,
//   socketId: string,
//   transport: string,
//   reconnectAttempts: number,
//   currentUser: string,
//   listenersCount: {
//     message: number,
//     edit: number,
//     delete: number,
//     translation: number,
//     typing: number,
//     status: number
//   }
// }
```

### Logging Points
- Connection state changes
- Authentication events
- Message encryption/decryption
- Service initialization
- Error conditions

## Conclusion

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Single Responsibility Principle
- ✅ Type safety throughout
- ✅ Easy testing and maintenance
- ✅ Backward compatibility
- ✅ Performance optimization
- ✅ Extensibility for future features
