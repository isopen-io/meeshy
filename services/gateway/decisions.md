# Decisions - services/gateway (Fastify API Gateway)

## 2026-07-31 : Le curseur read/delivered ordonne par `createdAt`, plus par chaine ObjectId

**Statut** : Accept
**Contexte** : La garde de fraicheur atomique de `MessageReadStatusService._advanceCursor` (et son jumeau `isStaleCursorMessageId` du chemin mark-unread, `routes/conversations/messages.ts`) comparait deux ObjectId MongoDB par ordre **lexicographique de chaine hex** comme proxy de chronologie. Un ObjectId n'encode la date de creation qu'a la **seconde** (4 premiers octets) ; les 5 octets suivants sont un aleatoire **par process**. Deux messages crees dans la meme seconde sur des process gateway **differents** (scale horizontal) trient donc par chaine dans un ordre **sans rapport** avec la vraie recence. Consequence : la double coche de l'auteur pouvait se figer sur un message anterieur, voire **reculer** le curseur vers un message plus ancien (resurrection de non-lus) — transitoire, self-healing au prochain recu d'une seconde ulterieure, mais reel.

**Decision** :
- Deux champs `ConversationReadCursor.lastReadMessageCreatedAt` / `lastDeliveredMessageCreatedAt` (`DateTime?`) memorisent le `createdAt` du message pointe. La garde ordonne desormais par ce `createdAt` (precision milliseconde, stable inter-process) via `buildCursorFreshnessGuard` (fonction pure, exportee et testee en isolation). L'ordre ObjectId n'est conserve qu'en **repli** pour les curseurs legacy (`createdAt` null tant qu'une avance ne l'a pas renseigne) et pour un message introuvable (supprime entre l'envoi et le recu).
- Le pair `(id, createdAt)` doit rester coherent chez **tous** les ecrivains du curseur : le chemin mark-unread (`upsert`) ecrit maintenant `lastReadMessageCreatedAt` en meme temps que `lastReadMessageId`. Un `createdAt` laisse perime aurait fausse la garde et rejete des avances de lecture legitimes.

**Alternatives rejetees** :
- **Comparer sur `lastReadAt`/`lastDeliveredAt` (temps de traitement serveur)** : ce n'est pas le temps du message ; deux recus traites a des instants proches ne refletent pas l'ordre des messages.
- **Lire l'etat courant puis decider en memoire** : reintroduit le TOCTOU que la garde atomique dans le WHERE de l'`updateMany` ferme deja (deux appels concurrents liraient le meme curseur non avance).
- **Ajouter un departage ObjectId a `createdAt` egal (meme milliseconde)** : rejete pour la simplicite ; une egalite stricte au milliseconde inter-process est bien plus rare que la collision a la seconde d'aujourd'hui, et se resout au recu suivant (stall transitoire, jamais un recul).

**Consequences** :
- Additif MongoDB : les curseurs existants ont `createdAt` null et empruntent le repli ObjectId jusqu'a leur premiere avance, qui renseigne le champ. Aucune migration/backfill.
- Une lecture `message.findUnique({ select: { createdAt } })` supplementaire par avance de curseur (chemin d'ecriture d'arriere-plan, requete par `_id` — la moins couteuse). Acceptable.

**Tests** : +5 `MessageReadStatusService.test.ts` (helper pur + inversion meme-seconde inter-process : ni recul ni stall), +2 `messages-routes.test.ts` (staleness mark-unread ordonnee par createdAt + ecriture coherente du pair). Suite gateway complete verte (565 suites).

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


## 2026-08-08 : Les mentions d'un post editee sont RECONCILIEES, pas rejouees

**Contexte** : `PUT /posts/:postId` reextrayait les `@handle` du contenu edite, resolvait les
usernames, puis **recreait** les lignes `PostMention` et renotifiait — son commentaire l'admettait
(`re-fires all; idempotent via P2002 swallow`). L'idempotence citee ne couvre que la persistance :
`createPostMentions` avale les P2002, mais `createPostMentionNotificationsBatch` n'a aucune memoire
de qui a deja ete prevenu. Deux consequences.

D'une part, **chaque edition repingeait tous les mentionnes**. Le bloc ne comparait pas le contenu
a son etat precedent : dix corrections de frappe valaient dix `user_mentioned` a quelqu'un nomme
une seule fois, et modifier la seule VISIBILITE d'un post repingeait tout le monde. Le garde-fou de
debit (`MAX_MENTIONS_PER_MINUTE` par paire emetteur/destinataire) ne couvre qu'une fenetre d'une
minute et ne rattrape donc rien.

