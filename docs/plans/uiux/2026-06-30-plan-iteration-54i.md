# Plan — Iteration 54i (2026-06-30)

## Objectif
Accessibilité Dynamic Type : migrer la plus grosse surface iOS encore figée,
`ConversationInfoSheet` (fiche d'information de conversation), des `.font(.system(size:))`
codées en dur vers l'atome SDK `MeeshyFont.relative(...)`. Poursuite de 53i (`GlobalSearchView`).

## Périmètre
- **1 fichier** : `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`.
- iOS exclusivement (suffixe `i`). Aucune dépendance web/Android.

## Étapes
1. [x] Resync branche de travail sur `main` HEAD (53i déjà mergée → main `0d3498b`).
2. [x] Inventaire : 52 `.font(.system(size:))` figés, 0 `MeeshyFont.relative`.
3. [x] Swap mécanique 1:1 `.system(size: N, …)` → `MeeshyFont.relative(N, …)` (51 sites).
4. [x] Exception documentée inline : badge numérique de comptage d'onglet (`size:10`) gardé
       figé (pill compacte) — même classe que les exceptions 53i.
5. [x] Vérifs statiques : 51 `MeeshyFont.relative`, 1 figé restant, aucun double-paren,
       atome `MeeshyFont` exposé par MeeshyUI (déjà importé).
6. [x] Rédiger analyse `2026-06-30-iteration-54i.md` + ce plan.
7. [ ] Commit + push sur la branche assignée.
8. [ ] PR → attendre CI `iOS Tests` verte → merge dans `main`.
9. [ ] Mettre à jour `branch-tracking.md` (53i mergée, pointeur 54i, base 55i = main HEAD).
10. [ ] Supprimer la branche après merge.

## Vérification
- CI `ios-tests.yml` : compile Xcode 26.1.x (XcodeGen regen) + tests simulateur 18.2.
- Aucun changement de comportement attendu : swaps police uniquement, layout/couleur/a11y
  labels inchangés.

## Risques / mitigations
- Risque : régression visuelle si une taille mappe vers un TextStyle inattendu. Mitigation :
  mapping identique à 53i/`textStyle(for:)`, déjà éprouvé en prod sur d'autres surfaces.
- Risque : overflow d'un badge compact. Mitigation : seul badge numérique en pastille gardé figé.
