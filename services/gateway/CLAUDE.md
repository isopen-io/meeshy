# services/gateway - Fastify API Gateway

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

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
  **En CLIQUET depuis le cycle 130** : `src/__tests__/detached-promise-catch-sweep.ts`,
  inventaire VIDE. La règle était écrite, motivée, et commentée sur place partout où
  elle était appliquée — et le balayage a rendu **quatorze** contre-exemples de
  production, dont deux à cinquante lignes d'un de ces commentaires. Une règle ne se
  propage pas depuis son énoncé : elle vaut là où quelqu'un l'a récitée. Quand le
  cliquet tombe, la réparation est le `.catch`, jamais une ligne d'inventaire — il n'y
  a pas de promesse détachée non gardée légitime à porter. Cinq des quatorze vivaient
  dans un `setTimeout`, la forme la plus chère : aucun `try/catch` englobant à
  invoquer, et un rappel qui se déclenche longtemps après la requête qui l'a armé.
  Cf. `tasks/lessons.md` § Leçon 306.
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

**Un témoin qui n'exerce pas la SÉRIALISATION atteste un contrat que personne ne
respecte.** La règle vaut dans les deux sens, et les deux ont été mesurés :

- côté SERVEUR, mocker les schémas partagés DÉSARME fast-json-stringify — 154
  témoins verts couvraient des routes qui ne rendaient rien (cycle 91 bis) ;
- côté CLIENT, construire l'événement dans le langage du client et l'ÉMETTRE
  directement dans le flux saute le DÉCODEUR. `ConversationMembersViewModelTest`
  (Android) le faisait : `ParticipantRoleUpdatedEvent` exigeait un `role` de
  premier niveau que la passerelle n'a jamais émis (elle envoie `newRole`), donc
  `MissingFieldException` à chaque événement, avalée par le `runCatching` du
  listener. **Aucun changement de rang n'a jamais atteint le trombinoscope
  Android**, et le témoin était vert (cycle 92 bis).

Un témoin de contrat de fil part donc de la charge utile RÉELLE de l'émetteur,
copiée clé par clé, et la fait traverser la vraie couche de (dé)sérialisation.

Corollaire pour un événement DIFFUSÉ : **avant d'en changer la forme, relever ses
consommateurs sur les trois clients.** Le commentaire du site d'émission de
`participant:role-updated` affirmait « les seuls consommateurs sont web et iOS ».
Android en avait un — il n'était pas compté parce qu'il n'avait jamais marché.

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

**Et dans le gateway, passer par `utils/recipient-language.ts`** — jamais
`resolveUserLanguage` à cru. La descente exige DEUX choses, et rien d'autre ne les
tient ensemble : la forme du `select` (`RECIPIENT_LANG_SELECT` — les quatre
colonnes) et l'option `deviceLocale`. Dix-sept sites en avaient sauté au moins une
au cycle 124.

| besoin | appeler |
|---|---|
| langue de **CADRAGE** (l'interface : sujet d'e-mail, titre de notification) | `recipientLanguage(user, fallback)` |
| liste ordonnée où un **CONTENU** se résout | `recipientLanguages(user)` |
| étiquette pour `Intl` / `toLocaleString` | `recipientDateLocale(user, fallback)` |

Trois pièges, tous mesurés :

- **Le `select` est le seul des trois qu'aucun témoin de rang ne peut voir.** Un
  mock Prisma rend ce qu'on lui dit quel que soit le `select` : un témoin de rang
  passe au VERT sur un site dont la requête ne ramène pas les colonnes du Prisme,
  et la descente est morte en production. Un témoin de projection assert donc sur
  la REQUÊTE, pas sur le rendu.
- **Un témoin de RANG s'écrit sur un rang AUTRE que le premier.** Au rang 1,
  `user.systemLanguage || 'xx'` et la descente rendent le même verdict — un témoin
  posé là ne peut pas tomber. Cinq témoins du dépôt étaient dans ce cas, dont un
  dont le commentaire AFFIRMAIT que le site appelait `resolveUserLanguage`.
- **Une langue résolue ne suffit pas si la DATE qui l'accompagne ne l'est pas.**
  `systemLanguage === 'en' ? 'en-US' : 'fr-FR'` et `toLocaleDateString('fr-FR')`
  vivaient à côté de titres correctement localisés.

Le **repli terminal est un PARAMÈTRE**, pas un défaut partagé : `resolveUserLanguage`
retombe sur `'fr'`, plusieurs sites sur `'en'`. Le garder au site rend visible la
question produit — « quelle langue pour un compte sans AUCUNE préférence ? » — sans
la mêler à un correctif de Prisme.

## Toute porte qui sort un profil de TIERS filtre sa présence

`select: { isOnline: true, lastActiveAt: true }` sur quelqu'un d'AUTRE que
l'appelant n'a qu'une suite légitime : `PresenceVisibilityService`. Aucune route
ne sert ces deux champs bruts — le gate porte les préférences
(`showOnlineStatus` / `showLastSeen`), la désactivation de compte, et le blocage
bidirectionnel, qu'aucune route ne rejoue à la main.

**UN régime, la directive du 2026-08-25** (`decisions.md`, « Visibilité de la
présence ») : la présence d'un utilisateur n'est servie qu'à **lui-même**, à
**ADMIN/BIGBOSS**, et à un **ami ACCEPTÉ** (`FriendRequest.status = accepted`) —
et pour l'ami, selon les préférences de la cible (`showOnlineStatus` /
`showLastSeen`). Tout le reste est MASQUÉ :

- **MODERATOR est un lecteur ordinaire** — aucun bypass (`isGlobalAdmin`, plus
  `isGlobalModerator`) ; AUDIT, ANALYST, USER, AGENT idem.
- **« Affilié » (parrainage) ne compte pas**, ni un contact téléphone importé :
  un lien posé d'un seul côté n'est pas une relation.
- **Partager une conversation ou une communauté ne donne RIEN** — le « contexte
  acquis » (co-participant, co-membre) n'existe plus comme critère.
  `sharesConversation` est retiré du type d'entrée de la loi ; y revenir ne
  compile pas.
- **Anonyme / non authentifié** (viewer `null`) : masqué.

Le seul signal qu'un non-ami reçoit encore est l'ACTIVITÉ — frappe
(`typing:start`), message envoyé — qui voyage par ses propres événements
Socket.IO, jamais par ce résolveur.

**Une seule méthode, toujours avec le viewer** : `resolveForTarget(viewer, target)`
/ `resolveForTargets(viewer, ids)`. La résolution AVEUGLE au viewer
(« préférences seules », `resolvePrefsOnly`) est **SUPPRIMÉE, pas dépréciée** —
une garde de source (`__tests__/unit/presence-visibility-viewer-aware-guard.test.ts`)
rougit si l'identifiant réapparaît sous `services/gateway/src/`,
`packages/shared/utils` ou `packages/shared/types`, défini, appelé ou seulement
cité ; elle prouve d'abord qu'elle balaie bien ces trois racines (une garde
négative dont le balayage rend `[]` reste verte). Le viewer se lit par
`viewerFromRequest(request)` (`routes/users/presence-gate.ts`) — jamais depuis
`AuthenticatedRequest`, dont le champ `registeredUser` est typé `boolean` alors
que la production y met un objet.

**Un paramètre `viewer` est REQUIS, jamais optionnel** : un appelant sans viewer
passe `null`, ce qui MASQUE. Une porte de confidentialité échoue en montrant
moins, jamais en montrant plus.

**Une entrée ABSENTE de la carte vaut masquée, sauf pour ADMIN/BIGBOSS.**
`resolveForTargets` rend une entrée par id passé ; une entrée absente désigne
une cible SANS COMPTE (participant anonyme, pas de `userId`) — ou une anomalie.
Son sort ne se décide pas au site : `presenceMissingEntryPolicy(viewer)` rend
`'reveal'` pour ADMIN/BIGBOSS et `'hide'` pour tout autre lecteur — dérivé de la
loi partagée (`resolvePresenceVisibility` appliquée à l'entrée qu'elle aurait
reçue), pas redéclaré — et `presenceFor(viewer, carte, userId)` sert la
visibilité d'un id sans jamais rendre `undefined`. L'idiome
`vis.get(id)?.showOnline === false ? false : x` est INTERDIT : un `undefined`
laissé passer révèle l'inconnu à tout le monde (`core.ts` le faisait pour un
inscrit non résolu, avant `presenceFor`).

Le collapse « visibilité résolue → champs servis » ne se réécrit pas à la main.
Deux applicateurs partagés, et le schéma de la route choisit :
`applyPresenceVisibility` (`isOnline: null`, pour un schéma nullable) et
`applyPresenceVisibilityAsOffline` (`isOnline: false`, pour `userMinimalSchema`
et `contacts-schemas`, qui le déclarent `type: 'boolean'`). Le second prend
`{ onMissingEntry }`, à alimenter par `presenceMissingEntryPolicy(viewer)` — le
défaut `'hide'` est le bon pour tout lecteur non-ADMIN. Son type de retour dit
ce qu'il fait : `lastActiveAt` sort en `Date | null` dès que le profil le porte
(`PresenceAsOffline<T>`), même si l'entrée l'excluait — `PublicUser` le déclare
nullable pour cette raison.

**Un participant sérialisé passe par `serializeConversationParticipant`
(`packages/shared/utils/participant-helpers.ts`) avec
`presence: presenceFor(viewer, carte, userId)`.** La fabrique FERME par défaut :
sans visibilité fournie, elle sert `isOnline:false` / `lastActiveAt:null`, jamais
la colonne. Un appelant qui oublie l'option masque ; il ne fuit pas.

**Une SÉLECTION ou un ORDRE qui dépend de la présence révèle autant que le
champ.** Filtrer `?onlineOnly=true` en base puis masquer `isOnline` livrait à un
non-ami la liste exacte des membres en ligne — l'APPARTENANCE à la page était la
fuite ; trier `isOnline: 'desc'` en base puis masquer laissait lire la présence
dans la POSITION. La sélection ne porte que sur les ids dont le viewer a le
DROIT de connaître l'état (`onlineOnlyScope`, `conversations/participants.ts` :
tout pour ADMIN/BIGBOSS, soi ∪ amis acceptés sinon, vide pour un anonyme), et
l'ordre par présence brute n'est demandé à la base que si
`mayOrderByRawPresence(viewer)` — sinon la page se lit sans clé de présence,
puis se stabilise APRÈS la porte sur ce qui est SERVI (`servedOnlineFirst`,
`presence-gate.ts`).

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

**Un LIEN n'est pas une AMITIÉ.** Sur une page de stories, une ligne `FRIENDS` /
`EXCEPT` / `COMMUNITY` / `ONLY` prouve que l'auteur a CHOISI son audience — un
lien — et le régime « à deux vitesses » qui en déduisait « préférences seules »
pour tout auteur ainsi prouvé a été SUPPRIMÉ avec la directive : la présence ne
se déduit d'aucune audience. `PostFeedService.resolveStoryAuthorPresence` passe
chaque auteur par `resolveForTargets(viewer, ids)`, sans exception par ligne.

**Attention aux commentaires qui ÉNUMÈRENT une règle au lieu de la citer** : la
note de `storyAuthorSelect` listait trois audiences gatées et omettait `PUBLIC`,
la seule qui ne l'est pas. Fausse nulle part, incomplète là où l'incomplétude
valait autorisation — c'est elle, pas le code, qui a tenu la porte ouverte.

**Une carte incomplète a UN sort, et il se décide par le VIEWER, pas par le
site.** Tant que deux régimes coexistaient, un id manquant valait masqué sous
l'un et visible sous l'autre — et l'idiome
`vis.get(id)?.showOnline === false ? false : x` (« seule une préférence
explicitement négative masque ») était la référence du second. Il est désormais
une FUITE : un participant anonyme n'a pas de `userId`, donc jamais d'entrée, et
cet idiome le révélait à tout lecteur. La règle unique est celle du
§ « entrée ABSENTE » plus haut — `presenceFor` / `presenceMissingEntryPolicy`,
révélé à ADMIN/BIGBOSS seuls.

**Un audit qui liste des `select:` ne liste pas des fuites.** Entre la requête et
le fil il y a un sérialiseur : au cycle 84, deux des trois portes examinées ne
servaient RIEN — `POST /conversations/:id/invite` renvoyait `member` quand son
schéma déclarait `membership` (la clé du handler supprimée, celle du schéma jamais
posée), et `GET /communities/search` déclarait `creator`/`members` en
`{ type: 'object' }` NU, que fast-json-stringify sérialise en `{}`. Avant de
qualifier une fuite, **traverser la sérialisation** (patron :
`friend-requests-pagination.test.ts`, `conversation-invite-serialization.test.ts`).

Les deux sont réparés — l'invitation au cycle 92 bis, avec son gate. La règle, elle,
ne l'est pas : c'est une règle de MÉTHODE, et elle vaut au prochain audit.

**Et une non-fuite ACCIDENTELLE se garde par un témoin.** Trois fois déjà, la
donnée s'est arrêtée sur une omission de schéma que rien ne nomme
« confidentialité ». Chacune est un piège armé : la première personne qui aligne
les noms pour faire vivre la charge utile ouvre la fuite sans qu'un témoin
tombe. Poser le témoin qui la forcera à voir ce qu'elle ouvre — il garde une
PORTE, pas un bug.

**Le piège a fonctionné, et c'est mesuré.** Le témoin posé sur l'invitation au
cycle 84 disait explicitement qu'il tomberait le jour où quelqu'un aligne les
deux noms, et qu'il l'obligerait à poser le gate dans le même lot. Il est tombé
au cycle 92 bis, et les deux sont arrivés ensemble. Un cycle entier s'est écoulé
entre le moment où le site a été identifié (91 bis, laissé ouvert PAR DÉCISION,
gelé au cliquet avec sa raison écrite) et sa réparation : **c'est la forme
normale d'un lot de confidentialité, pas un retard.**

## La présence est gardée sur ce qui LISTE un participant, sur rien qui en MUTE un

Formulé au cycle 92 bis, où c'était vrai des cinq surfaces qui servent un participant
sous `conversationParticipantSchema` : les trois qui en LISTENT construisaient
leur projection et gardaient la présence, les deux qui en MUTENT passaient le
rang Prisma BRUT et ne la gardaient pas.

Les deux mutations avaient le MÊME défaut et des issues OPPOSÉES, décidées par
la seule coïncidence d'un nom de clé : `PATCH …/role` déclarait `participant` et
envoyait `participant` ⇒ `Participant.isOnline`/`lastActiveAt`, que le schéma
DÉCLARE, sortaient non gardés. `POST …/invite` déclarait `membership` et envoyait
`member` ⇒ tout était supprimé, donc rien ne fuyait.

> **Un schéma qui « marche » peut cacher une fuite au lieu de l'empêcher.** Celui
> qui ne fuyait pas ne protégeait rien — il était cassé. Ne jamais lire « ce site
> ne fuit pas » comme « ce site est gardé » sans avoir vu la garde.

Le chemin le plus exposé n'était pas REST mais la diffusion Socket.IO
(`participant:role-updated`), qui n'a **aucun sérialiseur** : le rang y partait
entier — `bannedAt`, `leftAt`, `deletedForMe`, `nickname`, `shareLinkId`.

**La cause était structurelle, pas un oubli.** Aucun sérialiseur de participant
n'existait : la forme de fil était réécrite à la main à chaque surface, donc la
garde n'avait aucun endroit unique où être posée.
`serializeConversationParticipant` (`packages/shared/utils/participant-helpers.ts`)
est cette source unique. Elle ferme deux pièges par construction :

1. **La présence ne peut sortir qu'à travers son paramètre de visibilité** — pas
   de champ à recopier, donc pas de champ à oublier. Et le paramètre FERME par
   défaut (`showOnline === true` pour servir, sinon `false` / `null`) : la
   fabrique avait d'abord été écrite « absente ⇒ révèle », ce que ses trois
   appelants compensaient chacun chez eux par `presenceFor` — le quatrième
   aurait fui.
2. **`role` porte DEUX taxonomies.** `Participant.role` est le rang DANS LA
   CONVERSATION (`creator|admin|moderator|member`) ; le schéma déclare le rôle
   GLOBAL (`USER|ADMIN|…`). Le rang brut servait donc `member` là où le contrat
   promet `USER`, en laissant `conversationRole` vide. La fabrique sépare les deux.

**Toute nouvelle surface qui sert un participant l'appelle.** Écrire la projection
à la main est exactement ce qui a produit l'écart — une règle qui doit être
retapée à chaque site est une règle qu'un site finira par ne pas avoir.

