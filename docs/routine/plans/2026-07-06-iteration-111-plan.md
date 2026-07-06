# Iteration 111 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger **F82** : `rankUsers` (`services/gateway/src/routes/admin/system-rankings.ts`) agrège 8
critères par `Participant.id` sans repli vers `User.id` — produisant des lignes utilisateur dupliquées
(Famille A) ou entièrement « Unknown » (Famille B) dans le dashboard admin. Introduire un helper de
repli participant→utilisateur (avec somme) et l'appliquer aux 8 critères.

## Affected modules
- `services/gateway/src/routes/admin/system-rankings.ts` — helper `foldParticipantCountsToUsers` + 8
  critères de `rankUsers`.
- `services/gateway/src/__tests__/unit/routes/admin/system-rankings.test.ts` — 3 tests neufs + 1 réécrit.
- Consommateurs (hérités, inchangés) : `apps/web/app/admin/ranking/page.tsx` → `useRankingData` →
  `adminService.getRankings()` → `GET /api/v1/admin/ranking`.

## Implementation phases
1. **Helper** — `foldParticipantCountsToUsers(fastify, Map<participantId, count>) → Map<userId, count>`
   (batch `participant.findMany`, somme par userId, repli `|| participantId` pour les orphelins). ✅
2. **Famille A** (messages_sent, reactions_given, mentions_received, files_shared, call_participations)
   — construire `Map<participantId, count>` depuis le `groupBy` (inchangé), fold, sortAndLimit,
   fetchUserDetails. ✅
3. **Famille B** (reactions_received, replies_received, mentions_sent) — insérer le fold entre
   `senderCounts` (participant-scope) et `sortAndLimit`. ✅
4. **Tests** — dedup `messages_sent` ; résolution + fold `reactions_received` ; réécriture
   `files_shared` orphelin null-userId. ✅
5. **Validation** — `bun run test:unit -- system-rankings.test.ts` : 114/114. ✅

## Dependencies
Aucune. Aucun changement de route/réponse.

## Estimated risks
Faible-modéré (8 blocs, 1 fichier). `groupBy` inchangé (orderBy/take préservés → tests d'inspection
`take` verts). Repli `|| participantId` préserve tests de repli existants + visibilité orphelins.

## Rollback strategy
Réversible par fichier (git revert). Aucun état persistant, aucune migration.

## Validation criteria
- [x] 109 tests existants préservés + 3 neufs + 1 réécrit = 114/114 (bun/jest).
- [x] Vue par défaut `messages_sent` : un utilisateur multi-participant → 1 ligne sommée.
- [x] `reactions_received`/`replies_received`/`mentions_sent` : résolvent vers un vrai user (plus « Unknown »).
- [x] Aucune référence morte ; helper partagé par les 8 critères.

## Completion status
**COMPLET.** Fix + tests + docs. Prêt à commit/push/PR.

## Progress tracking
- [x] Analyse (`2026-07-06-iteration-111-analyse.md`).
- [x] Plan (ce fichier).
- [x] Helper + réécriture 8 critères.
- [x] Tests (3 neufs + 1 réécrit).
- [x] `bun run test:unit` vert (114/114).
- [ ] Commit + push + PR.

## Future improvements
- **F83** (MEDIUM) : `AffiliateTrackingService.getAffiliateStats` — ventilation par statut ignore le
  filtre `tokenId`/`status` du total. PR ciblée séparée (itération suivante).
- **F82b** (LOW) : agréger pleinement avant `take` (top-N utilisateurs, pas top-N participants).
