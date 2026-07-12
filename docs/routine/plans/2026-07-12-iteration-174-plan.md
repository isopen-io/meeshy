# Plan Iteration 174 — Unification casse de résolution de langue (`getTranslationFromJSON`)

## Objectifs
Rendre `getTranslationFromJSON` insensible à la casse, cohérent avec
`transformTranslationsToArray`, sans altérer le fast path exact-match.

## Modules affectés
- `services/gateway/src/utils/translation-transformer.ts` (production)
- `services/gateway/src/__tests__/unit/utils/translation-transformer.test.ts` (tests)

## Phases d'implémentation
1. **RED** — 4 tests ajoutés au bloc `getTranslationFromJSON` :
   clé stockée majuscule, langue demandée majuscule, variante régionale
   `pt-BR`/`pt-br`, et invariant « exact-case privilégié sur sibling ».
2. **GREEN** — accès direct puis repli `Object.entries().find(toLowerCase)`.
   Garde `undefined` si aucun match. JSDoc mise à jour.
3. **REFACTOR** — early-return `if (!translations)`, expression unique `??`,
   pas de mutation (conforme code style CLAUDE.md).

## Dépendances
Aucune (fonction pure, pas de Prisma/Redis/ZMQ).

## Risques estimés
Très faibles. Le seul changement de comportement observable est l'élargissement
des correspondances trouvées ; aucun appelant production existant.

## Stratégie de rollback
Revert du commit unique (`git revert`). Fonction pure sans état ni migration.

## Critères de validation
- [x] 26/26 tests verts sur le fichier ciblé.
- [x] RED prouvé (3 échecs sur code d'origine).
- [x] `tsc --noEmit` sans erreur sur le fichier.

## Statut de complétion
**Terminé.**

## Suivi de progression
- [x] Analyse rédigée
- [x] Tests RED
- [x] Correctif GREEN
- [x] Validation
- [x] Docs analyse + plan

## Améliorations futures
- Envisager d'exposer une fonction commune de normalisation de langue partagée
  entre `transformTranslationsToArray` et `getTranslationFromJSON` si un 3e
  consommateur apparaît (éviter la duplication du `toLowerCase`).
- F69 (`sanitizeFileName` overlong sans extension) reste candidat LOW.
