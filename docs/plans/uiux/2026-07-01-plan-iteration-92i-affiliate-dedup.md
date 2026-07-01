# Plan itération 92i — Fix artefact de merge `AffiliateView`

**Base** : `main` HEAD (`8aea0e4e`)
**Branche** : `claude/upbeat-euler-f80iih`
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`

## Objectif
Supprimer le `.accessibilityElement(children: .combine)` dupliqué sur `affiliateStatCard`,
artefact du merge simultané de 91i (#1234) et d'une itération parallèle sur le même fichier.

## Étapes
1. [x] Confirmer que le doublon est bien committé dans `main` (working tree propre = origin/main).
2. [x] Supprimer l'occurrence interne (avant `.background`), garder l'unique après `.background`.
3. [x] Scanner le fichier pour tout autre modificateur d'accessibilité dupliqué (0 résiduel).
4. [x] Rédiger analyse + plan + mettre à jour `branch-tracking.md`.
5. [ ] Commit, push, PR, CI `iOS Tests` verte, merger dans `main`, resync branche.

## Garde-fous
- 1 ligne supprimée, 0 logique, 0 clé i18n, 0 test neuf.
- Gate = CI `iOS Tests`.