**Le contrôle d'accès borne qui ENTRE, jamais ce qu'on sert de la présence.**
`GET /communities/:id/members` ne referme que les communautés PRIVÉES ; tant que
deux régimes existaient, `hasAccess` y choisissait « préférences seules » pour
un membre et strict pour un non-membre (cycle 85-bis). Depuis la directive, la
co-appartenance ne vaut rien : la route passe TOUTES ses lignes par
`resolveForTargets(viewer, ids)`, et `hasAccess` ne gouverne plus que la liste.
Le seul régime est le strict ; la seule variable est le viewer.

## Un fichier `X.ts` à côté d'un répertoire `X/` : lequel est chargé ?

Le fichier. Node résout **LOAD_AS_FILE avant LOAD_AS_DIRECTORY**, donc un import
sans extension — `import { x } from './routes/X'`, la forme qu'emploie
`route-registration.ts` — ne voit JAMAIS `X/index.ts` si `X.ts` existe.

Après une scission de module, l'étape finale n'est pas facultative : `X.ts`
devient une **coquille de ré-export**.

```typescript
export { userRoutes } from './users/index';
```

`routes/users.ts`, `routes/voice.ts` et `routes/attachments.ts` la portaient.
`routes/communities.ts` ne l'a jamais reçue, et son répertoire (~1 900 lignes,
gates de présence compris) est resté injoignable de sa création au cycle 86-ter, qui
l'a consolidé — les quatre routes que seul le legacy portait (`/mine`,
`/:id/join`, `/:id/leave`, `/:id/invite`) portées dans le répertoire, puis le
fichier basculé en coquille. **Les quatre scissions du dépôt sont désormais
branchées, et `KNOWN_UNREACHABLE` doit rester vide.**

**Une scission inachevée ne ressemble à rien** : le répertoire compile, ses
suites passent, sa couverture monte, aucun avertissement ne se lève. Le seul
symptôme est un correctif sans effet — et l'effet d'un correctif de
confidentialité, personne ne le mesure. `module-shadowing.test.ts` garde les
paires par deux voies (balayage des coquilles, et routes RÉELLEMENT
enregistrées) ; toute nouvelle paire non-coquille le fait tomber.

Coût mesuré avant consolidation (cycle 86-ter) : **trois cycles de correctifs
atterris dans le répertoire sans jamais atteindre la production**. Le cycle 84 y
a diagnostiqué, corrigé et CLOS « la recherche de communautés iOS était morte » ;
le fichier vivant portait encore le défaut mot pour mot. Avec lui, en
production : les noms de communauté non assainis, `memberCount` correct mais
`creator`/`members[]` vidés en `{}`, et `POST /communities/:id/conversations/:conversationId`
— qu'iOS appelle — en `404`.

### Corollaire : un témoin s'importe par le chemin de la PRODUCTION

Six des huit suites communauté importaient `routes/communities/search` ou
`routes/communities/index` — des chemins explicites vers le module mort. Une
septième visait bien le spécificateur de production mais mockait
`@meeshy/shared/types/api-schemas` en `{ additionalProperties: true }`, ce qui
désarme fast-json-stringify, soit exactement la couche où vivaient deux des
défauts.

**Copier le spécificateur depuis `route-registration.ts`, ne pas le composer à
la main** — et ne pas mocker les schémas partagés dans un témoin de
sérialisation.

**Un double PARTIEL d'un module perd en silence tout ce que le module GAGNE**,
et la seule question est de savoir si la perte se voit. Au cycle 86 elle ne se
voyait pas : le double `additionalProperties: true` désarmait la couche où
vivaient deux défauts. Au cycle 91 elle s'est vue bruyamment — un double de
`routes/voice/types` listant trois schémas à la main rendait `undefined` les
deux constantes que le lot venait d'y ajouter, et **la route ne se construisait
plus** :

```
schema is invalid: data/properties/data/properties/attachment must be object,boolean
```

Deux bouts du même défaut : un double partiel cache un bug, ou empêche un
correctif de se charger.

**Et c'est arrivé DEUX FOIS EN DEUX CYCLES.** Le cycle 93 a reproduit
l'incident sur `conversation-messages-advanced.test.ts`, dont le double de
`api-schemas` listait deux schémas à la main : une composition de
`messageResponseSchema` au chargement du module y a trouvé `undefined`, et
154 témoins ont cessé de se charger. La règle du cycle 91 était déjà écrite et
n'a pas suffi — **un double partiel ne se signale qu'au moment où le module
grandit**, donc jamais avant. Ce n'est plus un incident, c'est un patron de
harnais à cesser d'écrire : `jest.requireActual` par défaut, surcharge ciblée
seulement si nécessaire. **Prolonger (`jest.requireActual` + surcharge ciblée)
plutôt que remplacer** ; et quand le double existait pour garantir un
comportement de SÉCURITÉ, préférer le vrai code — un double ne peut qu'attester
l'absence d'un repli vulnérable, le vrai code la prouve. Patron : `communities-live-wiring.test.ts`, qui n'assert que ce
que deux modules concurrents ne partagent pas.

**TROISIÈME exemplaire au cycle 104, et la perte n'est plus un schéma mais un
NOM D'ÉVÉNEMENT.** `SocialEventsHandler.test.ts` portait un double de
`@meeshy/shared/types/socketio-events` énumérant vingt-sept constantes de
`SERVER_EVENTS` à la main — pas la vingt-huitième, `COMMENT_UNLIKED`. Sous ce
harnais, `broadcastCommentUnliked` émettait un événement au nom **`undefined`**
sur ses DEUX adresses, et son témoin était vert : il assertait les rooms
(`io.to`), jamais le NOM.

> **Une ADRESSE juste ne dit rien de ce qui y arrive.** Un témoin d'émission
> assert sur le COUPLE `(événement, charge)`, pas seulement sur la room —
> c'est le nom, et lui seul, qui décide si un client branche quoi que ce soit
> dessus.

Et quand le module doublé n'expose que des CONSTANTES pures (`SERVER_EVENTS`,
`ROOMS`), la bonne réponse n'est même pas `jest.requireActual` : c'est **pas de
double du tout**.

Et **poser au moins un témoin de SURFACE** : « cette route est-elle
enregistrée ? ». Aucun ne le demandait, et un `404` sur une route qu'un client
appelle depuis toujours n'était vu par personne.

Corollaire de manœuvre : **basculer vers la jumelle exige de porter d'abord ce
que l'exemplaire VIVANT avait de plus.** Le répertoire ignorait
`flattenCommunityCounts` et quatre routes ; basculer sans les porter aurait
servi `memberCount: 0` partout. Les témoins qui PASSENT déjà avant la bascule
valent autant que ceux qui échouent — on les écrit dans le même lot.

## Une garde d'admission se pose sur CHAQUE chemin, pas sur le plus fréquenté

Les trois éventails de `messageNotificationFanOut` poussent la même bannière pour
le même message. **Un seul demandait si ce message est encore VIVANT.**

`createMessageNotification` relit l'état juste avant de pousser et abandonne quand
le message a été rappelé ou a expiré dans la fenêtre de l'éventail — sa raison est
écrite sur place : « we MUST NOT leak the original content via the banner ». Ni la
réponse ni la mention ne portaient cette garde (cycle 127), si bien qu'un message
rappelé entre son commit et l'éventail poussait son texte ORIGINAL vers la personne
VISÉE par la réponse et vers tous les mentionnés — dont la bannière perce jusqu'à
la sourdine — pendant que les membres ordinaires du fil étaient protégés.

> **Une garde qui protège la population la plus NOMBREUSE peut manquer la plus
> EXPOSÉE.** Posée sur le chemin le plus fréquenté, elle se lit comme une garde
> posée sur le SUJET ; elle ne l'est que sur son CHEMIN.

Trois corollaires, tous mesurés dans ce lot :

- **Une compensation en aval ne remplace pas une garde d'admission quand l'effet
  qu'elle compense est IRRÉVERSIBLE.** Le balayage de rétraction de l'éventail
  retire les lignes `Notification` d'un message rappelé, et son raisonnement de
  fenêtre est juste — mais il ferme la BASE quand la bannière est déjà sur
  l'ÉCRAN. Question à poser à tout nettoyage a-posteriori : *que reste-t-il de
  fait que ce nettoyage ne défait pas ?*

- **Un verdict de garde a TROIS états, pas deux.** `live`, `gone` (la lecture
  PROUVE), `unknown` (elle n'a rien prouvé — elle a levé, ou n'a rien rendu). Les
  deux derniers se ressemblent et s'arbitrent à l'OPPOSÉ : fail-CLOSED sur la
  preuve, où c'est un secret qui est en jeu ; fail-OPEN sur l'absence de preuve,
  où c'est une livraison. Sur `Message`, **une ligne ABSENTE est `unknown`** — le
  dépôt le dit déjà dans le balayage de rétraction (« `deletedAt` non nul est la
  SEULE preuve d'un rappel ; aucun chemin de la gateway ne supprime un message
  physiquement »), et une lecture servie par un secondaire en retard sur le jeu de
  réplicas rend `null` pour un message parfaitement vivant. Source unique :
  `NotificationService.messageLiveness`.

- **Un doc-comment qui EXEMPTE une unité d'une règle que sa voisine applique se
  vérifie comme une affirmation.** Celui de `loadMessagePrismSource` disait « pour
  les éventails dont la lecture n'est PAS un gate d'éligibilité » : vrai du code,
  et rien de plus. Rien dans « ce n'est pas un gate » ne dit *pourquoi ça ne
  devrait pas en être un* — mais posé en tête d'une unité, il se relit comme une
  décision qu'on n'a pas à instruire. La question n'est pas « est-ce exact ? »
  mais **« qu'est-ce qui justifie l'exemption ? »**.

Et la garde était GRATUITE : les trois éventails relisent la MÊME ligne dans la
MÊME fenêtre — deux colonnes de plus sur une lecture existante. **Avant de
conclure qu'une garde coûterait une requête, regarder ce que le site lit déjà.**

## Un nom de champ annonce l'unité de sa DESTINATION, jamais celle de sa SOURCE

`MessageAttachment.duration` est en MILLISECONDES — `schema.prisma` le dit
(« Durée en MILLISECONDES ») et le doc-comment de
`formatSingleAttachmentLabelI18n` le REDIT. Son unique producteur, l'éventail,
passe la colonne telle quelle. Deux sites de `createMessageNotification` la
multipliaient pourtant par 1000 comme si elle était en secondes : un vocal de
34 s partait annoncé pour **9 h 26**, sur le fil push ET dans la ligne
`Notification` persistée que le SDK iOS décode (cycle 128).

> Deux lectures d'un MÊME champ, dans le MÊME objet littéral, sous deux unités.
> Le doc-comment qui dit vrai est à quarante lignes de la ligne qui dit faux, et
> rien ne les confronte. Ce qui rend la conversion crédible est le NOM du champ
> d'ARRIVÉE (`…DurationMs`) : il déclare l'unité de la DESTINATION, et se relit
> comme une preuve que la source est dans une autre. **Devant tout `x * 1000`
> posé sous un nom qui finit par `Ms`, ouvrir le PRODUCTEUR.**

Il n'a pas été cherché : il s'est présenté dans le premier témoin RED du cycle,
qui a rendu « 🎵 Audio · 0:00 » pour un vocal de 12 secondes. **Lire le texte
qu'un correctif compose, et pas seulement l'assertion qu'on avait prévue.**

## Un correctif de RÉSOLUTION se mesure comme une garde de PROTECTION

Le § précédent sur `mediaMayTravel` dit qu'une protection de CONTENU se mesure
sur tout ce que la charge TRANSPORTE. La règle vaut identiquement d'un correctif
de RÉSOLUTION, et le cycle 128 l'a mesuré au même endroit : le cycle 123 a fait
descendre le Prisme au TEXTE de la bannière d'un vocal, et laissé douze lignes
plus bas `firstAttachmentUrl: first?.fileUrl` — l'ORIGINAL, sans condition,
identique pour tous les lecteurs. Bannière en français, pièce jointe en anglais.

La piste TTS vit sur la colonne que l'éventail lit DÉJÀ
(`MessageAttachment.translations[lang].url`, `select` inchangé depuis le cycle
123) : `transcriptTranslationTexts()` n'en prenait que le texte, sa jumelle
`transcriptTranslationTracks()` en prend le médium.

Trois règles en sont sorties, toutes portées par `servedAttachmentMedia` :

- **La piste est élue par la langue du TEXTE SERVI**, jamais par une descente
  indépendante — sans quoi la bannière servirait deux langues à la fois.
- **Deux replis, tous deux vers l'original, et ils disent deux choses** :
  `served === null` (le Prisme n'a rien élu) et langue élue SANS piste (le TTS
  peut manquer là où la traduction texte existe — fail-OPEN sur le médium).
- **Une carte de candidates est une porte NEUVE vers un écran verrouillé.** Elle
  est gardée par `mediaMayTravel`, aux DEUX niveaux qui déclarent la protection,
  et vidée une seconde fois par le verrou `notificationLocKey`. Ouvrir un chemin
  de média sans lui poser la garde du cycle 125 rouvre la même fuite sous un
  autre nom.

**Et vérifier la chaîne jusqu'au PIXEL découvre les contraintes du correctif**,
ce n'est pas une formalité de fin de lot : le producteur écrit `format: 'mp3'`
(extension NUE), qui rate le `hasPrefix("audio/")` de `fileHints` côté NSE et
retombe sur un `typeHint` NUL — pièce jointe rendue en dégradé. La normalisation
du mime est portante, et les deux producteurs du dépôt divergeant
(`'mp3'` / `'audio/mp3'`), le dépouillement NORMALISE au lieu de choisir.

## Cette entité a-t-elle une JUMELLE ?

À poser au moment où l'on corrige, pas des cycles plus tard. Le dépôt est plein
de paires portant la même opération sur deux tables : conversation / communauté,
message / post, participant / membre. `reorderConversationPreferences` a été
corrigé et a laissé sa raison en commentaire — « `updateMany` used to absorb
that for the wrong reason: it matched nothing, for anybody » — une phrase qui
décrivait MOT POUR MOT la route communauté, restée cassée un fichier plus loin
(cycle 85). **Un commentaire ne documente que l'exemplaire qu'il touche.**

Corollaire quand on reprend le correctif d'une jumelle : **on le prend en
entier.** Passer d'`updateMany` à `upsert` EXIGE le filtre d'appartenance —
`updateMany` empêchait par accident qu'un appelant fabrique des lignes contre
des ids arbitraires, l'upsert seul retire cette protection.

### On reprend une jumelle en cherchant la réponse à SA PROPRE question

Le corollaire ci-dessus (« on le prend en entier ») dit quoi faire. Le cycle 128
mesure pourquoi on ne le fait pas, et ce n'est pas une inattention.

`POST /user-preferences/communities/reorder` persistait `orderInCategory` sans
rien émettre, quand `reorderConversationPreferences` diffuse
`USER_PREFERENCES_REORDERED` sur la room personnelle — la ligne étant par
UTILISATEUR, un glisser-déposer fait sur un appareil n'atteignait aucun autre.
**Et le handler fautif CITAIT le jumeau**, sur dix lignes, pour lui emprunter son
filtre d'appartenance. La jumelle avait donc été ouverte, lue, et à moitié
reprise : la question du jour était « comment borner cet upsert ? », et la
réponse trouvée y répondait exactement.

> La question juste n'est pas *« que fait la jumelle pour mon problème ? »* mais
> **« que fait la jumelle, tout court, APRÈS cette écriture ? »** — et elle se
> répond en lisant sa suite ligne à ligne, jamais par un mot-clé, qui ne rend
> par construction que ce qu'on savait déjà chercher.

**Toute écriture d'une ligne de préférences PAR UTILISATEUR doit trois choses**
(le doc-comment de `conversationPreferencesSync.ts` les énonce) : persister,
incrémenter `version` quand la table en a une, et DIFFUSER sur `user:{id}`.
Cliquet d'inventaire des écrivains des deux tables :
`src/__tests__/preference-writer-sweep.ts` — il fige les sites d'ÉCRITURE, pas
les diffusions, et sa valeur est de forcer la question « celui-là, il
diffuse ? » au lot qui en ajoute un.

Corollaire d'inventaire, et c'est la leçon 261 vue d'un autre côté : **un lot
ferme une classe dans SA langue.** Le lot F71 avait fermé « les verbes qui
CHANGENT une préférence de communauté » ; le réordonnancement n'en est pas un
dans cette langue-là — c'est un geste d'ORDRE — et il écrit pourtant la même
ligne, dans le même fichier. Devant un inventaire de sites, demander : *ce que je
viens de nommer est-il la propriété, ou seulement le mot par lequel je l'ai
trouvée ?*

### Relever les consommateurs sert à décider s'il faut changer la forme DU TOUT

