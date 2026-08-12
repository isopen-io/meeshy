# Iteration 69 — Plan d'implémentation (2026-07-01)

## Objectif
Établir une **source unique** de validation d'ObjectId MongoDB côté web, éliminant la regex
`/^[0-9a-fA-F]{24}$/` réimplémentée en ligne. Changement **purement mécanique**, comportement préservé, CI
garantie verte (cible vérifiable localement).

## Phases

### Phase 1 — Source unique ✅
- [x] Créer `apps/web/utils/object-id.ts` :
  - `OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/`
  - `isValidObjectId(id: string): boolean` (garde `typeof === 'string'`, `false` sans lever pour non-chaîne)

### Phase 2 — Convergence des consommateurs ✅
- [x] `conversation-id-utils.ts` : déléguer `isValidObjectId` à la source unique (import + re-export), API publique inchangée
- [x] `link-identifier.ts` : remplacer les 3 `.test()` bruts d'ObjectId par `isValidObjectId(...)`
- [x] Conserver le regex composé `linkId` (`/^[0-9a-fA-F]{24}\.[0-9]+_[a-z0-9]+$/`, motif distinct)

### Phase 3 — Tests & vérification ✅
- [x] Nouveau `__tests__/utils/object-id.test.ts` (4 tests : valides, invalides, non-chaîne, regex)
- [x] `tsc --noEmit` : 1198 = 1198 (0 régression)
- [x] `jest` sur les 3 suites impactées : 112/112 verts
- [x] `next lint` : exit 0

### Phase 4 — Livraison ✅
- [x] Commit + push sur `claude/sharp-wozniak-8grkp8`
- [x] PR + merge dans `main` (CI verte)

## Backlog reporté
- **F32** : SSOT ObjectId gateway (~25 sites) — lot dédié (non vérifiable local à cause de Prisma).
- **F31 / F25b** : collisions de noms / modules à sémantiques divergentes — ne pas fusionner mécaniquement.

## Résultat
Littéral ObjectId nu applicatif : 5 → 1. `isValidObjectId` : 1 seule implémentation. Continuité assurée pour
l'itération 70 (prochaine cible candidate : F32 gateway si l'environnement Prisma redevient disponible, sinon
un cluster web/shared vérifiable).
