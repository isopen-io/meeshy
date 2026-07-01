# Iteration 46 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Unification de la sémantique du comptage non-lus (F23b) ». Aligner
`getUnreadCountsForParticipants` sur les deux autres sources (`getUnreadCount`,
`getUnreadCountsForUser`) : exclure **les messages de chaque participant lui-même**
(`senderId ≠ p.id`) au lieu de l'expéditeur du message. Préserver l'optimisation iter 45
(1 requête). Supprimer le paramètre `senderId` devenu mort + mettre à jour les 2 appelants.

Fichiers : `services/gateway/src/services/MessageReadStatusService.ts`,
`services/gateway/src/socketio/handlers/MessageHandler.ts`,
`services/gateway/src/socketio/MeeshySocketIOManager.ts`
Tests : `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts`

## Étapes (TDD : RED → GREEN)

### Phase A — Gateway : réécriture de la suite de tests (RED)
- [ ] Suite `getUnreadCountsForParticipants` (signature à 2 args) :
      - mock `message.findMany` renvoyant `{ createdAt, senderId }` ;
      - cas « exclut les messages du participant lui-même » : p1 a envoyé un message au-dessus
        de son plancher → non compté pour p1, mais compté pour p2 ;
      - cas « inclut les messages des autres (dont l'ex-`senderId`) » ;
      - cas « planchers distincts depuis 1 fetch », « plancher null illimité »,
        « borne `gt` stricte », « tableau vide », « DB throw → Map(p→0) » ;
      - vérifier que le `where` du `findMany` n'a **pas** de filtre `senderId`.

### Phase B — Gateway : implémentation (GREEN)
- [ ] `getUnreadCountsForParticipants(participants, conversationId)` (drop `senderId`) :
      1. `cursor.findMany` (inchangé) → `cursorMap`.
      2. Planchers `floorMs` par participant (inchangé).
      3. `minFloorMs` (inchangé).
      4. `message.findMany({ where: { conversationId, deletedAt: null,
         ...(minFloorMs!==null ? {createdAt:{gt:new Date(minFloorMs)}} : {}) },
         select: { createdAt: true, senderId: true }, orderBy: { createdAt: 'asc' } })`.
      5. `allTs = rows.map(r => r.createdAt.getTime()).sort` ;
         `bySender: Map<string, number[]>` (push par `senderId`, ordre createdAt asc préservé).
      6. `countAbove(ts[], F)` : upper-bound dichotomique (`null` → length).
      7. `unread(p) = countAbove(allTs, F) − countAbove(bySender.get(p.id) ?? [], F)`.
      8. `catch` inchangé → `Map(p → 0)`.

### Phase C — Appelants
- [ ] `MessageHandler.ts:1322` : retirer le 3ᵉ arg `senderId`.
- [ ] `MeeshySocketIOManager.ts:1802` : retirer le 3ᵉ arg `senderId`.
      (Les deux conservent le `.filter(p => p.id !== senderId)` — l'expéditeur ne reçoit pas
      d'auto-update ; inchangé.)

### Phase D — Vérification & livraison
- [ ] `node_modules/.bin/jest MessageReadStatusService` → suite verte.
- [ ] `jest MessageHandler` → appelants verts (méthode mockée).
- [ ] Commit + push `claude/sharp-wozniak-svekrj` ; PR vers `main` ; CI verte ; merge.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (backfill), F18d (queue présentation), F21 (sémantique), F23c (champ
dénormalisé `cursor.unreadCount` mort en lecture).

## Continuité
Iter 47+ : **F23c** (suppression du champ `unreadCount` dénormalisé si confirmé mort) ;
F18d ; F2/F10 dès qu'une fenêtre staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — suite `getUnreadCountsForParticipants` réécrite (signature 2 args, rows
      `{createdAt, senderId}`) : nouveau cas « exclut les messages de p, compte les autres »,
      « pas de filtre `senderId` dans le `where` », + planchers distincts/null/borne stricte/
      vide/throw. Gateway jest `MessageReadStatusService` **140/140**.
- [x] Phase B — `getUnreadCountsForParticipants(participants, conversationId)` : 1 `cursor.findMany`
      + 1 `message.findMany` (sans filtre expéditeur, `select {createdAt, senderId}`) ; buckets
      par expéditeur ; `unread(p) = countAbove(tous,F) − countAbove(messages_de_p,F)`.
- [x] Phase C — `MessageHandler.ts` + `MeeshySocketIOManager.ts` : 3ᵉ arg `senderId` retiré.
      Suites appelantes **695/695** (9 suites), aucune régression.
- [ ] Phase D — CI verte, mergé dans main
</content>
