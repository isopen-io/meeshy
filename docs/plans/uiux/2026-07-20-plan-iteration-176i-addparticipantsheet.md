# Plan Iteration-176i — `AddParticipantSheet` états vides natifs

**Date** : 2026-07-20
**Branche** : `claude/laughing-thompson-ll8dab`
**Base** : `main` HEAD (`9c27504`)
**Fichier cible** : `apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift`

## Objectif

Remplacer les 2 états vides custom (`searchPrompt`, `emptyResults`) par le composant
design-system natif `AdaptiveContentUnavailableView`, en réutilisant les clés i18n existantes.

## Étapes

1. [x] Analyser `AddParticipantSheet` (états vides custom identifiés).
2. [x] Vérifier l'API + précédents de `AdaptiveContentUnavailableView` (FeedView, StarredMessagesView/175i).
3. [x] Remplacer `searchPrompt` → `AdaptiveContentUnavailableView("participants.add.prompt", systemImage: "person.badge.plus")` + `.padding(.top, 40)`.
4. [x] Remplacer `emptyResults` → `AdaptiveContentUnavailableView("participants.add.no-results", systemImage: "person.slash")` + `.padding(.top, 40)`.
5. [x] Mettre à jour `branch-tracking.md` (pointeur 176i + ligne).
6. [x] Commit + push + PR.

## Contraintes

- 0 clé i18n neuve (réutiliser `participants.add.prompt` / `participants.add.no-results`).
- 0 changement de logique / réseau / test.
- Chrome `xmark` figé inchangé.
- Gate : CI `iOS Tests`.