D'autre part, **les partants n'etaient jamais retires**. La route creait, jamais ne supprimait :
editer « bravo @alice » en « bravo @bob » ajoutait Bob et laissait Alice mentionnee a vie. Ces
lignes alimentent l'affinite de recommandation des reels (`PostFeedService.getMentionsByPost`,
`getReelSeed`) — un post recommande pour une mention qu'il ne porte plus.

Meme couple de defauts que celui corrige cote messages par `replaceMessageMentions` (2026, cycle
22) ; le domaine social n'en avait pas herite.

**Decision** : nouvelle unite `services/posts/postMentions.ts`, miroir structurel de
`services/messaging/messageMentions.ts`, avec deux points d'entree publics que les routes
appellent a la place du bloc inline :
- `resolvePostMentions` (creation) : court-circuit sans cout quand le contenu ne porte aucun `@`,
  **aucune lecture de `PostMention`** (un post neuf n'a pas d'ensemble precedent), tous les
  mentionnes sont des entrants par construction.
- `reconcilePostMentions` (edition) : **pas** de court-circuit — un contenu qui ne nomme plus
  personne doit effacer ses lignes ; supprime les seuls partants, cree les seuls entrants, et ne
  notifie que `newlyMentionedUserIds`.

Les deux sont best-effort et ne levent jamais (`onError` laisse l'appelant journaliser dans le
contexte de sa requete). En panne — service absent, ensemble precedent illisible, resolution en
echec — la reconciliation **s'abstient de tout ecrire** et rend `reconciled: false` : preserver une
mention perimee vaut mieux que detruire une mention vivante. La notification est **detachee**
(appelee dans la continuation, jamais attendue) : elle traverse push, socket et e-mail, et rien de
cela n'a a retarder la reponse d'une publication.

**Alternatives rejetees** :
- **Factoriser avec `messageMentions`** : les deux domaines ne partagent ni la table (`PostMention`
  vs `Mention`), ni la validation (un post n'a ni participants ni regle « conversation directe »),
  ni le champ denormalise (`Message.validatedMentions` n'a pas d'equivalent sur `Post`). Seule la
  FORME est commune ; une abstraction sur si peu de substance aurait coute plus qu'elle ne rend.
- **Dedupliquer cote `NotificationService`** (ne pas creer un `user_mentioned` deja emis pour la
  paire post/destinataire) : deplace la connaissance de « qui etait deja mentionne » hors de
  l'endroit qui la detient, et ne repare pas D2 — les lignes des partants resteraient.
- **Purger puis recreer toutes les lignes** : plus simple, mais detruit l'ensemble precedent, donc
  rend « qui est entrant » insoluble — c'est precisement ce qui forcait a renotifier tout le monde.

**Consequences** :
- Le chemin d'edition attend desormais la reconciliation (jusqu'a trois aller-retours : lecture du
  precedent, `deleteMany` si partants, creation des entrants) avant de repondre. Les editions de
  post sont rares devant les creations, et l'ordre est requis par la correction.
- La creation attend la persistance des lignes, la ou elle etait en fire-and-forget. Un seul
  aller-retour de plus, et `createPostMentions` ne rejette pas (`Promise.allSettled` interne).
- Les `PostMention` perimees **deja ecrites** subsistent : le correctif ne vaut que pour les
  editions a venir. Reparable par script avec acces base, sur le patron de
  `repair-mention-user-ids.ts`.
- Les commentaires n'ont pas de route d'edition : rien a reconcilier cote `CommentMention`
  aujourd'hui. Le jour ou elle apparait, elle doit naitre avec `reconcilePostMentions` pour jumeau.

**Tests** : 16 tests d'unite (`__tests__/unit/services/posts/postMentions.test.ts`, ecrits en RED
avant l'implementation) + 2 tests de regression au niveau route (`posts-core-notifications.test.ts`)
qui verrouillent exactement les deux defauts : aucun renvoi de notification a un mentionne deja
nomme, et `deleteMany` sur les seuls partants. Suite gateway complete verte (603 suites,
15 655 tests).

## Le fil d'un post herite de l'audience de son post — deux verdicts nommes (cycle 29)

**Contexte** : `postVisibility.ts` portait depuis la decision 2026-07-08 une asymetrie ECRITE
mais inapplicable a un objet unitaire : le filtre de LISTE (`buildPostVisibilityOrFilter`, feed +
post unique) admet amis ∪ contacts DM, tandis que `canUserViewPost` — decrit dans le meme fichier
comme « ce qui garde REAGIR / COMMENTER » — reste amis stricts. Aucune route de commentaire
n'appliquait ni l'une ni l'autre : les six routes de `routes/posts/comments.ts`, le like/unlike
REST du post et les quatre handlers de reaction socket ne consultaient jamais `Post.visibility`. Le post etait pourtant
protege, `post:join` gardait deja la room, et `CommentReactionHandler` portait un
`_canUserViewPost` prive **que rien n'appelait**.

