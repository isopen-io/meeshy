# services/gateway - Fastify API Gateway

## Tech Stack
- Fastify 5.7 + TypeScript 5.9 (strict: false)
- Socket.IO 4.8 (WebSocket real-time)
- ZeroMQ 6.5 (PUSH/SUB to translator)
- Prisma 6.19 + MongoDB
- ioredis 5.9 (caching)
- @fastify/jwt 9.1 (authentication)
- Signal Protocol (E2EE)
- Sharp (images), fluent-ffmpeg (audio)
- Winston + Pino (structured logging with PII redaction)
- Zod (validation)
- Firebase Admin 13 + APNs (push notifications)

## Project Structure
```
src/
├── server.ts                    → Main entry point (comprehensive setup)
├── env.ts                       → Environment configuration
├── middleware/
│   ├── auth.ts                  → Unified auth (JWT + sessionToken)
│   ├── rate-limiter.ts          → Message & API rate limiting
│   └── validation.ts
├── routes/                      → 50+ route files by feature
│   ├── auth/                    → Login, register, magic link, phone transfer
│   ├── conversations/           → CRUD + messages + search
│   ├── admin/                   → Dashboard, users, reports, analytics
│   ├── posts/                   → Social feed
│   ├── voice-profile/           → Voice analysis, TTS
│   └── signal-protocol/         → E2EE key management
├── services/                    → 56 business logic services
│   ├── message-translation/     → Translation + ZMQ + caching (109KB)
│   ├── zmq-translation/         → ZMQ client orchestration
│   ├── AuthService.ts
│   ├── MessagingService.ts
│   ├── NotificationService.ts
│   ├── EncryptionService.ts
│   └── CacheStore.ts             → Unified cache (Redis + memory fallback)
├── socketio/                    → WebSocket layer
│   ├── MeeshySocketIOManager.ts → Main orchestrator (119KB)
│   ├── handlers/                → Auth, Message, Reaction, Status, Conversation
│   └── CallEventsHandler.ts     → Voice/video calls
├── utils/
│   ├── logger-enhanced.ts       → Pino + PII redaction
│   ├── sanitize.ts              → DOMPurify XSS protection
│   └── circuitBreaker.ts
├── errors/custom-errors.ts      → Typed error hierarchy
└── __tests__/                   → unit, integration, e2ee, performance
```

## Authentication (Unified Auth)
```typescript
// Two types of users share the same middleware:
UnifiedAuthContext {
  type: 'registered' | 'anonymous',
  registeredUser?: RegisteredUser,  // JWT auth
  anonymousUser?: AnonymousUser,    // sessionToken auth
  userId: string,                   // User.id (registered) | Participant.id (anonymous)
  participantId?: string,           // present for anonymous, == userId
  hasFullAccess: boolean,           // true for JWT, false for anon
}
```
- JWT: `Authorization: Bearer {token}`
- Anonymous: `X-Session-Token` header
- Admin: role-based permissions + audit trail

**`authContext.userId` n'est PAS toujours un `User.id`.** Pour un invité de lien
partagé il porte un `Participant.id` (`middleware/auth.ts`) — jamais le jeton de
session, qui ne quitte pas le middleware. C'est délibéré : ce champ nomme la
**room personnelle** de l'appelant (`ROOMS.user(userId ?? id)`, cf. § Room
Organization), et un participant sans ligne `User` en a bien une.

Ne jamais le recopier tel quel dans un champ de payload nommé `userId` : ces
champs déclarent un `User.id` et sont nullables pour ce cas précis
(`ReadStatusUpdatedEventData.userId`, `ReadStatusUpdateEvent` iOS,
`ReadStatusUpdatedEvent` Android). Les deux rôles se dérivent séparément, à
partir d'`isAnonymous` :

```typescript
const actorUserId = isAnonymous ? null : authContext.userId; // champ du contrat
const personalRoomKey = actorUserId ?? membership.id;        // clé de room
```

**Corollaire : une requête `Participant` sur cette clé doit choisir sa COLONNE.**
`where: { userId: readerKey }` ne matche RIEN quand `readerKey` porte un
`Participant.id`, et le symptôme est une liste VIDE, pas une erreur — donc un
`return` silencieux, donc un signal qui disparaît sans trace. Toujours brancher
sur la nature de la clé :

```typescript
where: isAnonymous ? { id: readerKey, isActive: true } : { userId: readerKey, isActive: true }
```

