# packages/shared - Shared Types & Schema

## Purpose
Single source of truth for TypeScript types, Prisma schema, encryption, validation, and Socket.IO event definitions shared across all services.

## Structure
```
types/              → 46+ TypeScript type files
  index.ts          → Public API exports
  socketio-events.ts → Event names, rooms, server/client events
  message.ts        → GatewayMessage, UIMessage types
  conversation.ts   → Conversation + related types
  user.ts           → User types
  preferences/      → User preference types
utils/              → Validation, errors, language config
  validation.ts     → Zod schemas (CommonSchemas)
  languages.ts      → 60+ language definitions with TTS/STT caps
  errors.ts         → ErrorCode enum + createError helper
encryption/         → Signal Protocol & E2EE
  SharedEncryptionService.ts
  CryptoAdapter.ts
prisma/
  schema.prisma     → MongoDB schema (THE source of truth)
  client/           → Generated Prisma client
```

## Socket.IO Event Convention
**Format**: `entity:action-word` (colons + hyphens, NEVER underscores)

```typescript
// packages/shared/types/socketio-events.ts
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  REACTION_ADDED: 'reaction:added',
  TYPING_START: 'typing:start',
  // ...
};

export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  REACTION_ADD: 'reaction:add',
  // ...
};

export const ROOMS = {
  conversation: (id: string) => `conversation:${id}`,
  user: (id: string) => `user:${id}`,
  feed: (id: string) => `feed:${id}`,
  call: (id: string) => `call:${id}`,
};
```

## Message Types
- **GatewayMessage**: Backend/API model (aligned with Prisma)
- **UIMessage**: Frontend display model (visual state included)
- Convert: `gatewayToUIMessage()`, access: `getDisplayContent(msg, lang)`

## API Response Standard
```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  pagination?: { total, offset, limit, hasMore };
}
```

## Status Types
```typescript
type ProcessStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
type DeliveryStatus = 'sent' | 'delivered' | 'received' | 'read';
type TranslationStatus = ProcessStatus | 'cached';
```

## Role Hierarchy
- Global: BIGBOSS (100) > ADMIN (80) > MODERATOR (60) > AUDIT (40) > ANALYST (30) > USER (10)
- Member: admin > moderator > member

## Validation (Zod)
```typescript
export const CommonSchemas = {
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  conversationType: z.enum(['direct', 'group', 'public', 'global']),
  messageContent: z.string().min(1).max(10000),
  messageType: z.enum(['text', 'image', 'file', 'audio', 'video', 'location', 'system']),
};
```

## Type Safety Rules
- **No `any`** - Use `unknown` with validation
- **All properties `readonly`** where possible
- **Branded types** for sensitive IDs: `type ConversationId = string & { __brand: 'ConversationId' }`
- **JSDoc with `@see schema.prisma`** references
- **Single export location** - avoid duplicating types

## Adding New Types
1. Create file in `types/new-type.ts`
2. Export from `types/index.ts`
3. Add JSDoc + `@see schema.prisma` reference
4. Use `readonly` properties
5. Run `npm run build` in shared/

## Adding Socket.IO Events
1. Add constant to `SERVER_EVENTS` or `CLIENT_EVENTS` in `socketio-events.ts`
2. Define data interface (e.g., `ReactionUpdateEventData`)
3. Add to `ServerToClientEvents` or `ClientToServerEvents` type map
4. Use pattern: `entity:action-word`

## Build
```bash
npm run build   # TypeScript → dist/ (ESM + declarations + source maps)
```
- Entry: `@meeshy/shared` (main index)
- Subpath imports: `@meeshy/shared/types/*`, `@meeshy/shared/utils/*`, `@meeshy/shared/encryption/*`

## Language Support
- 60+ languages with metadata (name, flag, TTS/STT/voice cloning capabilities)
- Helper functions: `getLanguageInfo()`, `getLanguagesWithTTS()`, `getSupportedLanguageCodes()`
- Language mappings for NLLB: `'en' → 'eng_Latn'`, `'fr' → 'fra_Latn'`, etc.

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (TypeScript strict, branded types, type vs interface, Socket.IO events, GatewayMessage vs UIMessage, Zod, encryption DI, ESM, langues, rles, MongoDB/Prisma, API response) avec contexte, alternatives rejetes et consquences.
