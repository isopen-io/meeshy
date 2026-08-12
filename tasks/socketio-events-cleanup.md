# socketio-events.ts — Cleanup backlog

Issu de l'audit `SERVER_EVENTS` réalisé le 2026-05-11 dans le cadre de la PR `feat/conv-discovery-prefs-cache` (Bug Conversation discovery).

Le seul item **résolu** dans la PR courante : ajout de `CONVERSATION_NEW: 'conversation:new'` pour remplacer la surcharge du générique `NOTIFICATION_NEW` (le créateur ne recevait aucun signal socket, le client iOS faisait du string-match `event.type === 'new_conversation_direct'`).

Le reste des items audités est documenté ici pour traitement séparé (impact cross-client à coordonner).

---

## 1. `NOTIFICATION_NEW` overload

**Problème** : `NOTIFICATION_NEW` est utilisé comme wrapper générique avec discrimination sur `event.type` côté client. Coexistent dans le même bus :
- `type=new_conversation_direct|group|added_to_conversation` → maintenant remplacé par `CONVERSATION_NEW`
- `type=friend_request_*` → devrait être `FRIEND_REQUEST_NEW`
- `type=call_*` → déjà couvert par `CALL_*`
- `type=mention_*` → déjà couvert par `MENTION_CREATED`
- `type=story_*` → déjà couvert par `STORY_*`

**Action proposée** :
- Auditer la liste exhaustive des `type` produits par `NotificationService` côté gateway
- Pour chaque type ayant un domaine équivalent, créer un event typé `{DOMAIN}_{ACTION}`
- Conserver `NOTIFICATION_NEW` uniquement pour notifications génériques sans domaine dédié (système, marketing, etc.)
- Ajouter une période de coexistence ~3 mois où les deux events sont émis en parallèle (déjà fait pour `CONVERSATION_NEW` ↔ `NOTIFICATION_NEW(type=new_conversation_*)`)

---

## 2. `STORY_TRANSLATION_UPDATED` mauvais namespace — ✅ Résolu (2026-07-05)

**Problème (historique)** :
```typescript
STORY_TRANSLATION_UPDATED: 'post:story-translation-updated',
```
Le préfixe `post:` était incorrect — toutes les autres clés `STORY_*` utilisent `'story:...'`. Vraisemblablement une coquille issue d'un copy-paste de `POST_TRANSLATION_UPDATED`.

**Fix appliqué** : `STORY_TRANSLATION_UPDATED` vaut maintenant `'story:translation-updated'`
(`packages/shared/types/socketio-events.ts:345`). iOS (`SocialSocketManager.swift:1078`)
souscrit à `"story:translation-updated"` avec un commentaire documentant l'ancien nom
`post:story-translation-updated` (retiré depuis le 2026-06-01, période de coexistence
écoulée). Web (`use-social-socket.ts`) et gateway (`StoryTextObjectTranslationService.ts`)
utilisent déjà la constante partagée `SERVER_EVENTS.STORY_TRANSLATION_UPDATED`, donc aucun
risque de désynchronisation string littérale. Rien à reprendre ici.

---

## 3. `READ_STATUS_UPDATED` namespace hyphené hors convention — ✅ Résolu (2026-07-05)

**Problème (historique)** :
```typescript
READ_STATUS_UPDATED: 'read-status:updated',
```
La convention partout ailleurs : `entity:action-word` avec entity en mot unique (`message`, `conversation`, `call`, etc.). Ici `read-status` introduit un hyphen dans le namespace.

**Fix appliqué** : `MESSAGE_READ_STATUS_UPDATED: 'message:read-status-updated'` ajouté dans
`packages/shared/types/socketio-events.ts` (même `ReadStatusUpdatedEventData`), **dual-émis**
en parallèle du legacy `READ_STATUS_UPDATED` (même pattern que `CONVERSATION_NEW`/
`FRIEND_REQUEST_*` — coexistence ~3 mois) aux 5 points d'émission : `routes/messages.ts`,
`routes/conversations/messages.ts`, `routes/message-read-status.ts`,
`socketio/MeeshySocketIOManager.ts` (`_emitDeliveryForDrainedMessages`),
`socketio/handlers/MessageHandler.ts` (`_autoDeliverToOnlineRecipients`). Purement additif —
aucun consommateur (web `presence.service.ts`, iOS `MessageSocketManager`, Android
`MessageSocketManager.kt`) n'a besoin d'être modifié dans cette passe puisque le nom legacy
continue de fonctionner à l'identique ; migrer les clients vers le nouveau nom reste un
suivi séparé, non bloquant.