La règle « avant de changer la forme d'un événement DIFFUSÉ, relever ses
consommateurs sur les trois clients » (cycle 105) a une suite. Le relevé ne sert
pas seulement à mettre les clients à jour : il sert à décider s'il faut toucher
à la forme.

Cycle 128 — admettre `communityId` dans `UserPreferencesReorderedEventData`
était la forme naturelle (même geste, un discriminant de plus, exactement ce que
fait `USER_PREFERENCES_UPDATED` avec ses trois scopes). Le relevé l'a interdit :
le décodeur iOS déclare `Update.conversationId` NON optionnel, si bien qu'un
item de communauté fait échouer le décodage de l'ÉVÉNEMENT ENTIER — emportant
les réordonnancements de conversation qui voyagent avec lui — pendant que le web
les filtre en silence.

> **Un décodeur STRICT rend l'élargissement plus cher que le nom neuf**, et
> c'est une mesure, pas un goût. Un événement multi-scope l'est parce qu'il a
> été CONÇU ainsi ; il ne le devient pas rétroactivement sans casser son cas
> nominal, et il le casse par le mécanisme le plus discret qui soit — un `catch`
> de décodage côté client (cycle 92 bis).

`USER_PREFERENCES_COMMUNITY_REORDERED` est INERTE pour les deux consommateurs
existants par construction. Et sa charge **nomme ce qui a été ÉCRIT, jamais ce
qui a été DEMANDÉ** : le filtre d'appartenance borne les deux ensemble, sans quoi
la diffusion enverrait les autres appareils appliquer un ordre que la base ne
porte pas — en confirmant au passage l'existence d'une communauté que l'appelant
n'a pas le droit de nommer.

### La forme OUTILLÉE de la question : compter les appelants du helper

Quand la règle qu'on vient de corriger vit dans un helper, la jumelle se
cherche par une commande, pas par intuition — **combien de sites de PRODUCTION
appellent ce helper ?** Un helper à un appelant ne garde pas une règle : il
documente qu'un site l'applique.

Mesuré au cycle 123 bis : `protectedPreview()` — le masque qui empêche le texte
d'un message éphémère / à vue unique / flouté / chiffré d'atteindre un écran
verrouillé — n'avait **qu'un seul appelant de production**
(`messageNotificationFanOut.ts`). Trois autres sites copiaient le texte sans
masque, dont deux vers des TIERS :

| site | destinataires | ce qui partait |
|---|---|---|
| `createReactionNotification` | l'AUTEUR | 100 car. de `Message.content` (les drapeaux n'étaient pas même `select`és) |
| `notifyNewlyMentioned` (édition) | les ENTRANTS | le contenu ÉDITÉ brut, sans base de Prisme |
| `reproduceEditedMessageNotifications` | tous les déjà-notifiés | le placeholder REMPLACÉ par le vrai texte, puis réannoncé |

**Deux des trois sont sur le chemin d'ÉDITION, et ce n'est pas un hasard.** Un
message protégé est masqué à l'ENVOI, une fois, par l'unité qui le sait ;
l'édition rejoue la même question dans des unités écrites pour un autre
problème (réconcilier des mentions, rafraîchir une copie dénormalisée). D'où la
règle générale : **quand une règle s'applique à une DONNÉE, énumérer ce qui la
PRODUIT ne suffit pas — il faut énumérer ce qui la RÉÉCRIT.** Une copie
dénormalisée a deux moments, et le second est écrit par quelqu'un qui pense
mettre à jour un texte, pas publier un secret.

Et rien n'interdit d'éditer un message protégé (mesuré : `messageEditAdmission`
et `messageEditContent` ne portent aucune occurrence de `isViewOnce`,
`isBlurred`, `effectFlags` ni `expiresAt`).

### Une garde de confidentialité se relit CHEZ ELLE, pas dans ses paramètres

Les deux correctifs d'édition relisent les drapeaux depuis la base plutôt que de
les recevoir de l'appelant. **Un paramètre dont l'absence désactive une garde
est un demi-correctif** — et les quatre transports d'édition construisent chacun
leur propre enregistrement, dont aucun ne porte ces drapeaux. Même arbitrage
pour l'échec : les deux relectures sont fail-CLOSED (une lecture qui ne conclut
pas répond « protégé »), à l'inverse du best-effort qui gouverne le reste de ces
unités. Une notification appauvrie se rattrape ; un secret poussé, non.

### La jumelle d'une garde peut être un MÉDIUM, pas une entité (cycle 125)

Les formes ci-dessus cherchent la jumelle dans une autre table, un autre site,
un autre moment. Il en existe une quatrième, et elle est la plus proche : **le
même site, la même charge, un autre médium.**

Quatre cycles de gardes se sont posées sur ce chemin — `protectedPreview`,
`previewPrismSource`, `prePersistedMessageFields`, le verrou du cycle 124.
Toutes justes, toutes testées. **Toutes gardent une chaîne de caractères.**
Douze lignes sous la dernière, dans le même objet littéral, `firstAttachmentUrl:
first?.fileUrl` partait sans aucune condition — et la NSE iOS télécharge cette
URL puis l'attache en `UNNotificationAttachment` sans regarder
`notificationLocKey`. Une photo à VUE UNIQUE s'affichait ENTIÈRE sur l'écran
verrouillé sous une bannière disant « 👁️ 🖼️ ».

> **Une protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE,
> jamais sur sa seule chaîne** — texte, fichier, nom de fichier, taille, durée,
> vignette, URL. La question se pose AU MOMENT du correctif : « la charge que ce
> site remet contient-elle autre chose que ce que je viens de garder ? », et
> elle se répond en lisant l'objet remis LIGNE À LIGNE, sans lire le code qui le
> construit — c'est le niveau d'abstraction du correctif qui rend l'objet voisin
> invisible, parce qu'il ne compose aucune chaîne.

Deux corollaires, mesurés dans le même lot :

- **Un champ de protection présent au modèle et absent de toute requête est un
  piège armé.** `MessageAttachment` déclare `isViewOnce`, `isBlurred` et
  `effectFlags` ; le `select` de l'éventail n'en lisait aucun. Aucun chemin de
  création ne les écrit *aujourd'hui* — le jour où une ligne les pose, dans un
  lot qui parlera d'autre chose, la protection sera tenue pour acquise par tous
  ceux qui lisent le schéma. Les respecter coûte trois champs dans un `select`.
- **Le second verrou se pose sur la clé qui DÉCLARE, pas sur celle qui décrit.**
  `notificationLocKey` a un unique producteur (`protectedPreview`) : sa présence
  n'est pas un indice, c'est une déclaration de protection qu'aucun appelant ne
  pose par accident. `createNotification` s'en sert pour vider `attachmentUrl` —
  un appelant qui masque le corps sans retirer son média perd le rich-push,
  jamais le secret.

## Un témoin d'écriture assert sur l'EFFET, jamais sur le statut

`expect(res.statusCode).toBe(200)` atteste que la route RÉPOND, pas qu'elle
FAIT. C'est resté vert pendant toute la vie du défaut ci-dessus, sur une route
qui ne persistait rien. Une écriture se garde sur la ligne écrite et
l'événement émis. Et quand on change la méthode Prisma qu'un handler appelle,
**repointer les témoins d'erreur** : un `mockRejectedValue` sur une méthode que
la route n'appelle plus passe au vert par le chemin nominal en croyant tenir le
chemin d'erreur.

**Le jumeau, côté LECTURE : un témoin de lecture assert sur ce que la réponse
DIT.** `conversations/stats.test.ts` portait cinq témoins verts — un 404, un
403, un 500, deux fois `statusCode === 200` avec `body.success === true` — sur
une route qui servait `{}` (cycle 86). Aucun ne nommait un champ de `data`.
Les deux moitiés tiennent en une phrase : **`statusCode` n'est pas une
observation de la charge utile**, et seul un témoin qui traverse le sérialiseur
(`app.inject()`, jamais un double du handler) peut voir ce qui en sort.

**Réparer une ENVELOPPE arme les déclarations qu'elle contenait.** Tant que
`data` sortait `{}`, `messageSchema.sender` ne servait rien, et le fait qu'il
DÉCLARE `isOnline` était sans conséquence. La correction de l'enveloppe
(cycle 88 bis) l'a rendue vivante : mesuré au compilateur, `isOnline: true`
posé sur l'objet **est désormais servi**. Rien ne fuit aujourd'hui — les deux
`select` ne le chargent pas — mais le piège du cycle 84 est ARMÉ pour de bon :
le prochain `select` qui l'ajoute le met sur le fil, sans gate, sans qu'un
témoin tombe.

L'expéditeur de ces routes est donc déclaré LOCALEMENT **sans `isOnline`**
(cycle 93) : c'est fail-closed — si le champ apparaît un jour dans l'objet, le
sérialiseur le retire — et cela vaut mieux qu'un gate sur une donnée que
personne ne charge, lequel est du code mort qui se périme. Un témoin garde
l'omission.

> **La règle du cycle 84 ne dit pas seulement « poser le gate dans le même
> lot ».** Elle dit que rendre une donnée visible oblige à DÉCIDER, dans le même
> lot, si elle a le droit de l'être. Et « rendre visible » inclut **réparer
> l'enveloppe au-dessus** : le lot qui débouche un parent hérite des décisions
> de visibilité de tous ses enfants.

**Une PANNE peut tenir la porte, et la réparer l'ouvre.**
`GET /communities/search` chargeait `isOnline` sur ses membres sans le gater ;
rien ne fuyait, parce que son schéma déclarait `creator: { type: 'object' }` et
`members: { items: { type: 'object' } }` — sans `properties`, donc `{}` (§ Un
schéma de réponse sans `properties`). Rien n'était protégé non plus. Réparer le
schéma pour une raison parfaitement légitime — les clients ne recevaient pas
leurs données — publie la fuite le jour même, sans qu'un témoin tombe puisqu'il
n'y en avait aucun. **Quand on répare ce qui rendait une donnée invisible, on
pose dans le MÊME lot la règle qui décide si elle a le droit d'être vue.**
L'ordre inverse n'existe pas (cycle 84).

## Un schéma de réponse sans `properties` EFFACE

`fast-json-stringify` applique `additionalProperties: false` **par défaut**.
Dans un schéma de réponse, `{ type: 'object' }` sans `properties` ne se lit donc
pas « ici un objet, tel quel » mais « ici un objet dont je ne connais aucune
clé » — et le sérialiseur rend `{}`. Idem pour `{ type: 'array', items: { type:
'object' } }`, dont chaque élément sort vide.

**Un `type: 'object'` sans `properties` dans un schéma de réponse est un bug,
jamais un choix.** Coût mesuré sur `GET /communities/search` (cycle 84) : `creator`
et `members[]` sortaient vides ; `APICommunityUser.id`/`.username` étant
non-optionnels côté iOS, le `{}` faisait échouer le décodage de la réponse
ENTIÈRE — la recherche de communautés iOS ne rendait qu'une erreur, jamais un
résultat dégradé. Le web, permissif, affichait des créateurs vides sans rien
signaler.

Réutiliser les schémas partagés qui décrivent déjà les types clients plutôt que
d'en réécrire un : `userMinimalSchema` ↔ `APICommunityUser`,
`communityMemberSchema` ↔ `APICommunityMember`, `conversationParticipantSchema`
↔ le participant iOS/web.

Corollaire : **un champ que le schéma déclare et que la requête ne charge pas
est la même dérive, dans l'autre sens.** `PATCH /conversations/:id` déclarait
`participants[].userId` sans jamais le `select` — la réponse sortait sans, et
sans lui aucune carte de visibilité de présence n'est adressable.

### « Objet libre » ≠ « pas de déclaration » — c'est `additionalProperties`

La seule défense honnête de `{ type: 'object' }` est *« mais c'est une carte,
je ne connais pas ses clés »*. Elle est parfois vraie — et la déclaration qui
la dit s'appelle `additionalProperties`, pas le silence :

```ts
hourlyDistribution: { type: 'object', additionalProperties: { type: 'number' } }
```

L'une laisse passer les clés inconnues, l'autre les supprime toutes. La
question à poser à chaque objet de réponse est binaire : **carte à clés
inconnues ⇒ `additionalProperties` ; sinon ⇒ `properties`.** Le silence n'est
jamais la réponse. (`GET /conversations/:id/stats` porte les trois formes côte à
côte : `contentTypes` fermé, `hourlyDistribution` carte, les trois autres en
tableaux — cycle 86.)

### Cette famille a TROIS formes, et le balayage n'en distingue aucune

Un schéma de réponse ne décrit pas seulement le CONTENU d'un champ : il décrit
aussi **sa présence**, et à quel NIVEAU d'enveloppe il prétend la décrire. Les
trois cas ont la même signature dans le code et des conséquences sans commune
mesure :

| forme | exemple | effet |
|---|---|---|
| **1** — la clé déclarée EXISTE dans la charge | `creator: { type: 'object' }` sur une charge qui porte `creator` | ce champ sort `{}`, **le reste survit** |
| **2** — la clé déclarée N'EXISTE PAS | `data: { properties: { message } }` sur une charge sans `message` | **le parent ENTIER sort `{}`** |
| **3** — le schéma décrit la MAUVAISE enveloppe | `GET /messages/:messageId` (voir plus bas) | **rien ne sort vide** — le balayage rend un FAUX POSITIF |

Le balayage ne voit que le schéma, jamais la charge d'en face. **Avant de
réparer un site de l'inventaire, poser les deux questions : que passe le
gestionnaire à `sendSuccess`, et à quel niveau le schéma prétend-il le
décrire ?**

La forme 3 est la plus dangereuse, parce que l'outil s'y trompe **dans le sens
rassurant** : un champ signalé « vidé » peut être servi brut, en fuite. C'est
exactement ce qui s'est passé sur `messages.ts` (cycle 88) — détail dans
§ *Une déclaration n'agit que si le schéma décrit la bonne ENVELOPPE*.