Ne JAMAIS enterrer l'incomplétude sous un `if (!isAnonymous)` au site d'appel :
le gate donne l'omission pour une règle produit, et le brancher plus tard sans
corriger la lecture reste un no-op muet. Cas réel :
`_emitUnreadCountsSnapshot` (cycle 61) a privé de pastille exacte à la
reconnexion TOUTE la population des invités de lien partagé — sans recours sur
iOS/Android, qui n'ont aucun lecteur pour `message:pending-delivered` — alors que
l'instantané de présence, vingt lignes plus haut dans la MÊME méthode, résolvait
déjà les deux identités correctement. `getUnreadCountsForUser` et
`socketio/utils/participant-resolver.ts` sont les références : les deux résolvent
sous les deux colonnes.

## Socket.IO Conventions

### Event Naming: `entity:action-word` (colons + hyphens)
```
Client → Server: message:send, reaction:add, typing:start
Server → Client: message:new, reaction:added, typing:start
```

### Room Organization
```typescript
ROOMS.conversation(id)  // conversation:${id}
ROOMS.user(id)          // user:${id} — id = participant.userId ?? participant.id
ROOMS.feed(id)          // feed:${id}
ROOMS.call(id)          // call:${id}
```

**Room personnelle d'un participant : `userId ?? id`.** Un participant sans ligne
`User` rejoint `ROOMS.user(participant.id)` — l'adresser par `userId` seul saute
une room qui existe. Ne pas réécrire la règle : utiliser `participantUserRooms()`
ou `emitToConversationParticipants()` (`socketio/emitToConversationParticipants.ts`).
Le `select` Prisma doit charger `id` **et** `userId`. Détail et exceptions :
`src/socketio/README.md` § « Quel `id` passer a `ROOMS.user()` ? ».

### Un champ que le client lit AUTORITATIVEMENT n'est plus optionnel pour l'émetteur

Quand un client recopie un champ de payload INCONDITIONNELLEMENT dans son cache, tout émetteur du
même événement qui l'omet **écrit** — il n'est pas muet. Le contrat doit alors porter autant d'états
que l'émetteur a de choses à dire, sans quoi « je n'ai pas calculé » sort sur le fil sous la forme de
« il n'y en a pas », et détruit.

Cas de référence, `conversation:unread-updated` et son pont ✦
(`ConversationUnreadUpdatedEventData.bridge`, 4 émetteurs) :

| forme | phrase | le client |
|-------|--------|-----------|
| `bridge: {…}` | voici le pont de CE lecteur | écrit |
| `bridge: null` | j'ai calculé, il n'y en a pas | efface |
| clé absente | je n'ai pas calculé | garde le sien |

`bridgeComputed()` / `bridgeNotComputed()` (`socketio/unreadBridgeField.ts`) sont les deux seules
façons d'écrire ce champ — un émetteur ne construit jamais l'objet à la main. `bridgeComputed(x)`
déclare un savoir (`x` ou `null`) ; `bridgeNotComputed()` déclare l'ignorance et n'émet aucune clé.
Un `unreadCount` à zéro relève du PREMIER : le contrat gelé §3.2 prouve l'absence de pont sans
ouvrir de requête. Une passe qui TOMBE, ou une conversation hors de la borne de l'instantané de
reconnexion, relèvent du second — se taire ne coûte rien, et `null` y ordonnerait un effacement sur
la foi d'une panne.

Corollaire de lot : **quand on rend un champ autoritatif côté client, on énumère TOUS les émetteurs
serveur du même événement dans le même lot.**

### Connection Maps
```typescript
connectedUsers: Map<string, SocketUser>   // userId → user info
socketToUser: Map<string, string>         // socketId → userId
userSockets: Map<string, Set<string>>     // userId → socketIds (multi-device)
```

### Handler Pattern
```typescript
socket.on(CLIENT_EVENTS.EVENT, async (data, callback) => {
  try {
    const result = await service.doSomething(data);
    callback?.({ success: true, data: result });
    io.to(room).emit(SERVER_EVENTS.RESULT, result);
  } catch (error) {
    console.error('[HANDLER]', error);
    callback?.({ success: false, error: 'Message' });
  }
});
```

## ZMQ Communication
- PUSH to translator port 5555 (send requests)
- SUB from translator port 5558 (receive results)
- Multipart: Frame 1 = JSON metadata, Frames 2+ = binary
- `binaryFrames[0]` = first binary (NOT [1])
- `ZmqSingleton.getInstance()` prevents multiple socket conflicts

