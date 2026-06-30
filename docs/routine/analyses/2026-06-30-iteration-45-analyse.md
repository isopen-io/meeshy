# Iteration 45 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 44 (lot « Source unique de l'arithmétique calendaire — F18c », mergé dans `main` :
`packages/shared/utils/calendar-date.ts` `startOfLocalDayMs` + `calendarDayDiff`, consommés
par `date-format.ts`, `notification-helpers.ts` et `FriendRequestCard.tsx`). Les lots de
dédup/SSOT des formateurs de date relatifs (F18a→F18c) sont **épuisés**.

Le backlog des itérations 42-44 conserve un constat **bande passante / charge DB** prioritaire
et actionnable **sans fenêtre staging** :

| # | Constat | Impact | Raison du report (jusqu'ici) |
|---|---------|--------|------------------------------|
| **F23** | `getUnreadCountsForParticipants` : **N** `message.count` parallèles (1 par participant) | MOYEN (BP / charge DB) | « floor par participant ; risque sur donnée visible » |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit sémantique + backfill |

F2/F10/F21 restent bloqués sur staging/backfill. **F23 est le seul item haute-valeur
implémentable et mergeable en autonomie** cette itération.

## Audit — constat vérifié (F23)

### La charge réelle : N requêtes `count` par message diffusé
`services/gateway/src/services/MessageReadStatusService.ts:182` `getUnreadCountsForParticipants`
est appelé **à chaque message diffusé** (`MessageHandler.ts:1322`,
`broadcastUnreadCountUpdate`). Pour une conversation de N destinataires, il exécute :

- **1** `conversationReadCursor.findMany` (batch des curseurs) — déjà optimal ;
- **N** `message.count` **en parallèle** — un par participant (l.200-214).

```ts
const results = await Promise.all(
  participants.map(async (p) => {
    const lastReadAt = cursorMap.get(p.id) ?? null;
    const floor: Date | null = lastReadAt ?? p.joinedAt ?? null;
    const count = await this.prisma.message.count({
      where: { conversationId, deletedAt: null,
               senderId: { not: senderId },
               ...(floor ? { createdAt: { gt: floor } } : {}) },
    });
    return [p.id, count] as const;
  })
);
```

Chaque `count` est un **scan d'index** indépendant `{conversationId, createdAt}` de la borne
`floor` du participant jusqu'à la fin. Sur un groupe de 50 membres, **50 scans** sont émis vers
MongoDB pour **un seul** message — pression connexions/CPU DB qui croît linéairement avec la
taille du groupe, exactement aux moments de plus forte activité (groupe vivant = beaucoup de
messages × beaucoup de membres).

### L'insight qui débloque le risque « floor par participant »
Le `senderId` passé est **une seule valeur** (l'auteur du message), **identique pour tous les
participants** — vérifié au call-site (`MessageHandler.ts:1305` `senderId = message.senderId`,
puis l.1322-1326 le même `senderId` est passé). Donc l'**ensemble candidat** de messages
(`{conversationId, deletedAt:null, senderId:{not:senderId}}`) est **strictement identique
pour tous les participants** : seule la borne `floor` (`createdAt > floor`) varie d'un
participant à l'autre.

Conséquence : le comptage par participant est une **partition d'un même ensemble trié par
`createdAt`**. On peut le calculer en **une seule lecture** :

1. `floor_min` = min des bornes (null si au moins un participant n'a pas de borne → tout compte) ;
2. **1** `message.findMany` qui ne récupère que `{ createdAt }` des messages candidats
   `createdAt > floor_min`, triés ascendant ;
3. pour chaque participant : `unread_p = (#timestamps > floor_p)` par **recherche dichotomique**
   (borne supérieure) en mémoire.

**Correction prouvée** : pour tout participant de borne `f ≥ floor_min`, un message compte ssi
`createdAt > f` ; comme `f ≥ floor_min`, un tel message vérifie `createdAt > floor_min` et est
donc présent dans l'ensemble récupéré ; réciproquement tout message `createdAt ≤ floor_min ≤ f`
ne compte pour personne et est correctement exclu du fetch. La borne stricte `gt` est préservée
par la dichotomie (upper-bound = 1er index `> f`, les égalités restent exclues). Sortie
**identique octet pour octet** à la version N-count.

### Profil de charge après
- **N scans d'index → 1 scan d'index** (de `floor_min` à la fin, soit la plage du participant
  le plus en retard — borne déjà atteinte par le pire `count` actuel).
- Donnée transférée : K `Date` où K = non-lus du participant le plus en retard (typiquement
  faible — les membres lisent). Indépendant de N.
- Le travail per-participant restant est **CPU mémoire** (dichotomie `O(log K)`), pas réseau DB.

C'est le pattern SOTA « fetch-once + bucketing mémoire » : on remplace un fan-out de requêtes
identiques-sauf-borne par une lecture unique partitionnée côté process.

## Décision iter 45 — lot « Comptage non-lus batch en une lecture (F23) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | TDD RED : étendre `MessageReadStatusService.test.ts` `getUnreadCountsForParticipants` — bornes mixtes, borne nulle (tout compte), borne stricte `gt` (message exactement à la borne exclu), tri non garanti côté entrée, exclusion `deletedAt`/`senderId` déléguée au `where`, chemin d'erreur | Filet de sécurité « donnée visible » |
| B | GREEN : remplacer les N `message.count` par 1 `message.findMany({select:{createdAt}})` + dichotomie upper-bound par participant ; helper pur `countAfter(sortedMs, floorMs)` | N scans DB → 1 ; charge DB constante en N |
| C | Vérif : suite gateway `MessageReadStatusService` verte + `MessageHandler` (callers) inchangés ; `tsc` gateway sans nouveau type error | Non-régression |

## Consignés pour itérations futures
- **F2** (`SOCKET_LANG_FILTER`) — dès qu'une fenêtre staging existe (gain BP le plus haut).
- **F10** (`conversationId` scalaire/index Notification) — dual-write + backfill.
- **F21** (sémantique `isActive`/`deactivatedAt`/`deletedAt`) — audit + backfill.
- **F24** (nouveau) : appliquer le même pattern « fetch-once + bucketing » à
  `getUnreadCountsForUser` (`MessageReadStatusService.ts:231`) **si** profilage le justifie —
  attention : là le `senderId` exclu (`p.id`) **varie** par conversation, l'ensemble candidat
  n'est donc pas commun ; pattern non transposable tel quel, audit dédié requis.

## Gain estimé global
Pour chaque message diffusé dans une conversation de N destinataires : **N requêtes
`message.count` → 1 requête `message.findMany`**. Charge DB (connexions/scans) découplée de la
taille du groupe ; le comptage per-participant devient du CPU mémoire. Sortie préservée octet
pour octet (borne stricte `gt`, exclusions `deletedAt`/`senderId` inchangées). Couvert par la
suite gateway `MessageReadStatusService` (TDD bornes mixtes/nulle/stricte + chemin d'erreur).
