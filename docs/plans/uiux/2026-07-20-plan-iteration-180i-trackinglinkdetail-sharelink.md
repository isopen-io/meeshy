# Plan — Iteration 180i — `TrackingLinkDetailView` ShareLink natif

**Date** : 2026-07-20
**Branche de travail** : `claude/laughing-thompson-jxv4l9`
**Base** : `main` HEAD `05491cc`

## Objectif

Remplacer le partage d'URL fait main (`UIActivityViewController` + `presentVC`) par
`ShareLink` natif dans `TrackingLinkDetailView`, sans changement visuel ni de logique.

## Étapes

1. [x] Extraire `actionButtonLabel(_:icon:color:)` (visuel commun des tuiles d'action).
2. [x] Réécrire `detailActionButton` pour consommer `actionButtonLabel`.
3. [x] Ajouter `shareActionButton` (`ShareLink(item: URL)` + fallback `String`).
4. [x] Remplacer l'appel du bouton Partager par `shareActionButton` dans `actionsBar`.
5. [x] Conserver `presentVC` + QR share manuel (image générée à la volée).
6. [x] Analyse : `docs/analyses/uiux/2026-07-20-iteration-180i-trackinglinkdetail-sharelink.md`.
7. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes respectées

- 1 fichier, 0 logique, 0 clé i18n neuve, 0 test (view-structure), 0 contention.
- `ShareLink` iOS 16.0+ = plancher app → pas d'`@available`.
- Parité visuelle via `.frame(maxWidth: .infinity)` sur le label partagé.

## Vérification

- CI `iOS Tests` (compile + run simu 18.2).