Tests : `packages/shared/__tests__/types/socketio-events.test.ts` (convention),
`delivery-receipt.test.ts`, `MessageHandler.autoDeliver.test.ts`,
`MeeshySocketIOManager.test.ts`, `messages-routes.test.ts`, `messages-extended.test.ts`,
`mark-conversation-status.test.ts` (dual-emit + suppression symétrique quand
`showReadReceipts=false`). Suite gateway ciblée (16 fichiers touchés par le changement) :
847/847 tests verts.

---

## 4. `NOTIFICATION` (sans suffixe) — usage flou — ✅ Résolu (2026-07-05, retiré)

**Problème (historique)** :
```typescript
NOTIFICATION: 'notification',
NOTIFICATION_NEW: 'notification:new',
```
Le générique `NOTIFICATION` (sans `:action`) était inhabituel — quel sens vs `NOTIFICATION_NEW` ?

**Audit (2026-07-05)** : `grep -rn "SERVER_EVENTS.NOTIFICATION\b"` (hors `NOTIFICATION_*`) a trouvé
exactement 2 émetteurs côté gateway, tous les deux morts en production :
- `MeeshySocketIOHandler.sendNotificationToUser()` — méthode définie mais **jamais appelée** par
  aucun caller (grep repo-wide sur `sendNotificationToUser` ne remonte que sa propre définition et
  ses tests unitaires).
- `SocketNotificationService.emitNotification()` — classe **jamais instanciée** en dehors de son
  propre fichier de test (`new SocketNotificationService()` n'apparaît nulle part dans
  `server.ts`/`NotificationService.ts`) ; la diffusion réelle des notifications passe entièrement par
  `NotificationService` qui émet directement sur `this.io` (ex. `NOTIFICATION_NEW`,
  `FRIEND_REQUEST_*`, `USER_UPDATED`) sans jamais passer par ce service.

Côté web, `notification-socketio.singleton.ts` gardait un listener `this.socket.on(SERVER_EVENTS.NOTIFICATION, ...)` commenté "Legacy support" — mais comme rien ne l'a jamais émis en production (les deux seuls émetteurs étaient déjà morts), ce n'était pas un vrai chemin de compat, juste du code mort en miroir. Côté iOS, `MessageSocketManager.swift` documentait déjà explicitement ne PAS écouter cet event legacy — même conclusion atteinte indépendamment.

**Fix appliqué** : suppression complète — constante `SERVER_EVENTS.NOTIFICATION` et son entrée dans
`ServerToClientEvents`, méthode `sendNotificationToUser` (+ import `SERVER_EVENTS` devenu inutile) sur
`MeeshySocketIOHandler`, classe `SocketNotificationService` entière (fichier + export
`services/notifications/index.ts`), listener legacy web + tests associés. Tests mis à jour en
conséquence (suppression des cas qui exerçaient exclusivement le code mort). Suites complètes vertes :
gateway 508/508, web 434/434, shared 45/45 (1284 tests).

**Bonus trouvé au passage** : `SequenceService.ts`, `consent-test-helper.ts` et
`migrate-from-legacy.ts` importaient `PrismaClient` depuis le package `@prisma/client` par défaut au
lieu de `@meeshy/shared/prisma/client` (seul generator configuré dans `schema.prisma`, output custom
`./client`) — `@prisma/client` n'a jamais de client généré à cet emplacement dans ce repo, donc
`import type { PrismaClient } from '@prisma/client'` ne résout à rien (`TS2305`). Ce bruit de compilation
cassait 26 suites de test gateway (répertorié comme "bruit préexistant" dans plusieurs itérations
précédentes, jamais corrigé). Corrigé en alignant les 3 imports sur la convention `@meeshy/shared/prisma/client`
déjà utilisée partout ailleurs dans `services/gateway/src` — root-cause fix, aucune régression
(suite complète 508/508 après correction, contre 482/508 + 26 suites en échec de compilation avant).

---

## 5. `CONVERSATION_CLOSED` vs `CONVERSATION_DELETED` — ✅ Résolu (2026-06-30)

