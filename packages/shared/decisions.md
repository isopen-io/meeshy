# Decisions - packages/shared (Types & Schema partags)

## 2026-08-13 (2) : Le bloc de statut dénormalisé de `Message` sort entièrement du schéma

**Statut** : Accepté

**Contexte** : Le modèle `Message` portait un bloc « COMPUTED STATUS FIELDS (denormalized for
performance) » de quatre colonnes — `deliveredToAllAt`, `readByAllAt`, `deliveredCount`,
`readCount` — documentées « Updated when all conversation participants complete each action ».
Leur unique écrivain, `MessageReadStatusService.updateMessageComputedStatus`, est un **no-op
assumé depuis le passage aux curseurs de lecture**. Les quatre colonnes valaient donc `0` / `null`
sur tout message écrit depuis, sans qu'aucun test ni aucune garde ne le signale.

Les cycles précédents ont rebranché la LECTURE : les quatre valeurs se calculent maintenant dans
`getConversationReadStatuses` (union curseur / reçu figé, opt-out `showReadReceipts` retiré du
numérateur comme du dénominateur) et sont servies telles quelles par
`GET /conversations/:id/messages` et `GET /messages/:messageId`. Plus aucun `select` Prisma ne
lisait les colonnes ; `tsc --noEmit` sur la gateway le confirme après retrait.

**Décision** : les quatre colonnes sortent de `schema.prisma`. Le commentaire du modèle explique
désormais où la valeur se calcule, pour qu'aucun futur écrivain ne les « restaure » et ne rouvre
la divergence.

**Ce qui NE change PAS** : `deliveredCount`, `readCount`, `deliveredToAllAt`, `readByAllAt`
restent dans les types de CHARGE UTILE (`types/message-types.ts`, `types/conversation.ts`,
`types/api-schemas.ts`, `utils/validation.ts`) — trois clients les décodent
(`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`). Application directe de la
leçon du cycle 103 : **la colonne « lecteurs » décide du geste, et ici le lecteur lit une valeur
CALCULÉE, pas une colonne**. Seul le stockage mort disparaît ; la charge utile est identique
au bit près.

**Alternatives rejetées** : *réécrire un écrivain* — reconstituerait une dénormalisation à tenir
cohérente à chaque curseur déplacé, alors que le calcul à la lecture est déjà la source de vérité
partagée par les quatre méthodes d'accusés.

**Conséquences** : MongoDB conserve les champs dans les documents existants (Prisma cesse
simplement de les connaître) — aucune migration, aucune perte. Toute tentative de les `select`
redevient une erreur de compilation.

## 2025-01: TypeScript Strict + Immutabilit
**Statut**: Accept
**Contexte**: Package partag entre tous les services, doit tre la rfrence de type safety
**Decision**: TypeScript strict avec tous les flags avancs (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.), zro `any`, `readonly` partout (2849+ occurrences)
**Alternatives rejet**: Mode loose (bugs runtime), proprits mutables (effets de bord), `any` pour flexibilit (perte de scurit)
**Cons**: Code plus verbeux, courbe d'apprentissage

## 2025-01: Branded Types pour IDs sensibles
**Statut**: Accept
**Contexte**: Prvenir la confusion compile-time entre types d'identifiants
**Decision**: Types brands via intersection: `type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' }`
**Alternatives rejet**: Strings simples (pas de protection compile-time), classes (overhead runtime), opaque types (pas support nativement par TS)
**Cons**: Zro overhead runtime, meilleure documentation d'intention

## 2025-01: `type` prfr  `interface`
**Statut**: Accept
**Contexte**: Cohrence des structures de donnes dans le package
**Decision**: `type` pour les structures de donnes, `interface` rserv aux contrats de comportement (Socket.IO event maps, encryption adapters)
**Alternatives rejet**: Interface-first (moins flexible pour unions/intersections), classes (trop lourd pour data-only)
**Cons**: Sparation claire donnes vs comportement