**Decision** : quatre primitives dans `postVisibility.ts`, pas un module de plus.

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | quelle est la tranche ACL de ce post ? | — (`null` si absent OU supprime) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire ? | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM (celle du feed) |
| `canUserInteractWithPost` | peut-il ECRIRE / REAGIR ? | amis stricts |

Les deux verdicts ne different que par `canUserViewPost(..., { includeDirectContacts })`. C'est le
point : l'asymetrie devient EXECUTABLE au lieu de rester un commentaire, et un point d'entree
choisit son verdict en le nommant plutot qu'en reglant un booleen.

**Alternatives rejetees** :
- **Un seul verdict (amis stricts) pour tout le fil** : plus simple, mais un contact DM non-ami a
  qui le feed montre deja une story `FRIENDS` recevrait un 404 sur ses commentaires. Ce n'est pas
  une garde, c'est une regression pour un lecteur legitime.
- **Reutiliser `PostService.getPostById`** pour garder la lecture : ramene tout le `postInclude`
  (medias, auteur, compteurs, reactions) la ou trois champs suffisent, sur un chemin de lecture
  chaud.
- **Materialiser la liste de contacts DM** (`getDirectConversationContactIds`) pour trancher un
  seul acces : cout proportionnel au carnet d'adresses. `doUsersShareDirectConversation` est le
  pendant **pairwise**, deux requetes bornees — exactement le rapport que `doUsersShareCommunity`
  entretient avec `getCommunityCoMemberIds`.
- **Faire confiance au `:postId` du chemin** (ou du payload socket) sur les routes adressant leur
  cible par `commentId` : un appelant annoncerait le post public de son choix tout en visant le fil
  d'un post prive. Le post est resolu DEPUIS le commentaire.
- **Ne garder que le chemin socket** : `likePost` / `PostReactionService.addReaction` ne verifient
  eux non plus que l'existence du post. Garder l'un sans l'autre ferait dependre l'ACL du
  TRANSPORT — un client refuse sur `post:reaction-add` reussirait en repassant par
  `POST /posts/:postId/like`.
- **Repondre `403`** : distinguer « interdit » d'« inexistant » fait de la route un oracle
  d'existence de posts prives. `404` partout, et `null` indistinct entre absent, supprime et
  invisible — doctrine deja tenue par `recordMediaDownloads`.

**Consequences** :
- Une requete bornee de plus par appel sur le fil. Cas dominant (post `PUBLIC`) : aucune lecture de
  graphe ensuite. `FRIENDS`/`EXCEPT` : une requete d'amitie, et le contact DM n'est consulte qu'en
  dernier recours. `EXCEPT` court-circuite sur sa liste noire avant toute lecture de graphe.
- **Un utilisateur qui perd l'acces a un post ne peut plus retirer une reaction qu'il y avait
  laissee.** Contrepartie assumee : elle lui est de toute facon invisible, et une ACL qui depend du
  sens du geste est un footgun. Seul l'auteur peut encore faire disparaitre le post.
- Les harnais de test doivent DECLARER leur audience (15 fichiers). C'est voulu : un double qui
  n'expose pas la tranche ACL echoue au lieu de rendre un verdict par defaut.
- `doUsersShareCommunity` prend desormais `CommunityVisibilityPrisma` au lieu de `PrismaClient`
  entier — la garde n'a plus a se faire passer un client complet par assertion.

**Tests** : 51 tests neufs, RED observe a chaque etape (24 rouges avant implementation) —
`__tests__/unit/services/posts/postThreadAccess.test.ts` (22), `.../routes/posts/comments-audience.test.ts`
(17), `.../routes/posts/interactions-audience.test.ts` (8), plus 9 cas d'audience dans les deux
suites de handlers socket. Suite gateway complete verte (608 suites, 15 740 tests), `tsc --noEmit`
propre.

## 2026-08-09 : Défauts `audioTranslationEnabled`/`ttsEnabled` alignés sur le texte (false → true)

