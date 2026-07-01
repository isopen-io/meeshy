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

## 2. `STORY_TRANSLATION_UPDATED` mauvais namespace

**Problème** :
```typescript
STORY_TRANSLATION_UPDATED: 'post:story-translation-updated',
```
Le préfixe `post:` est incorrect — toutes les autres clés `STORY_*` utilisent `'story:...'`. Vraisemblablement une coquille issue d'un copy-paste de `POST_TRANSLATION_UPDATED`.

**Action proposée** :
- Renommer en `'story:translation-updated'`
- Garder l'ancien event émis en parallèle ~3 mois pour compat
- Migrer web + iOS pour subscribe au nouveau nom

**Impact** : breaking pour les clients qui écoutent `'post:story-translation-updated'`. Vérifier la liste des abonnés via `grep`.

---

## 3. `READ_STATUS_UPDATED` namespace hyphené hors convention

**Problème** :
```typescript
READ_STATUS_UPDATED: 'read-status:updated',
```
La convention partout ailleurs : `entity:action-word` avec entity en mot unique (`message`, `conversation`, `call`, etc.). Ici `read-status` introduit un hyphen dans le namespace.

**Action proposée** :
- Renommer en `'message:read-status-updated'` (sémantiquement c'est un changement sur un message)
- Ou `'reading:status-updated'` si on veut un domaine dédié
- Migration coordonnée

---

## 4. `NOTIFICATION` (sans suffixe) — usage flou

**Problème** :
```typescript
NOTIFICATION: 'notification',
NOTIFICATION_NEW: 'notification:new',
```
Le générique `NOTIFICATION` (sans `:action`) est inhabituel — quel sens vs `NOTIFICATION_NEW` ?

**Action proposée** :
- Auditer `grep -rn "SERVER_EVENTS.NOTIFICATION[^_]" services/gateway` pour voir s'il est encore émis
- Si non utilisé → deprecate puis remove
- Si utilisé → renommer en `NOTIFICATION_GENERIC` ou `NOTIFICATION_PUSH` selon sémantique

---

## 5. `CONVERSATION_CLOSED` vs `CONVERSATION_DELETED` — ✅ Résolu (2026-06-30)

Docstrings ajoutées sur les deux constantes dans `socketio-events.ts`, vérifiées contre le code (`routes/conversations/core.ts` / `delete-for-me.ts`) :
- `CONVERSATION_CLOSED` : suppression **globale** par le créateur/un admin (`DELETE /conversations/:id`), `Conversation.isActive=false`, broadcast à `ROOMS.conversation` (tous les membres).
- `CONVERSATION_DELETED` : "delete for me" **par utilisateur** (`DELETE /conversations/:id/delete-for-me`), broadcast uniquement à `ROOMS.user` du caller (ses autres devices), la conversation reste active pour les autres participants.

---

## 6. `USER_UPDATED` manquant

**Problème** : Pas d'event quand un user modifie son profil (avatar, displayName, etc.). Actuellement la diffusion implicite passe par la mise à jour des `participants` dans les events `CONVERSATION_UPDATED`. Limite :
- Coût : N events de conv update pour un seul changement profil
- Latence : tant que l'user n'est pas dans une conv affichée, le profile reste stale dans le cache iOS/web

**Action proposée** :
- Ajouter `USER_UPDATED: 'user:updated'` émis aux contacts/follow de l'utilisateur
- Payload léger : `{ userId, changes: Partial<UserPublic> }`
- iOS/web invalide les caches profile correspondants

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

---

## Priorisation suggérée

| Priorité | Item | Raison |
|---|------|--------|
| P1 | #2 STORY_TRANSLATION namespace | Bug bloquant pour story translations en prod si filtres mal câblés |
| P1 | #5 CONVERSATION_CLOSED docstring | 30min — ambiguïté coûte plus cher qu'un fix |
| P2 | #1 NOTIFICATION_NEW audit complet | Pattern récurrent qui pourrira chaque domaine ajouté |
| P2 | #7 FRIEND_REQUEST events | Visibility équivalente au bug de conv créateur, juste pas remonté yet |
| P3 | #6 USER_UPDATED | Performance + UX cache invalidation, gain modéré |
| P3 | #3 READ_STATUS namespace | Cosmétique, faible blast radius |
| P3 | #4 NOTIFICATION générique | À élucider d'abord |

## Conventions à inscrire dans `socketio-events.ts`

Suggérer un commentaire d'entête au fichier rappelant les règles :
- Convention : `entity:action-word` (colons + hyphens dans action seulement)
- Une entité par event (pas de wrapper polymorphe générique)
- Préférer un event typé spécifique à une discrimination string
- Backward compat : ~3 mois d'émission parallèle entre ancien et nouveau event