## 2025-01: Socket.IO Events - `entity:action-word` avec hyphens
**Statut**: Accept
**Contexte**: Convention de nommage unique pour tous les vnements temps rel
**Decision**: Format `entity:action-word` (colons + hyphens, JAMAIS underscores). Constants spars `SERVER_EVENTS` et `CLIENT_EVENTS` avec `as const`
**Alternatives rejet**: Underscores (`message_send`) (moins lisible), camelCase (`messageSend`) (pas convention WS), namespace plat (collisions)
**Cons**: Convention doit tre enforce manuellement

## 2025-01: Messages - GatewayMessage vs UIMessage
**Statut**: Accept
**Contexte**: Backend et frontend ont des besoins diffrents pour les messages
**Decision**: `GatewayMessage` (align Prisma, backend), `UIMessage` (tats visuels, frontend). Conversion via `gatewayToUIMessage()`, affichage via `getDisplayContent(msg, lang)`
**Alternatives rejet**: Type unique (mlange concerns API et UI), types multiples par contexte (maintenance impossible)
**Cons**: Logique de conversion  maintenir, deux types  comprendre

## 2025-01: Validation - Zod avec CommonSchemas
**Statut**: Accept
**Contexte**: Validation runtime aux frontires de confiance (API, WebSocket)
**Decision**: Zod pour validation + infrence de types. `CommonSchemas` centralis (mongoId, conversationType, messageContent, email, etc.)
**Alternatives rejet**: Joi (moins TypeScript-friendly), Yup (moins d'infrence), class-validator (ncessite classes), validation manuelle (error-prone)
**Cons**: Source unique de vrit pour les rgles de validation

## 2025-01: Encryption - SharedEncryptionService avec DI
**Statut**: Accept
**Contexte**: Mme code de chiffrement sur frontend (Web Crypto) et backend (Node crypto)
**Decision**: SharedEncryptionService avec injection de dpendances (CryptoAdapter, KeyStorageAdapter), Signal Protocol optionnel
**Alternatives rejet**: Impls spares par plateforme (duplication), Web Crypto only (pas Node.js), Node crypto only (pas browser)
**Cons**: Setup DI plus complexe, mais testable avec mocks

## 2025-01: Build - ESM + Subpath Exports
**Statut**: Accept
**Contexte**: Module moderne avec tree-shaking pour tous les consommateurs
**Decision**: `"type": "module"`, target ES2020, moduleResolution `bundler`, subpath exports (`@meeshy/shared/types/*`, `@meeshy/shared/encryption/*`)
**Alternatives rejet**: CommonJS (legacy, pas de tree-shaking), dual CJS+ESM (maintenance complexe)
**Cons**: Extensions `.js` obligatoires dans les imports (convention ESM), incompatible outils CJS-only

## 2025-01: Langues - 60+ langues avec capability flags
**Statut**: Accept
**Contexte**: Frontend et backend doivent connatre les capacits de chaque langue
**Decision**: `SupportedLanguageInfo` avec flags (supportsTTS, supportsSTT, supportsVoiceCloning), engine specs, codes MMS, rgions
**Alternatives rejet**: Listes de langues hardcodes (pas flexible), config backend-only (duplication frontend), fichiers spars par langue (maintenance)
**Cons**: Synchronisation manuelle avec le service translator Python

## 2025-01: Rles - Hirarchie numrique
**Statut**: Accept
**Contexte**: Vrification de permissions efficace et extensible
**Decision**: Rles globaux numriques (BIGBOSS 100 > ADMIN 80 > MODERATOR 60 > AUDIT 40 > ANALYST 30 > USER 10), rles membres spars (CREATOR 40 > ADMIN 30 > MODERATOR 20 > MEMBER 10)
**Alternatives rejet**: Comparaison string (error-prone), bitwise flags (moins lisible), hirarchie DB-only (query ncessaire)
**Cons**: Numros arbitraires, distinction globaux vs contextuels  comprendre

## 2025-01: Database - MongoDB 8 + Prisma (PAS PostgreSQL)
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, documents imbriqus, scalabilit horizontale
**Decision**: MongoDB 8 avec replica set (transactions), Prisma ORM, dnormalisation pour performance (memberCount, reactionSummary), soft deletes
**Alternatives rejet**: PostgreSQL (mentionn dans anciens docs mais OBSOLTE), MySQL (pas adapt), raw driver (perte type safety)
**Cons**: Replica set obligatoire, pas de full-text search natif (besoin Atlas Search)

## 2025-01: API Response - Format unifi ApiResponse<T>
**Statut**: Accept
**Contexte**: Cohrence des rponses REST et WebSocket
**Decision**: `{ success: boolean, data?: T, error?: string, code?: ErrorCode, pagination?: PaginationMeta }`
**Alternatives rejet**: Formats diffrents par endpoint (incohrent), erreurs lances (pas de type safety)
**Cons**: Lgrement plus verbeux (toujours unwrapper `.data`)

## 2026-08: Mention - keye sur User, pas sur Participant
**Statut**: Accept
**Contexte**: `Mention.mentionedParticipantId` tait DCLARE comme une relation vers `Participant` alors que tous ses crivains et lecteurs (`MentionService.createMentions`, `getRecentMentionsForUser`, l'mission `mention:created`, le filtre anti-auto-notification de `createMentionNotificationsBatch`) y mettaient un `User.id`. Consquences: `getMentionsForMessage` joignait un espace d'identifiants que la colonne n'a jamais contenu et rendait `[]` pour tout message, `onDelete: Cascade` ne se dclenchait jamais, et les lignes rcrites par `migrate-to-participant-model.ts` taient invisibles depuis l'inbox.
**Decision**: `mentionedUserId String @map("mentionedParticipantId")` + relation `mentionedUser User`, aligne sur ses deux jumeaux `CommentMention` et `PostMention`. Le `@map` conserve le nom PHYSIQUE de la colonne: le renommage est un renommage de type, pas de donnes. `scripts/migrations/repair-mention-user-ids.ts` reconvertit les lignes restes en `Participant.id`.
**Alternatives rejet**: Converger vers `Participant` (imposerait une jointure  chaque lecture de l'inbox, qui est transverse aux conversations; et une cascade qui effacerait l'historique des mentions au retrait d'un membre — une mention nomme une personne, pas une adhsion). Renommer physiquement la colonne (migration de donnes sur toutes les lignes, sans gain).
**Cons**: Le nom physique de la colonne ne correspond plus  son nom logique — le `@map` et ce document portent l'explication.

## 2026-08: CallParticipant - la qualite de connexion est EPHEMERE, pas une colonne
**Statut**: Accepte
**Contexte**: `CallParticipant.connectionQuality` etait declare QUATRE fois, de quatre facons mutuellement incompatibles: `Json?` (`schema.prisma`, commente `{ latency, packetLoss, bandwidth }`), l'interface `ConnectionQuality` (`types/video-call.ts`), `z.number().nullable()` (`CallParticipantSchemas`, `utils/validation.ts`) et `{ type: 'number', 0-100 }` (`callParticipantSchema`, `types/api-schemas.ts`) — les fixtures de test y ajoutaient une cinquieme forme, une CHAINE (`'good'`). Aucun des 12 sites `callParticipant.{create,update,updateMany}` du gateway ne l'ecrivait: ZERO ecrivain. Trois emissions socket (`CallEventsHandler`, deux `call:initiated` + `call:participant-joined`) le relayaient donc a `null` a tout client, toujours, sous un double cast `as unknown as ConnectionQuality | null` qui masquait que la forme Json n'avait jamais ete validee. ZERO consommateur: iOS (`CallManager.connectionQuality: PeerConnectionState`), Android (`CallViewModel` <- `ConnectionQuality.from(sample.level())`) et web (`call-store.connectionQuality: ConnectionQualityLevel`) calculent tous leur qualite LOCALEMENT depuis leur propre pile WebRTC. La surface REST, elle, etait deja propre: `toCallParticipantResponse` (`utils/call-session-response.ts`) construit une forme explicite et n'a jamais porte le champ.
**Decision**: RETIRER le champ — du modele Prisma, du type partage `CallParticipant`, de l'interface `ConnectionQuality` devenue orpheline, et des trois emissions socket. Le signal par participant existe deja et circule EN TEMPS REEL: `call:quality-report` porte `rtt`, `packetLoss`, `level` par participant, et sur degradation soutenue le handler emet `call:quality-alert` par participant aux pairs. Les statistiques instantanees gardent leur type dedie `ConnectionQualityStats`, a ne pas confondre avec le `ConnectionQuality` retire. Le bilan de fin d'appel reste dans `CallParticipant.analytics`. Retires dans le meme lot: `CallParticipantSchemas` (Zod) et `callParticipantSchema` (OpenAPI), sans aucune reference dans le depot, et qui decrivaient en outre `status`, `duration`, `isMuted`, `isVideoOff` — quatre champs absents du modele Prisma (qui porte `isAudioEnabled`, `isVideoEnabled`, `leftAt`). Ce n'etaient pas des contrats perimes sur un champ, mais deux descriptions entieres d'une entite qui n'a jamais existe sous cette forme.
**Alternatives rejetees**: CABLER le champ (le remplir depuis `call:quality-report`) — couterait jusqu'a 30 ecritures/min/participant (plafond `SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT`) sur le chemin CHAUD de l'appel, pour persister une donnee dont la valeur expire en quelques secondes et que trois clients sur trois calculent deja eux-memes. Laisser le champ en place «au cas ou» — c'est precisement ce qui a produit quatre declarations divergentes et un `null` diffuse a tous les clients pendant toute la vie de la feature.
**Cons**: Aucune migration MongoDB n'accompagne le retrait (rien n'a jamais ete ecrit, il n'y a aucune donnee a perdre); des documents `CallParticipant` anterieurs pourraient theoriquement porter la cle, que Prisma ignore desormais. Une future qualite PERSISTEE devra repartir du modele, pas de ces schemas: c'est l'objet des commentaires laisses aux quatre sites.

## 2026-08: Message.receivedByAllAt — retire; deliveredToAllAt/readByAllAt restent, mais CALCULES
**Statut**: Accepte
**Contexte**: Le modele `Message` porte cinq champs de statut denormalises (`deliveredToAllAt`,
`receivedByAllAt`, `readByAllAt`, `deliveredCount`, `readCount`). Le passage au suivi par curseurs a
vide leur unique ecrivain: `MessageReadStatusService.updateMessageComputedStatus` est depuis un
no-op documente («Computed fields are no longer stored on Message to improve write performance»).
Sur toute la collection, les trois dates valent donc `null` et les deux compteurs zero. Les
compteurs ont ete rebranches sur la source de verite aux deux cycles precedents; les DATES ne
l'avaient pas ete.
**Decision**: `receivedByAllAt` SORT — modele Prisma, `MessageEntity` (`types/message-types.ts`),
`ConversationMessage` (`types/conversation.ts`), `messageSchema` (`types/api-schemas.ts`) et les deux
`select` du gateway. Il n'a ni ecrivain NI lecteur: aucun client des quatre plateformes ne le decode
(verifie par grep sur `apps/web`, `apps/ios`, `apps/android`, `packages/MeeshySDK`). Ses deux
voisines RESTENT declarees et servies, mais CALCULEES par
`MessageReadStatusService.getConversationReadStatuses` — l'instant du dernier destinataire servi,
`null` tant qu'il en manque un.
**Alternatives rejetees**: Retirer les trois d'un meme geste — `deliveredToAllAt` et `readByAllAt`
ont de VRAIS lecteurs (`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`,
`MessagePersistenceActor`), qui traitent `!= null` comme la preuve que tous ont lu; les retirer
casserait trois decodeurs pour un defaut qui se repare. Reactiver l'ecriture des colonnes —
c'est la decision d'archi que le passage aux curseurs a prise a l'envers; deriver a la lecture ne
coute aucune requete de plus.
**Cons**: Retrait d'un champ d'API publiee. Sans consequence connue: il ne pouvait valoir que `null`
et n'avait aucun decodeur. Aucune migration MongoDB — Prisma cesse de mapper la cle, les documents
existants la gardent inerte. `deliveredCount` / `readCount` restent declares sans ecrivain: ils ont,
eux, des lecteurs clients et sont deja servis calcules; leur retrait est un lot distinct.

## 2026-08: Événements de marquage EN MASSE — un PRÉDICAT en union discriminée, jamais un sac d'options
**Statut**: Accepté
**Contexte**: Les quatre chemins de marquage groupé de `NotificationService` (`markAllAsRead`, les trois clés de `markContextNotificationsAsRead`, `markNotificationsByTypesAsRead`) passent par `updateMany` / `$runCommandRaw`, qui ne renvoient AUCUN id : ils ne peuvent pas émettre un `notification:read` par ligne, et refetcher les ids annulerait le gain de l'update unique indexé. L'événement doit donc décrire ce qui a été fait, pas à quoi. La fiche d'audit `gwcontract-05` prescrivait un payload `{ conversationId?, postId?, types?, all? }` — toutes clés optionnelles.
**Décision**: `NotificationReadBulkScope` est une union DISCRIMINÉE : `{kind:'all'} | {kind:'context', contextKey, contextValue} | {kind:'types', types}`, et le prédicat correspondant est énoncé UNE seule fois, hors des clients, dans `utils/notification-read-bulk.ts` (`notificationMatchesReadBulkScope`) — chaque client l'importe au lieu de le réécrire. Un `kind` inconnu ne matche RIEN (repli sûr d'un client plus vieux que son serveur : ne rien marquer laisse l'événement de compteurs recaler le badge, alors que marquer trop retirerait de la cloche des lignes encore non lues). Le payload ne porte délibérément AUCUN `count`.
**Alternatives rejetées**: Le sac d'options prescrit — il rend représentables un scope vide (« rien » ou « tout » ?) et un scope contradictoire (`{all:true, conversationId}`), et surtout **il n'a pas de place pour `friendRequestId`**, la troisième clé sur laquelle la gateway marque réellement en masse et que la fiche avait omise : un client écrit d'après elle l'aurait ignorée en silence, laissant la notification de demande d'amitié non lue sur tous les autres appareils après y avoir répondu. Un payload dont toutes les clés sont optionnelles n'écrit sa cardinalité nulle part — ni le compilateur, ni un test, ni une relecture ne peuvent signaler qu'il en manque une. Porter un `count` « informatif » — c'est offrir au client le décrément exact qu'il ne doit pas faire : son cache est partiel (paginé), il matche moins de lignes que le serveur n'en a marquées, et `notification:counts` (absolu, émis juste après) est la seule autorité sur les compteurs. Émettre via `emitWithSeq` — estampiller un événement qu'aucun client n'observe ferait avancer `lastSeq` sans lecteur, donc de faux trous de séquence au prochain événement observé (lockstep `gwcontract-01`).
**Conséquences**: Tout nouveau chemin de marquage en masse doit AJOUTER un `kind` — l'union le force à répondre « sur quoi ? » à un endroit unique, au lieu d'ajouter une clé optionnelle de plus que personne ne lira. Le miroir Swift du prédicat reste à écrire côté iOS ; l'événement étant additif, un client qui l'ignore se comporte exactement comme avant. La symétrie côté SUPPRESSIONS n'existe pas encore : `deleteAllRead` a le même défaut et demanderait un `notification:deleted-bulk`.

## 2026-08: `conversation:updated` — le groupe d'aperçu est un CONTRAT nommé, pas ce que l'index signature laisse passer
**Statut**: Accepté
**Contexte**: `ConversationUpdatedEventData` se termine par `readonly [key: string]: unknown`, la gateway ne posant que les champs qui ont changé. Le groupe d'APERÇU — les champs qui, ENSEMBLE, décrivent le message que la ligne de liste doit rendre — y voyageait donc pour partie sans être déclaré : `lastMessageId`, `lastMessagePreview`, `senderId` et `location` passaient par l'index signature. Trois émetteurs le produisent (`MessageHandler` pour le WS `message:send`, `MeeshySocketIOManager._broadcastNewMessage` pour REST/ZMQ/agents, `emitConversationPreviewUpdate` pour édition/suppression/traduction/masquage), et leur parité ne reposait que sur la lecture du code voisin. Elle a échoué : le second omettait `location`, alors qu'il calculait déjà le lieu vingt lignes plus haut pour le hisser sur `message:new` — un message position-seule a un `lastMessagePreview` vide par construction, donc la ligne de liste ne rendait plus rien du tout. Le correctif de code a été livré par #3122 ; il ne pose aucune garde contre la récidive, et c'est cette décision-ci qui l'ajoute.
**Décision**: `location` est déclaré dans le type, avec la règle qui le gouverne — **clé ABSENTE = « ce message n'a pas de lieu », jamais « je n'en parle pas »**. Les clients écrivent le lieu AVEC l'identité du message (`adoptLastMessage` puis `lastMessageLocation = event.location`), donc son absence efface la pastille du message précédent : c'est ce qui rend correct le remplacement d'une épingle par un texte, et faux tout émetteur qui « oublie » le champ. Corollaire opposable : **un émetteur qui porte `lastMessageId` porte le lieu du message qu'il nomme, ou aucun.** La forme reste `unknown`, même convention que `MessageRequest.location` — la validation stricte vit dans `services/gateway/src/services/location/sharedPlace.ts`.
**Alternatives rejetées**: Laisser l'index signature faire le travail — c'est l'état qui a produit le défaut, et rien (ni compilateur, ni test, ni relecture) ne signale qu'un émetteur sur trois a oublié un membre du groupe ; le champ suivant se perdra de la même façon. Typer strictement le lieu ici (dupliquer `SharedPlace` dans `packages/shared`) — les bornes de coordonnées et les longueurs de chaîne vivraient alors à deux endroits, et c'est cette duplication-là que `sharedPlace.ts` existe pour éviter. Faire porter tout le groupe par un sous-objet `lastMessage: {...}`, qui rendrait l'oubli d'un membre impossible par construction — c'est la bonne forme, mais c'est un changement de fil pour trois émetteurs et trois clients : à instruire pour lui-même.
**Conséquences**: Les autres membres du groupe encore non déclarés (`lastMessageId`, `lastMessagePreview`, `senderId`) devraient suivre le même chemin ; ils ne sont pas ajoutés ici faute d'un défaut mesuré à leur nom. Le contrat parle des « clients » au pluriel pour des règles que tous ne tiennent pas encore (la garde monotone est iOS-seule) — écart connu, piste ouverte.

## 2026-08: Un canal serveur→client déclaré sans émetteur est un DÉFAUT — sauf s'il est réservé explicitement
**Statut**: Accepté
**Contexte**: Sur les 124 noms de `SERVER_EVENTS`, huit n'étaient prononcés nulle part dans le code exécutable de la passerelle. Cinq étaient de vraies dérives : `message:translated`, `system:message` et `conversation:online-stats` (écoutés par les clients, jamais émis par aucune version du serveur) ; `post:reaction-sync` et `comment:reaction-sync` (l'instantané voyage dans l'ACK de la requête, jamais en diffusion — frères de `reaction:sync`, retiré pour cette exacte raison, et dont le commentaire de retrait raconte qu'un client s'y était abonné en versant l'instantané dans le seau INCRÉMENTAL de `reaction:added`, donc un vrai bug). Les trois autres sont une réservation légitime (pipeline de traduction en appel). La réservation était jusque-là portée par un bloc de PROSE, « Call events RESERVED (no emitter yet) », qui avait pourri sans que rien ne le signale : il nommait encore six événements dont l'émetteur avait atterri depuis.
**Décision**: Tout nom de `SERVER_EVENTS` doit être NOMMÉ dans le code exécutable de la passerelle, ou figurer dans `RESERVED_SERVER_EVENTS` — une valeur exportée par le contrat, à côté des noms qu'elle qualifie. `packages/shared/__tests__/ci/socket-event-emitter-gate.test.ts` fait respecter les deux sens : un nom orphelin non réservé rougit, ET un nom réservé dont l'émetteur a atterri rougit aussi. Le critère d'émission est « la passerelle nomme l'événement », pas « un `.emit(` le prend en argument » — le serveur émet aussi par indirection (`const errorEventName = …; socket.emit(errorEventName, …)`), et le critère retenu se trompe donc du côté PERMISSIF : il ne peut pas produire de faux positif. Les commentaires sont dépouillés avant recherche, sans quoi la prose qui explique qu'un événement N'EST PLUS émis vaudrait preuve d'émission.
**Alternatives rejetées**: Garder la liste des réservations dans la garde — une table d'exceptions cachée au fond d'un fichier de test est un endroit où l'on dépose ce qu'on ne veut pas traiter, et que personne ne relit ; dans le contrat, réserver un canal redevient un acte visible en revue, dans le fichier qu'on ouvre de toute façon pour déclarer l'événement. Exiger la forme littérale `.emit(NOM` — rendrait rouges dix-neuf canaux d'appel parfaitement émis (ils s'écrivent `CALL_EVENTS.INITIATED`, jamais `SERVER_EVENTS.CALL_INITIATED`) et tous les émetteurs indirects. Laisser la réservation en commentaire — c'est l'état qui a produit la pourriture : une exemption que rien n'exécute survit à sa raison d'être et finit par couvrir un vrai défaut.
**Conséquences**: Ajouter un canal serveur→client au contrat avant son émetteur exige désormais de l'inscrire dans `RESERVED_SERVER_EVENTS`, et de l'en retirer quand l'émetteur atterrit. La garde forme une paire avec `socket-event-name-gate` (cycle 76), qui pose la question inverse — un nom épelé par un client existe-t-il au contrat ? La troisième garde de la série, « tout `CLIENT_EVENTS` a-t-il un handler gateway ? », reste à écrire : elle bute sur `CALL_SIGNAL`, déclaré dans les DEUX maps, ce que le `CLAUDE.md` de ce paquet interdit déjà explicitement.

## 2026-08: Le réordonnancement de COMMUNAUTÉS a son propre nom d'événement, pas un élargissement de celui des conversations
**Statut**: Accepté
**Contexte**: `POST /user-preferences/communities/reorder` persistait `orderInCategory` et n'émettait rien, quand son jumeau `reorderConversationPreferences` diffuse `USER_PREFERENCES_REORDERED` sur la room personnelle. La ligne `UserCommunityPreferences` étant par UTILISATEUR et non par appareil, un glisser-déposer fait sur un appareil n'atteignait jamais les autres — qui tiennent leur liste en `staleTime: Infinity` avec le socket pour source primaire. La forme naturelle du correctif était d'admettre `communityId` dans `UserPreferencesReorderedEventData` : même geste, un discriminant de plus, exactement ce que fait `USER_PREFERENCES_UPDATED` avec ses trois scopes.
**Décision**: `USER_PREFERENCES_COMMUNITY_REORDERED` (`user:preferences-community-reordered`), avec `UserPreferencesCommunityReorderedEventData` — même forme que son jumeau, `communityId` à la place de `conversationId`, et pas de `version` (`UserCommunityPreferences` n'en a pas ; l'ordre vit hors du chemin versionné des deux côtés). La charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ : le filtre d'appartenance borne les deux ensemble, et un lot vide n'émet rien.
**Alternatives rejetées**: Élargir `UserPreferencesReorderedEventData` — MESURÉ sur les décodeurs avant d'écrire : iOS déclare `UserPreferencesReorderedSocketEvent.Update.conversationId` NON optionnel, donc un item de communauté fait échouer le décodage de l'ÉVÉNEMENT ENTIER et emporte les réordonnancements de conversation qui voyagent avec lui ; le web les filtre en silence (`preferencesMap.has(update.conversationId)`). L'élargissement casse le cas NOMINAL pour en servir un neuf, par le mécanisme le plus discret qui soit — un `catch` de décodage côté client (cf. `ParticipantRoleUpdatedEvent`, cycle 92 bis). Un événement multi-scope l'est parce qu'il a été CONÇU ainsi, avec des décodeurs qui discriminent ; il ne le devient pas rétroactivement. Router le geste vers le seau `onCategoryChanged` (`() => void`) — il jetterait `updates[]`, et un réordonnancement ne touche aucune `UserConversationCategory`, décision déjà prise pour le jumeau conversation.
**Conséquences**: Le nouveau nom est INERTE pour les deux consommateurs existants par construction. iOS et Android n'ont aujourd'hui aucune surface de réordonnancement de communautés — le seul émetteur de la route est le web — donc aucun décodeur n'y est posé : l'écrire maintenant serait un consommateur sans producteur, que rien ne ferait tomber s'il dérive ; il appartient au lot qui apportera le geste. Cliquet d'inventaire des écrivains des deux tables de préférences : `services/gateway/src/__tests__/preference-writer-sweep.ts`.
