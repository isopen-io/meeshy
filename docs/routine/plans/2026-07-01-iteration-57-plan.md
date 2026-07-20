# Iteration 57 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Suppression de la maintenance morte de `cursor.unreadCount` (F23c) ». Retirer la méthode
privée `updateUnreadCount()` et son appel dans `markMessagesAsReceived()` — éliminant 3
opérations DB par réception (findUnique + count + update) pour maintenir un champ jamais lu.
**Aucune modification observable** (champ mort en lecture).

Fichier : `services/gateway/src/services/MessageReadStatusService.ts`
Tests : `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts`

> Contexte multi-sessions : `main` porte déjà des itérations 47–56 (autres fils). Ce lot reprend
> le fil F23c (issu d'iter 46) ; numéroté 57. Base rebasée sur le dernier `main`.

## Étapes

### Phase A — Gateway : suppression du code mort (GREEN direct — pas de comportement observable)
- [x] Retirer l'appel `await this.updateUnreadCount(participantId, conversationId);` dans
      `markMessagesAsReceived()`.
- [x] Supprimer la méthode privée `updateUnreadCount()` entière.
- [x] Conserver les littéraux `unreadCount: 0` des upserts (le champ schéma reste — F23c-b).

### Phase B — Tests
- [x] Retirer le bloc `describe('updateUnreadCount (via markMessagesAsReceived)')` (comportement
      supprimé — le curseur n'est plus ré-update par markMessagesAsReceived).
- [x] Remplacer le bloc `describe('updateUnreadCount — error swallowed silently')` par un test
      équivalent ciblant la vraie résilience restante (échec du read curseur best-effort
      `prevDeliveredAt` toujours avalé).
- [x] Retirer les mocks/commentaires « Mock for updateUnreadCount » devenus obsolètes.

### Phase C — Vérification & livraison
- [x] `node_modules/.bin/jest MessageReadStatusService` → **137/137**.
- [x] `jest "MessageHandler|MeeshySocketIOManager"` → **832/832** (10 suites) — aucune régression.
- [ ] Commit + push `claude/sharp-wozniak-svekrj` (force-with-lease : le remote porte l'ancien
      commit iter-46 déjà squash-mergé) ; PR vers `main` ; CI verte (checks code) ; merge.

## Hors périmètre (consigné dans l'analyse)
F23c-b (champ schéma + index — fenêtre prisma generate), F2 (staging), F10 (backfill),
F21 (sémantique).

## Continuité
Iter suivante (ce fil) : **F23c-b** (retrait du champ schéma `unreadCount` + index
`@@index([unreadCount])` + littéraux `unreadCount: 0`) dès qu'une fenêtre `prisma generate` /
build cross-service est disponible.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `updateUnreadCount` + son appel supprimés
- [x] Phase B — tests réécrits (137/137)
- [x] Phase C partielle — suites locales vertes (832/832) ; reste CI + merge main
</content>
