# Plan — Iteration 178i — ShareLinksView

**Date** : 2026-07-20
**Branche** : `claude/laughing-thompson-nbspy1`
**Base** : `main` HEAD `d5038c5`
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift`

## Objectif

Deux correctifs UI/UX auto-contenus, sans changement de logique :
1. Dédupliquer l'état vide fait-main vers le composant design-system
   `EmptyStateView` (HIG, cohérence, animation, moins de code).
2. Rendre le titre d'en-tête atteignable via le rotor « En-têtes » VoiceOver
   (`.accessibilityAddTraits(.isHeader)`), comme tous les écrans frères.

## Étapes

- [x] Resync branche depuis `main` HEAD (175i mergée #2064 supprimée).
- [x] Vérifier `ShareLinksView` non réclamé par un PR en vol (≠ `ShareLinkDetailView` #2040).
- [x] Confirmer la signature `EmptyStateView(icon:title:subtitle:accentColor:compact:)` et les tokens `MeeshyColors.shareAccent(Hex)`.
- [x] Confirmer le pattern `.isHeader` sur les 5 écrans frères.
- [x] Fix A : remplacer `emptyState` par `EmptyStateView(..., compact: true)` en réutilisant les clés i18n existantes.
- [x] Fix B : ajouter `.accessibilityAddTraits(.isHeader)` au titre d'en-tête.
- [x] Vérifier équilibre accolades + absence de référence morte.
- [ ] Commit + push + PR 178i.
- [ ] Gate : CI `iOS Tests` (build iOS non runnable en local Linux).

## Contraintes respectées

- 1 fichier, 0 logique, 0 clé i18n neuve, 0 test neuf.
- Accent de marque préservé (`shareAccentHex`).
- Rangées / stats / navigation / ViewModel inchangés.

## Suite (179i+)

Dédup empty-state sur `CommunityLinksView` et `TrackingLinksView`
(mêmes réimplémentations manuelles), sous réserve de collision essaim.
