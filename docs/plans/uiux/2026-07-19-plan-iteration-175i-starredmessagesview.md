# Plan — Iteration-175i — StarredMessagesView empty-state → `AdaptiveContentUnavailableView`

- **Last synchronized commit**: `fff57e8` (origin/main)
- **Source branch**: `main`
- **Working branch**: `claude/laughing-thompson-zz7wzb`
- **Iteration**: 175i (strictly > highest in-flight iOS iteration 174i / PR #2062)
- **Synchronization status**: rebased fresh from `origin/main` HEAD `fff57e8`

## Objectif

Remplacer l'état vide custom (`VStack` + icône `.system(size: 56)` + 2 `Text`)
de `StarredMessagesView` par le composant design-system natif
`AdaptiveContentUnavailableView` (`ContentUnavailableView` iOS 17+, fallback
fidèle iOS 16), déjà adopté par `FeedView` et `CreateShareLinkView`.

## Étapes

1. [x] Sync branche depuis `origin/main`.
2. [x] Analyse `docs/analyses/uiux/2026-07-19-iteration-175i-starredmessagesview.md`.
3. [x] Remplacer `emptyState` par `AdaptiveContentUnavailableView` en réutilisant
   les clés i18n existantes (`starred.messages.empty.title` / `.subtitle`).
4. [x] Vérifier : 0 `.system(size:)` restant, `theme` / `MeeshyColors` toujours
   utilisés (pas de warning unused).
5. [ ] Commit + push.
6. [ ] Ouvrir PR (gate = CI `iOS Tests`).

## Portée

- **1 fichier** : `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`.
- 0 logique, 0 réseau, **0 clé i18n neuve** (réutilise l'existant), 0 test neuf.
- `StarredRow` et toute la navigation/store **inchangés**.

## Risque

- Nul : composant déjà en prod (FeedView/CreateShareLinkView), import `MeeshyUI`
  déjà présent, clés i18n préexistantes, aucun test n'assère le `VStack` interne.
