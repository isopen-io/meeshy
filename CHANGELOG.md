# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### 🐛 Fixed

- **Aperçu de conversation figé sur l'écran liste après édition/suppression du dernier message** : `broadcastNewMessage` fanne `conversation:updated` (portant `lastMessageId`/`lastMessagePreview`) vers chaque salle personnelle `user:<id>` à l'envoi — précisément parce qu'un participant posé sur la liste de conversations a quitté la salle `conversation:<id>` mais reste dans `user:<id>`. L'édition et la suppression, elles, n'émettaient `message:edited`/`message:deleted` que vers `conversation:<id>` : un membre en ligne posé sur la liste (jamais entré dans la conversation cette session) ne recevait donc aucun signal quand le **dernier** message était édité ou supprimé, et sa ligne continuait d'afficher le texte pré-édition (ou le message supprimé) jusqu'à réouverture (refetch SWR). Le handler delete recalculait pourtant déjà `lastMessageAt` — le serveur *savait* que l'aperçu avait changé. Correctif : helper partagé `emitConversationPreviewUpdate` qui recalcule le dernier message non supprimé et fanne `conversation:updated` vers chaque salle user de participant actif (anonymes ignorés, dédup par userId), appelé après chaque émission `message:edited`/`message:deleted` sur les 7 sites (WS `MessageHandler` + REST `messages.ts` + `messages-advanced.ts`) — pas de dérive par transport. Best-effort : ne fait jamais échouer l'edit/delete. Éditer/supprimer un message non-dernier émet l'aperçu inchangé (no-op idempotent client). Régression couverte par tests (RED→GREEN) : `emitConversationPreviewUpdate.test.ts` (5 tests) + `MessageHandlerEditDelete.test.ts`.
- **`message:new.senderId` émis en Participant.id sur le chemin WS `message:send` (vs User.id sur REST/ZMQ) — auto-message multi-device jamais réconcilié** : `Message.senderId` est un `Participant.id` (relation Prisma `MessageSender`). Le writer REST/ZMQ (`MeeshySocketIOManager.broadcastMessage`) le résolvait déjà vers le `User.id` (« les clients comparent senderId avec leur userId »), mais le writer WS (`MessageHandler._buildMessagePayload`) émettait le `Participant.id` brut. Côté client, `use-socket-cache-sync.ts` compare `message.senderId === currentUser.id` (un `User.id`) pour détecter ses propres messages et promouvoir l'optimistic bubble multi-device — sur le chemin WS le test échouait toujours (Participant.id ≠ User.id), donc l'auteur voyait son propre message en double / rendu comme entrant. Invisible sur REST (qui résolvait correctement) : seul le transport WS était atteint. Correctif : `_buildMessagePayload` résout désormais `senderId` avec la même chaîne `participant.userId ?? participant.user?.id ?? message.senderId` que les writers REST/ZMQ (fallback Participant.id pour les anonymes). Le champ `sender.id` (Participant.id) reste disponible séparément ; `conversation:updated` garde volontairement le Participant.id brut (cohérent entre ses deux writers). Régression couverte par test (RED→GREEN) : `MessageHandler.test.ts` → « exposes the sender User.id (not Participant.id) in the message:new senderId ».
- **Événements temps réel `_seq` émis dans le désordre sous concurrence (SyncEngine)** : `emitWithSeq` allouait le numéro de séquence monotone via `await sequenceService.nextSeq(userId)` puis émettait immédiatement. `nextSeq` fait un `upsert{increment}` Mongo, atomique au niveau document (valeurs distinctes et gapless **dans l'ordre d'appel**) — mais deux appels concurrents pour le même user s'exécutent sur des connexions poolées différentes dont les réponses peuvent revenir **dans le désordre** : le `await` de `_seq=N+1` pouvait résoudre avant celui de `_seq=N`, émettant l'événement le plus récent en premier. Le client SyncEngine avance alors `lastSeq` à `N+1` et rejette le `_seq=N` reçu ensuite comme doublon périmé → perte d'une `notification:new` temps réel (deux expéditeurs écrivant au même destinataire quasi-simultanément), récupérée seulement au prochain `/sync`. Cela violait le contrat « séquence monotone pour détection de gap exacte » que le module documente. Correctif : l'allocation du `_seq` **et** l'emit sont désormais sérialisés **par user** via une chaîne de promesses en mémoire (`Map<userId, Promise>`), garantissant « ordre d'émission == ordre d'allocation » ; les users distincts gardent des chaînes séparées (aucun head-of-line blocking cross-user) et la Map est purgée une fois chaque chaîne drainée. Résilience préservée : un échec d'allocation émet toujours sans `_seq`, un échec d'emit ne casse pas la chaîne du user. Régression couverte par test (RED→GREEN) : `emitWithSeq.test.ts` → « emits _seq in strictly monotonic order even when nextSeq resolutions race » + garde anti-blocage cross-user.
- **Badge de non-lus jamais mis à jour en temps réel pour les utilisateurs anonymes** : à l'authentification, le socket anonyme rejoignait la salle personnelle nue `<participantId>` (`socket.join(socketUser.id)`), alors que le chemin JWT — et **tous** les émetteurs d'événements personnels (`CONVERSATION_UNREAD_UPDATED`, mentions, etc.) — adressent `io.to(ROOMS.user(participant.userId ?? participant.id))`, soit `user:<participantId>` pour un anonyme. Le socket anonyme était donc dans une salle qu'aucun émetteur ne cible : quand un message arrivait dans une conversation qu'il n'avait pas ouverte, `conversation:unread-updated` était émis vers `user:<participantId>` et silencieusement perdu ; le compteur de non-lus restait figé jusqu'à un refetch REST manuel. Le repli `?? participant.id` présent dans les deux sites d'émission (WS `_updateUnreadCounts` et REST `broadcastMessage`) montrait l'intention explicite de servir les anonymes — la livraison échouait par simple divergence salle-de-jointure vs salle-d'émission. Correctif : le chemin anonyme rejoint désormais `ROOMS.user(socketUser.id)`, alignant jointure et émission sur la convention unique (`AuthHandler._authenticateAnonymousUser`). Aucun émetteur ne ciblait la salle nue (vérifié par balayage de tous les `io.to(...)`/`io.in(...)` du gateway), donc zéro régression. Régression couverte par test (RED→GREEN) : `AuthHandler.test.ts` → « joins the anonymous socket to the ROOMS.user personal room emitters target ».
- **Mentions d'utilisateurs à casse mixte silencieusement perdues** : `resolveMentionedUsers` (source des `mentionedUsers` du broadcast temps réel `message:new`, du chemin REST d'envoi, et du rendu des mentions posts/commentaires/feed) interrogeait `prisma.user.findMany` avec `username: { in: [...], mode: 'insensitive' }`. Or MongoDB ignore `mode: 'insensitive'` combiné à `in` (déjà documenté dans `MentionService.resolveUsernames`), donc la correspondance était sensible à la casse contre des handles préalablement mis en minuscules — une mention `@Alice_B` (username stocké `Alice_B`) ne résolvait rien : la puce de mention, la surbrillance et le lien profond disparaissaient pour tous les destinataires, et la notification « vous avez été mentionné·e » ne se déclenchait jamais. Correctif : `OR` + `equals` insensible à la casse (une clause par handle), le motif déjà utilisé par `resolveUsernames`. Régression couverte par tests (RED→GREEN) émulant la sémantique Prisma+MongoDB.
- **Réactions dupliquées en cas de course concurrente** : `ReactionService.addReaction` appliquait le modèle "1 emoji par user" au niveau applicatif (find/deleteMany/create), non atomique — deux ajouts concurrents avec des emojis différents pouvaient chacun insérer leur propre ligne. Passage à un `upsert` atomique sur la clé composite `(messageId, participantId)` (l'index unique ne porte plus sur l'emoji). Migration Mongo requise avant déploiement : `packages/shared/prisma/migrations/2026-07-04-reaction-single-per-user-unique-index.mongodb.js`. Voir `docs/analyses/2026-07-04-reaction-duplicate-race-fix.md`.
- **Idem pour les réactions par pièce jointe** : `AttachmentReactionService.addAttachmentReaction` portait exactement la même course (findMany/deleteMany/upsert non atomique). Même correctif — `upsert` atomique sur `(attachmentId, participantId)`, index resserré. Migration Mongo requise avant déploiement : `packages/shared/prisma/migrations/2026-07-04-attachment-reaction-single-per-user-unique-index.mongodb.js`. Voir `docs/analyses/2026-07-04-attachment-reaction-duplicate-race-fix.md`.

