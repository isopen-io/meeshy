# Iteration 35 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 34 (selectors Zustand chemins chauds + recharts différé — mergé via PR #580/#581).
Le plan iter 34 désignait pour iter 35 : **F7/F8 gateway** (les plus actionnables) puis **F9 web**.
Audit mené sur le flux notifications du gateway, l'include du détail de conversation, et
l'indicateur de présence de la liste de conversations.

## Constats retenus pour iter 35

### 1. Auto-marquage des notifications : fetch O(n) de TOUTES les non-lues + duplication + blocage de la réponse (F7, ÉLEVÉ)
Trois problèmes imbriqués sur le même flux :

- **Fetch O(n) côté application** : `NotificationService.markConversationNotificationsAsRead`
  (`NotificationService.ts:2902`) fait `findMany({ userId, isRead: false })` **sans select**
  (documents complets : content, actor, metadata, delivery…) puis filtre EN MÉMOIRE sur
  `context.conversationId`, puis `updateMany` par ids — 2 round-trips DB + transfert de toutes
  les non-lues de l'utilisateur à CHAQUE ouverture de conversation. Le commentaire du code
  (« Prisma MongoDB ne supporte pas les filtres JSON ») est vrai pour l'API Prisma mais le
  codebase utilise déjà `$runCommandRaw` pour exactement ce besoin (filtres sur champs imbriqués :
  `MessagingService.ts:478` filtre `userId: {$oid}`, `preferences.ts:416` filtre `'sender.userId'`,
  `StoryTextObjectTranslationService.ts:88` update ciblé). Un **seul** `update` Mongo avec filtre
  `{ userId: {$oid}, isRead: false, 'context.conversationId': X }` fait le travail en 1 round-trip
  sans transfert, en s'appuyant sur l'index existant `@@index([userId, isRead])`.
- **Duplication du même anti-pattern** : `markPostNotificationsAsRead`
  (`NotificationService.ts:2963`) duplique le même code avec `context.postId` ; et le détail de
  conversation (`routes/conversations/core.ts:692-718`) **réimplémente inline** une 3e copie
  (findMany + filtre + updateMany) au lieu de déléguer au service — copie qui n'émet PAS
  `notification:counts`, donc la cloche/badge ne se resynchronise pas quand l'auto-marquage
  passe par l'ouverture du détail (incohérence avec `POST /notifications/conversation/:id/read`
  qui, lui, émet).
- **Blocage du chemin critique** : le bloc inline de `core.ts` est `await`-é AVANT l'envoi de la
  réponse `GET /conversations/:id` — 2 round-trips DB de latence ajoutés à chaque ouverture de
  conversation pour un effet de bord non essentiel à la réponse. Le pattern fire-and-forget existe
  déjà dans le codebase pour ce même service : `posts/interactions.ts:248`
  (`markPostNotificationsAsRead(...).catch(() => {})`).

