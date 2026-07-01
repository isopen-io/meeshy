# Plan — Iteration 78i (2026-07-01) — iOS

## Objectif
Rendre `LinkPreviewCard` (aperçu OpenGraph sous les bulles de message) conforme Dynamic Type
en remplaçant ses tailles de police figées par des styles relatifs scalables. Surface fraîche,
auto-portée, orthogonale aux PR iOS 71i–77i en vol.

## Base de départ
- Branche : `claude/upbeat-euler-l93ziq` resynchronisée sur `main` HEAD (`e17d494`).
- Dernier iOS mergé constaté sur `main` : **77i** (#1162, SharePickerView i18n).

## Étapes
1. [x] Choisir une surface iOS fraîche (exploration agent) → `LinkPreviewCard` (#1 rank,
       auto-porté, défaut Dynamic Type clair, sans cap de largeur dur).
2. [x] Remplacer les 9 `.font(.system(size:))` par `MeeshyFont.relative(size:, weight:)`
       (poids/design préservés). Vignette 72×72 et minHeight 64 laissés intacts.
3. [x] Vérifier : 0 `.system(size:` restant, 9 `MeeshyFont.relative`.
4. [ ] Commit + push sur `claude/upbeat-euler-l93ziq`.
5. [ ] Ouvrir PR, attendre CI `ios-tests.yml` verte.
6. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1 + tests simulateur 18.2). Pas de test neuf : swap
mécanique, `MeeshyFont.relative` déjà couvert (SDK `Accessibility` + usage app `ConversationInfoSheet`).

## Risque
Faible. Aucun cap de largeur → le scaling ne casse pas le layout (texte wrappe/tronque,
carte grandit via `minHeight`). Aucun changement de couleur/logique.
