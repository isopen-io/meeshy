# Iteration 45 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Comptes de non-lus : N requêtes → 1 requête + dichotomie (F23) ». Collapser les **N
`message.count` parallèles** de `getUnreadCountsForParticipants` (un par participant, à chaque
`message:new`) en **1 `message.findMany`** index-backed + bucketing par recherche dichotomique
en mémoire — **sortie préservée à l'identique**.

Fichier cible : `services/gateway/src/services/MessageReadStatusService.ts`
Tests : `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts`

## Étapes (TDD : RED → GREEN)

### Phase A — Gateway : réécriture de la suite de tests (RED)
- [ ] Réécrire la suite `getUnreadCountsForParticipants` :
      - mocker `message.findMany` (et non plus `message.count`) ;
      - cas « planchers distincts » : 2 participants, planchers différents → comptes différents
        issus d'UN seul `findMany` (dichotomie) ;
      - cas « plancher null illimité » : participant sans curseur ni `joinedAt` → compte = total
        des candidats ; vérifier que le `findMany` est appelé **sans** borne `createdAt` ;
      - cas « borne `gt` stricte » : un message dont `createdAt === floor` n'est pas compté ;
      - cas « cible future » / curseur > dernier message → 0 ;
      - conserver : tableau vide → `Map()` sans requête ; DB throw → `Map(p → 0)`.

### Phase B — Gateway : implémentation (GREEN)
- [ ] `getUnreadCountsForParticipants` :
      1. `cursor.findMany` (inchangé) → `cursorMap`.
      2. Planchers par participant : `floorMs = ((cursorMap.get(p.id) ?? p.joinedAt)?.getTime()) ?? null`.
      3. `hasUnboundedFloor = floors.some(f => f.floorMs === null)` ;
         `minFloorMs = hasUnboundedFloor ? null : Math.min(...floorsMs)`.
      4. `message.findMany({ where: { conversationId, deletedAt: null, senderId: { not: senderId },
         ...(minFloorMs !== null ? { createdAt: { gt: new Date(minFloorMs) } } : {}) },
         select: { createdAt: true }, orderBy: { createdAt: 'asc' } })`.
      5. `timestamps = rows.map(r => r.createdAt.getTime()).sort((a,b)=>a-b)` (tri filet).
      6. `countAbove(floorMs)` : `null → timestamps.length` ; sinon upper-bound dichotomique
         (`> floorMs`) → `timestamps.length - lo`.
      7. `return new Map(floors.map(f => [f.id, countAbove(f.floorMs)]))`.
      8. `catch` inchangé → `Map(p → 0)`.

### Phase C — Vérification & livraison
- [ ] `cd services/gateway && bun run test -- MessageReadStatusService` → suite verte.
- [ ] Sanity : suites appelantes non impactées (MessageHandler mocke la méthode).
- [ ] `tsc --noEmit` gateway : aucun nouveau type error sur le fichier touché.
- [ ] Commit + push `claude/sharp-wozniak-svekrj` ; PR vers `main` ; CI verte ; merge.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F18d (queue de présentation), F21 (sémantique),
F23b (discordance `senderId` vs `participant.id` — audit dédié).

## Continuité
Iter 46+ : **F23b** (audit sémantique `senderId`/`participant.id` dans le compte batché) si
confirmé visible ; F18d (queue de rendu commune) ; F2/F10 dès qu'une fenêtre staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — suite `getUnreadCountsForParticipants` réécrite (mock `message.findMany`) :
      planchers distincts depuis 1 fetch, oldest-floor lower bound, plancher null illimité,
      borne `gt` stricte, futur → 0, tableau vide, DB throw. 7 cas.
- [x] Phase B — `getUnreadCountsForParticipants` : 1 `cursor.findMany` + 1 `message.findMany`
      (index `[conversationId, deletedAt, createdAt]`) + bucketing dichotomique `upper-bound`.
      Sortie iso. `message.count` n'est plus appelé sur ce chemin.
- [x] Phase C — gateway jest local : `MessageReadStatusService` **139/139** vert (dont les 7
      nouveaux cas) ; suites appelantes `MessageHandler` **418/418** vert (méthode mockée,
      aucune régression). Compilation ts-jest du service OK. Reste : CI verte + merge `main`.
</content>