Docstrings ajoutées sur les deux constantes dans `socketio-events.ts`, vérifiées contre le code (`routes/conversations/core.ts` / `delete-for-me.ts`) :
- `CONVERSATION_CLOSED` : suppression **globale** par le créateur/un admin (`DELETE /conversations/:id`), `Conversation.isActive=false`, broadcast à `ROOMS.conversation` (tous les membres).
- `CONVERSATION_DELETED` : "delete for me" **par utilisateur** (`DELETE /conversations/:id/delete-for-me`), broadcast uniquement à `ROOMS.user` du caller (ses autres devices), la conversation reste active pour les autres participants.

---

## 6. `USER_UPDATED` manquant — ✅ Résolu (2026-07-02)

**Problème (historique)** : Pas d'event quand un user modifie son profil (avatar, displayName, etc.). La diffusion implicite passait par la mise à jour des `participants` dans les events `CONVERSATION_UPDATED`. Limite :
- Coût : N events de conv update pour un seul changement profil
- Latence : tant que l'user n'est pas dans une conv affichée, le profile reste stale dans le cache iOS/web

**Fix appliqué** : `USER_UPDATED: 'user:updated'` (`packages/shared/types/socketio-events.ts`,
payload `{ userId, changes: Partial<{ displayName, avatar, banner, username, firstName,
lastName }> }`) émis via `NotificationService.emitUserUpdated()` (realtime-only, pas de
`Notification` persistée — même pattern que `emitFriendRequestCancelled`) depuis les 4
routes `PATCH /users/me`, `/users/me/avatar`, `/users/me/banner`, `/users/me/username`
(`services/gateway/src/routes/users/profile.ts`), fire-and-forget après l'update DB.

Fan-out ciblé (pas de broadcast complet) : nouveau helper
`getDistinctConversationPartnerUserIds(prisma, userId)`
(`services/gateway/src/utils/conversation-partners.ts`), 2 requêtes Prisma (conversations du
user → participants distincts des autres users dans ces conversations), même forme que le
dédup existant de `MeeshySocketIOManager._emitPresenceSnapshot` mais scopé aux users
enregistrés (les participants anonymes n'ont pas de profil à propager).

Web câblé de bout en bout (`presence.service.ts` → `orchestrator.service.ts` →
`meeshy-socketio.service.ts` → `use-socket-cache-sync.ts` invalide
`queryKeys.users.detail(userId)`, ce qui couvre `useUserProfileQuery` puisque `profile()` est
nested sous `detail()`). iOS non câblé dans ce passage (pas de toolchain Swift dans
l'environnement d'exécution) — à faire en suivi, même pattern que
`CONVERSATION_NEW`/`FRIEND_REQUEST_*`.

Tests : gateway (`emitUserUpdated.test.ts` ×4, `conversation-partners.test.ts` ×4,
`profile.test.ts` ×4 nouveaux cas), shared (`socketio-events.test.ts`), web
(`presence.service.test.ts` ×2, `use-socket-cache-sync.test.tsx` ×2).

---

## 7. `FRIEND_REQUEST_*` events absents

**Problème** : Les friend requests passent par `NOTIFICATION_NEW` avec discrimination string. Même pattern problématique que `CONVERSATION_NEW` avant fix.

**Action proposée** :
- Ajouter `FRIEND_REQUEST_NEW`, `FRIEND_REQUEST_ACCEPTED`, `FRIEND_REQUEST_REJECTED`, `FRIEND_REQUEST_CANCELLED`
- Émettre aux user-rooms respectifs
- Migrer clients

**`FRIEND_REQUEST_CANCELLED` — ✅ Résolu (2026-07-01)**

Contrairement à `NEW`/`ACCEPTED`/`REJECTED` (délivrance fonctionnelle via
`NOTIFICATION_NEW`, juste non typée), `DELETE /friend-requests/:id` n'émettait
**RIEN** à l'autre partie — vrai gap temps réel (même classe de bug que
`CONVERSATION_NEW` avant son fix) : si Alice annule une demande envoyée à Bob (ou
si Bob supprime une demande reçue sans y répondre), l'autre côté gardait sa liste
de demandes en attente périmée jusqu'à un refetch complet manuel.