### Key ZMQ Events
- `translationCompleted` - Text translation done
- `audioProcessCompleted` - Audio transcription/translation done
- `audioTranslationsProgressive` - Multi-language progressive results
- `transcriptionReady` - Transcription before translation

## Route Pattern
```typescript
export async function routeGroupRoutes(fastify: FastifyInstance) {
  const context = { fastify, service, prisma };
  registerSubRoutes(context);
}

function registerSubRoutes(ctx: Context) {
  ctx.fastify.post('/path', {
    schema,
    preValidation: [auth]
  }, async (req, reply) => {
    const authContext = (req as UnifiedAuthRequest).authContext;
    // logic
  });
}
```

## Service Pattern
```typescript
export class ServiceName {
  constructor(private prisma: PrismaClient) {}
  async method(params): Promise<Result> {
    try { /* logic */ }
    catch (error) { /* log + throw */ }
  }
}
```

**No redundant boolean + timestamp pairs** - use nullable `DateTime?`: `null` = false, non-null = true with timestamp (e.g. `deletedAt` NOT `isDeleted` + `deletedAt`)

## Error Handling
```typescript
// Custom hierarchy
BaseAppError
├── AuthenticationError (401)
├── TokenExpiredError (401)
├── PermissionDeniedError (403)
├── ValidationError (400)
├── NotFoundError (404)
├── ConflictError (409)
├── RateLimitError (429)
└── InternalServerError (500)

// Prisma mapping
P2002 → DuplicateEmailError / DuplicateUsernameError
P2025 → NotFoundError
```

## Rate Limiting
- Global: 300 req/min per IP
- Messages: 20/min per user
- Mentions: max 50 per message, 5/min per recipient
- Status updates: throttled to once per 5 seconds

## Response Format
```typescript
{ success: boolean, error?: { code, message }, data?: T, meta?: { total, page, limit } }
```

## Logging
```typescript
const logger = enhancedLogger.child({ module: 'ServiceName' });
logger.info('message', { userId, conversationId }); // PII auto-redacted
```

## Build & Deploy
- `tsx watch` for dev, `tsc` + `node dist/src/server.js` for prod
- Docker: node:22-alpine build, node:22-slim runtime
- Port 3000
- Healthcheck: `curl http://localhost:${PORT}/health`

## Static Audio Endpoint
Story background audio files are served at:
```
GET /api/v1/static/:filename   (JWT-protected)
```
- Stored in `UPLOAD_DIR` (env var, default `/tmp/meeshy-uploads`)
- Only audio extensions allowed: `.mp3`, `.mp4`, `.wav`, `.m4a`, `.aac`, `.ogg`
- Path traversal is blocked via `path.basename()`
- `Cache-Control: private, max-age=3600`
- Route registered in `routes/posts/audio.ts` alongside the upload route
- URL generated at upload time: `/api/v1/static/${filename}`

## Critical Gotchas
- `emit()` does NOT await Promises - wrap async listeners in try/catch
- **`void p` exige TOUJOURS `p.catch(...)`.** Un `void` DÉTACHE la promesse : le
  `try/catch` qui l'entoure n'attrape qu'un `throw` SYNCHRONE, jamais le rejet de la
  promesse rendue. Un rejet sans écouteur termine le PROCESS sous le
  `--unhandled-rejections=throw` par défaut de Node 22 — toute la gateway tombée pour
  un canal best-effort. Les deux gardes sont disjointes et aucune ne subsume l'autre :
  `try/catch` pour l'APPEL, `.catch` pour la PROMESSE. Ne jamais raisonner « le callee
  avale ses erreurs » : c'est une propriété du collaborateur, pas une garantie du site
  d'appel — et elle est fausse dès que le callee a UNE instruction non gardée avant son
  propre `.catch`. Cf. `tasks/lessons.md` § Leçon 230.
- Audio pipeline only via WS `message:send-with-attachments` (not REST)
- MessageTranslationService emits `translatedAudio` (singular) - check data shape
- Anonymous users have NO encryption
- Admin audit trail required for all admin actions

## Tests — un témoin qui ne peut pas tomber n'est pas un témoin

**Ne JAMAIS ré-implémenter le corps d'une méthode de production dans un helper de
test pour ensuite tester la copie.** Aucune assertion portée par une copie ne peut
passer au ROUGE quand la production change : les deux dérivent en silence et les
témoins continuent d'attester la copie, verts.

