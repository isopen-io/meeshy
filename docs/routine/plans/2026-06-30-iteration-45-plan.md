# Iteration 45 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Comptage non-lus batch en une lecture (F23) » : remplacer les **N** `message.count`
parallèles de `getUnreadCountsForParticipants` par **1** `message.findMany` (timestamps seuls)
+ bucketing dichotomique par participant — **sortie préservée octet pour octet**, charge DB
découplée de la taille du groupe.

## Étapes (TDD : RED → GREEN)

### Phase A — RED : tests de comportement (gate « donnée visible »)
- [ ] `MessageReadStatusService.test.ts` `describe('getUnreadCountsForParticipants')` :
  - [ ] empty array → `Map` vide, aucun appel DB (conservé).
  - [ ] bornes **mixtes** : p1 (curseur `lastReadAt`), p2 (`joinedAt`), p3 (curseur plus récent)
        → comptes **distincts** dérivés du même set de `createdAt` mocké via `message.findMany`.
  - [ ] borne **nulle** (ni curseur ni `joinedAt`) → compte **tous** les candidats.
  - [ ] borne **stricte** : un message à `createdAt === floor` n'est **pas** compté.
  - [ ] entrée `findMany` **non triée** → résultat correct (le service trie / `orderBy asc`).
  - [ ] DB throw (`findMany` rejette) → map de zéros par participant (conservé).
- [ ] Mocks : `message.count` n'est plus utilisé par ce chemin ; mocker `message.findMany`.

### Phase B — GREEN : implémentation fetch-once + bucketing
- [ ] `MessageReadStatusService.ts:getUnreadCountsForParticipants` :
  1. curseurs : `conversationReadCursor.findMany` (inchangé).
  2. `floors = participants.map(p => ({ id, floor: cursorMap.get(p.id) ?? p.joinedAt ?? null }))`.
  3. `floorMin = floors.some(f => f.floor === null) ? null : new Date(min(getTime()))`.
  4. `messages = message.findMany({ where:{ conversationId, deletedAt:null,
     senderId:{not:senderId}, ...(floorMin ? {createdAt:{gt:floorMin}} : {}) },
     select:{createdAt:true}, orderBy:{createdAt:'asc'} })`.
  5. `ts = messages.map(m => m.createdAt.getTime())` (déjà trié par `orderBy`).
  6. par participant : `floor===null ? ts.length : ts.length - upperBound(ts, floor.getTime())`.
- [ ] Helper pur module-local `countAfter(sortedMs: number[], floorMs: number): number`
      (recherche dichotomique upper-bound : 1er index `> floorMs`, retourne `length - idx`).
- [ ] `catch` inchangé : map de zéros.
- [ ] Mettre à jour le commentaire d'en-tête de la méthode (N counts → 1 findMany).

### Phase C — Vérification & livraison
- [ ] `bun run test` ciblé `MessageReadStatusService.test.ts` → vert.
- [ ] Suites callers inchangées : `MessageHandler` (mock `getUnreadCountsForParticipants`) verts.
- [ ] `tsc --noEmit` gateway : aucun nouveau type error sur le fichier touché.
- [ ] Commit + push `claude/sharp-wozniak-6lwbw0` ; PR vers `main` ; CI verte ; merge.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F21 (sémantique), F24 (`getUnreadCountsForUser` —
`senderId` exclu variable par conversation, pattern non transposable tel quel).

## Continuité
Iter 46+ : **F24** sous réserve de profilage (le set candidat n'est PAS commun car le `senderId`
exclu varie par conversation — audit dédié). Puis F2 dès fenêtre staging.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `MessageReadStatusService.test.ts` `getUnreadCountsForParticipants` réécrit :
      bornes mixtes (p1/p2/p3 → 3/4/1 d'un même fetch), borne nulle (tout compte), borne
      stricte `gt` (message à la borne exclu), entrée non triée → tri en process, chemin
      d'erreur (map de zéros). 6/6 verts.
- [x] Phase B — `getUnreadCountsForParticipants` : N `message.count` → 1 `message.findMany`
      (`select:{createdAt}`) + helper pur `countAfter` (dichotomie upper-bound) ; tri en
      process (`.sort`) pour ne pas dépendre de l'ordre du driver. Suite complète
      `MessageReadStatusService` **138/138** ; callers `MessageHandler` **245/245**.
- [x] Vérif type — `tsc --noEmit` gateway : **300 erreurs identiques au baseline** (33 dans le
      fichier), toutes dues au client Prisma non généré (CDN engines bloqué par le proxy local) ;
      **0 nouvelle erreur** introduite. CI génère le client → type-check vert en CI.
- [~] Phase C — PR #1131 ouverte. **Déblocage CI** : `main` était silencieusement rouge (CI
      *skip* sur le commit release `[skip ci]`) — un merge antérieur avait combiné deux designs
      a11y divergents de `invite-user-modal` (nom accessible statique + inner button `aria-hidden`),
      cassant `invite-user-modal.test.tsx` (`toBeDisabled` sur un `div[role=button]`). Réconcilié
      en une `<button>` native (commit `b22ece44`) : `role=button`+`tabIndex`+`onKeyDown` (clavier),
      `disabled` natif + `aria-label` conditionnel (`addUserAria`/`selectedUserAria`, clés déjà
      présentes en 4 locales). Suite **30/30**. CI re-lancée ; merge automatique dès le vert (cron).