Trois sites de forme 2 corrigés au cycle 88 bis, tous du même patron : une
enveloppe `data.message` / `data.link` qu'aucun gestionnaire n'a jamais produite.
Les deux transports REST d'édition de message rendaient `{"success":true,
"data":{}}` ; `POST /conversations/:id/new-link` rendait
`{"success":true,"data":{"link":{}}}` — ni lien, ni code, ni réglages.

**Un défaut de sérialisation, seul, produit une boucle de réémission temps
réel.** Sur `PATCH /messages/:messageId`, `data: {}` fait échouer le décodage
Android (`ApiMessage.id`/`.conversationId` n'ont pas de défaut) ; `apiCall` rend
`Failure(PARSE)` ; `OutboxFlushWorker` traduit tout `Failure` d'une
`EDIT_MESSAGE` en `TransientFailure`, donc en RÉESSAI. La ligne d'outbox ne
draine jamais, et chaque vidange rejoue l'édition que le serveur rediffuse en
`message:edited` à toute la room. Chaque maillon est correct ; c'est la réponse
vide qui les compose en boucle. **Chercher la cause d'une boucle de réessai dans
la file d'attente, c'est chercher là où la lumière est meilleure.**

### Une forme écrite dans du CODE MORT n'est pas maintenue, et se propage

`messageResponseSchema` portait l'enveloppe fantôme `data.message` et n'était
**utilisé nulle part** — ce qui l'a mis hors de portée de toute correction, et
n'a rien empêché : ses deux copies inline vivaient dans les routes servies. Un
schéma mort n'est pas neutre, il est un **patron**.

Le correctif n'est pas de le supprimer, c'est de le rendre VIVANT : corrigé en
`data: messageSchema` et CONSOMMÉ par les deux routes, il n'y a plus de forme à
copier, il y a un import.

Corollaire : **un contrat déclaré doit être EXERCÉ.** Des trois transports
d'édition de message, le seul qui servait la charge entière est
`PUT /messages/:messageId` — celui qui ne déclare AUCUN schéma de réponse. Un
schéma faux est strictement pire que pas de schéma ; la conclusion n'est pas
d'en retirer, c'est d'en tester la sortie.

### Le balayage est OUTILLÉ et en CLIQUET : 38 sites, et il reste 4

### La forme 2 est OUTILLÉE — le second balayage

La taxonomie ci-dessus dit que « le balayage n'en distingue aucune ». C'est vrai
du balayage des objets NUS, qui cherche l'absence de `properties`. La **forme 2**
— la clé déclarée n'existe pas dans la charge — est désormais outillée à son
tour, et en cliquet :
`routes/__tests__/response-payload-mismatch.ts`, gardé par
`response-payload-mismatch.test.ts` (cycle 91 bis).

Il apparie chaque bloc `response:` avec les `sendSuccess(reply, { … })` qui le
SUIVENT — le gestionnaire d'une route vit entre son schéma et le schéma suivant
— et compare les jeux de clés : `total` (aucune clé envoyée n'est déclarée ⇒
`data` sort à `{}`) contre `partial` (les clés supprimées, nommées). Il ne
conclut jamais au vide quand la charge porte un `...spread`, qui peut apporter
les clés déclarées.

Sa limite, assumée : `sendSuccess(reply, maVariable)` lui échappe — remonter
jusqu'à la variable demanderait un typeur, pas un balayage.

**`FROZEN_MISMATCHES` est VIDE depuis le cycle 92 bis**, et c'est un état à défendre,
pas un état atteint. Son dernier site — l'invitation — y a été gelé un cycle
entier PAR DÉCISION, le temps que son gate de présence soit prêt. Quand le
cliquet tombe : ouvrir l'ÉMETTEUR (le seul discriminant, cycle 91 bis) avant de
geler quoi que ce soit, et ne geler que ce qu'une raison ÉCRITE justifie de
laisser ouvert.

**Pourquoi il fallait l'outiller, et pas seulement poser la question.** Le
cycle 88 bis a réparé trois sites de forme 2 en les cherchant à la main. Le
`DELETE /…/messages/:messageId` — dans le MÊME fichier, entre les deux
transports d'édition réparés — est passé au travers : son
`message: { type: 'string' }` est irréprochable, et il décrit
`{messageId, deleted, meta}`. Il rendait `data: {}` depuis toujours, et personne
ne l'a vu en corrigeant ses deux voisins.

Trois autres exemplaires vivaient en production, tous en forme 2, et deux
touchaient l'AUTHENTIFICATION :

| route | déclaré | envoyé | effet |
|---|---|---|---|
| `POST /auth/login` (branche 2FA) | `user, token, sessionToken, session, expiresIn` | `requires2FA, twoFactorToken, …` | **aucun compte 2FA ne pouvait se connecter** |
| `POST /auth/register` (conflit de numéro) | `user, token, expiresIn` | `phoneOwnershipConflict, phoneOwnerInfo, pendingRegistration` | modale de transfert morte |
| `DELETE /…/messages/:id` | `message` (string) | `messageId, deleted, meta` | acquittement vide |

**Une route qui sert DEUX charges utiles sous le même code de statut doit
déclarer les deux.** C'est le patron des deux routes d'auth : une branche
nominale et une branche « il manque quelque chose », le schéma n'ayant été écrit
que pour la première.

Corollaire de méthode, et c'est ce qui a laissé ces trois-là vivre : **un témoin
qui n'assert que `statusCode` couvre une route morte sans jamais rougir.** Pire,
quand quelqu'un REMARQUE le retrait et l'écrit en commentaire au lieu de le
traiter comme un défaut, il scelle la panne :

```ts
// 2FA case returns 200 (response schema strips requires2FA from serialized output)
```

Ce commentaire a tenu la connexion à deux facteurs fermée en le disant à voix
haute. Devant toute phrase de cette forme — « le schéma retire X », « ce champ
ne sort pas » — la question est : *et c'est bien ?*

**Et réparer un schéma peut OUVRIR ce que la panne retenait.** La charge du
conflit de numéro portait le mot de passe EN CLAIR ; il ne sortait pas, le
schéma le retirant avec tout le reste. Déclarer la branche sans y penser aurait
publié le secret sans faire tomber un témoin. Le retrait se fait à la SOURCE —
compter sur une omission de schéma pour retenir un secret est un piège armé,
pas une protection (règle du cycle 84).


**L'outil vit dans le dépôt** — `routes/__tests__/response-schema-sweep.ts`,
gardé par `response-schema-sweep.test.ts` (cycle 87 bis). **Ne pas le refaire à
la main.** Le cycle 86 l'avait construit et laissé dans son JOURNAL ; deux
cycles plus tard, deux agents ont retrouvé les mêmes trois sites séparément, à
la main, le même jour. Le coût d'un outil hors du dépôt ne se paie pas en
mémoire, mais en travail fait deux fois.

Un `grep` ne suffit pas — il faut résoudre l'objet littéral englobant (a-t-il
`properties` ?), calculer la portée des clés `response:` (un schéma de REQUÊTE
sans `properties` est permissif, pas destructeur), et **dépouiller les
commentaires**, sans quoi on retrouve les commentaires des cycles précédents au
lieu des défauts.

Le test **gèle** l'inventaire restant. **Quand il tombe :** une entrée EN TROP =
un nouveau site nu vient d'entrer, à déclarer (`properties` si structuré,
`additionalProperties` si carte) ; une entrée EN MOINS = un site réparé, et
retirer sa ligne fait partie du correctif. L'inventaire est clé par fichier +
champ + code de statut, **jamais** par numéro de ligne — une clé de ligne dérive
à la première édition et transforme le cliquet en bruit.

**Lister un champ avec un schéma VIDE est pire que ne pas le lister du tout** —
un parent `additionalProperties: true` ne rattrape pas un enfant déclaré vide,
puisque la clé est LISTÉE : le champ sort à `{}` là où l'omettre l'aurait laissé
passer entier. La règle est juste et vérifiée au compilateur.

**Mais elle ne s'appliquait PAS à `GET /messages/:messageId`**, que ce
paragraphe citait en exemple. Sur cette route, le schéma décrivait le MESSAGE
quand `sendSuccess` répond `{ success, data }` : `sender` n'était pas une clé de
l'objet réel, la déclaration était donc INERTE et le champ traversait entier
(§ Une déclaration n'agit que si le schéma décrit la bonne ENVELOPPE). Ce site
ne vidait rien — il portait une fuite de présence ACTIVE, fermée au cycle 88 par
un gate à la source.

**Aligné au cycle 94**, et l'alignement a découvert les DEUX défauts que
l'enveloppe inerte neutralisait — voir § *Gouverner, c'est créer la possibilité
du désaccord* ci-dessous.

**État de l'inventaire** : les sites de niveau `data:` (charge utile ENTIÈRE) et
les cinq sites de PRÉSENCE sont corrigés ; les onze schémas d'ERREUR écrits à la
main sont repris au cycle 89 ; les quatre `analysis` de `voice-analysis.ts` au
cycle 90, avec la PANNE qu'ils recouvraient ; les trois de `voice/translation.ts`
au cycle 91, avec la TRONCATURE que portait la forme « juste » du même fichier ;
les trois enveloppes fantômes au cycle 88 bis.

**Les trois derniers sont partis au cycle 91 bis** — `calls.ts|details|400`
(schéma d'erreur écrit à la main, faux sur l'enveloppe dans les trois sens),
`links/admin.ts|creator|200` (déclaré depuis ses deux émetteurs), et
`users/profile.ts|permissions|200`, **RETIRÉ** plutôt que déclaré : son
gestionnaire posait `permissions: undefined` délibérément, le champ n'avait
aucun producteur.

**L'inventaire est VIDE depuis le cycle 94.** Sa dernière ligne —
`messages.ts|sender|200`, seule de la forme 3 — est partie avec le lot qui a
aligné `GET /messages/:messageId` sur son enveloppe réelle. Les 42 clés servies
ont été relevées MÉCANIQUEMENT depuis le `select` et les surcharges du handler,
puis passées au sérialiseur : 42 entrent, 42 sortent. `FROZEN_INVENTORY` doit
rester VIDE — quand le cliquet tombe, l'entrée en trop est un site NEUF, à
déclarer, jamais à geler. Inventaires raisonnés :
`tasks/realtime-sync-audit-2026-08-22-cycle91-bis.md`,
`…-cycle91.md` §8 et `…-cycle88-bis.md` §5 — ce dernier pose les deux questions
à instruire AVANT de réparer : que passe le gestionnaire à `sendSuccess`, et à
quel niveau le schéma prétend-il le décrire ?

**Le compte se lit dans le FICHIER, jamais dans le journal précédent.** Les
cycles 89 à 92 ont publié 15, 11, 8 puis 6 restants quand `FROZEN_INVENTORY` en
portait 14, 10, 7 puis 5, et leurs tableaux nommaient un champ `user` qui n'y a
jamais figuré : il vient d'un tableau en prose du cycle 88, recopié de journal
en journal sans être confronté au fichier, pendant que le compte se propageait
par soustraction depuis un premier chiffre déjà faux. Le cliquet était vert à
chaque cycle — le FICHIER a toujours été juste, c'est la prose qui a dérivé.
**Un compte est une AFFIRMATION, comme un tri (cycle 86 bis) : il se compte,
il ne s'hérite pas.**

**Et le `calls.ts|details|400` retiré ci-dessus était une FEUILLE.** Le balayage
d'ERREUR (§ *La troisième forme*) a ouvert la racine que ce cliquet-ci ne peut
pas voir : le `details` fautif était imbriqué dans un `error` déclaré OBJET, et
cette racine-là vivait sur les **dix-neuf** schémas du fichier, pas sur le seul
400 que l'inventaire nommait. Une clé du mauvais TYPE porte des `properties` :
elle n'est jamais « nue ».

**Le balayage ne lit que `services/gateway/src/routes`** : les schémas de
`packages/shared`, dont un défaut se propage le plus loin, lui échappent. **Et
il ne détecte qu'une déclaration ABSENTE, jamais une déclaration INCOMPLÈTE**
(§ Une déclaration n'est juste que contre son PRODUCTEUR) — un vert au cliquet
n'atteste donc pas qu'un schéma dit vrai.

### Gouverner, c'est créer la possibilité du désaccord

Une charge utile NON gouvernée ne se trompe jamais — il n'y a pas de contrat à
contredire. C'est ce qui la rend dangereuse, et le cycle 94 l'a mesuré en
alignant la dernière enveloppe inerte du dépôt (`GET /messages/:messageId`).
Deux défauts vivaient dessous, invisibles tant que rien ne les confrontait :

**1. `translations` sortait en CARTE Mongo.** `schema.prisma` est explicite —
`Message.translations` est une map `langue → {text, …}`. Le contrat déclare un
TABLEAU `{targetLanguage, translatedContent, …}`, et les TROIS clients le
décodent ainsi (iOS `[APITextTranslation]?`, Android `List<ApiTextTranslation>`,
`messageSchema.translations`). Le pont existe — `transformTranslationsToArray`
(`utils/translation-transformer.ts`) — et il était appliqué par la liste, par la
recherche, et **par les deux autres transports du MÊME fichier**. Pas par ce
GET-là, qui étalait `...message`.

Le symptôme ne remontait nulle part, parce que le seul consommateur de cette
route est l'extension de notification iOS : elle appelle, dépose le blob dans
l'App Group, et `NSEPendingMessageConsumer` le décode en `APIMessage` — où
`translations` se décode avec un `try` NON tolérant, contrairement à ses voisins
immédiats (`callSummary`, `trackingLinks`) qui sont en `try?`. Une carte y fait
échouer le décodage du message ENTIER ; le consommateur SUPPRIME le fichier.
**Le démarrage à froid depuis une notification était sans son message, pour tout
message portant au moins une traduction** — donc, sur un produit qui traduit
tout, pour à peu près tous.

> **Réparer l'ADRESSE d'un appel ne prouve rien sur la FORME de sa réponse.**
> Cette route avait justement été CHOISIE à l'audit du 2026-08-13 pour rétablir
> cette garantie (l'appel précédent visait une paire méthode/chemin jamais
> enregistrée et répondait 404). La garantie a été rétablie au transport, et
> reperdue à la forme. Un 404 se voit ; un 200 dont le corps ne se décode pas ne
> laisse qu'une ligne de log dans un processus que personne ne regarde.

**2. `encryptionMode` manquait à `messageSchema`**, sur la foi de ce commentaire :

```ts
// Encryption (encryptionMode is only on Conversation)
```

Faux. `schema.prisma` porte le champ sur `Message` aussi, deux routes le
CHARGENT, et le SDK iOS le DÉCLARE sur son message. Le défaut n'était pas propre
à la route du lot : la LISTE sert par `items: messageSchema`, donc mesuré au
sérialiseur, `encryptionMode` était **supprimé de chaque message de chaque
page**. Un client E2EE recevait `isEncrypted: true` et le chiffré, sans savoir
**sous quel régime** déchiffrer. C'est mot pour mot le défaut « R5 » des pièces
jointes, une couche plus haut — `messageAttachmentSchema` a son enveloppe E2EE
et son cliquet (`attachmentIncludes.test.ts`), le MESSAGE porteur ne les avait
pas.

> **Un commentaire qui ÉNONCE une contrainte de schéma est une AFFIRMATION, et
> se vérifie comme telle** — comme un tri (cycle 86 bis) et comme un compte
> (cycle 93). Celui-ci a tenu un champ hors du contrat pendant toute la vie de
> `messageSchema`, alors que `schema.prisma` le contredisait à deux fichiers de
> là. Même famille que la note de `storyAuthorSelect` qui ÉNUMÉRAIT trois
> audiences gatées en omettant la quatrième, celle qui ne l'est pas.

**Méthode, et elle n'est pas négociable** : les clés servies se relèvent
MÉCANIQUEMENT (parcours de profondeur sur le littéral `select:` + les surcharges
que le handler compose ensuite), puis se passent au vrai `fast-json-stringify`.
La réutilisation naïve du schéma partagé perdait ici CINQ choses
(`encryptionMode`, `conversation`, `statusSummary`, `sender.user`, et la relation
brute `reactions` des pièces jointes). Lire le schéma ne l'aurait pas dit.

**Et un lot qui gouverne une charge utile jusque-là libre ne doit rien y décider
d'autre.** `conversation` (la ligne d'appartenance de l'APPELANT, chargée pour
le contrôle d'accès) et `statusSummary` (le miroir groupé des trois compteurs)
sont déclarés TELS QU'ILS SONT SERVIS, pas retirés : un changement de contrat se
décide sur des preuves de consommation client. Sinon la mesure « rien n'a été
perdu » cesse d'être vérifiable, et c'est la seule qui protège les clients.

**Enfin, la quatrième famille n'est pas outillée.** Les trois cliquets sont à
inventaire vide en même temps depuis le cycle 94, et aucun ne voit une
déclaration **présente, bien formée, et fausse contre son producteur** — ce
qu'étaient les deux défauts ci-dessus. Un vert aux trois n'atteste pas qu'un
schéma dit vrai.

### Une déclaration n'agit que si le schéma décrit la bonne ENVELOPPE

`{ type: 'object' }` nu ne vide que si le schéma qui le porte décrit vraiment la
charge utile. `GET /messages/:messageId` déclare `id`, `content`, `sender`… au
premier niveau, alors que `sendSuccess` répond `{ success, data }` : aucune de
ces propriétés ne matche, `success`/`data` sont non déclarés, et l'objet entier
traverse par l'`additionalProperties: true` du bloc. **Toutes les déclarations
y sont inertes** (cycle 88, vérifié en isolant le compilateur).

Conséquences, dans les deux sens :

- **Le balayage rend un faux positif** sur ces sites — un champ signalé « vidé »
  qui ne l'est pas. Vérifier l'enveloppe avant de conclure.
- **Et un vrai défaut peut s'y cacher** : ce site-là servait la présence brute de
  l'expéditeur sur ses DEUX porteurs, en fuite ACTIVE — l'inverse du piège armé
  du cycle 84 bis, et plus urgent. Le signal était faux, la conclusion juste.
- **Aligner un tel schéma est un lot en soi** : déclarer partiellement une
  enveloppe qui passait entière TRONQUE ce qui marchait. Le faire avec la liste
  complète des champs servis, ou pas du tout.

### Le `where` dit qui SORT — plus quel régime de présence s'applique

Le contrôle d'accès borne qui ENTRE ; la requête borne ce qui SORT. Au cycle 88,
la seconde décidait encore du régime de présence : sur
`GET /communities/:id/conversations`, le `where` porte
`participants: { some: { userId } }`, donc tout profil servi est un
CO-PARTICIPANT, et la route servait « préférences seules » sans condition. La
directive du 2026-08-25 a retiré la co-participation des critères : la route
passe aujourd'hui par le strict comme les autres (`resolveForTargets` avec le
viewer, `communities/member-presence.ts`), et les pastilles que le cycle 88
préservait ne sont légitimes que pour un ami accepté. La leçon de MÉTHODE
survit — lire le `where` avant de raisonner sur ce qu'une route sert — le
verdict de présence, non.

### Un schéma d'ERREUR se confronte à l'enveloppe, pas à l'intuition

`utils/response.ts` produit `{ ...details, success, error, message, code,
violations? }`. Deux faits que onze schémas écrits à la main ignoraient
(cycle 89) :

- **`details` n'est PAS une clé** — il est ÉTALÉ à la racine (c'est ainsi que
  `suggestedNickname` remonte sur un 409). Un schéma qui déclare
  `details: { type: 'array' }` décrit un champ qui n'existe jamais.
- **Le seul tableau que l'enveloppe porte s'appelle `violations`**, dont les
  éléments sont `{ path, message }`.

Ces onze blocs supprimaient en prime, selon leur forme, `error` ou `message`, et
**`code` sur les onze** — que `api.service.ts` lit pour son `ApiServiceError`.
Le TEXTE survivait toujours (le client lit `data.message || data.error`), et
aucun de ces chemins ne pose de `code` aujourd'hui : **piège armé, pas panne.**

**Ne pas écrire de schéma d'erreur à la main.** `errorResponseSchema` pour un
échec simple, `validationErrorResponseSchema` quand il y a des `violations`.
Les deux étaient déjà utilisés à quelques lignes des blocs fautifs, dans les
mêmes fichiers. **C'est outillé et en cliquet depuis le cycle 92** —
`routes/__tests__/error-schema-sweep.ts`, inventaire VIDE : il n'y a pas de dette
d'erreur légitime à porter, la forme juste étant toujours la même constante.

### La troisième forme : une clé du MAUVAIS TYPE est COERCÉE, pas supprimée

Le cycle 89 cherchait des clés ABSENTES. `calls.ts` portait l'autre moitié du
défaut sur ses **dix-neuf** schémas : `error` déclaré OBJET
`{ code, message, details }`, quand `sendError` en pose une CHAÎNE — le code
d'erreur lui-même. Mesuré au sérialiseur :

```
in  : { success: false, error: 'NOT_A_PARTICIPANT', message: 'Vous ne participez pas…', code: … }
out : {"success":false,"error":{}}
```

Toute la surface de signalisation d'appel servait ses erreurs **sans code, sans
message et sans rien d'exploitable**. Une déclaration d'apparence complète, donc
invisible au balayage frère — qui ne signalait que le `details` imbriqué, la
feuille, jamais la racine.

> **Un schéma d'erreur ne se vérifie pas sur la PRÉSENCE des clés mais sur leur
> TYPE contre le producteur.** `sendError` est unique : `success` booléen,
> `error`/`message`/`code` chaînes. Toute autre forme est fausse, et l'écrire
> n'échoue pas — elle coerce.

**`errorResponseSchema` déclare `message` depuis le cycle 92.** Le constat était
posé ici depuis le cycle 89 comme « une décision, pas une initiative » ; ce qui
l'a tranchée, c'est que ramener les schémas écrits à la main sur cette constante
l'EXIGE — dix d'entre eux déclaraient `{ success, message }` et servaient donc
bien leur phrase, que consolider sur une constante muette aurait supprimée. Le
texte n'était pas décoratif : **138 appels d’erreur (sur 1440) passent un `message` distinct
de l'`error`**, et `api.service.ts:239` le lit EN PREMIER
(`data.message || data.error`).

### Une déclaration n'est juste que contre son PRODUCTEUR

Le cliquet garde contre l'**absence** de déclaration. Rien ne garde contre une
déclaration qui dit **faux** — et une déclaration fausse tronque exactement
comme un objet nu vide, sans qu'aucun outil ne la signale, puisqu'elle porte
des `properties`.

Cas mesuré (cycle 91) : `routes/voice/translation.ts` portait trois
`attachment: { type: 'object' }` nus **et**, trois cents lignes plus bas, la
forme « juste » qu'on aurait voulu leur copier. Elle déclarait les six champs du
producteur COURT (`translateAttachment`) sur une route qui sert le producteur
LONG (`getAttachmentWithTranscription`, treize champs) :

```
out : {"id","messageId","fileName","fileUrl","duration","mimeType"}
      ← originalName, fileSize, bitrate, sampleRate, codec, channels, createdAt PERDUS
