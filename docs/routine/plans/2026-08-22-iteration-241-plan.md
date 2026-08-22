# Plan d'implémentation — Iteration 241

## Objectifs
Corriger la pagination par curseur en mémoire de `loadMostActiveParticipants`
(`GET /conversations/:id/participants`, régime restreint) : un curseur absent de la liste recalculée
(`findIndex → -1`, `startIndex = 0`) redémarrait à la page 1 — lignes dupliquées, défilement infini
qui ne se termine jamais. Faire de la terminaison-sur-curseur-périmé un invariant explicite,
gardé par une fonction pure source unique.

## Modules affectés
- `services/gateway/src/utils/pagination.ts` (source — nouvelle fonction `sliceByIdCursor`).
- `services/gateway/src/routes/conversations/participants.ts` (consomme la fonction ; retire le bloc
  `findIndex + 1` fautif).
- `services/gateway/src/__tests__/unit/utils/pagination.test.ts` (7 cas de garde).

## Phases d'implémentation
1. **RED** — importer `sliceByIdCursor` (inexistant) dans `pagination.test.ts` + 7 cas dont la
   terminaison sur curseur périmé. Confirmé ROUGE (TS2305 : membre non exporté).
2. **GREEN** — ajouter `sliceByIdCursor<T extends { id: string }>` à `pagination.ts` : `findIndex`
   séparé de l'offset, un `foundIndex < 0` (curseur périmé) donne `startIndex = items.length` (page
   vide, `hasMore=false`, `nextCursor=null`) ; le cas valide reproduit le comportement d'origine à
   l'identique. Confirmé VERT (16/16).
3. **REFACTOR** — brancher `loadMostActiveParticipants` sur la fonction (import + remplacement du bloc
   par `const { page, hasMore, nextCursor } = sliceByIdCursor(filtered, cursor, pageLimit)`).

## Dépendances
Aucune. Ajout d'un export pur + un import interne au gateway. Aucun changement de contrat réseau, de
schéma de réponse, d'API ou de comportement de la route pour un curseur VALIDE.

## Risques estimés
Négligeable. Les consommateurs existants de `pagination.ts` ne voient qu'un export supplémentaire.
Le régime non restreint (curseur keyset Prisma) est inchangé. Le seul changement observable est la
correction : un curseur périmé termine au lieu de redémarrer.

## Stratégie de rollback
Revert du commit unique. Zéro migration, zéro état persistant modifié.

## Critères de validation
- [x] RED : `pagination.test.ts` ROUGE avant `sliceByIdCursor` (TS2305).
- [x] GREEN : 16/16 dans `pagination.test.ts` (7 nouveaux cas).
- [x] Non-régression : `participants.test.ts` 110/110 ; `conversation*` 66 suites / 1379 tests verts.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut de complétion
- **Implémenté et validé localement.** En attente CI.

## Suivi de progression
- Fonction `sliceByIdCursor` posée en SSOT dans `pagination.ts`, `loadMostActiveParticipants`
  branchée dessus, bloc fautif retiré, 7 cas de garde ajoutés, `tsc` propre, suites vertes, docs
  écrites, commit + push branche.

## Améliorations futures (hors périmètre de cette itération)
- **`normalizeMessage` self-OR sur `senderId`** (`packages/shared/types/migration-utils.ts:201`) —
  repli mort ; arbitrage nécessaire sur le champ de repli visé ; aucun test sur `migration-utils.ts`.
- **`truncateText` trime le blanc de tête** (`apps/web/utils/truncate.ts:82`) — déviation de
  contrat (docstring : fin seulement) ; `.replace(/\s+$/, '')`.
