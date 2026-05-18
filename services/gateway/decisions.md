# Decisions - services/gateway (Fastify API Gateway)

## 2025-01: Framework - Fastify 5.7
**Statut**: Accept
**Contexte**: Gateway haute performance pour 100k+ messages/seconde
**Decision**: Fastify 5.7 avec validation JSON Schema (Ajv), systme de plugins, async/await natif
**Alternatives rejet**: Express (2-3x plus lent, callbacks, mauvais TS support), Nest.js (trop opinionn, overhead DI style Angular)
**Cons**: cosystme plus petit qu'Express, courbe d'apprentissage

## 2025-01: WebSocket - Socket.IO 4.8 avec multi-device
**Statut**: Accept
**Contexte**: Messagerie temps rel bidirectionnelle avec reconnexion et fallback
**Decision**: Socket.IO 4.8, rooms normalises (`conversation:{id}`), maps multi-device (`userSockets: Map<userId, Set<socketId>>`)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/rooms), Firebase RTDB (vendor lock-in)
**Cons**: Convention `entity:action-word` doit tre enforce (hyphens PAS underscores), `emit()` n'attend pas les Promises

## 2025-01: IPC - ZeroMQ PUSH/SUB
**Statut**: Accept
**Contexte**: Communication ultra-rapide Gateway <-> Translator pour traductions temps rel
**Decision**: ZMQ PUSH (port 5555) vers Translator PULL, Translator PUB (port 5558) vers Gateway SUB. Multipart: Frame 1 = JSON, Frames 2+ = binaire
**Alternatives rejet**: gRPC (latence protobuf, overhead pour binaire), RabbitMQ/Kafka (broker inutile pour point-to-point), REST polling (trop lent)
**Cons**: Pas de persistence messages, gestion manuelle du cycle de vie des sockets
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1]). Singleton ZMQ obligatoire

## 2025-01: Auth - Unified Auth (JWT + Session Tokens)
**Statut**: Accept
**Contexte**: Support simultan des utilisateurs enregistrs (JWT) et anonymes (session token)
**Decision**: Middleware unifi `UnifiedAuthContext` avec `type: 'jwt' | 'session' | 'anonymous'`, trusted sessions pour "remember me"
**Alternatives rejet**: OAuth2/OIDC (overkill), Passport.js (Express-oriented), session-only (incompatible mobile stateless)
**Cons**: Plus complexe qu'un seul type d'auth, rtro-compatibilit `request.user`/`request.auth`

## 2025-01: Database - Prisma 6.19 + MongoDB 8
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, types auto-gnrs, support transactions
**Decision**: Prisma ORM avec MongoDB (replica set), schma unique dans `packages/shared/prisma/schema.prisma`
**Alternatives rejet**: Mongoose (types manuels, populate() stringly-typed), PostgreSQL (schma rigide pour documents)
**Cons**: Support MongoDB Prisma moins mature que PostgreSQL, pas de full-text search natif

## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Le service ne doit jamais crasher cause de Redis
**Decision**: RedisWrapper singleton, fallback automatique vers `Map<string, CacheEntry>` aprs 3 checs, `permanentlyDisabled` flag
**Alternatives rejet**: Redis seul (crash si Redis down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire non partag entre instances, taux de cache hit rduit si Redis tombe

## 2025-01: Erreurs - Hirarchie custom d'erreurs
**Statut**: Accept
**Contexte**: Rponses d'erreur structures et types pour le frontend
**Decision**: `BaseAppError` avec hirarchie (Auth/Permission/NotFound/Conflict/Validation/RateLimit/Internal), mapping Prisma (P2002/P2025), flag `isOperational`
**Alternatives rejet**: Erreurs gnriques (pas de type safety), codes HTTP bruts (pas d'info actionnable)
**Cons**: Plus de boilerplate, discipline ncessaire pour utiliser les bonnes classes

## 2025-01: Rate Limiting - Multi-niveaux
**Statut**: Accept
**Contexte**: Protection contre spam, scraping, DDoS
**Decision**: Global 300 req/min par IP, messages 20/min par user, mentions max 50/msg et 5/min par destinataire, Signal Protocol limits spcifiques
**Alternatives rejet**: Rate limit unique (pas assez granulaire), externe (Cloudflare only, pas de contrle fin)
**Cons**: Limites mmoire ne fonctionnent pas en multi-instance (besoin Redis pour distribu)

## 2025-01: Encryption - Signal Protocol + AES-256-GCM serveur
**Statut**: Accept
**Contexte**: Trois modes de chiffrement selon le besoin (E2EE, serveur, hybride)
**Decision**: Signal Protocol (`@signalapp/libsignal-client`), ServerKeyVault avec envelope encryption, LRU cache 500 cls/30min TTL
**Alternatives rejet**: Custom crypto (ne jamais rouler le sien), AES seul (pas de forward secrecy)
**Cons**: E2EE dsactive la traduction, Signal Protocol ncessite impl ct client

## 2025-01: Logging - Pino + PII Redaction
**Statut**: Accept
**Contexte**: Logs structures pour aggregation, conformit RGPD
**Decision**: Pino (5x plus rapide que Winston), redaction automatique PII (email, userId, IP hashes), child loggers par module
**Alternatives rejet**: Winston seul (plus lent, legacy), console.log (pas structur)
**Cons**: Double systme logging (Pino + Winston legacy), redaction complique le debugging

## 2025-01: Audio - Pipeline WebSocket-only
**Statut**: Accept
**Contexte**: Rsultats de traduction progressifs en temps rel
**Decision**: Audio uniquement via WS `message:send-with-attachments`, pipeline 3 tapes (Whisper -> NLLB -> Chatterbox), vnements progressifs
**Alternatives rejet**: REST (pas de streaming, ncessite polling), pipeline unique (pas de rsultats intermdiaires)
**Cons**: Traduction audio indisponible pour clients REST-only, connexion WS persistante requise

## 2025-01: Push - Firebase + APNs dual
**Statut**: Accept
**Contexte**: Push cross-platform (iOS/Android/Web) + VoIP iOS
**Decision**: FCM pour cross-platform, APNs pour iOS VoIP (PushKit), filtrage par prfrences utilisateur, DND
**Alternatives rejet**: OneSignal/Pusher (cot par notification, vie prive), FCM seul (pas de VoIP iOS)
**Cons**: Setup complexe (deux providers), maintenance certificats APNs + credentials FCM

## Phase 4 — `clientMessageId` idempotency dedup (2026-05-09)

**Contexte** : Les retries reseau (offline queue iOS, double-tap web, multi-device sync) produisaient des messages dupliques cote serveur. Phase 4 introduit un identifiant client-genere `cid_<uuid v4 lowercase>` qui sert de cle d'idempotence.

**Decision** :
- Le client (iOS, web, anonymous chat) genere un `clientMessageId` AVANT envoi, format `cid_<uuid v4 lowercase>` (helper centralise `packages/shared/utils/client-message-id.ts` + miroir Swift `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`).
- Le serveur (`MessagingService.handleMessage` -> `MessageProcessor.saveMessage`) applique le pattern **catch-on-conflict atomique** : `prisma.message.create` direct, capture P2002 sur duplicate-key, fallback `findFirst` pour retourner l'existant.
- L'unicite est garantie par un **index unique partiel MongoDB** sur `(conversationId, clientMessageId)` avec `partialFilterExpression: { $exists: true, $type: "string", $ne: "" }` — manage manuellement (cf migration `2026-05-09-message-client-id.mongodb.js`), PAS via `@@unique` Prisma (qui produirait un index non-partial cassant les rows historiques sans le champ).
- Le `findUnique` Prisma est remplace par `findFirst({ where: { conversationId, clientMessageId } })` pour cette meme raison.

**Alternative rejetee** : `findUnique` pre-INSERT n'est PAS atomique (deux requetes concurrentes passent toutes deux le `findUnique` retourne null avant qu'une n'INSERT). Le pattern `INSERT direct + catch P2002` collapse ce checkpoint en une seule round-trip.

**Consequences** :
- **Performance** : ~5% de latence d'ecriture additionnelle MongoDB 8 sur le path nominal. Sur la cible 100k msgs/s du projet, ce n'est pas le goulot ; le plafond reste la connection pool Prisma.
- **Sharding-ready** : l'index est compatible avec le pattern de sharding `{ conversationId: "hashed" }` (cle de shard alignee, pas de scatter-gather sur le dedup). Hors scope de Phase 4 mais documente pour le futur.
- **Re-translate sur dedup hit** : si la premiere insertion a reussi mais le PUSH ZMQ vers translator a echoue (translator down), le dedup hit re-pousse via `void messageTranslationService.translate(message).catch(...)` (fire-and-track avec capture d'erreur). Si traductions deja presentes, skip.
- **Privacy-preserving broadcast** : le serveur strip `clientMessageId` du payload `message:new` envoye aux autres participants ; seul le sender recoit le champ pour la reconciliation iOS / web.
- **Contrat cross-platform pinne par tests** : `services/gateway/src/__tests__/unit/utils/client-message-id.test.ts` (13 tests) verrouille la regex `cid_<uuid v4 lowercase>`, l'unicite (1000 invocations), le rejet des prefixes legacy (`temp_`/`offline_`/`retry_`), des UUIDs uppercase (defaut Swift), des variants/version digits invalides, et l'ancrage `^...$` de la regex.

## Phase 5 — Reactions sur posts migrees vers table dediee (2026-05-15)

**Contexte** : Les reactions sur posts/stories etaient stockees en `Post.reactions: Json[]` embedded (array de `{userId, emoji, createdAt}`). Trois problemes structurels : (1) race condition sur l'array — concurrent `findFirst + update` ecrasent l'un l'autre car le RMW n'est pas atomique ; (2) leak de privacy — la liste exhaustive des reactors est envoyee a tout viewer du post ; (3) trois sources de verite divergeables (`likeCount`, `reactionCount`, `reactionSummary`, `reactions[]`).

Le pattern Message/Comment etabli en Phase 1+2 (table dediee + `currentUserReactions` batch + Socket.IO + ACL room) etait strictement superieur. Phase 5 aligne Post sur ce pattern.

**Decision** :
- Nouvelle table `PostReaction { postId, userId, emoji, createdAt, updatedAt }` avec `@@unique([postId, userId, emoji])` + indexes (`[userId, commentId]` cover la query batch hot path).
- Nouveau `PostReactionService` mirror exact de `CommentReactionService` post-remediation : `try/catch P2002`, `prisma.$transaction` enveloppant `updatePostReactionSummary`, `MAX_REACTIONS_PER_USER = 1`, `getEmojiAggregation` retourne `{ emoji, count }` only (pas de `userIds`/`hasCurrentUser` — Phase 3 privacy trim coherent SDK + gateway).
- Nouveau `PostReactionHandler` Socket.IO (`post:reaction-add/added/-remove/-removed/-request-sync/-sync`) avec auth, Zod, `SocketRateLimiter` 30/60s, `canUserViewPost()` ACL (extrait dans `services/posts/postVisibility.ts`, partage avec `CommentReactionHandler`), `enhancedLogger`. La room `post:{postId}` est partagee avec les comments — les handlers `post:join`/`post:leave` ont migre depuis `CommentReactionHandler` vers `PostReactionHandler` (posts sont les owners naturels).
- `PostService.likePost`/`unlikePost` (REST) deviennent des compat shims : delegent a `PostReactionService.addReaction`/`removeReaction` puis resynchronisent `Post.reactions: Json[]` + `Post.likeCount` depuis la table canonique. Les anciens clients qui lisent ces champs voient toujours un etat coherent.
- `currentUserReactions: string[]` ajoute aux reponses `GET /posts/:id`, `/feed`, `/feed/stories`, `/posts/user/:id`, `/posts/community/:id`, `/posts/bookmarks` via batch query `prisma.postReaction.findMany({ userId, postId IN [...] })`. `Cache-Control: private, no-cache` ajoute sur ces routes.
- SDK Swift : `APIPost.currentUserReactions: [String]?`, `SocketPostReactionUpdateEvent`/`SyncEvent`/`Aggregation` (slim), `addPostReaction(postId:emoji:)`/`removePostReaction`/`requestPostReactionSync` sur `SocialSocketProviding`, publishers `postReactionAdded/Removed/Sync`. `PostReactionError` enum (mirror de `CommentReactionError`).
- iOS app : `FeedView` + `RootViewComponents.ThemedFeedOverlay` + `PostDetailView` hoissent `postLikedIds`/`postLikeDelta`/`postHeartInFlightIds`, seedent depuis `currentUserReactions` via `computePostLikedIds(from:)`, emettent via Socket.IO (`addPostReaction`/`removePostReaction`, plus de REST), s'abonnent aux events realtime. `PostDetailView` join/leave la room `post:{postId}` ; le feed list NE join PAS (trop de rooms ephemeres).
- Script one-shot `scripts/migrate-post-reactions.ts` backfille `Post.reactions: Json[]` -> `PostReaction` rows. Cursor-paginated, idempotent via `@@unique` + P2002 swallow (Mongo Prisma 6 ne supporte pas `createMany skipDuplicates`), resumable via `--from-cursor`, `--dry-run` option. Helper `embeddedReactionsToRows` extrait + 19 tests unitaires.

**Alternatives rejetees** :
- **Garder embedded array avec Mongo natif `$push` + filter `$ne`** : aurait fixe la race d'array sans table, mais (a) necessite `prisma.$runCommandRaw` qui casse le typage Prisma et la coherence avec le reste du codebase, (b) ne resout PAS le leak de privacy (les viewers continuent de recevoir tous les userIds), (c) ne resout pas la dispersion des compteurs.
- **Hybride : table source-de-verite + snapshot embedded des derniers N** : dual-write, complexite supplementaire pour un benefice marginal sur des commentaires qui ont typiquement <30 reactions.
- **Reverser Comment vers embedded pour matcher Post** : aurait simplifie l'API (1 query), mais aurait reintroduit les 3 problemes resolus en Phase 1+2 + ses 12 commits + ses revues senior. Le pattern Comment est strictement superieur ; on a aligne Post dessus, pas l'inverse.

**Compatibilite** :
- `Post.reactions: Json[]` est PRESERVE pour les clients pre-Phase-5. Sa deprecation est differee a Phase 6 (apres deploiement + migration data + verification que les clients passent par `currentUserReactions`).
- Notification `'post_like'` (type existant) est reutilisee — pas de nouveau type pour eviter de toucher l'UI iOS de rendu de notifications.
- Anciens clients web continuent d'appeler REST `POST/DELETE /posts/:id/like` ; ces endpoints continuent de fonctionner via le compat shim.

**Risques connus residuels** :
- Drift potentiel entre `Post.reactions: Json[]` (legacy) et `PostReaction` table pendant la fenetre de migration : le shim `PostService.likePost` rebuild systematiquement le Json depuis la table, donc apres CHAQUE ecriture via /like ou Socket.IO les deux convergent. Mais les ecritures pre-Phase-5 restent en place — d'ou le besoin du script de backfill `scripts/migrate-post-reactions.ts`.
- `MeeshyNotificationType` doit etre etendu pour supporter `post_like` si pas deja present (verifie iOS pre-existant — type connu, rendu via `heart.fill`).

**Tests** : +67 PostReactionService + +26 PostReactionHandler + +22 PostService/PostFeedService batch enrichment + +5 SDK Swift decoding + +10 iOS computePostLikedIds + heartInFlight + +19 migration helper = **+149 tests**. Total Phase 1+2+3 atomiques sur la branche : 400+.

## 2026-05-16 : Double coche pilotee par push pour les destinataires hors-ligne

**Contexte** : Le flux de statut message (sent -> delivered -> read) ne couvrait que les destinataires EN LIGNE. `MessageHandler._autoDeliverToOnlineRecipients` marque un message livre pour chaque destinataire ayant une socket active et emet `read-status:updated` -> l'auteur voit la double coche immediatement. Mais un destinataire HORS-LIGNE qui recoit seulement un push notification ne declenche aucune transition : l'extension iOS `MeeshyNotificationExtension` pre-enregistre le message localement mais ne rappelle jamais le gateway. Resultat : l'auteur reste sur simple coche jusqu'a ce que le destinataire ouvre l'app.

**Decision** :
- Nouvel endpoint `POST /api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt` (`routes/message-read-status.ts`). Il resout la conversation, verifie l'appartenance, valide que le message existe et appartient bien a cette conversation (rejet d'un messageId spoofe/cross-conversation), puis delegue a `MessageReadStatusService.markMessagesAsReceived(participantId, conversationId, messageId)` et diffuse `read-status:updated` via le helper existant `broadcastReadStatusUpdate`.
- Comportement calque sur le sibling `mark-as-received` : le curseur de livraison est avance dans tous les cas (coherence `unreadCount`), mais le broadcast `read-status:updated` est supprime quand le destinataire a desactive `showReadReceipts`. No-op si l'appelant est l'auteur du message.
- Cote iOS, l'extension `NotificationService` appelle `NSEDataSync.postDeliveryReceipt` a reception d'un push de type message (`new_message`, `message_reply`, `reply`, `message_forwarded`, `new_conversation*`, `added_to_conversation`).
- `NSEDataSync.enqueueBackgroundPost` route l'appel via une **`URLSession` background** (`URLSessionConfiguration.background`, `sharedContainerIdentifier` = App Group). Le daemon systeme `nsurlsessiond` termine le transfert meme apres le teardown de l'extension (declenche par `contentHandler`), sans jamais retarder la banniere. Token Bearer lu depuis le Keychain partage, base URL resolue depuis l'allowlist (jamais depuis le payload push — coherent avec l'audit SSRF 2026-05-11).

**Alternatives rejetees** :
- **Reutiliser `POST /conversations/:id/mark-as-received`** : fonctionnellement equivalent (curseur time-based), mais pas de messageId explicite ni d'observabilite dediee au flux push-delivery. Un endpoint dedie clarifie la semantique.
- **`URLSession.shared` dans le `DispatchGroup` de l'extension** : plus simple mais (a) une requete reseau lente retarderait l'affichage de la banniere, (b) les tasks foreground meurent avec le process si `contentHandler` est appele avant la fin. La session background decouple totalement le receipt du rendu de la banniere et survit au teardown.
- **Capter les delivery-receipts APNs/FCM** : aucun lien fiable cote serveur entre un receipt APNs et un message ; APNs ne garantit pas la livraison.

**Consequences** :
- Le `read-status:updated` emis par l'endpoint est identique a celui du chemin online — l'auteur (iOS/web) le consomme deja, aucune modification client cote auteur.
- Livraison non garantie : si APNs ne delivre pas le push, ou si l'extension n'a pas de token valide, aucun receipt n'est emis ; la double coche apparaitra a l'ouverture de l'app. Acceptable et documente.
- Sur-comptage en groupe : `markMessagesAsReceived` avance un curseur time-based (`lastDeliveredAt = now`), donc tout message `createdAt <= now` est compte livre. Comportement pre-existant, identique au chemin online auto-deliver — accepte.
- `showReadReceipts` respecte cote serveur : la confidentialite du destinataire est preservee meme si le receipt est poste.

**Tests** : 9 tests route gateway (`__tests__/routes/delivery-receipt.test.ts`) — curseur avance + broadcast, 404 conversation/message, 403 non-membre, message cross-conversation, message supprime, `showReadReceipts` off (curseur sans broadcast), no-op self-sender, 400 messageId invalide. Cote iOS, l'extension NSE n'a pas de cible de tests dans le repo (comme `NSEDataSync.syncMessage` / `NSEDecryptor` pre-existants) ; verification via `./apps/ios/meeshy.sh build` (macOS requis).

