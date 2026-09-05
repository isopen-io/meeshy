# packages/shared - Shared Types & Schema

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

## Purpose
Single source of truth for TypeScript types, Prisma schema, encryption, validation, and Socket.IO event definitions shared across all services.

## Structure
```
types/              → 46+ TypeScript type files
  index.ts          → Public API exports
  socketio-events.ts → Facade: re-exporte socketio-events/ (adresse stable)
  socketio-events/   → Un fichier par domaine + event-names.ts (constantes)
                       et event-maps.ts (ServerToClient/ClientToServer)
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

## Schema Field Notes

### `Conversation.firstMessageSentAt: DateTime?`
`null` on a `direct` conversation means no message has been sent yet — the DM stays silent/invisible to every participant except its creator until the first message flips the field (see `services/gateway/decisions.md` § "Un DM direct créé sans message reste silencieux jusqu'au premier envoi", 2026-08-10). Non-`direct` conversations never set this field.

**Absent vs `null` trap**: this field was added by migration and never backfilled — every `Conversation` document created before 2026-08-10 has the field **ABSENT**, not `null`. On the MongoDB connector, Prisma's `{ firstMessageSentAt: null }` matches ONLY documents where the field is present-and-null; it does NOT match documents where the field is absent. Crucially, negating it does not fix this: `NOT: { firstMessageSentAt: null }` ALSO excludes absent-field documents on this connector (Prisma wraps scalar filters, negated or not, so absent-field documents never match either form) — it only matches documents where the field is explicitly present-and-non-null. A query deciding DM visibility therefore MUST be written as an OR of both cases: `OR: [{ NOT: { firstMessageSentAt: null } }, { firstMessageSentAt: { isSet: false } }]` (already-set ⇒ visible OR absent-legacy ⇒ visible) — same idiom as `deletedForMe` in `services/gateway/src/routes/conversations/core.ts`. A bare positive `firstMessageSentAt: null` check alone would incorrectly hide every pre-migration conversation, and a bare `NOT: { firstMessageSentAt: null }` alone would incorrectly hide them too (this was a real pre-merge bug, corrected 2026-08-10). The guarded writes that flip the field on first message (the null-guard CAS pattern) correctly use the positive form instead, since they intentionally target ONLY conversations that had the field explicitly initialized to `null` at creation time — a legacy conversation with the field absent is not a candidate for the flip and does not need one (it's already visible via the OR-based read-side check above).

## Socket.IO Event Convention
**Format**: `entity:action-word` (colons + hyphens, NEVER underscores)

```typescript
// packages/shared/types/socketio-events/event-names.ts
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
- **No redundant boolean + timestamp pairs** - use nullable `DateTime?`: `null` = false, non-null = true with timestamp (e.g. `deletedAt` NOT `isDeleted` + `deletedAt`)

## Adding New Types
1. Create file in `types/new-type.ts`
2. Export from `types/index.ts`
3. Add JSDoc + `@see schema.prisma` reference
4. Use `readonly` properties
5. Run `npm run build` in shared/

## Adding Socket.IO Events
1. Add constant to `SERVER_EVENTS` or `CLIENT_EVENTS` in `types/socketio-events/event-names.ts`
2. Define data interface (e.g., `ReactionUpdateEventData`) in `types/socketio-events/<domaine>.ts`
3. Add to `ServerToClientEvents` or `ClientToServerEvents` in `types/socketio-events/event-maps.ts`
   (le SEUL fichier qui cite tous les domaines — c'est l'assemblage, pas un domaine)
4. Use pattern: `entity:action-word`

**`SERVER_EVENTS` ou `CLIENT_EVENTS`, pas les deux** — sauf si les DEUX sens
existent réellement, c'est-à-dire s'il existe à la fois un émetteur client et un
`socket.on(...)` côté gateway pour l'accueillir. Déclarer un nom dans les deux
maps « au cas où » fabrique un contrat que rien n'honore : `user:status` y a
figuré des deux côtés alors que c'est un événement SERVEUR→client pur (la
présence est DÉRIVÉE par le backend depuis `isOnline` + `lastActiveAt`, cf.
`utils/user-presence.ts` — aucun client ne l'annonce), retiré au cycle 60. Une
déclaration parasite comme celle-là est aussi ce qui empêche d'écrire un garde
« tout `CLIENT_EVENTS` a un handler gateway » sans liste d'exemptions.

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

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : UNE définition par type et par règle (maintenabilité — les résolveurs de Prisme sont des sites uniques), compatibilité ascendante des types lus par les trois clients, Zod à chaque frontière de confiance (sécurité), aucune jumelle divergente (cohérence).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