### 🎉 Refonte Majeure - Système de Notifications

#### Changed

- **Structure groupée** : Réorganisation complète de l'architecture des notifications en groupes logiques (CORE, ACTOR, CONTEXT, METADATA, STATE, DELIVERY)
- **Suppression du champ `title`** : Le title est maintenant construit dynamiquement côté frontend via i18n pour un meilleur support multilingue
- **`data` → `metadata`** : Remplacement du champ Json non typé par un système de discriminated unions TypeScript fortement typé
- **Champs dénormalisés déplacés** : `senderId`, `senderUsername`, etc. regroupés dans `actor`
- **État groupé** : `isRead`, `readAt`, `createdAt` déplacés dans le groupe `state`
- **Context enrichi** : Informations de contexte (conversation, message, appel) regroupées dans `context`

#### Added

- **Nouveau groupe `actor`** : Informations sur l'utilisateur qui a déclenché la notification (id, username, displayName, avatar)
- **Nouveau groupe `context`** : Informations contextuelles (conversationId, conversationTitle, conversationType, messageId, callSessionId, etc.)
- **Nouveau groupe `metadata`** : Données type-spécifiques avec typage fort via discriminated unions
- **Nouveau groupe `state`** : État de lecture et timestamps (isRead, readAt, createdAt, expiresAt)
- **Nouveau groupe `delivery`** : Suivi multi-canal (emailSent, pushSent)
- **Champ `priority`** : Niveaux de priorité (low, normal, high, urgent)
- **Helper `buildNotificationTitle()`** : Construction dynamique des titles avec support i18n
- **Type guards** : Fonctions pour typer correctement le metadata selon le type de notification
- **NotificationService refactorisé** : API simplifiée avec méthodes spécifiques par type (`createMessageNotification`, `createMentionNotification`, etc.)
- **NotificationFormatter** : Formatage cohérent DB → API
- **Socket.IO mis à jour** : Émission d'événements `notification:new` avec structure groupée
- **Documentation complète** :
  - `docs/notifications/STRUCTURE.md` : Architecture détaillée avec exemples
  - `docs/notifications/MIGRATION_GUIDE.md` : Guide de migration complet