```

Plus `translatedAudios`, produit par les trois chemins de la route et jamais
déclaré, donc supprimé sur les trois.

> **Copier la forme juste d'à côté ne suffit pas : il faut l'ouvrir contre le
> producteur de CETTE route.** Trois fois de suite (cycles 84, 89, 91) la bonne
> forme se trouvait à portée de regard du défaut ; la troisième fois, elle était
> fausse aussi.

**Un schéma partagé peut décrire la bonne enveloppe et le mauvais PRODUCTEUR**
(cycle 93). Une fois l'enveloppe fantôme de `messageResponseSchema` corrigée
(cycle 88 bis, `data: messageSchema`), les deux routes d'édition servent enfin
leur message — et leur `sender` sort TRONQUÉ. `messageSchema.sender` est
`userMinimalSchema`, écrit pour un `User`, quand ces routes chargent un
`Participant` :

```
in  : { id, userId, displayName, avatar, type, role, language, user: {…} }
out : { id, userId, displayName, avatar, type }     ← role, language, user PERDUS
```

Deux défauts empilés sur le même champ, réparés dans cet ordre : tant que le
parent sortait `{}`, le second était invisible. **Réparer une enveloppe rend
lisibles les défauts de ce qu'elle contenait** — la deuxième passe n'est pas
facultative.

**Le grain juste est celui qui CHARGE.** Deux routes qui chargent plus qu'un
schéma partagé MINIMAL ne déclare, déclarent plus LOCALEMENT — élargir
`userMinimalSchema` aurait poussé `role`, `language` et un `user` imbriqué sur
les dizaines de réponses qui l'emploient, dont beaucoup décrivent un vrai `User`.
Le schéma partagé ne grossit pas pour deux appelants. (À trois, la réponse
devient un `participantSenderSchema` partagé — pas un élargissement du minimal.)

**Entre deux producteurs, déclarer le SUPERSET.** L'asymétrie du sérialiseur le
permet et le commande : une clé déclarée qu'un objet ne porte pas n'est pas
fabriquée, une clé portée et non déclarée est supprimée. Le superset est donc
sans risque dans un sens et le seul correct dans l'autre.

**Et quand les deux producteurs se CONTREDISENT** au lieu de s'emboîter — sur
`translatedAudios`, l'un rend `audioBase64`, l'autre `audioPath`/`id`/`createdAt` —
il n'y a pas de superset. Ne rien déclarer (`{ type: 'array' }` sans `items`,
qui laisse passer) est alors plus honnête que d'en choisir un ; l'écrire en
commentaire sur place, pour que ça se lise comme une décision et non comme un
oubli.

### Un tableau sans `items` est PERMISSIF ; un objet sans `properties` EFFACE

L'asymétrie n'est pas une intuition, elle est mesurée au compilateur :

```
schéma : { success: { type: 'array' } }
in     : { success: [ { a: 1, b: { c: 2 } } ] }
out    : {"success":[{"a":1,"b":{"c":2}}]}      ← intact
```

C'est ce qui justifie que le balayage ne signale QUE les objets nus : un
tableau non décrit laisse passer, il ne vide pas. Déclarer ses `items` reste un
gain de contrat — jamais une réparation de fuite, et il ne faut pas le compter
comme telle (cycle 90).

### Avant de déclarer un champ, remonter jusqu'à l'ÉMETTEUR

Le type TypeScript n'est PAS une source de vérité tant qu'il n'a pas été
confronté à ce que l'émetteur émet. Sur l'analyse vocale (cycle 90),
`VoiceCharacteristics.to_dict()` (Python) et `VoiceAnalysisResult`
(`@meeshy/shared`) **ne partagent aucune clé de feuille** — `pitch.mean_hz`
contre `pitch.mean`, `spectral.*` contre `timbre.*`, `metadata.confidence`
contre `classification.confidence`. Quatre familles portaient le même nom au
premier niveau, ce qui suffisait à rendre les deux formes crédibles.

Trois conséquences, toutes vérifiées sur ce cas :

- **Écrire le schéma depuis le type aurait servi `{ pitch: {}, mfcc: {}, … }`** :
  les bons noms de famille, rien dedans, et `spectral` / `quality` / `prosody` /
  `metadata` supprimés. Une réponse d'apparence correcte est pire qu'une réponse
  vide.
- **Un cast à la frontière est un vœu.** `_sendRequest<VoiceAnalysisResult>(…)`
  ne vérifiait rien. Un adaptateur explicite est le seul endroit honnête où la
  traduction de forme a lieu (`services/voice-analysis-normalize.ts`).
- **Le calcul qui lit ces champs peut être une CONSTANTE sans que rien ne le
  dise.** `calculateQualityMetrics` rendait `0,45` / « fair » / « pas bon pour le
  clonage » pour toute voix — `clarity = 0` (clé absente), `consistency = 1`
  (`0 / 1`), `confidence` au défaut. Des chiffres plausibles, jamais nuls, donc
  jamais signalés. Ses témoins étaient verts : ils FABRIQUAIENT la forme déclarée
  avant de la passer au service.

Corollaire de couches : **un défaut de forme peut être la troisième d'une pile.**
Ici la route ne rendait même jamais `200` (§ doubles de test ci-dessous), et
réparer une seule couche n'aurait rien montré. Remonter jusqu'à l'émetteur est la
seule façon de savoir combien de couches on répare.

### Un `MagicMock` nu n'est pas un double, c'est un oui-oui

Il accepte n'importe quel argument nommé et FABRIQUE n'importe quel attribut
demandé. Il rend donc vertes les deux formes exactes de panne d'intégration :

```python
self.voice_analyzer.analyze(audio_path=…, analysis_types=…)  # TypeError réel
self.voice_analyzer.compare_voices(…)                        # AttributeError réel
```

Les deux opérations de voix étaient MORTES en production — avalées par un
`except Exception` large, servies en `INTERNAL_ERROR` — avec des témoins verts
au-dessus (cycle 90).

**Le correctif est `create_autospec`, pas `spec=`.** `MagicMock(spec=X)` ne
contrôle que l'EXISTENCE des attributs, jamais les signatures ; et réassigner
`service.analyze = AsyncMock(...)` efface de toute façon ce que le `spec` y avait
posé. Vérifié : sous `spec=`, la production revertie laissait le témoin PASSER.

```python
service = create_autospec(VoiceAnalyzerService, instance=True)
service.analyze.return_value = …          # jamais `service.analyze = AsyncMock(…)`
```

Et un double qui rend une charge utile INVENTÉE propage la fiction : celui-ci
rendait du camelCase qu'aucun émetteur du dépôt ne produit. **Un double se
construit depuis la sortie réelle du collaborateur, capturée, pas depuis le type
qu'on aimerait qu'il ait.**

Enfin, le témoin voisin assertait
`result['type'] in ['voice_api_success', 'voice_api_error']` — il ne pouvait pas
tomber. **Un témoin qui accepte les deux issues n'atteste rien** (§ Tests — un
témoin qui ne peut pas tomber n'est pas un témoin).

### « Sans producteur » ne veut pas dire « à supprimer »

Le cycle 88 avait classé ces onze champs comme du bruit à retirer. Ils
l'étaient — mais le schéma qui les portait supprimait aussi des champs que
l'émetteur PRODUIT. Retirer le mort et s'arrêter là aurait laissé `code` tomber
pour toujours. **Un schéma faux se répare en le confrontant à ce que l'émetteur
émet, jamais en retranchant seulement ce qu'on sait faux.**

### Un tri est une AFFIRMATION, et se vérifie comme telle

Le cycle 86 bis a publié une priorité sur quatorze sites groupés sous
l'étiquette `items`, en les annonçant « listes vides, gravité maximale ». Le tri
était faux, par un artefact d'extraction : sur
`data: { type: 'array', items: { type: 'object' } }`, l'objet nu est porté par
`items` — le mot-clé JSON Schema — et non par `data`. **Trois charges utiles
ENTIÈRES se sont donc rangées sous une étiquette de détail**, dans le même
document qui affirmait n'en avoir laissé que deux ; les onze autres sont des
champs `details`/`errors` de réponses 400 **sans aucun producteur** (gravité
documentaire — les retirer plutôt que les déclarer).

Corrigé au cycle 87, après ouverture de chacun des quatorze. **Ne jamais
prioriser un inventaire sur la foi d'une clé extraite par script sans avoir
ouvert les sites.**

### La liste vide est plus dangereuse que la réponse vide

Une charge utile `data:` sérialisée en `{}` se voit — l'écran est blanc,
quelqu'un le signale. Une LISTE de la bonne longueur, à la pagination juste,
dont chaque ligne est `{}`, ressemble à un défaut d'affichage : elle envoie
chercher du mauvais côté et survit plus longtemps. Trois listes
d'administration (`/admin/messages`, `/admin/communities`, `/admin/posts`,
toutes lues par le web) l'ont fait jusqu'au cycle 87.

Corollaire de harnais : **un double Prisma qui rend `[]` rend tout témoin de
contenu trivialement vert.** Rien ne distingue « la route sert ses lignes » de
« la route n'a aucune ligne » tant que le double est vide — c'est ce qui a
laissé ces trois listes couvertes et cassées.

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

## Un `default` dans un schéma de REQUÊTE est une ÉCRITURE, pas une documentation

Tout ce qui précède porte sur les schémas de RÉPONSE. Le miroir existe côté
REQUÊTE, et il est plus discret : Fastify active `useDefaults` d'AJV, et
`server.ts` ne le désactive pas. Un `default` dans un bloc `body:` /
`querystring:` / `params:` **écrit dans `request.body` avant que le
gestionnaire ne s'exécute**. Mesuré sous les options AJV exactes de la
production :

```
schéma : originalLanguage: { type: 'string', default: 'fr' }
requête: { content: 'x' }
handler: { content: 'x', originalLanguage: 'fr' }
```

Conséquence : **un gestionnaire ne peut PAS distinguer l'absence sur un champ
qui porte un `default`.** Toute garde de la forme `x === undefined ? … : …`,
`if (!x)`, `x ?? …` y est un no-op — c'est la famille « une garde conditionnée
à ce qu'elle garde est un no-op » (cycle 96), avec la variante qui la rend
invisible : **ce n'est pas le gestionnaire qui est faux, c'est la couche
au-dessus qui rend sa précondition inatteignable.** Le code se lit juste, le
commentaire dit vrai, et la règle ne s'applique jamais.

Cas mesuré (cycle 103) : `PUT /conversations/:id/messages/:messageId` est la
SEULE des quatre entrées d'édition à réécrire `originalLanguage`, et sa garde
énonçait exactement la bonne intention — « l'omettre veut dire *je n'affirme
rien sur la langue*, pas *c'est du français* ». Son schéma portait
`default: 'fr'`. Une omission réétiquetait donc le message en français **en
base ET comme langue SOURCE de la retraduction** : un texte anglais ressortait
traduit comme du français dans toutes les langues du Prisme.

La question à poser à chaque `default` de requête est binaire :

| le gestionnaire distingue-t-il l'absence ? | verdict |
|---|---|
| non — la valeur est un simple repli (`limit`, `offset`, `page`) | `default` légitime |
| oui — une branche lit `undefined` / `!x` | **le `default` la supprime** : le retirer, et laisser le repli au gestionnaire |

Le repli appartient au gestionnaire, qui est le seul à savoir ce que
l'absence VEUT DIRE. Le schéma ne peut que la faire disparaître.

**Piège armé ≠ panne, et la distinction se MESURE, elle ne se suppose pas.**
Sur ce cas, aucun client ne déclenchait le défaut — le web passe la clé en
paramètre requis, iOS et Android éditent par deux autres routes. Ce qui ne
change rien à la conclusion (règle du cycle 84 : on ne laisse pas un piège armé
au motif que personne n'a encore marché dessus), mais change tout au récit :
annoncer une panne qu'on n'a pas mesurée coûte la confiance dans les cycles où
il y en a une.

## Une porte de TYPE garde le sortant ; seule l'exécution garde l'entrant

Les cycles 104 à 106 ont bâti la porte d'émission, et trois journaux de suite se
sont clos sur le même suivi : « le miroir client→serveur n'est pas gouverné,
`ClientToServerEvents` n'a aucun équivalent de `serverEmit.ts` ». Le cycle 107
l'a instruit et l'a **mesuré faux**.

Le constat de départ était exact ; la conclusion ne l'était pas, et l'écart tient
en une distinction :

| sens | ce qu'une porte de TYPE garde |
|---|---|
| SORTANT | **tout** — une diffusion Socket.IO n'a aucun sérialiseur, donc ce que le compilateur laisse passer part sur le fil |
| ENTRANT | **rien** — le client n'est pas compilé par nous. Un `socket.on` typé décrit ce que le serveur CROIT recevoir, jamais ce qu'il ACCEPTE |

> **Pour de l'entrant, la seule garde possible est à l'EXÉCUTION** — et c'est
> celle qui existait déjà : 37 validations zod (`validateSocketEvent`), des
> gardes manuscrites dans deux familles (`_validateCoordinates`,
> `OBJECT_ID.test`), et un limiteur de débit sur CHAQUE famille.

La faute de méthode a un nom : la symétrie était **lexicale**. « Le miroir » a
suffi à transposer la conclusion du sortant sur l'entrant, sans ré-instruire la
question — trois cycles durant, par recopie du suivi précédent. **Un suivi
hérité est une AFFIRMATION, exactement comme un compte ou un tri : il se mesure
avant d'être recopié, et le recopier trois fois ne le rend pas vrai.**

### Corollaire : un balayage qui cherche UN idiome mesure sa popularité, pas une propriété

Le premier outil écrit pour ce cycle cherchait `validateSocketEvent` et a rendu
**sept faux positifs** — `LocationHandler` et `AttachmentReactionHandler`
valident, simplement autrement, et `REACTION_REQUEST_SYNC` valide par zod dans un
fichier que le suivi de délégation n'atteignait pas.

C'est la règle du cycle 84 rejouée par inadvertance (« un audit qui liste des
`select:` ne liste pas des fuites »). **Le balayage a été JETÉ, pas gelé** :
geler un inventaire faux aurait transformé une erreur de mesure en vérité de
dépôt, et un cliquet ment plus longtemps qu'un journal.

### Ce qui reste, à sa taille

Deux familles sur douze valident à la main. Écart de CONSISTANCE, pas de
couverture : les gardes sont réelles et lisibles. La question utile n'est pas
« sont-elles gardées ? » mais « la douzième famille le sera-t-elle ? ».

### Et pourtant le CAST, lui, effaçait les DEUX sens

La section ci-dessus est juste, et ce qui suit ne la contredit pas : **une porte
d'écoute typée n'est pas une garde de sécurité, c'est un instrument de
COMPLÉTUDE DE CONTRAT.** Mesuré au compilateur sous le `tsconfig` réel, voici
exactement ce qu'elle refuse — ni plus, et il faut le dire :

| ce qu'on écoute | verdict |
|---|---|
| un nom d'événement ABSENT du contrat | **refusé** (TS2345) |
| une charge SANS RECOUVREMENT avec la déclarée | **refusé** |
| une charge divergente mais assignable dans UN sens | **ACCEPTÉ** |

La troisième ligne est structurelle (`strictFunctionTypes: false` ⇒ paramètres
bivariants). **Une porte annoncée plus stricte qu'elle n'est vaut moins que pas
de porte** : personne n'ira vérifier derrière.

Ce qu'elle garde vraiment, et qui suffit à la justifier : **aucun événement ne
peut plus être ÉCOUTÉ sans être DÉCLARÉ.** `call:analytics` a vécu écouté,
validé par zod (donc GARDÉ, au sens de la section précédente) et agrégé en
production, ses dix-neuf champs transcrits dans la signature du listener, **sans
figurer dans `ClientToServerEvents`** — pendant que les trois clients
l'émettaient chacun contre sa propre transcription. Une validation d'exécution
irréprochable ne dit rien de la dérive de contrat : ce sont deux propriétés
disjointes, et il en faut une garde chacune.

**Le point qui a fait la différence de production** : le socket et le serveur
d'un handler viennent de `socketio/typed-socket.ts` (`MeeshySocket`,
`MeeshyIOServer`), **jamais** de `socket.io`. Quand `MeeshySocketIOManager`
passait son `io` par `this.io as SocketIOServer` — six sites — il ne relâchait
pas seulement l'écoute : il relâchait **tout ce que `CallEventsHandler` ÉMET**,
c'est-à-dire précisément la moitié dont le tableau ci-dessus dit qu'aucune autre
garde ne la couvre.

> **Un `as` vers le type NU d'une dépendance ne relâche pas un appel, il relâche
> tout ce que la valeur castée porte** — ici les deux sens d'un sous-système
> entier. Et il est plus discret qu'une redéclaration : il ne crée aucun type
> nommé qu'on puisse chercher.

Quatre divergences SORTANTES sont tombées à la première compilation sous la
porte, dont `iceServers` sur `call:initiated` — les identifiants TURN, calculés
par destinataire, que le SDK iOS décode pour traverser un NAT dès la SONNERIE,
émis par les deux producteurs et déclarés par aucun contrat (famille `_seq` /
`location`, cycle 105) — et `CallEndedEvent.endedBy`, que le contrat promettait
alors que l'émetteur l'élargit délibérément en optionnel.

> **Une piste peut être fausse sur son MOTIF et juste sur son ADRESSE.** Mesurer
> la prémisse d'un suivi hérité fait abandonner la piste ; mesurer le SITE la
> résout. La conclusion complète n'est pas « le suivi est faux, on passe », mais
> « le suivi est faux, ET voilà ce qu'il y a effectivement à cette adresse ».

### Un `.refine` Zod ne restreint pas `z.infer`

Un objet PLAT gardé par un `.refine` transversal et une union DISCRIMINÉE
expriment les mêmes contraintes à l'EXÉCUTION, et des types INFÉRÉS différents.
Quand le contrat partagé déclare l'union (`WebRTCSignal`), c'est le SCHÉMA qu'on
répare — jamais le site d'émission par un cast, ce qui rouvrirait la porte qu'on
vient de fermer. Bénéfice réel de l'union : zod RETIRE les champs de l'autre
membre, ce dont un relais qui émet `validation.data` plutôt que `data` dépend
déjà pour sa sécurité.

### Un gate rend DEUX verdicts, et ils peuvent se contredire

Le texte ET le code de retour. Deux fois dans le même cycle, un seul des deux a
été lu, et pas le même :

- un `bun run build` échoué redirigé vers `/dev/null` a laissé la passerelle
  compiler contre un `dist` PÉRIMÉ — une preuve de ROUGE semblait ne pas tomber ;
- `bash check-type-debt.sh 2>&1 | tail -20` a rendu `exit 0` sur un gate qui
  ÉCHOUAIT : **le code de retour d'un pipeline est celui de sa DERNIÈRE
  commande**, ici `tail`.

**Ne jamais passer un gate par un pipe quand c'est son code de sortie qu'on
interroge** (`set -o pipefail`, ou rediriger et lire `$?` avant toute autre
commande). Et se méfier particulièrement d'un gate qui échoue en annonçant une
bonne nouvelle — le cliquet de dette de types échoue sur une AMÉLIORATION non
enregistrée, ce qui n'a pas la forme d'un échec.

## La porte d'ÉMISSION se DÉRIVE du contrat, elle ne se redéclare pas

Gouverner la CHARGE d'un événement sans gouverner le CANAL ne garde que le site
où la valeur est construite : le canal reste libre de la porter sous un autre nom
d'événement, et libre de porter n'importe quoi d'autre sous le bon.

La déclaration à ne JAMAIS réécrire :

```ts
to(room: string): { emit(event: string, payload: unknown): unknown }   // ✗
```

Elle vivait **huit fois** dans la passerelle, dans huit fichiers qui ne se citent
pas — chacune commentée « structurale, pour accepter le `Server` de production
comme un double de test », ce qui est vrai et n'exige à aucun moment de renoncer
au contrat. La forme juste est dans `socketio/serverEmit.ts` : `ServerEmitIO`,
`ServerEmitTarget`, `ServerEmitSocket`, tous dérivés de `ServerToClientEvents`,
et tous aussi structuraux que les huit copies qu'ils remplacent.

### `Server<…, ServerToClientEvents>` ne garde PAS un nom d'événement CALCULÉ

C'est le point le plus contre-intuitif, et il est mesuré sous le `tsconfig` de
la production :

| ce qu'on émet | `Server` de socket.io | `ServerEmitTarget` |
|---|---|---|
| nom LITTÉRAL + charge fausse | refuse | refuse |
| nom **UNION** + charge d'un SEUL membre | **ACCEPTE** | refuse |

`EventParams<…, Ev>` sur un `Ev` UNION s'effondre en UNION de tuples de
paramètres : une charge correspondant à n'importe lequel des membres passe sous
n'importe quel autre. Or un nom calculé — `action === 'add' ? X_ADDED : X_REMOVED` —
est une union, et c'est la forme de TOUTE paire `added`/`removed`.

> **Un émetteur qui a l'air gardé et ne l'est pas est pire qu'un émetteur
> ouvertement non typé** : personne ne va le vérifier. Quatre émetteurs de la
> passerelle étaient dans ce cas (`ReactionHandler`, `AttachmentReactionHandler`,
> `PostReactionHandler`, `SocialEventsHandler`) — ils émettent sur un `Server`
> typé, avec un nom calculé. Même famille que « un schéma qui *marche* peut
> cacher une fuite au lieu de l'empêcher » (cycle 92 bis).

### La forme du type : union de tuples, pas méthode générique

`emit<E extends ServerEventName>(event: E, payload: ServerEventPayload<E>)` est
ce qu'on écrit spontanément, et **le `Server` de production ne la satisfait
pas** : socket.io décore sa carte d'événements
(`DecorateAcknowledgementsWithMultipleResponses`) avant d'en dériver ses
paramètres, et deux signatures génériques ne s'unifient pas à travers ce mappage.
`emit(...args: ServerEmitArgs)`, où `ServerEmitArgs` est l'union des 120 tuples
`[event, payload]`, n'a pas de paramètre de type à unifier — chaque site d'appel
choisit son membre, et la signature décorée lui est assignable.

### Corréler par un `switch`, effacer seulement quand le couple est une DONNÉE

`EVENT_NAME[eventType]` d'un côté et `payload` de l'autre sont **deux unions
indépendantes** : rien ne dit qu'on prend le même membre dans les deux. La porte
typée le refuse, et elle a raison. Le `switch` sur le discriminant n'est pas une
préférence de style, c'est le seul moyen de corréler sans rien effacer — la forme
à préférer partout où elle est possible.

TypeScript ne propage pas la corrélation à travers l'accès à deux propriétés
d'une union discriminée (microsoft/TypeScript#30581). Quand le couple voyage
comme une DONNÉE (une liste d'émissions à rejouer) ou qu'on l'émet depuis
l'INTÉRIEUR d'une fonction générique, l'effacement est inévitable : il vit dans
`emitServerEvent`, **une fois**, derrière un paramètre dont le type EST la
garantie qu'il est sans conséquence. **Une exception nommée, pas une porte
ouverte** — c'est toute la différence avec les huit copies.

### Un cliquet doit être ATTEIGNABLE par le compilateur

`services/gateway/tsconfig.json` **exclut** `__tests__`. Un cliquet de TYPE posé
dans un fichier que personne n'importe n'est jamais lu — donc jamais rouge.
`ServerEmitRatchet` vit donc dans `serverEmit.ts` lui-même, en assertions
d'assignabilité (`Assert<T extends true>`), sans une ligne exécutable.

**L'`include` couvre `src/**/*` depuis le cycle 105 bis.** Il portait avant une
ÉNUMÉRATION de dix-huit répertoires, qui ne nommait ni `adapters`, ni
`migrations`, ni `validation`, et n'atteignait `socketio/` que par le graphe
d'imports de `server.ts`. Six fichiers de production échappaient au compilateur ;
deux étaient cassés. **Ne pas revenir à une liste tenue à la main** : elle est en
retard par construction, et son retard ne ressemble pas à une erreur — il
ressemble à des fichiers qui compilent. Vérifier plutôt que supposer :
`tsc --listFiles` contre `find src -name '*.ts'`.

**Ce qui rend un cliquet de type rouge EN CI, et c'est mesuré.** Deux mécanismes
disjoints, savoir lequel s'applique :

- `ts-jest` compile tout fichier de production qu'une suite atteint par ses
  imports, et `TS2344` — le code d'une assertion de type — n'est pas dans son
  `diagnostics.ignoreCodes` (`[2307, 2322, 2339, 2345, 2740]`). C'est ce qui
  garde `ServerEmitRatchet`.
- L'étape « Type-check » de `.github/workflows/ci.yml` a porté
  `continue-on-error: true` jusqu'au cycle 105 bis, qui l'a SCINDÉE : les trois
  packages TypeScript à zéro erreur (`shared`, `gateway`, `agent`) sont
  désormais BLOQUANTS ; `apps/web`, qui en porte 1241, passe par un cliquet
  chiffré (`scripts/check-type-debt.sh`).

Noter les codes IGNORÉS par `ts-jest` : `2322` et `2345` sont exactement ceux
qu'un couple `(événement, charge)` dépareillé produit. **Un témoin ne peut donc
pas servir de cliquet pour ces deux-là** — et jusqu'au cycle 105 bis rien ne le
pouvait, l'amnistie couvrant le seul outil qui les voit. C'est `tsc` bloquant qui
les porte maintenant ; les retirer d'`ignoreCodes` reste inutile, un double de
test ayant le droit d'être permissif.

**Et un cliquet de type ne suffit pas** : une porte RELÂCHÉE et une porte
CONTOURNÉE sont deux régressions distinctes, la seconde étant la plus probable —
rien n'oblige un nouvel émetteur à importer `serverEmit.ts`.
`socketio/__tests__/server-emit-door-sweep.test.ts` garde l'inventaire à VIDE, et
balaye `src/` ENTIER : la huitième copie vivait dans `utils/socket-broadcast.ts`,
à deux répertoires de la septième. Quand il tombe, la réparation est de dériver,
jamais d'ajouter une ligne à un inventaire — il n'y a pas de porte non typée
légitime à porter.

### Un CAST est une porte, au même titre qu'une déclaration

Le balayage du cycle 104 ne cherchait que la méthode abrégée
(`emit(event: string, …)`), la forme des huit interfaces qu'il consolidait. Une
**neuvième** porte lui a échappé pour cette seule raison — elle s'ouvrait par
ASSERTION DE TYPE, sur le chemin de rejeu hors ligne :

```ts
const userRoom = this.io.to(ROOMS.user(userId)) as unknown as {
  emit: (event: string, payload: unknown) => void;   // ← invisible au balayage
};
```

Un cast produit **exactement** la liberté d'une déclaration, sur exactement le
même appel, et il est plus discret : il ne crée aucun type nommé qu'on puisse
chercher. Le balayage voit désormais les deux formes (`emit(ev: string` et
`emit: (ev: string`) — mais la règle générale vaut au-delà de cet outil :
**chercher une forme fautive par son NOM de déclaration, c'est manquer tous les
sites qui l'obtiennent autrement.**

### La TROISIÈME forme : ne rien réécrire, et prendre le `Server` NU

La règle ci-dessus a une instance de plus, et c'est la plus discrète des trois —
il n'y a ni déclaration ni assertion à chercher, seulement un import qui a l'air
parfaitement normal (cycle 108) :

```ts
import type { Server } from 'socket.io';
constructor(private io: Server) {}
this.io.to(room).emit(SERVER_EVENTS.X, payload);   // ← vérifié par RIEN
```

**Ce n'est pas un défaut de style, c'est une absence totale de contrat.** `Server`
sans paramètres de type retombe sur `DefaultEventsMap`, dont la signature est
`emit(ev: string, ...args: any[])`. Mesuré sous le `tsconfig` de production :

| ce qu'on émet à travers un `Server` NU | verdict |
|---|---|
| un nom d'événement **entièrement inventé** | **0 erreur** |
| une charge de forme **fausse** sous un vrai nom | **0 erreur** |

C'est la forme exacte du défaut du cycle 101 — `message:edited` servi sans
`senderId`/`messageType`/`createdAt`, rejeté en silence par tous les décodeurs
iOS pendant des mois.

Cinq porteurs au cycle 108, ~16 émissions temps réel (les quatre familles de
demande d'ami, `user:updated`, les compteurs de notification, `call:ended`) —
dont le helper PARTAGÉ `emitWithSeq`, qui prenait le `Server` nu **pour le compte
de tous ses appelants** : sa charge était gouvernée (il émet par
`emitServerEvent`), son CANAL ne l'était pas.

> **Aucun des deux cliquets existants ne pouvait le voir.** Celui du TYPE garde
> `serverEmit.ts`, que ces services n'importaient pas ; celui du BALAYAGE cherche
> une signature `emit` réécrite, et ici **rien n'est réécrit**. Une porte se
> ferme, une porte se contourne — et une porte peut aussi n'avoir jamais été
> construite parce qu'on a pris celle de la dépendance.

`sweepRawServerEmitters` (`socketio/__tests__/server-emit-door-sweep.ts`) garde
l'inventaire à VIDE. Son discriminant est ÉTROIT par décision — `import type` +
`.emit(` :

- **`import type`** exclut `MeeshySocketIOManager`, qui importe `Server` en
  VALEUR parce qu'il le CONSTRUIT. Un `import type` ne peut, lui, que DÉCLARER.
- **`.emit(`** exclut par CONSTRUCTION tout fichier qui détient un `Server` sans
  émettre. **Détenir n'est pas ÉMETTRE** — sans cette condition le balayage
  mesurerait la popularité d'un import au lieu d'une propriété (cycle 107, sept
  faux positifs, balayage JETÉ plutôt que gelé).

**Quand il tombe** : la réparation est de dériver (`ServerEmitIO`, ou
`ServerEmitIOWithRooms` si le porteur lit aussi ses rooms), jamais d'ajouter une
ligne à un inventaire — il n'y a pas de `Server` nu légitime pour émettre.

### Un lot peut rendre un contournement INUTILE sans le faire disparaître

Variante douce de « le lot qui rend une chose possible doit relire les
commentaires qui la déclaraient impossible » (§ suivant), et elle coûte autant.

Les cinq `(socket as unknown).emit(…)` de `VideoCallInterface.tsx` (web)
n'étaient pas gratuits : `CallMediaToggleClientEvent` exigeait `mediaType`,
`participantId` et un ack, quand le web n'envoie que `{ callId, enabled }`. Le
cycle 107 bis a mesuré ce que les clients émettent RÉELLEMENT et corrigé le
contrat — rendant les cinq casts sans objet le jour même, sans que personne le
remarque. Ils sont restés un cycle de plus, continuant de soustraire cinq
émissions d'appel à toute vérification **pour une raison qui n'existait plus**.

> Quand un lot répare un contrat contre ses émetteurs réels, la question à poser
> dans le même lot est : **qui avait contourné ce contrat, et pourquoi ?** Un
> contournement ne se périme pas tout seul, et il ne rougit jamais.

### Le lot qui rend une chose possible doit relire les commentaires qui la déclaraient IMPOSSIBLE

Le cast ci-dessus vivait sous cette phrase :

```ts
// Replayed payloads are stored as opaque JSON in the queue … so re-checking
// them against ServerToClientEvents here is impossible (loose emit).
```

Elle était VRAIE quand elle a été écrite. Le cycle 104 l'a rendue fausse sans
s'en apercevoir — `_drainedEmissions` rend depuis lors des couples CORRÉLÉS
(`ServerEmission`), et `emitServerEvent` existe pour les émettre.

> Un commentaire d'impossibilité ne rougit jamais. Il survit à ce qui l'a périmé,
> et il se lit comme une raison de ne pas essayer. Même famille que « un
> commentaire qui ÉNONCE une contrainte est une AFFIRMATION » (cycle 94), avec
> une variante plus retorse : celui-ci n'était pas faux au départ, il l'est
> DEVENU. Quand un lot déplace une frontière, la question à poser est « qu'est-ce
> que je viens de rendre possible, et où est-ce écrit que ça ne l'est pas ? ».

### Un `Record<string, unknown>` dans un contrat est une absence de déclaration

C'est la version « carte » du `{ type: 'object' }` nu, et elle se diagnostique de
la même façon : contre le PRODUCTEUR. `NotificationEventData.context` était
déclaré `Record<string, unknown>` alors que `NotificationContext` — dix-huit
champs nommés — vit dans le même paquet, deux fichiers plus loin.

L'opacité n'était pas un choix : elle n'avait **jamais été confrontée à
l'émetteur**, parce que les deux sites d'appel la castaient
(`socketPayload as unknown as Record<string, unknown>`). Le premier typage de
l'émission l'a fait tomber en une ligne — une interface n'a pas de signature
d'index, donc n'est jamais assignable à une carte ouverte. **Le cast n'était pas
une commodité de typage : c'était la MARQUE de la déclaration manquante**, comme
au cycle 103 et au cycle 104.

### Un champ que trois clients LISENT et qu'aucun contrat ne déclare

`_seq` — le curseur monotone par utilisateur que `emitWithSeq` estampille, et le
signal de détection de TROU du SyncEngine — était lu par le web
(`observeSyncSeq`), par iOS (`case seq = "_seq"`) et par Android, et déclaré
**nulle part**. Il ne voyageait que parce que la porte prenait
`Record<string, unknown>`.

C'est exactement `location` sur `ConversationUpdatedEventData` avant sa
déclaration, avec la même conséquence : la parité entre émetteurs ne tient qu'à
la lecture du code voisin, et le premier émetteur qui l'omet retire une
fonctionnalité aux trois clients sans faire tomber quoi que ce soit.

> **Typer une porte, c'est découvrir ce qui la traversait.** Les champs qu'un
> canal non gouverné transporte ne sont pas hypothétiques — ils sont déjà en
> production, déjà lus, et déjà indispensables.

### La file hors ligne est tenue au MÊME contrat que la diffusion directe

`socketio/queuedEventContract.ts` porte **la** correspondance `eventType` de
file → événement serveur (`DRAINED_EVENT`), et en dérive la charge que chaque
type doit porter (`QueuedPayloadFor`, `QueuedEventVariant`). Un transport ne peut
donc plus diffuser une forme et en ENFILER une autre.

Pourquoi c'était le suivi le plus urgent : **le seul témoin d'une divergence
entre l'émission directe et le rejeu est un destinataire qui était hors ligne au
mauvais moment** — c'est-à-dire personne. Un défaut de cette famille ne produit
aucun signal, jamais.

Trois règles en sont sorties :

1. **Une chaîne de `if` n'est pas une table.** `_drainedEventName` en portait
   onze, avec un repli final (`return MESSAGE_NEW`) : un `eventType` neuf s'y
   serait rejoué sous le mauvais nom, sans bruit. Un objet littéral
   `as const satisfies Record<Union, …>` rend la couverture EXHAUSTIVE au
   compilateur.
2. **`satisfies` garde la totalité, jamais la JUSTESSE.** Une table peut être
   complète et pointer le mauvais événement. Poser des assertions
   d'assignabilité sur les correspondances dont une inversion serait SILENCIEUSE
   — celles dont les deux charges se ressemblent (`reaction-added` /
   `reaction-removed`, `new` / `edited`).
3. **Gouverner une frontière ne sert à rien tant que ses RELAIS ne la relaient
   pas.** Sept l'ont interrompue ici, chacun en redéclarant un `eventType` en
   union et un `payload: Record<string, unknown>` — deux unions indépendantes de
   plus, à chaque étage. Le contrat se perdait AVANT d'atteindre la file. Même
   leçon que le cycle 98 sur la symétrie X3DH (« un correctif prouvé à une
   couche peut être défait par la couche qui le consomme »), appliquée en
   amont.

> **Corollaire de méthode : une erreur commise en écrivant un cliquet est le
> meilleur cas de test qu'il aura jamais.** `'link-message'` a d'abord été mappé
> vers `MESSAGE_NEW` — faux, parce que la file stocke l'ENVELOPPE `{ message }`
> et non le message nu ; le typage aurait été un cran trop bas, et un appelant
> qui enfilait le message nu aurait compilé pour produire un rejeu non routable.
> L'assertion qui gèle ce point est née de l'erreur elle-même.

### À une frontière de désérialisation, un champ AGRÉGÉ n'a pas de correctif local

Les trois gardes de la file de rejeu ne sont pas de même nature, et c'est ce qui
a fait rater la troisième pendant deux cycles. `drainedEventName` (le NOM,
cycle 109 bis) et `isDeliverableQueuedPayload` (la CHARGE, cycle 111) se
prononcent sur une entrée en la lisant **seule** : une entrée refusée n'emporte
qu'elle. `isAddressableConversationId` (cycle 112) garde le seul champ que le
drain **met en commun** — un unique `conversationId: { in: [...] }` porte tout le
lot, pour le gate d'autorisation (`_dropEndedMemberships`) comme pour les accusés
de remise.

Une entrée dont l'id n'est pas interrogeable faisait donc lever la requête pour
TOUT le monde. Mesuré contre le client Prisma généré, sans base : `undefined`,
`null`, un nombre, un objet ⇒ `PrismaClientValidationError` côté client ; toute
chaîne non-ObjectId (`''`, un identifiant lisible non normalisé) ⇒
`Malformed ObjectID` côté moteur. **Le plancher est donc la forme ObjectId, pas
`typeof === 'string'`** — s'arrêter à la chaîne laisse ouverte la moitié la plus
plausible, le dépôt portant deux façons de nommer une conversation.

> **Le test à faire passer à chaque champ d'une frontière de désérialisation
> n'est pas « que vaut-il quand il est faux ? » mais « est-il lu SEUL, ou mis en
> commun avec ceux des autres entrées ? »** — la seconde forme n'a pas de
> correctif local.

#### Un `catch` fail-open couvre aussi la question qu'on a mal posée

Le corollaire, et il vaut au-delà de la file. `_dropEndedMemberships` échoue
OUVERT **par décision écrite** : « une absence de réponse n'autorise rien à
conclure », le drain étant destructif et une tempête de reconnexions étant
exactement le moment où la base est sous pression. C'est juste pour ce qu'il
vise.

Ce qu'il ne peut pas faire, c'est distinguer « la dépendance n'a pas répondu »
de « nous ne lui avons jamais posé de question valide ». La première est une
panne subie et le fail-open est la bonne réponse ; la seconde est un défaut à
nous, et le fail-open y devient l'**amplificateur** — ici, une seule entrée
corrompue désactivait le gate d'autorisation du rejeu, et l'arriéré d'une
conversation quittée ou d'où le lecteur avait été banni repartait en entier
(jusqu'à 48 h et 500 entrées).

**La garde va donc AVANT l'appel, jamais dedans**, et à l'endroit où l'entrée
fautive est encore nommable une par une (`dropEntry`, journal par entrée). Un
`catch` ne peut pas réparer ce qu'il ne peut pas attribuer.

Seule exception à la règle du cycle 111 (« `conversationIds` ne se resserre
pas ») : une entrée refusée POUR son `conversationId` n'a rien à nommer, et
publier son id enverrait le client invalider une conversation qui n'existe pas.

#### Un gate qui s'exprime par un PROXY ne couvre pas forcément tous ses membres

Le drain ne demande pas à une entrée « quelle est ta forme ? ». Il lui demande
« sais-tu te diffuser ? », et lit la réponse dans `emissions.length === 0` —
`_drainedEmissions` écrivant lui-même le contrat : « une liste VIDE dit *je ne
sais pas diffuser ceci* ».

Onze `eventType` sur douze passent par la table `DRAINED_EVENT`, qui peut rendre
`undefined` donc `[]`. Le douzième, `'link-message'`, est le seul dont la charge
se **DÉPLIE** — et `linkMessageEmissions` poussait l'enveloppe
INCONDITIONNELLEMENT avant de regarder ce qu'elle contient. **Il ne pouvait pas
rendre `[]`.** Le refus du message dérivé, ancien et gardé par ses propres
témoins, retirait donc la seule émission qui compte et laissait la liste à 1.

Ce que l'enveloppe seule livre : rien — son unique auditeur (le web) lit
`data.message` ; iOS et Android n'écoutent que le `message:new` dérivé, celui
qu'on vient de refuser. Ce que la liste non vide AFFIRME, en revanche, coûte
trois signaux (cycle 114) : `count` comptait la remise, `conversationIds` ne
nommait PAS la conversation (donc rien n'envoyait le client rechercher un
message qui est pourtant toujours en base), et — `announcesMessageArrival('link-message')`
étant vrai — l'accusé partait : le curseur `lastDeliveredAt` de l'auteur
avançait, et il est **MONOTONE** (`_advanceCursor` ne recule jamais). Sur le
SEUL transport d'envoi dont dispose un participant anonyme.

> La question à poser à tout gate qui s'exprime par un proxy (une longueur, un
> `null`, un booléen dérivé) n'est pas « est-il correct ? » mais **« chaque
> membre de ce qu'il arbitre peut-il le faire répondre NON ? »**. S'il en est un
> qui ne le peut pas, le gate ne le couvre pas — quelle que soit la place qu'il
> occupe dans le code.

Corollaire de journal : quand un refus a plusieurs causes possibles, la `reason`
les SÉPARE. `'unresolvable-event-type'` accuse la file (un `eventType` d'une
version voisine) ; `'link-envelope-without-message'` accuse le producteur de
l'enveloppe. Les deux n'envoient pas chercher au même endroit.

#### Un témoin qui nomme correctement la moitié qu'il garde GÈLE l'autre

Trois témoins de `linkMessageEmissions` assertaient
`n'ajoute PAS 'message:new' ⇒ [LINK_MESSAGE_NEW]`. Leur intitulé disait VRAI, et
c'est cette vérité qui a rendu la seconde moitié de l'assertion invisible : elle
se relisait comme le reste de la phrase, pas comme une affirmation à instruire.
Deux cycles de gardes posées à cette frontière sont passés à côté.

> **Un `toEqual` sur une liste entière affirme autant sur ce qu'il GARDE que sur
> ce qu'il ADMET.** Les deux moitiés se relisent séparément — et l'intitulé du
> témoin ne couvre en général que la première.

#### Un double de test ment aussi par ce qu'il ACCEPTE

La leçon connue — « un double Prisma qui rend `[]` rend tout témoin de contenu
trivialement vert » — porte sur ce que le double RÉPOND. Son jumeau porte sur ce
qu'il ACCEPTE, et il est plus discret : un double qui répond faux finit par se
voir ; **un double qui accepte un argument impossible ne se voit jamais, parce
que le test qu'il sert PASSE.**

Les fixtures de rejeu portaient `'conv-1'`, `'conv-kept'` — que la colonne
ObjectId ne peut pas prendre — et onze entrées n'avaient pas de `conversationId`
du tout. Toute la suite `_drainPendingMessages` attestait un drain dont la
requête d'appartenance aurait levé en production. Le correctif est un double qui
REFUSE ce que le vrai client refuse (`strictMembership`), et des ids de fixture
de la forme de production (`convId('kept')`).

**Et la forme impossible peut être un MODÈLE, pas une valeur (cycle 129).**
`DELETE /me/preferences/categories/:categoryId` détachait ses conversations en
écrivant sur `ConversationPreference` — le magasin CLÉ/VALEUR générique
(`key`/`value`/`valueType`), qui ne déclare ni `categoryId` ni aucun lien vers
une catégorie ; la colonne vit sur `UserConversationPreferences`. Le client
généré refuse l'appel AVANT tout aller-retour (`PrismaClientValidationError`,
« Unknown argument `categoryId` »), donc le `$transaction` levait et **aucune
catégorie de conversation n'a jamais pu être supprimée**.

Ce qui l'a tenu en vie n'est pas l'ignorance. Le double d'une des trois suites
portait, mot pour mot : *« categories.ts uses prisma.conversationPreference…
(pre-existing) — keep the surface so the route doesn't crash »*, suivi d'un
`userConversationPreferences` commenté *« real model name (in case Phase 1 fixes
the surface) »*.

> **Poser une surface de double pour empêcher une route de tomber, c'est
> supprimer le seul signal qui la ferait réparer.** Devant tout commentaire de
> double qui décrit une bizarrerie de production — « pre-existing », « keep the
> surface », « in case X fixes it » — poser la question du cycle 91 bis : **et
> c'est bien ?**

Deux mesures qui accompagnent ce cas, et qui valent au-delà :

- **`tsc --noEmit` ne voit pas cette erreur de modèle.** Sous le `tsconfig` réel
  du gateway (`strict: false`), la ligne EXACTE de production rend `EXIT=0` —
  alors que la même faute prise ISOLÉMENT (`where: { categoryId }` seul) tombe
  en `TS2353`. **On ne conclut pas d'un site qu'un gate voit une classe.**
- **Changer la méthode Prisma qu'un handler appelle oblige à repointer le témoin
  d'erreur** : celui du DELETE rejetait `$transaction`, que la route n'appelle
  plus, et passait au vert par le chemin nominal en croyant tenir le chemin
  d'erreur.

#### Gouverner ce que la file CONTIENT ne dit rien de la façon dont on l'ATTEINT

Tout ce qui précède porte sur des entrées DÉJÀ ÉCRITES. L'écriture, elle, était
sur les DEUX producteurs de `message:new` suspendue au succès de
synchronisations que le code qualifie lui-même de non-bloquantes (cycle 116) :

- **REST/ZMQ** — l'enfilage était la DERNIÈRE instruction du `try` `[CONV_SYNC]`,
  dont tout le reste est cosmétique (`conversation:updated` par destinataire,
  badges non-lus) et dont le `catch` journalise « non-bloquant ». Or
  `io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut
  (le dépôt l'écrit lui-même dans `emitWithSeq`) : une seule levée dans la
  boucle par destinataire annulait le rejeu pour TOUS les absents.
- **WS** — la requête participants avait son `try` dédié, mais retombait sur
  `[]`. `enqueueForOfflineParticipants` lit `params.participants ?? sa propre
  requête` : `[]` n'est pas nullish, donc l'unité partagée recevait
  l'AFFIRMATION « aucun participant » et n'enfilait pour personne. La requête
  qui tombe est le SUPERSET (Prisme + `joinedAt`) dont seule la cosmétique a
  besoin ; la file, elle, ne demande que `{id, userId}`.

Trois règles, et la première est la générale :

> **Pour toute garantie DURABLE, la question n'est pas seulement « ce qu'elle
> stocke est-il correct ? » mais « de quoi son EXÉCUTION dépend-elle, et ces
> dépendances ont-elles le droit d'échouer ? »** Ici les deux dépendances
> avaient ce droit, écrit et journalisé ; la garantie ne l'avait pas.

> **`[]` par défaut décide à la place du consommateur.** Il rend le code d'après
> plus court (`.map`, `.length` sans garde) et transforme une IGNORANCE en
> AFFIRMATION. Rendre `undefined` est ce qui laisse chaque consommateur choisir
> — c'est la même distinction que `bridgeComputed(undefined)` /
> `bridgeNotComputed()`, un étage plus bas.

> **Une étiquette de `catch` ne qualifie que ce que son auteur avait en tête.**
> « non-bloquant » était vrai des deux premières instructions du `try` et faux
> de la troisième. Une portée grandit toute seule à chaque instruction ajoutée
> au bloc, et c'est l'étiquette qu'on relit, pas le bloc.

L'ordre juste est donc, sur les deux producteurs : charger la liste → **enfiler
(durable)** → diffuser la cosmétique. C'est la règle que `_emitPresenceSnapshot`
applique déjà en plaçant le drain HORS de son `try` ; elle n'avait jamais été
portée aux chemins d'ENVOI. Gardée par
`socketio/__tests__/message-new-producer-parity.test.ts` (§ « la file hors ligne
ne dépend pas de la synchro de liste »), qui fait lever `emit` PAR NOM
d'événement — un double qui lève sur tout ne prouverait que la survie à un
harnais mort.

### Une clé venue d'un SPREAD est invisible au contrôle des propriétés excédentaires

Corollaire direct du paragraphe précédent, et il change ce qu'il faut faire d'un
contrat trop libre. Mesuré sous `--strict` (cycle 106) :

```ts
type Target = { readonly a: string; readonly b?: number };
declare function take(t: Target): void;

take({ a: 'x', zzz: 1 });        // TS2353 — attrapé
const built = { a: 'x', zzz: 1 };
take({ ...built });              // SILENCE
take({ ...built, www: 2 });      // TS2353 sur `www` SEULEMENT
take(built);                     // SILENCE
```

Or **la charge d'un événement se compose presque toujours dans une variable**
(`updatePayload`, `basePayload`, `changedFields`) avant d'être répandue dans
l'appel à `emit`. Le contrôle des propriétés excédentaires n'a donc jamais lieu
sur ces sites-là.

> **Conséquence contre-intuitive : retirer un `readonly [key: string]: unknown`
> d'un contrat d'événement ne fait tomber AUCUNE compilation.** Mesuré sur
> `ConversationUpdatedEventData` — 0 erreur sur `packages/shared` +
> `services/gateway`. La signature d'index ne supprimait qu'un contrôle que le
> spread supprimait déjà. Elle a l'air d'être la cause parce qu'elle est la
> seule des deux qui soit ÉCRITE ; le spread, lui, est la forme normale du code.

**Ce qui SURVIT au spread**, en revanche, et c'est ce sur quoi il faut s'appuyer :

| à travers un spread | verdict |
|---|---|
| champ NON déclaré (excédent) | **silence** |
| champ requis ABSENT | TS2345 — attrapé |
| champ déclaré de TYPE FAUX | TS2345 — attrapé |

> **Le levier n'est donc pas de fermer la carte, c'est de DÉCLARER les champs.**
> Les deux gestes se ressemblent, portent sur la même interface, et ne font pas
> le même travail : le premier est cosmétique, le second est le seul qui vérifie
> quoi que ce soit. Devant un suivi qui prescrit « retirer la signature
> d'index », l'exécuter D'ABORD pour mesurer ce qu'il produit — un lot vert,
> propre et sans effet est le résultat par défaut.

**Et le trou que le typage ne peut pas boucher** : un champ NOUVEAU, ajouté à un
émetteur et à aucun contrat, redevient invisible au premier spread. C'est
exactement ce qui était arrivé à `location` (#3122), omise par le seul chemin
REST/ZMQ pendant que les deux autres la portaient. Ce trou-là se ferme par un
BALAYAGE, jamais par un type — qui lit le jeu de champs déclarés **à la source
du contrat** (jamais une seconde liste écrite dans le témoin, qui dériverait) et
le confronte aux clés que les émetteurs émettent réellement. Référence :
`socketio/__tests__/conversation-updated-declared-fields.ts`.

La double mesure à reproduire quand on pose un tel cliquet : sur la même
mutation, `tsc --noEmit` rend **0 erreur** pendant que le balayage tombe en
NOMMANT le transport et le champ. Les deux côte à côte sont ce qui prouve que le
balayage n'est pas redondant avec le compilateur.

### Un contrat peut déclarer la DÉCORATION et taire le SUJET

`ConversationUpdatedEventData` déclarait sept champs ; les trois clients en
lisent dix-sept (iOS les décode tous). Les non déclarés n'étaient pas des
détails : c'étaient les champs **PORTEURS** — l'identité du dernier message, son
horodatage, son texte, son auteur — pendant que les déclarés étaient ceux qui les
DÉCORENT (la carte du Prisme, la langue d'origine, le drapeau de recalcul).

Le biais est mécanique et vaut d'être connu : **on déclare ce qu'on vient
d'ajouter, pas ce qui était déjà là.** Chaque champ décoratif a été déclaré par
le lot qui l'a introduit ; les porteurs, présents depuis l'origine, n'ont jamais
eu de lot à eux. Devant un contrat partiellement déclaré, la question n'est donc
pas « que manque-t-il ? » mais **« les champs déclarés sont-ils les plus
importants, ou seulement les plus récents ? »**

### Un horodatage dont le type n'est pas énoncé est décidé par l'ENCODEUR

`lastMessageAt` partait en objet `Date` sur les trois émetteurs, quand
`updatedAt` — son jumeau, dans le même payload — est une chaîne ISO. Sur le fil
la différence ne se voit pas : la passerelle n'installe aucun parseur socket.io
personnalisé, donc `JSON.stringify` rend exactement `toISOString()`.

Ce que ça coûte n'est pas une panne, c'est une divergence de MESURE : **tout
témoin en cours de route atteste alors une forme que personne ne reçoit.** Il y
en avait un, qui assertait `toEqual(new Date(…))` sur une charge que le client
reçoit en chaîne. Énoncer le type dans le contrat est ce qui aligne les deux.


## Une preuve TRANSPORTÉE n'est pas une preuve VÉRIFIÉE

`signedPreKey.signature` est la seule chose qui rattache la pré-clé signée à la
clé d'identité, donc la seule chose qui fasse de X3DH un accord AUTHENTIFIÉ. Le
dépôt la PRODUISAIT (`SignalKeyManager.generateAndStoreSignedPreKey`), la
PERSISTAIT (`DMAEnrollment.signedPreKeySignature`), la RELISAIT pour la placer
dans le paquet (`SignalProtocolEngine.initiateNewSession`) et la DÉCLARAIT
obligatoire (`PreKeyBundle`). Quatre couches irréprochables ; la cinquième —
celle qui la lit — n'existait pas (cycle 96).

> **Un champ présent à chaque étape se lit comme un champ traité.** Il n'y a rien
> à trouver : pas de `TODO`, pas de champ manquant, pas de type qui ment. La
> preuve voyage bien formée jusqu'au bout et personne ne l'ouvre.

La question n'est donc jamais « ce champ est-il là ? » mais **« qui le LIT, et
que fait-il quand il est faux ? »**. Le nom apparaissait six fois dans le
sous-arbre, et zéro fois à droite d'une comparaison.

**Et une valeur ABSURDE qu'un témoin fait passer sans broncher nomme la garde qui
manque** : les six constructions de paquet de la suite du sous-arbre passaient
`signature: crypto.randomBytes(64)` et l'accord aboutissait. Chercher dans les
fixtures ce qu'un attaquant n'aurait jamais pu produire est un balayage à part
entière.

### Une garde conditionnée à la PRÉSENCE de ce qu'elle garde est un no-op

Même sous-arbre, même lot — `decryptMessage` étape 2 :

```ts
if (senderIdentityKey && encryptedMessage.signature.length > 0) { /* refuser si invalide */ }
else if (encryptedMessage.signature.length > 0) { /* avertir */ }
```

Un message SANS signature ne franchit aucune des deux branches : ni vérification,
ni avertissement, ni refus — sous un commentaire qui déclare la vérification
« stricte ». Elle l'était contre une signature FAUSSE, jamais contre une
signature RETIRÉE, et le retrait est strictement moins cher que la forgerie.

> **Une authentification dont l'attaquant décide s'il la subit n'est pas une
> authentification.** Le discriminant juste est l'INTENTION de l'appelant
> (« m'a-t-on donné de quoi vérifier ? »), jamais l'obligeance de l'émetteur
> (« m'a-t-on donné quelque chose à vérifier ? »).

### Un `as any` sur un objet de contrat NOMME le champ qui manque

`SignalProtocolAdapter.performX3DH` portait `recipientBundle as any` parce que
`ISignalProtocolAdapter` ne transportait pas la signature que `PreKeyBundle`
déclare obligatoire : le cast faisait taire exactement cette absence-là. Le
cycle 95 l'avait consigné comme dette cosmétique de dernier rang ; c'était
l'indice.

Corollaire, vérifié au même endroit : **rouvrir une signature de méthode révèle
ce qu'elle déclarait faux.** Deux autres mensonges du même contrat sont tombés en
écrivant honnêtement sa liste de paramètres — `ourEphemeralPrivate` DÉCLARÉ et
silencieusement ignoré, et un résultat qui jetait la clé éphémère publique sans
laquelle le pair ne peut rien dériver.

## Deux moitiés d'un protocole peuvent être cohérentes SÉPARÉMENT et fausses ENSEMBLE

X3DH liait un identifiant d'enregistrement dans l'`info` de son HKDF. L'initiateur
y mettait celui du DESTINATAIRE (`recipientBundle.registrationId`), le répondeur
celui de l'INITIATEUR — deux entiers tirés au hasard par identité, donc
différents. Les quatre Diffie-Hellman étant correctement disposés, **le secret
partagé coïncidait et toutes les clés qui en sortaient divergeaient** : clé
racine, chaîne d'émission, chaîne de réception. Toute session nouvelle
s'établissait sans erreur, et aucun message n'y était déchiffrable (cycle 97).

**Le répondeur ÉNONÇAIT l'invariant que l'initiateur violait**, trois lignes
au-dessus de son propre appel :

```ts
// Note: both parties must use the same registration ID (initiator's)
// to derive identical shared secrets
```

> **Un commentaire qui énonce un invariant de PAIRE ne garde que l'exemplaire qui
> le porte.** Le côté qui écrivait la règle était le côté conforme — même famille
> que « Cette entité a-t-elle une JUMELLE ? » (cycle 85) et que la note de
> `storyAuthorSelect` (cycle 83). La connaissance était dans le dépôt, à l'endroit
> exact, et ne s'appliquait qu'à la moitié où elle était écrite.

**Aucun témoin ne pouvait le voir, et la raison est structurelle** :
`X3DHKeyAgreement.test.ts` exerce chaque côté SEUL, et **un côté seul est toujours
cohérent avec lui-même**. Il faut confronter les deux PRODUCTIONS réelles pour
qu'un désaccord apparaisse — c'est la « quatrième famille » que le cycle 94
déclarait non outillée.

**Le témoin d'une paire SÉPARE ses affirmations**, parce que la séparation est le
diagnostic : « le secret partagé coïncide » puis « les clés dérivées coïncident »
localise la panne dans le HKDF plutôt que dans les DH, là où un unique `expect`
sur la clé racine laisse chercher partout
(`__tests__/unit/dma-x3dh-derivation-symmetry.test.ts`).

### Entre deux valeurs qu'il faut accorder, choisir celle qui ne vient pas d'un canal hostile

Il fallait décider quel identifiant est autoritatif. Celui de l'initiateur — et
pas par convention : l'identifiant du destinataire ne voyage QUE dans le paquet de
pré-clés, un champ que la signature de la pré-clé signée **ne couvre pas**. Le
lier donnerait à l'annuaire un levier pour désaccorder deux pairs sans jamais
toucher à une signature, donc sans franchir la vérification du cycle 96. Celui de
l'initiateur, lui, est lu chez soi d'un côté et dans l'inscription de l'expéditeur
de l'autre.

> **Quand deux bouts doivent s'accorder sur une valeur, la question n'est pas
> « laquelle est la plus naturelle ? » mais « laquelle un attaquant peut-il
> fournir ? ».**

### Un invariant de paire se viole chez le CONSOMMATEUR, pas chez le producteur

Le cycle 97 a formulé la règle pour deux fichiers. Le cycle 98 l'a retrouvée
**dans la même classe** : `X3DHKeyAgreement` croise les chaînes du répondeur
(« responder's send is initiator's receive and vice versa »),
`SignalProtocolEngine.responderKeyAgreement` le REDIT (« X3DH already swaps chain
keys for responder, so use them directly ») — et `decryptMessage`, son UNIQUE
consommateur cent lignes plus bas, les recroisait. Deux croisements s'annulent :
le répondeur déchiffrait avec la chaîne d'ÉMISSION de son pair.

> **La distance n'est ni ce qui protège ni ce qui expose.** Deux commentaires
> justes, chez le producteur, dans le même fichier que la violation, n'ont rien
> gardé. Seul un témoin qui TRAVERSE les deux moitiés peut voir un désaccord
> d'orientation.

Corollaire, et il est cher : **un correctif de symétrie prouvé à une couche peut
être défait par la couche qui le consomme.** Le cycle 97 a fait converger les deux
HKDF de X3DH et l'a prouvé ; le moteur redivergeait à la ligne suivante. Le
correctif était juste, testé, et sans effet. Quand on corrige une symétrie,
**remonter jusqu'au dernier site qui compose le résultat**.

### La quatrième famille s'outille en faisant se rencontrer deux PRODUCTIONS

Le patron est acquis (cycles 97 et 98) et se reprend tel quel :

1. **Deux instances réelles**, jamais un côté et une reconstitution de l'autre —
   un côté seul est toujours cohérent avec lui-même.
2. **Ne fabriquer que la BASE** : ce que chaque partie publie de soi et que l'autre
   lit. Tout le reste sort des productions.
3. **SÉPARER les affirmations, la séparation EST le diagnostic** : secret partagé,
   puis orientation, puis texte clair. La première qui tombe nomme la couche. Un
   unique `expect` sur le texte clair laisse chercher partout.
4. **Écrire en négatif ce qui se présentait en vert** : « la chaîne d'émission de
   l'un n'est PAS celle de l'autre » garde la forme exacte du défaut.

Références : `__tests__/unit/dma-session-roundtrip.test.ts` (aller-retour complet,
4 défauts découverts d'un coup), `__tests__/unit/dma-double-ratchet-symmetry.test.ts`,
`__tests__/unit/dma-x3dh-derivation-symmetry.test.ts`.

**Et quand aucun témoin de bout en bout n'existe, demander pourquoi.** Ici la
réponse était matérielle : `SignalProtocolEngine.initialize()` ne pouvait pas
aboutir (aucune identité transmise à son gestionnaire de clés), donc aucun témoin
de bout en bout n'était possible. **Un protocole sans témoin de bout en bout est
souvent un protocole qu'on ne PEUT pas instancier** — le chercher avant de
conclure à un oubli de couverture.

### Un défaut par défaut ment sur sa cause

Le répondeur repliait sur `0` un identifiant absent (`initiatorRegistrationId ?? 0`).
Ce repli ne dégrade pas la session : il en fabrique une que le pair ne retrouvera
jamais, et déplace le diagnostic vers la couche GCM — où la panne se présente sous
les traits d'une ATTAQUE, plusieurs secondes et deux modules plus loin. Fail-closed
à l'endroit où la cause est encore lisible ; et le paramètre devient REQUIS au
typage, la garde runtime subsistant pour la frontière que le typage ne couvre pas
(la valeur vient d'une colonne).

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (Fastify, Socket.IO, ZeroMQ, auth unifie, Prisma/MongoDB, Redis fallback, erreurs types, rate limiting, Signal Protocol, logging PII, audio pipeline, push notifications) avec contexte, alternatives rejetes et consquences.

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : gardes fail-closed et champs VOISINS relus (sécurité — ce qui part à côté du champ gardé), p95 par route sous charge, maps de connexion et caches BORNÉS (mémoire), schémas de réponse complets (complétude — un schéma sans `properties` efface), UNE source de vérité par règle (maintenabilité), chaque champ ajouté lu par les trois clients (compatibilité).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
