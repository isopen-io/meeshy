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
