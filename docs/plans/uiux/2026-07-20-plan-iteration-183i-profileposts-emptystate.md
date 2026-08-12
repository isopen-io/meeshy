# Plan — Iteration 183i

**Surface** : `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`
**Type** : design-system dedup + i18n + VoiceOver
**Branche** : `claude/laughing-thompson-8vaq6w` (base `main` HEAD `64f943d`)

## Objectif

Dédupliquer l'état vide fait-main de la liste de publications de profil vers le
composant partagé `EmptyStateView`, en profitant pour ajouter un sous-titre de
guidage localisé (5 langues) et un label VoiceOver combiné.

## Étapes

- [x] Localiser l'empty-state bespoke (`VStack` icône+titre, l.222).
- [x] Confirmer le précédent in-scroll `compact: true` (`ShareLinksView` 178i).
- [x] Remplacer le `VStack` par `EmptyStateView(icon:title:subtitle:compact:)`,
      en réutilisant la clé `profile.posts.empty`.
- [x] Ajouter `profile.posts.empty.subtitle` à `Localizable.xcstrings` (de/en/es/
      fr/pt-BR — parité avec la clé sœur).
- [x] Vérifier que `theme` reste référencé (via `isDark`) → pas de warning.
- [x] Valider le JSON `.xcstrings`.
- [x] Rédiger l'analyse (`docs/analyses/uiux/2026-07-20-iteration-183i.md`).
- [ ] Commit + push + PR.

## Non-objectifs

- Pas de changement de logique de chargement / cache / actions.
- Pas de refonte visuelle de la liste (cards inchangées).
