# Messaging Service - Modular Architecture

## Overview

The MessagingService has been refactored from a monolithic 1,315-line file into a clean, modular architecture with strong composition and type safety.

## Structure

```
src/services/messaging/
├── MessagingService.ts       # Orchestrator (357 lines)
├── MessageValidator.ts       # Validation logic (315 lines)
├── MessageProcessor.ts       # Processing logic (629 lines)
└── index.ts                  # Public exports (8 lines)
```

**Total: 1,309 lines** (vs 1,315 original)

## Module Responsibilities

### MessagingService (Orchestrator)
- **Purpose**: Main entry point and orchestration layer
- **Responsibilities**:
  - Request handling and flow orchestration
  - Authentication context creation
  - Sender ID resolution
  - Response generation
  - Statistics and translation queueing
- **Dependencies**: Uses MessageValidator and MessageProcessor via composition
- **Lines**: 357

### MessageValidator
- **Purpose**: All validation and permission checking logic
- **Responsibilities**:
  - Request validation (content, attachments, anonymous fields)
  - Permission checking (registered users, anonymous users, global conversations)
  - Conversation ID resolution
  - Language detection
- **Lines**: 315
- **Key Methods**:
  - `validateRequest()`: Full request validation
  - `checkPermissions()`: Permission verification with auth context
  - `resolveConversationId()`: Handle both MongoDB IDs and identifiers
  - `detectLanguage()`: Auto-detect content language

### MessageProcessor
- **Purpose**: Message content processing and persistence
- **Responsibilities**:
  - Link processing (tracking links, markdown, URL handling)
  - Message encryption (server, e2ee, hybrid modes)
  - Message persistence with relations
  - Mention processing and notifications
  - Tracking link updates
- **Lines**: 629
- **Key Methods**:
  - `saveMessage()`: Persist message with all relations
  - `processLinksInContent()`: Handle link tracking rules
  - `getEncryptionContext()`: Determine encryption strategy
  - `processMentions()`: Extract and validate user mentions

## Design Principles

### 1. Strong Composition
Each module has a clear, single responsibility. The orchestrator composes the validator and processor rather than inheriting from them.

```typescript
class MessagingService {
  private validator: MessageValidator;
  private processor: MessageProcessor;

  constructor(prisma, translationService, notificationService?) {
    this.validator = new MessageValidator(prisma);
    this.processor = new MessageProcessor(prisma, notificationService);
  }
}
```

### 2. Type Safety
All modules use strict TypeScript types from `@meeshy/shared/types`:
- `MessageRequest`
- `MessageResponse`
- `MessageValidationResult`
- `MessagePermissionResult`
- `AuthenticationContext`

### 3. Selective Exports
Only the main service classes are exported via `index.ts`. Internal implementation details remain encapsulated.

```typescript
// index.ts
export { MessagingService } from './MessagingService';
export { MessageValidator } from './MessageValidator';
export { MessageProcessor } from './MessageProcessor';
```

### 4. Backward Compatibility
The original `src/services/MessagingService.ts` now re-exports the modular service, maintaining compatibility with all existing imports:

```typescript
// src/services/MessagingService.ts
export { MessagingService } from './messaging/MessagingService';
```

## Migration Guide

### For New Code
Import from the messaging module directly:

```typescript
import { MessagingService } from './services/messaging';
// or
import { MessagingService } from './services/messaging/MessagingService';
```

### For Existing Code
No changes required. All existing imports continue to work:

```typescript
import { MessagingService } from './services/MessagingService';
```

## Testing

All existing tests continue to work without modification due to backward-compatible re-exports:

- `src/__tests__/unit/services/MessagingService.test.ts`
- `src/__tests__/integration/dma-encryption-interop.test.ts`
- `src/__tests__/integration/e2ee-full-flow.test.ts`
- `src/__tests__/e2ee/encryption-full-flow.test.ts`

## Key Features Preserved

### Authentication Support
- JWT tokens (registered users)
- Session tokens (anonymous users)
- Robust authentication context handling

### Encryption Modes
- E2EE (end-to-end encryption - client-side)
- Server-side encryption
- Hybrid mode (both layers)

### Link Processing Rules
1. Markdown `[text](url)` → Normal link (no tracking)
2. Raw URLs → No automatic tracking
3. `[[url]]` → Force tracking → `m+token`
4. `<url>` → Force tracking → `m+token`

### Mention System
- Extract mentions from content (`@username`)
- Frontend-provided mention IDs (preferred)
- Permission validation
- Batch notification creation

## Performance Optimizations

### Parallel Operations
The orchestrator executes independent operations in parallel where possible.

### Efficient Queries
- Batch operations for mentions
- Optimized link tracking updates
- Conditional relation loading

### Caching Strategy
Link tokens are reused within the same message to avoid duplicate tracking entries.

## Error Handling

Each module implements comprehensive error handling:
- Validation errors return structured error objects
- Processing errors are logged but don't block message creation
- Graceful degradation (e.g., mention processing failures)

## Future Enhancements

### Potential Further Refactoring
If modules exceed 800 lines in the future:

1. **MessageProcessor** could be split into:
   - `LinkProcessor`: Link tracking logic
   - `EncryptionProcessor`: Encryption handling
   - `MentionProcessor`: Mention extraction and notifications

2. **MessageValidator** could extract:
   - `PermissionChecker`: Permission verification logic
   - `RequestValidator`: Input validation

### Recommended Practices
- Keep each module under 800 lines
- Maintain single responsibility
- Use composition over inheritance
- Export only public interfaces
- Document complex logic inline

## Architecture Benefits

✅ **Maintainability**: Each module has a clear, focused purpose
✅ **Testability**: Smaller modules are easier to unit test
✅ **Readability**: Reduced cognitive load with <800 line modules
✅ **Reusability**: Validator and Processor can be used independently
✅ **Type Safety**: Strong typing throughout with no `any` types
✅ **Backward Compatibility**: Zero breaking changes for existing code

## Related Services

The messaging module integrates with:
- `MessageTranslationService`: Translation queueing
- `MessageReadStatusService`: Read status tracking
- `TrackingLinkService`: URL tracking
- `MentionService`: User mention handling
- `EncryptionService`: Message encryption
- `NotificationService`: User notifications
- `ConversationStatsService`: Conversation statistics

## Support

For questions or issues with the messaging module:
1. Check this README
2. Review inline code documentation
3. Examine test files for usage examples
