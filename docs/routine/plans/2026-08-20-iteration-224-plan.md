# Plan d'implémentation — Iteration 224

## Objectifs
Garder par CI l'invariant « les tables de réduction de langue TS et Swift sont identiques », qui ne
tenait jusqu'ici que par une consigne en commentaire. Zéro changement de comportement de production.

## Modules affectés
- `packages/shared/utils/language-normalize.ts` — export de `ISO_639_3_TO_1` et `LEGACY_ISO_639_1`.
- `packages/shared/__tests__/language-normalize-swift-parity.test.ts` — nouveau garde de parité.
- (lecture seule) `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` — source du miroir.

## Phases d'implémentation
1. **RED possible** — exporter les tables TS, écrire le garde qui parse les dictionnaires Swift nommés
   et compare en égalité stricte. Prouver qu'il tombe sous une divergence d'un seul côté. ✅
2. **GREEN** — les tables étant déjà synchrones, le garde passe. Contre-épreuve de taille intégrée. ✅
3. **Non-régression** — suite shared complète + build tsc. ✅

## Dépendances
Aucune. Vitest + `fs`/`path` (déjà utilisés par `password-min-length-parity.test.ts`).

## Risques estimés
Très faibles. Seul diff de prod : deux `export`. Risque de fragilité du parseur regex mitigé par
l'ancrage sur le nom de déclaration Swift et la contre-épreuve de taille (une extraction cassée lève
ou échoue au lieu de passer à vide).

## Stratégie de rollback
Retirer le fichier de test et les deux `export` — aucun consommateur runtime des symboles exportés.

## Critères de validation
- RED prouvé par perturbation (`tgl: 'tl'` ajouté au seul TS → échec ciblé), puis reverté.
- GREEN : 2/2 nouvelle suite ; 146 verts sur les suites de langue/résolution ; 2297/2297 shared ;
  `tsc` exit 0.

## Statut de complétion
✅ Terminé.

## Suivi de progression
- [x] Export des tables TS
- [x] Garde de parité écrit + RED prouvé + reverté
- [x] GREEN + non-régression (2297/2297) + build
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures
Voir « Future Considerations » de l'analyse : parité du set de codes supportés TS↔Swift, miroir Kotlin,
et un helper `assertSwiftStringMapEquals` pour généraliser le patron aux futures tables jumelles.