#### Removed

- **Champ `title`** : ❌ Plus stocké en DB, construit dynamiquement
- **Champs dénormalisés à la racine** : ❌ `senderId`, `senderUsername`, `senderAvatar`, `senderDisplayName`
- **Références directes** : ❌ `conversationId`, `messageId`, `callSessionId` à la racine
- **Champ `data` non typé** : ❌ Remplacé par `metadata` structuré
- **Champs d'état à la racine** : ❌ `isRead`, `readAt` déplacés dans `state`

#### Breaking Changes

⚠️ **Migration complète requise** - La nouvelle structure n'est pas compatible avec l'ancienne.

**Champs renommés/déplacés:**
- `notification.sender` → `notification.actor`
- `notification.conversationId` → `notification.context.conversationId`
- `notification.messageId` → `notification.context.messageId`
- `notification.isRead` → `notification.state.isRead`
- `notification.createdAt` → `notification.state.createdAt`
- `notification.data` → `notification.metadata` (typé)
- Plus de `notification.title` → utiliser `buildNotificationTitle(notification, t)`

**Fichiers modifiés:**

*Backend:*
- `packages/shared/types/notification.ts` - Types partagés refactorisés (673 lignes)
- `packages/shared/types/api-schemas.ts` - Schemas OpenAPI mis à jour
- `packages/shared/prisma/schema.prisma` - Schema DB nettoyé
- `services/gateway/src/services/notifications/NotificationService.ts` - Service refactorisé (660 lignes)
- `services/gateway/src/services/notifications/NotificationFormatter.ts` - Nouveau formatteur (85 lignes)
- `services/gateway/src/routes/notifications.ts` - Routes API modernisées (350 lignes)
- `scripts/migrations/drop-notifications.ts` - Script de migration

*Frontend:*
- `apps/web/types/notification.ts` - Types frontend mis à jour (359 lignes)
- `apps/web/services/notification.service.ts` - Service simplifié (280 lignes, -47%)
- `apps/web/utils/notification-helpers.ts` - Helpers avec i18n
- `apps/web/components/notifications/notifications-v2/NotificationItem.tsx` - Composant mis à jour
- `apps/web/components/notifications/NotificationCenter.tsx` - Centre mis à jour
- `apps/web/app/notifications/page.tsx` - Page notifications mise à jour
- `apps/web/services/notification-socketio.singleton.ts` - Socket.IO client mis à jour

**Migration:**

Pour développement (recommandé):
```bash
cd scripts/migrations
node drop-notifications.ts --confirm
```

Pour production avec conservation des données:
Voir `docs/notifications/MIGRATION_GUIDE.md` pour le script de migration personnalisé.

#### Technical Improvements

- **Réduction de code**: Service frontend notification réduit de 531 → 280 lignes (-47%)
- **Type safety**: Discriminated unions pour metadata par type de notification
- **Performance**: Indexes MongoDB optimisés pour la nouvelle structure
- **Maintenabilité**: Code mieux organisé et documenté
- **i18n**: Support natif multilingue pour les titles
- **Évolutivité**: Architecture préparée pour fonctionnalités futures (groupement, actions rapides, préférences avancées)

#### Documentation

- 📚 [Structure des Notifications](docs/notifications/STRUCTURE.md)
- 📚 [Guide de Migration](docs/notifications/MIGRATION_GUIDE.md)

---

## [0.1.0] - 2025-01-XX

### Added
- Initial release