**Contexte** : `AudioPreferenceSchema`/`AUDIO_PREFERENCE_DEFAULTS` (`packages/shared/types/preferences/audio.ts`) avaient `transcriptionEnabled`/`textTranslationEnabled` par défaut `true`, mais `audioTranslationEnabled`/`ttsEnabled` par défaut `false` — une asymétrie sans équivalent côté texte. `ConsentValidationService.getConsentStatus` porte son **propre** repli codé en dur, indépendant du schema partagé (`boolPref(audioPrefs.audioTranslationEnabled, false)` / `boolPref(audioPrefs.ttsEnabled, false)`) — changer seulement le schema n'aurait donc eu aucun effet observable. Or `processAudioAttachment` (`MessageTranslationService.ts`) vide silencieusement `targetLanguages` quand `!canGenerateTranslatedAudio`, et `canGenerateTranslatedAudio = translatedAudioGenerationEnabled && canTranslateAudio` avec `canTranslateAudio = audioTranslationEnabled && canTranscribeAudio && canTranslateText`. Tant qu'aucun des deux booléens n'avait été explicitement écrit par le client (`PATCH /me/preferences/audio`), aucune langue traduite n'était jamais générée pour personne, sans que l'expéditeur ni le destinataire ne le sache — une régression silencieuse par rapport au principe Prisme (l'audio doit être traduit automatiquement, comme le texte).

**Décision** : flip des deux défauts à `true`, aux DEUX endroits (le schema seul ne suffit pas puisque `ConsentValidationService` ne le dérive pas) :
- `packages/shared/types/preferences/audio.ts` : `AudioPreferenceSchema` (`audioTranslationEnabled`/`ttsEnabled` → `z.boolean().default(true)`) et `AUDIO_PREFERENCE_DEFAULTS` (idem).
- `services/gateway/src/services/ConsentValidationService.ts` : `boolPref(audioPrefs.audioTranslationEnabled, false)` → `boolPref(audioPrefs.audioTranslationEnabled, true)`, idem pour `ttsEnabled`.

**Aucune migration nécessaire.** `boolPref` ne retombe sur le défaut QUE quand le champ JSON est absent (`typeof value === 'boolean'` faux) — jamais persisté, calculé à chaque lecture. Un utilisateur qui a explicitement désactivé (`false` écrit via `PATCH /me/preferences/audio`) garde son choix intact ; seul celui qui n'a jamais touché au réglage bascule sur le nouveau défaut, immédiatement après déploiement, sans backfill.

**Le consentement voix de base reste inchangé.** `canTranscribeAudio = audioTranscriptionEnabled && hasVoiceDataConsent` — `hasVoiceDataConsent` (dérivé de `voiceDataConsentAt`, un consentement RGPD explicite) reste un gate distinct, non touché par ce flip. `audioTranslationEnabled`/`ttsEnabled` ne retirent qu'une couche d'opt-in redondante AU-DESSUS d'un consentement déjà accordé par ailleurs ; un utilisateur n'ayant jamais donné son consentement voix reste bloqué exactement comme avant.

**Alternatives rejetées** :
- **Ne changer que le schema partagé, pas `ConsentValidationService`** : aurait laissé le comportement identique en pratique — le service a son propre repli dupliqué, jamais dérivé du schema. Corrigerait un fichier sans effet observable.
- **Ajouter un backfill/migration explicite** : inutile et risqué — écrirait `true` dans des documents où l'utilisateur avait peut-être une raison de laisser le champ absent plutôt que de le poser à `false` explicitement. La lecture en négatif (absent ⇒ nouveau défaut) suffit et ne touche jamais un choix explicite.

**Tests** : `ConsentValidationService.test.ts` — le cas « préférence audio absente » est réécrit pour attendre `canTranslateAudio`/`canGenerateTranslatedAudio` à `true` (au lieu de `false`) quand le consentement voix de base est accordé ; un cas dédié verrouille qu'un `audioTranslationEnabled: false` explicite reste respecté malgré le flip du défaut ; un second cas dédié (`ttsEnabled: false` explicite, `audioTranslationEnabled` omis) prouve que `canTranslateAudio` se débloque bien et que seul `ttsEnabled` bloque `canGenerateTranslatedAudio` — pour ne pas laisser cette assertion n'être qu'un effet de bord du cascade `canTranslateAudio=false` (commits `ce98fad50`, `42734c66f`).

**Implication charge/capacité** : ce flip rend la génération audio traduite opt-out plutôt qu'opt-in pour la grande majorité des utilisateurs — auparavant la plupart n'avaient jamais rien écrit sur ces deux champs et généraient donc zéro synthèse TTS. Chaque message audio d'un expéditeur consentant va désormais déclencher une synthèse Chatterbox (pipeline CPU/GPU-bound) pour chaque langue cible dérivée de la conversation, par défaut. C'est l'effet produit recherché, mais il a un impact réel sur l'infrastructure : surveiller la profondeur de file et la saturation du pool de workers du translator après déploiement en production, et être prêt à scaler ce pool si la charge TTS augmente significativement.

Détail complet et rationale : `docs/superpowers/specs/2026-08-09-audio-translation-prisme-reliability-design.md` (Problème 3).
