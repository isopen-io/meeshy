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
et `contacts-schemas`, qui le déclarent `type: 'boolean'`). Le second prend
`{ onMissingEntry: 'hide' | 'reveal' }` — le défaut `'hide'` sert le régime
strict, `'reveal'` le régime prefs-only (voir les défauts opposés plus bas).

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

**Les deux régimes ont des défauts OPPOSÉS sur une carte incomplète, et les deux
ont raison.** Strict (`resolveForTargets`) : un id non rendu vaut MASQUÉ — le
résolveur rend une entrée par id, donc un manquant est une anomalie, et une
porte de confidentialité refuse par défaut. Prefs-only (`resolvePrefsOnly`) : un
id manquant est NORMAL — les participants anonymes n'ont pas de `userId`, donc
pas de préférences, et restent visibles ; seule une préférence **explicitement**
négative masque, d'où l'idiome `vis.get(id)?.showOnline === false ? false : x`
(`participants.ts`, la référence). Ne jamais « simplifier » l'un vers l'autre.

**Un audit qui liste des `select:` ne liste pas des fuites.** Entre la requête et
le fil il y a un sérialiseur : au cycle 84, deux des trois portes examinées ne
servaient RIEN — `POST /conversations/:id/invite` renvoie `member` quand son
schéma déclare `membership` (la clé du handler supprimée, celle du schéma jamais
posée), et `GET /communities/search` déclare `creator`/`members` en
`{ type: 'object' }` NU, que fast-json-stringify sérialise en `{}`. Avant de
qualifier une fuite, **traverser la sérialisation** (patron :
`friend-requests-pagination.test.ts`, `conversation-invite-serialization.test.ts`).

**Et une non-fuite ACCIDENTELLE se garde par un témoin.** Trois fois déjà, la
donnée s'est arrêtée sur une omission de schéma que rien ne nomme
« confidentialité ». Chacune est un piège armé : la première personne qui aligne
les noms pour faire vivre la charge utile ouvre la fuite sans qu'un témoin
tombe. Poser le témoin qui la forcera à voir ce qu'elle ouvre — il garde une
PORTE, pas un bug.

**Une même route peut relever des DEUX régimes, décidés par son contrôle
d'accès.** `GET /communities/:id/members` ne referme que les communautés
PRIVÉES : sur une publique, elle répond à un non-membre, et devient une porte de
découverte. Le régime s'y choisit donc par LECTEUR — `hasAccess` ⇒ prefs-only,
sinon strict — avec le `onMissingEntry` correspondant. Lire le contrôle d'accès
avant de choisir le régime : « c'est une route de communauté » ne suffit pas
(cycle 85-bis).

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
correctif de se charger. **Prolonger (`jest.requireActual` + surcharge ciblée)
plutôt que remplacer** ; et quand le double existait pour garantir un
comportement de SÉCURITÉ, préférer le vrai code — un double ne peut qu'attester
l'absence d'un repli vulnérable, le vrai code la prouve. Patron : `communities-live-wiring.test.ts`, qui n'assert que ce
que deux modules concurrents ne partagent pas.

Et **poser au moins un témoin de SURFACE** : « cette route est-elle
enregistrée ? ». Aucun ne le demandait, et un `404` sur une route qu'un client
appelle depuis toujours n'était vu par personne.

Corollaire de manœuvre : **basculer vers la jumelle exige de porter d'abord ce
que l'exemplaire VIVANT avait de plus.** Le répertoire ignorait
`flattenCommunityCounts` et quatre routes ; basculer sans les porter aurait
servi `memberCount: 0` partout. Les témoins qui PASSENT déjà avant la bascule
valent autant que ceux qui échouent — on les écrit dans le même lot.

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

**Mais elle ne s'applique PAS à `messages.ts:113`**, que ce paragraphe citait en
exemple. Sur cette route, le schéma décrit le MESSAGE quand `sendSuccess` répond
`{ success, data }` : `sender` n'est pas une clé de l'objet réel, la déclaration
est donc INERTE et le champ traverse entier (§ Une déclaration n'agit que si le
schéma décrit la bonne ENVELOPPE). Ce site ne vidait rien — il portait une fuite
de présence ACTIVE, fermée au cycle 88 par un gate à la source. Sa ligne reste
au cliquet comme dette de FORME, plus comme fuite.

**État de l'inventaire** : les sites de niveau `data:` (charge utile ENTIÈRE) et
les cinq sites de PRÉSENCE sont corrigés ; les onze schémas d'ERREUR écrits à la
main sont repris au cycle 89 ; les quatre `analysis` de `voice-analysis.ts` au
cycle 90, avec la PANNE qu'ils recouvraient ; les trois de `voice/translation.ts`
au cycle 91, avec la TRONCATURE que portait la forme « juste » du même fichier ;
les trois enveloppes fantômes au cycle 88 bis. **Il ne reste que 4 sites** —
`calls.ts|details|400`, `links/admin.ts|creator|200`, `messages.ts|sender|200`,
`users/profile.ts|permissions|200` — triés dans
`tasks/realtime-sync-audit-2026-08-22-cycle91.md` §8 et `…-cycle88-bis.md` §5.
Le second pose les deux questions à instruire AVANT de réparer : que passe le
gestionnaire à `sendSuccess`, et à quel niveau le schéma prétend-il le décrire ?

**Le balayage ne lit que `services/gateway/src/routes`** : les schémas de
`packages/shared`, dont un défaut se propage le plus loin, lui échappent. **Et
il ne détecte qu'une déclaration ABSENTE, jamais une déclaration INCOMPLÈTE**
(§ Une déclaration n'est juste que contre son PRODUCTEUR) — un vert au cliquet
n'atteste donc pas qu'un schéma dit vrai.

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

### Le régime se lit dans le `where`, pas dans le contrôle d'accès

Le contrôle d'accès borne qui ENTRE ; la requête borne ce qui SORT — et c'est la
seconde qui décide du régime de présence. Sur
`GET /communities/:id/conversations`, l'accès ne referme que les communautés
PRIVÉES (ce qui appellerait le strict), mais le `where` porte
`participants: { some: { userId } }` : la route ne rend que les conversations
dont l'appelant est lui-même participant, donc tout profil servi est un
CO-PARTICIPANT ⇒ `resolvePrefsOnly`, sans condition. Choisir sur le contrôle
d'accès aurait retiré des pastilles légitimes (cycle 88).

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
mêmes fichiers.

Constat non corrigé : **`errorResponseSchema` ne déclare pas `message`.** Rien
ne casse tant que les clients lisent les deux clés, mais l'ajouter est un
changement de contrat sur des centaines de routes — une décision, pas une
initiative. Figé par `error-envelope-serialization.test.ts`.

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

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (Fastify, Socket.IO, ZeroMQ, auth unifie, Prisma/MongoDB, Redis fallback, erreurs types, rate limiting, Signal Protocol, logging PII, audio pipeline, push notifications) avec contexte, alternatives rejetes et consquences.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
