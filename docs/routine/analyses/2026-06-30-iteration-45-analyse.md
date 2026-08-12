# Iteration 45 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 44 (lot « Source unique de l'arithmétique calendaire — F18c », mergé dans `main` :
`packages/shared/utils/calendar-date.ts` `startOfLocalDayMs`/`calendarDayDiff` consommés par
`date-format.ts` ×2, `notification-helpers.ts` et `FriendRequestCard` délégant à
`classifyRelativeTime`). Le plan iter 44 renvoie la continuité vers la liste différée :
**F23** (agrégation des comptes de non-lus), F18d (queue de présentation), F2 (filtre langue
socket), F10 (`conversationId` scalaire + index).

Cette itération attaque **F23** — l'item différé au plus fort impact « bande passante /
exploitation des ressources » encore ouvert et **entièrement testable sur ce runner Linux**
(gateway jest, Prisma mocké), sans fenêtre staging ni backfill.

Surfaces testables sur ce runner :
- **gateway jest** : `MessageReadStatusService.test.ts` (suite `getUnreadCountsForParticipants`).
- Les appelants (`MessageHandler`) mockent la méthode entière → non impactés.

## Audit — constat vérifié (F23)

### Chemin le plus chaud : N comptes par message diffusé
`MessageReadStatusService.getUnreadCountsForParticipants` (l.182-221) est appelé par
`MessageHandler._updateUnreadCounts` (l.1322) **à chaque `message:new`**, pour TOUS les
participants d'une conversation. Sa boucle exécute **N `message.count` en parallèle** (un par
participant) :
```ts
const results = await Promise.all(
  participants.map(async (p) => {
    const floor = (cursorMap.get(p.id) ?? p.joinedAt) ?? null;
    const count = await this.prisma.message.count({
      where: { conversationId, deletedAt: null, senderId: { not: senderId },
               ...(floor ? { createdAt: { gt: floor } } : {}) },
    });
    return [p.id, count] as const;
  })
);
```
Pour un groupe de N participants, c'est **N requêtes DB par message** (en plus de
`1 cursor.findMany`). À l'échelle « 100k messages/s » de la cible produit, c'est le poste de
charge DB dominant sur la diffusion.

### Le prédicat est IDENTIQUE pour tous les participants — sauf le plancher `createdAt`
Les N comptes partagent **exactement** la même clause `WHERE`
(`conversationId`, `deletedAt: null`, `senderId ≠ <expéditeur du message>`) ; **seule** la
borne basse `createdAt > floor(p)` varie. Le compte d'un participant de plancher `F` n'est rien
d'autre que « le nombre de messages candidats dont `createdAt > F` ». N comptes sur le même
ensemble trié = **N recherches dans le même tableau** → collapsable en **1 requête + N
recherches dichotomiques** en mémoire.

### Index disponible
`@@index([conversationId, deletedAt, createdAt])` (schema.prisma l.696) couvre exactement le
`findMany` candidat (`conversationId` + `deletedAt` + plage `createdAt`), scan ordonné par
`createdAt` ; `senderId ≠ X` reste un filtre résiduel — strictement comme les N comptes actuels.

## Décision iter 45 — lot « Comptes de non-lus : N requêtes → 1 requête + dichotomie (F23) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `getUnreadCountsForParticipants` : 1 `cursor.findMany` (inchangé) + **1 `message.findMany`** (createdAt des candidats, index-backed) + bucketing par dichotomie `upper-bound`. Plancher par participant : `cursor.lastReadAt → joinedAt → null` (inchangé). Sortie **octet pour octet identique**. | BANDE PASSANTE / DB : `N` comptes → `1` requête sur le chemin diffusion le plus chaud |
| B | TDD gateway : réécrire la suite `getUnreadCountsForParticipants` (mock `message.findMany` au lieu de `message.count`) + cas plancher distincts, plancher null (illimité), borne d'égalité `gt` stricte, futur. | Couverture comportementale |

### Préservation du comportement (prouvée)
- Plancher par participant : `(cursorMap.get(p.id) ?? p.joinedAt) ?? null` — réduction
  identique à l'actuel `lastReadAt ?? p.joinedAt ?? null` (cas curseur absent / `lastReadAt`
  null / `joinedAt` null tous équivalents).
- Borne `gt` stricte : un message dont `createdAt === floor` n'est **pas** compté — dichotomie
  `upper-bound` sur `> floorMs`, identique au `createdAt: { gt: floor }`.
- Précision ms : `Date.getTime()` (ms) ↔ BSON Date (ms) — comparaison exacte.
- Plancher `null` (curseur absent ET `joinedAt` null) → aucun borne basse → compte tous les
  candidats : le `findMany` omet alors la borne `createdAt` (fetch complet), `countAbove(null)`
  renvoie `timestamps.length`. Identique à l'actuel (`floor ? {createdAt…} : {}`).
- Chemin d'erreur : `catch` renvoie `Map(p → 0)` — inchangé.

### Bornage de la requête
La borne basse du `findMany` = **plus ancien** plancher parmi les participants (`minFloor`) :
on ne charge que les messages que **n'importe quel** participant pourrait compter. Conversation
active (tout le monde à jour) → `minFloor` récent → peu de lignes. Si au moins un participant a
un plancher `null` (jamais lu, sans `joinedAt`), la borne tombe (fetch complet) — exactement
l'ensemble que l'ancien `count` sans borne scannait déjà, mais en **1 seul** aller-retour au
lieu de N. Tri JS défensif `(a,b)=>a-b` en filet (le `orderBy: createdAt asc` rend déjà l'ordre
index) pour garantir la dichotomie quelle que soit la source.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18d | Unifier la queue de présentation (weekday + heure, date courte/absolue) | FAIBLE | Queues hétérogènes ; gain marginal |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit + backfill |
| F23b | Discordance latente : la version batchée exclut `senderId` (expéditeur du message) là où `getUnreadCount` exclut `participant.id`. En pratique masquée par l'avance du curseur lors de l'envoi. | FAIBLE | Audit sémantique dédié — hors périmètre « iso-comportement » de ce lot |

## Gain estimé global
Sur le chemin de diffusion le plus chaud (`message:new` → `_updateUnreadCounts`), passage de
**N+1** requêtes DB par message à **2** (1 `cursor.findMany` + 1 `message.findMany`),
sortie préservée octet pour octet. Réduction directe de la charge DB et des allers-retours
réseau gateway↔Mongo à l'échelle multi-participants. Couvert par gateway jest
(`MessageReadStatusService` — suite `getUnreadCountsForParticipants` réécrite + cas limites).
</content>
</invoke>