Cas réel, supprimé au cycle 62 :
`__tests__/unit/socketio/MeeshySocketIOManager.presenceSnapshot.test.ts` recopiait
`_emitPresenceSnapshot` et `_emitUnreadCountsSnapshot` dans des helpers `*Impl`.
Coût mesuré, en deux temps :

1. La copie avait dérivé sur le point le plus cher du contrat — elle plaçait le
   drain de la file hors-ligne et l'instantané de pastille DANS le `try`, soit
   l'inverse exact de la production, qui les place APRÈS pour qu'un accroc Mongo
   sur l'instantané (cosmétique) n'échoue jamais le rejeu (destructif).
2. Elle a laissé `_emitUnreadCountsSnapshot` priver de pastille toute la
   population des invités de lien partagé pendant des mois AVEC des témoins verts
   (cycle 61) : deux exemplaires du même témoin gelaient le symptôme, et le fix de
   la production n'en a fait tomber aucun.

Le harnais `src/socketio/__tests__/MeeshySocketIOManager.test.ts` construit un
VRAI `MeeshySocketIOManager` (ZMQ / Redis / Firebase déjà mockés par fabriques) :
toute garde de comportement du manager y va. Le prétexte historique de la copie
(« l'import du manager pend en test ») est faux depuis que ce harnais existe.

**Toujours prouver le ROUGE.** Une garde se livre en montrant qu'elle tombe sous
la mutation qu'elle nomme — c'est la seule mesure qui distingue un témoin d'une
décoration.

**Un `.catch` sur promesse détachée se prouve par le runtime, pas par le retour de
l'appelant** (§ Critical Gotchas, `void p`) : la promesse étant abandonnée,
l'appelant résout `undefined` qu'elle soit gardée ou non. Écouter
`process.on('unhandledRejection')` autour de l'appel, puis franchir la phase
« check » (`setImmediate`) — cf. `captureUnhandledRejections` dans le harnais.

## Caching Patterns (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Patterns G1-G7

### Auth User Cache
Auth middleware Prisma query should be cached in Redis (5min TTL).
Invalidate on: profile update, role change, language change.

### ConversationId Cache
`normalizeConversationId` MUST cache identifier→ObjectId mapping in memory (immutable data).

### HTTP Cache-Control
Read-heavy endpoints MUST return `Cache-Control` + `ETag` headers.
Client sends `If-None-Match`, gateway responds 304 if unchanged.

### Response Format
ALL routes MUST use `sendSuccess()`/`sendError()` from `utils/response.ts`.
Pagination is emitted at the ROOT of the response, NOT under `meta` — both
`sendSuccess` (`utils/response.ts:33`) and `sendPaginatedSuccess` (`:56`) assign
`pagination` as a top-level key, and the iOS/web decoders read it there. This
line used to state the opposite, which no route could satisfy while using the
mandated helper.
Errors under `error: { code, message }`, NOT `error: "string"`.

### Language Resolution
ALWAYS use `resolveUserLanguage()` from `@meeshy/shared` for language resolution.
NEVER reimplement the priority order locally.

## Toute porte qui sort un profil de TIERS filtre sa présence

`select: { isOnline: true, lastActiveAt: true }` sur quelqu'un d'AUTRE que
l'appelant n'a qu'une suite légitime : `PresenceVisibilityService`. Aucune route
ne sert ces deux champs bruts — le gate porte les préférences
(`showOnlineStatus` / `showLastSeen`), la désactivation de compte, et le blocage
bidirectionnel, qu'aucune route ne rejoue à la main.

Deux régimes, et la question qui les départage : **le lecteur a-t-il un DROIT sur
cette donnée, ou seulement un lien qu'il a posé tout seul ?**

| régime | méthode | pour |
|---|---|---|
| STRICT | `resolveForTargets` / `resolveForTarget` | découverte : recherche d'utilisateurs, répertoire, profil. Le lien est unilatéral et non vérifié — n'importe qui inscrit n'importe quel numéro dans son téléphone |
| contexte acquis | `resolvePrefsOnly` | co-participants d'une conversation, co-membres d'une communauté : les DEUX parties ont posé le lien. Seules les préférences s'appliquent |

Le viewer se lit par `viewerFromRequest(request)` (`routes/users/presence-gate.ts`) —
jamais depuis `AuthenticatedRequest`, dont le champ `registeredUser` est typé
`boolean` alors que la production y met un objet.

**Un paramètre `viewer` est REQUIS, jamais optionnel** : un appelant sans viewer
passe `null`, ce qui MASQUE. Une porte de confidentialité échoue en montrant
moins, jamais en montrant plus. Même règle sur la carte rendue par
`resolveForTargets` : **un id ABSENT vaut masqué**, jamais brut.

Le collapse « visibilité résolue → champs servis » ne se réécrit pas à la main.
Deux applicateurs partagés, et le schéma de la route choisit :
`applyPresenceVisibility` (`isOnline: null`, pour un schéma nullable) et
`applyPresenceVisibilityAsOffline` (`isOnline: false`, pour `userMinimalSchema`
et `contacts-schemas`, qui le déclarent `type: 'boolean'`).

**Une amitié acceptée n'est PAS un laissez-passer.** `areConnected` ouvre la
porte, il ne dispense pas de `showOnlineStatus` — la politique pure masque quand
même. Toute déduction du type « ce lecteur-là aurait `FULL` de toute façon » se
vérifie dans `resolvePresenceVisibility`, elle ne se raisonne pas :
`GET /users/friend-requests` a servi la présence brute de TOUTE la liste d'amis
(c'est `?status=accepted`) sur cette hypothèse-là (cycle 82).

**Et le gate s'applique à la SOURCE, jamais au sérialiseur.** Sur cette même
route, `lastActiveAt` ne sortait que parce que `userMinimalSchema` ne le déclare
pas — une omission de schéma partagé, que la première route qui l'ajoute
annulerait sans faire tomber un seul témoin. fast-json-stringify n'est pas une
garde de confidentialité.

**CHARGER n'est pas SERVIR, et un témoin de `select` n'atteste pas la réponse.**
`storyAuthorSelect` charge la présence pour une raison produit légitime
(l'interstitiel du viewer doit être complet au switch de groupe) ; le fil la
servait brute. Trois témoins nommés `stories-presence` étaient verts — ils
assertaient tous les trois que le `select` DEMANDE les champs, aucun sur ce que
le handler en FAIT, et le défaut vivait dans l'espace exact entre les deux
(cycle 83). **Un témoin de confidentialité assert sur la VALEUR SERVIE.**

**Le régime peut se trancher par LIGNE, pas seulement par route.** Sur une page
de stories, `PUBLIC` ne prouve aucun lien (`buildPostVisibilityOrFilter` la sert
sans condition d'audience) ⇒ strict ; `FRIENDS` / `EXCEPT` / `COMMUNITY` /
`ONLY` en prouvent un ⇒ `resolvePrefsOnly`. Un régime unique s'y trompe dans les
deux sens. Et un sujet qui prouve le lien par UNE ligne de la page le prouve
pour toutes. Voir `PostFeedService.resolveStoryAuthorPresence`.

**Attention aux commentaires qui ÉNUMÈRENT une règle au lieu de la citer** : la
note de `storyAuthorSelect` listait trois audiences gatées et omettait `PUBLIC`,
la seule qui ne l'est pas. Fausse nulle part, incomplète là où l'incomplétude
valait autorisation — c'est elle, pas le code, qui a tenu la porte ouverte.

### Une règle appliquée à l'ÉCRITURE n'est pas appliquée

`ContactDirectoryService.match()` filtrait le blocage bidirectionnel, avec le
commentaire qui l'énonce et des témoins verts — mais il ne tourne qu'à la
synchronisation d'appareil, pendant que le blocage bouge librement entre deux.
`list()` servait donc le lien Meeshy d'un compte bloqué APRÈS le dernier `sync`,
bouton « Lui écrire » compris, vers un envoi que la passerelle rejette en
`USER_BLOCKED`.

Le discriminant est **la fréquence relative des deux horloges** : quand ce que la
règle décide change plus souvent que le moment où elle s'exécute, la décision
persistée est un état FAUX jusqu'à la prochaine écriture. Une lecture rejoue donc
la règle, et **rend exactement ce que la prochaine écriture poserait** — ici le
triplet `matchedUserId` / `matchedBy` / `matchedAt` à `null`, soit « à inviter »,
ce que `sync()` écrirait pour ce contact.

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (Fastify, Socket.IO, ZeroMQ, auth unifie, Prisma/MongoDB, Redis fallback, erreurs types, rate limiting, Signal Protocol, logging PII, audio pipeline, push notifications) avec contexte, alternatives rejetes et consquences.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
