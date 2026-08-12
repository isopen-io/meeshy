# Iteration 57 — Analyse d'optimisation (2026-07-01)

## Contexte
Fil de continuité **F23** (comptage des non-lus, chemin de diffusion temps-réel) :
- iter 45 (F23) : N `message.count` → 1 `message.findMany` + dichotomie (mergé, PR #1134).
- iter 46 (F23b) : sémantique batchée alignée sur `getUnreadCount`/`getUnreadCountsForUser`
  (exclure les messages du participant lui-même) (mergé, PR #1138).
- iter 46 désignait **F23c** comme suite : `cursor.unreadCount` dénormalisé, maintenu mais mort
  en lecture.

> Note multi-sessions : d'autres sessions de la routine avancent en parallèle (le `main` porte
> déjà des itérations 47–56 sur d'autres fils, ex. F25/F26). Cette itération reprend le fil
> **F23c** ; numérotée **57** (prochain numéro libre dans `main` au moment du commit) pour éviter
> toute collision de nom de fichier. Base rebasée sur le dernier `main` (`updateUnreadCount` y
> existe encore → travail non dupliqué).

Surfaces testables sur ce runner : **gateway jest** — `MessageReadStatusService.test.ts`,
suites appelantes `MessageHandler` / `MeeshySocketIOManager`.

## Audit F23c — constat confirmé (champ mort en lecture)

Audit exhaustif (grep repo-wide services/gateway, packages, apps) :

### `ConversationReadCursor.unreadCount` n'est JAMAIS lu
Aucun `select: { unreadCount }`, aucun `include`, aucun accès `cursor.unreadCount` pour décider
d'un comportement ou renvoyer une valeur. Toutes les fonctions de comptage recomputent frais
(`getUnreadCount`, `getUnreadCountsForUser`, `getUnreadCountsForParticipants`,
`getMessageReadStatus`, `getConversationReadStatuses`, `getLatestMessageSummary` sélectionnent
`lastReadAt`/`lastDeliveredAt` — jamais `unreadCount`). Le commentaire l.86-94 le documente
(« the denormalized `unreadCount` field is intentionally ignored »). Les payloads socket
`CONVERSATION_UNREAD_UPDATED` et les réponses REST portent des valeurs **fraîchement calculées**.

### La maintenance de ce champ mort coûte 3 opérations DB par réception (chemin chaud)
La méthode privée `updateUnreadCount()` était appelée par `markMessagesAsReceived()` — donc **à
chaque marquage de réception**. Elle exécutait :
1. `conversationReadCursor.findUnique` (relire le curseur),
2. `message.count` (recompter les non-lus),
3. `conversationReadCursor.update` (réécrire le champ mort).

**3 opérations DB par réception, uniquement pour maintenir un champ que personne ne lit** — pur
gaspillage sur un chemin très fréquent.

## Décision iter 57 — lot « Suppression de la maintenance morte de `cursor.unreadCount` (F23c) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Supprimer la méthode privée `updateUnreadCount()` **et** son appel dans `markMessagesAsReceived()`. | −3 opérations DB par réception sur le chemin chaud ; code mort éliminé |
| B | Réécrire les tests : retirer les 2 blocs `describe` dédiés à `updateUnreadCount` ; conserver un test de résilience (échec du read curseur best-effort dans `markMessagesAsReceived` toujours avalé). | Couverture comportementale |

### Aucune modification observable
Le champ étant mort en lecture, retirer sa recomputation ne change **rien** d'observable : aucun
compteur affiché, aucune valeur renvoyée, aucun event n'en dépend. Seul le gaspillage DB
disparaît. Les écritures triviales `unreadCount: 0` des upserts create/update (constantes, sans
opération DB supplémentaire) sont conservées (le champ schéma reste — cf. F23c-b).

## Périmètre volontairement restreint
La **suppression du champ schéma** `unreadCount Int @default(0)` + de son index
`@@index([unreadCount])` (index sur un champ désormais figé à 0 → write-amplification pure sur
chaque upsert curseur) est reportée à **F23c-b** : elle exige `prisma generate` + recompilation
cross-service, non vérifiables localement sur ce runner (engines Prisma bloqués au download). Le
retrait de `updateUnreadCount` livre déjà le gain DB principal, entièrement vérifiable via
gateway jest (stub Prisma).

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F23c-b | Retirer le champ schéma `unreadCount` + `@@index([unreadCount])` + les littéraux `unreadCount: 0` des upserts | FAIBLE-MOYEN (write-amplification index sur chaque upsert curseur) | `prisma generate` + build cross-service (fenêtre CI dédiée) |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | États distincts ; backfill |

## Gain estimé global
Suppression de **3 opérations DB par `markMessagesAsReceived`** (findUnique + count + update) sur
un chemin très fréquent, et d'une méthode entièrement morte — sans aucune modification observable
(champ mort en lecture). Couvert par gateway jest (`MessageReadStatusService` **137/137** ;
appelants `MessageHandler`/`MeeshySocketIOManager` : 10 suites, **832/832**).
</content>