Fix : event dédié `FRIEND_REQUEST_CANCELLED: 'friend-request:cancelled'`
(`packages/shared/types/socketio-events.ts`, payload `{ friendRequestId, cancelledBy }`),
émis via `NotificationService.emitFriendRequestCancelled()` (realtime-only, PAS de
`Notification` persistée) vers `ROOMS.user(otherUserId)` depuis le handler
`DELETE /friend-requests/:id` (`services/gateway/src/routes/friends.ts`). Web câblé
de bout en bout (`presence.service.ts` → `orchestrator.service.ts` →
`meeshy-socketio.service.ts` → `use-friend-requests-v2.ts` invalide la query au
reçu). iOS non câblé dans ce passage (pas de toolchain Swift dans l'environnement
d'exécution) — à faire en suivi, même pattern que `CONVERSATION_NEW`.

`NEW`/`ACCEPTED`/`REJECTED` restent P2/P3 (cosmétique — pattern à corriger mais pas
de gap de délivrance fonctionnel aujourd'hui).

**`FRIEND_REQUEST_NEW` / `FRIEND_REQUEST_ACCEPTED` / `FRIEND_REQUEST_REJECTED` — ✅ Résolu (2026-07-01)**

Ajoutés en dual-émission (mêmes points d'appel que `createFriendRequestNotification` /
`createFriendAcceptedNotification` / la notification système de rejet, legacy
`NOTIFICATION_NEW` conservé ~3 mois). Un gap de délivrance réel a été trouvé au passage :
côté **web**, `use-friend-requests-v2.ts` n'invalidait la liste `sent` sur aucun signal
socket pour `friend_accepted`/rejet (`onNotification` ne filtrait que
`friend_request`/`contact_request`) — l'expéditeur ne voyait pas en temps réel que sa
demande avait été acceptée/refusée, seulement au prochain refetch complet.

- `packages/shared/types/socketio-events.ts` : `FRIEND_REQUEST_NEW: 'friend-request:new'`
  (`{ friendRequestId, senderId, receiverId }`), `FRIEND_REQUEST_ACCEPTED:
  'friend-request:accepted'` (`{ friendRequestId, accepterId, conversationId? }`),
  `FRIEND_REQUEST_REJECTED: 'friend-request:rejected'` (`{ friendRequestId, rejecterId }`).
- `NotificationService.emitFriendRequestNew/Accepted/Rejected()` (realtime-only, même
  pattern que `emitFriendRequestCancelled`) appelées depuis
  `services/gateway/src/routes/friends.ts` : `POST /friend-requests` (NEW → user-room du
  receiver), `PATCH /friend-requests/:id` accepted (ACCEPTED → user-room du sender,
  `conversationId` résolu après création/lookup de la conversation directe) et rejected
  (REJECTED → user-room du sender).
- Web câblé de bout en bout (`presence.service.ts` → `orchestrator.service.ts` →
  `meeshy-socketio.service.ts` → `use-friend-requests-v2.ts`, invalide `invalidateAll()`
  sur les 3 events — ferme le gap ci-dessus).
- iOS non câblé dans ce passage (pas de toolchain Swift dans l'environnement d'exécution)
  — à faire en suivi, même pattern que `CONVERSATION_NEW`/`FRIEND_REQUEST_CANCELLED`.
- Tests : gateway (`friends-routes.test.ts`, 6 nouveaux cas), shared
  (`socketio-events.test.ts`), web (`presence.service.test.ts` ×6,
  `use-friend-requests-v2.test.tsx` ×3).

---

## Priorisation suggérée

| Priorité | Item | Raison |
|---|------|--------|
| ~~P1~~ | ~~#2 STORY_TRANSLATION namespace~~ | ✅ Résolu 2026-07-05 |
| ~~P1~~ | ~~#5 CONVERSATION_CLOSED docstring~~ | ✅ Résolu 2026-06-30 |
| P2 | #1 NOTIFICATION_NEW audit complet | Pattern récurrent qui pourrira chaque domaine ajouté |
| ~~P2~~ | ~~#7 FRIEND_REQUEST events~~ | ✅ Résolu 2026-07-01 (CANCELLED + NEW/ACCEPTED/REJECTED) |
| ~~P3~~ | ~~#6 USER_UPDATED~~ | ✅ Résolu 2026-07-02 |
| ~~P3~~ | ~~#3 READ_STATUS namespace~~ | ✅ Résolu 2026-07-05 |
| ~~P3~~ | ~~#4 NOTIFICATION générique~~ | ✅ Résolu 2026-07-05 (code mort retiré, pas juste renommé) |

## Conventions à inscrire dans `socketio-events.ts`

Suggérer un commentaire d'entête au fichier rappelant les règles :
- Convention : `entity:action-word` (colons + hyphens dans action seulement)
- Une entité par event (pas de wrapper polymorphe générique)
- Préférer un event typé spécifique à une discrimination string
- Backward compat : ~3 mois d'émission parallèle entre ancien et nouveau event
