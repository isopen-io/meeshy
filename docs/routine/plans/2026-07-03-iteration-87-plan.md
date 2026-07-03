# Iteration 87 — Plan d'implémentation (2026-07-03)

## Objectifs
Corriger deux défauts de correction backend/shared, haute confiance, indépendants des PR ouvertes
(#1388/#1389/#1390, surfaces iOS/web disjointes), tous deux instances du motif **sibling-drift** :
1. **87-A** — `getReels` : curseur de pagination pris sur l'ordre de score → réels sautés/re-servis
   en scroll infini. Aligner sur l'invariant lossless documenté du sibling `getFeed`.
2. **87-B** — `languageCodeSchema` (attachment-validators) rejette les codes ISO 639-3 supportés →
   transcriptions/traductions `bas`/`ksf`/`nnh`/`dua`/`ewo` rejetées au trust boundary. Élargir le
   regex, homogène avec le fix 86-B de `CommonSchemas.language`.

## Modules affectés
- `services/gateway/src/services/PostFeedService.ts` (`getReels`) — 87-A
- `services/gateway/src/__tests__/unit/services/PostFeedService.test.ts` — tests 87-A
- `packages/shared/utils/attachment-validators.ts` (`languageCodeSchema`) — 87-B
- `packages/shared/__tests__/attachment-validators.test.ts` — test 87-B

## Phases d'implémentation
1. **87-A fix** : `getReels` — `candidatePoolSize = limit + 1` ; `hasMore/page/oldest/nextCursor`
   calculés sur la fenêtre chronologique avant scoring ; scoring d'affinité sur la `page` seulement
   (réordonne l'affichage). ✅
2. **87-A tests** : 3 régressions neuves (curseur = chrono-oldest ≠ score-last ; `take === limit+1` ;
   `hasMore:false`+cursor null sur page unique) + recadrage du test préexistant `limit×4` (encodait
   le bug) sur `take === 6`. ✅
3. **87-B fix** : regex `[a-zA-Z]{2}` → `[a-zA-Z]{2,3}` + JSDoc documentant les 5 codes 639-3. ✅
4. **87-B test** : cas `639-3 ×5` ajouté à la suite `languageCodeSchema` existante. ✅
5. **Homogénéité** : grep confirmant aucun autre sibling `[a-zA-Z]{2}` résiduel (86-B + 87-B couvrent
   les 2 schémas de langue). ✅

## Dépendances
Aucune. Fixes localisés, pas de migration de schéma Prisma, pas de changement de signature publique.

## Risques estimés
FAIBLE (voir Risk assessment 87-A/87-B). Le fix 87-A adopte un invariant déjà validé en prod sur
`getFeed` ; 87-B ne fait qu'élargir l'acceptation (aucun input valide existant cassé).

## Stratégie de rollback
`git revert` du commit unique. Aucun état persistant modifié.

## Critères de validation
- [x] `vitest attachment-validators.test.ts` → 36/36
- [x] `jest PostFeedService.test.ts` → 35/35
- [x] `jest PostFeedService|posts-engagement-feed|reelAffinity` → 88/88, 0 régression
- [x] `bun run build` (shared) → 0 erreur

## Statut de complétion
**COMPLET** — les deux cibles livrées + testées + validées.

## Suivi de progression
- 87-A : ✅ livré (fix + 3 tests neufs + 1 recadré)
- 87-B : ✅ livré (fix + 1 test neuf)

## Améliorations futures
- Le retrieval Reels reste chronologique (fondation) : quand un moteur de reco/embeddings remplacera
  `reelAffinityScore`, il devra préserver le contrat de curseur opaque (createdAt+id) — la pagination
  lossless est désormais garantie par la fenêtre `limit+1` comme `getFeed`.
- Audit périodique recommandé : tout nouveau schéma de code langue doit accepter les 639-3
  (`bas/ksf/nnh/dua/ewo`) — 2 schémas corrigés (86-B `CommonSchemas.language`, 87-B
  `languageCodeSchema`) ; vérifier qu'aucun 3e ne réintroduit `[a-zA-Z]{2}`.