Garde nécessaire : `authContext.userId` vaut le sessionToken pour les anonymes (pas un ObjectId) ;
le filtre `{$oid}` exige un hex 24. Les notifications n'existant que pour les utilisateurs
enregistrés (`Notification.userId` → relation `User`), un early-return sur non-ObjectId est
le comportement correct (aujourd'hui : exception Prisma avalée par le try/catch).

### 2. `conversationDetailInclude` : `include` participant non trimé — champs sensibles et morts fetchés puis strippés (F8, MOYEN)
`routes/conversations/core.ts:88` utilise `include: { user: {...} }` pour les participants du
détail → **tous** les scalaires `Participant` sont hydratés depuis MongoDB, dont :
- `sessionTokenHash` (hash de session anonyme — donnée sensible qui n'a rien à faire hors DB),
- `anonymousSession` (objet embarqué complet), `shareLinkId`, `deletedForMe`, `leftAt`,
  `bannedAt`, `nickname`, `conversationId`, `language`.

Or le schéma wire du détail (`conversationParticipantSchema`, `api-schemas.ts:861`) ne déclare
que : `id, userId, type, displayName, avatar, role, isOnline, lastActiveAt, isActive, joinedAt,
permissions` (+ champs « user aplati » que les rows Prisma ne portent pas) — et **ne déclare pas
de propriété `user` imbriquée** : fast-json-stringify strippe donc déjà tout le surplus du wire.
Le `user` hydraté ne sert qu'au serveur (`generateDefaultConversationTitle`, `core.ts:665`,
qui lit `displayName/username/firstName/lastName`) ; ses champs `avatar/isOnline/lastActiveAt/role`
sont fetchés pour rien. Conversion `include` → `select` aligné sur le wire + besoin serveur :
×100 participants par ouverture, zéro changement de payload client (le wire est déjà trimé),
gain DB→gateway + CPU de sérialisation + hygiène (le hash de session ne quitte plus la DB).
Pattern de référence déjà en place côté liste : `conversationListParticipantSelect` (`core.ts:48`).

### 3. Indicateur de présence : tout l'item de liste re-rendu à chaque tick (F9, MOYEN)
`ConversationItem.tsx:70` s'abonne au tick de présence (`_lastStatusUpdate`) au niveau de
l'ITEM entier : chaque event `user-status` / tick de décroissance re-rend la row complète
(avatar, tags, badges, actions, formatage du dernier message) de CHAQUE conversation directe,
alors que seul le point de présence (`OnlineIndicator`, lignes 231-248) dépend du statut.
État de l'art (déjà appliqué dans le codebase : leaf components + selectors étroits, iter 34) :
extraire un composant feuille `ParticipantPresenceIndicator` mémoïsé qui s'abonne seul à
`useUserById(userId)` + `useUserStatusTick()` (selectors existants depuis iter 34,
`user-store.ts:144-150`) et recalcule `getUserStatus`. L'item ne s'abonne plus du tout au
user store. La décroissance des statuts relatifs (online → away → offline) est préservée à
l'identique : la feuille re-rend à chaque tick, exactement comme l'item le faisait — seule
la SURFACE re-rendue change (un dot au lieu de la row).
Les groupes restent à zéro abonnement effectif (selector conditionnel `0` aujourd'hui,
plus de subscription du tout demain).

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | `MessageHandler.ts:580` | HAUT (~75 % BP multilingue) | Validation staging requise |
| F4 | Pollings admin → events Socket.IO | `components/admin/agent/*` | MOYEN (admin only) | Events gateway à créer |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` (filtre indexé sans `$or` legacy) | `schema.prisma` Notification | FAIBLE après iter 35 | Le filtre raw iter-35 s'appuie déjà sur `[userId, isRead]` ; scalaire utile seulement si volume non-lues/user explose |
| F11 | `HeaderAvatar` et `ActiveUsersSection` rendent un statut figé (pas d'abonnement tick → pas de décroissance) | `HeaderAvatar.tsx:65`, `ActiveUsersSection.tsx:57` | FAIBLE (bug d'affichage mineur) | Réutiliser `ParticipantPresenceIndicator` introduit en iter 35 |

## Décision iter 35
Traiter 1+2+3 (gateway + web, zéro changement de comportement visible hors corrections) :
- **A1** : `markConversationNotificationsAsRead` / `markPostNotificationsAsRead` → helper commun
  1 seul `update` Mongo via `$runCommandRaw` (filtre `context.*` serveur, garde ObjectId,
  `notification:counts` émis si count > 0) ; `core.ts` détail délègue au service en
  fire-and-forget (réponse non bloquée + cloche resynchronisée — correction d'incohérence).
- **A2** : `conversationDetailInclude` → `select` participant aligné wire + besoin serveur
  (drop `sessionTokenHash`, `anonymousSession`, etc. ; user réduit aux champs du titre).
- **A3** : extraction `ParticipantPresenceIndicator` (feuille mémoïsée abonnée par userId),
  `ConversationItem` désabonné du user store.

**Gain estimé** : ouverture de conversation — 2 round-trips DB (dont un O(n non-lues) full-doc)
sortis du chemin critique de la réponse ; auto-marquage 2 requêtes → 1, transfert ≈ 0 ;
badge/cloche resynchronisés en temps réel à l'ouverture du détail (correctif) ; détail
×100 participants sans scalaires morts ni hash de session ; liste de conversations — tick de
présence re-rend N dots au lieu de N rows complètes.
