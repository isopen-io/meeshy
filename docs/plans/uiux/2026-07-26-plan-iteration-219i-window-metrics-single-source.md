# Plan — Iteration 219i : SSOT des métriques de fenêtre

**Date** : 2026-07-26
**Branche** : `claude/quirky-curie-0u4lgr` (recréée depuis `origin/main` `ffef1339e`)
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-219i-window-metrics-single-source.md`

## Objectif

Étendre la source de vérité `DeviceLayout` posée par 218i de la **taille** de
fenêtre aux **insets** et à la **scène**, puis y converger les 11 surfaces qui
résolvaient encore la scène à la main — dont 5 par `connectedScenes.first`,
c'est-à-dire le premier élément d'un `Set` **non ordonné**.

## Étapes

- [x] Resync : `git checkout -B claude/quirky-curie-0u4lgr origin/main` (le
      commit précédent portait 216i, déjà mergée en #2325)
- [x] Essaim : `list_pull_requests` (open) → **0 PR** ⇒ 0 collision
- [x] Inventaire des lecteurs de métriques (`connectedScenes`, `UIScreen.main`)
      et tri en 3 familles : taille / insets / scène, plus les faux positifs
      (`CallManager`, cibles de décodage, commentaires)
- [x] **RED** : `WindowMetricsSingleSourceTests` → 27/39 assertions en échec
- [x] `DeviceLayout` : extraction de `activeWindow`, ajout de `safeAreaInsets`
      et `activeWindowScene` ; `windowSize` inchangé sémantiquement
- [x] Convergence des 11 surfaces (12 fichiers de production avec `DeviceLayout`)
- [x] **GREEN** : 42/42
- [x] Équilibre accolades/parenthèses/crochets des 13 fichiers au tokenizer
- [x] Analyse + plan + `branch-tracking.md`
- [x] Commit, push, PR

## Surfaces converties

| Fichier | Lisait | Lit désormais |
|---|---|---|
| `Core/DeviceLayout.swift` | — | **SSOT** : `activeWindow` + 3 accesseurs |
| `Views/StoryViewerView.swift` | copie privée ×2 | `windowSize` / `safeAreaInsets.bottom` |
| `Views/StoryViewerView+Content.swift` | `UIScreen.main`, `connectedScenes.first` | `windowSize.height`, `activeWindowScene` |
| `Views/ConversationView.swift` | `connectedScenes.first` | `safeAreaInsets.bottom` |
| `Views/ConversationListView.swift` | `UIScreen.main` ×2 | `windowSize.width` |
| `Views/ReelFeedCard.swift` | `UIScreen.main` | `windowSize.width` |
| `Views/AudioFullscreenView.swift` | `UIScreen.main` | `windowSize.height` |
| `Views/RootView.swift` | `connectedScenes.first` ×2 | `activeWindowScene` |
| `Views/VideoLegacySupport.swift` | `connectedScenes…first` | `activeWindowScene` |
| `Components/ComposerModels.swift` | copie privée | `windowSize.height` |
| `Components/RecentMediaStrip.swift` | `UIScreen.main` | `windowSize.width` |
| `Components/IslandEmergingBanner.swift` | traversée sans filtre | `safeAreaInsets.top` |

## Hors périmètre (assumé, tracé pour 220i+)

1. **Budget pixel de décodage** — `BubbleStandardLayout:568`,
   `ConversationMediaGalleryView:251`, `ImageDownsamplingConfig:50`. Mesure de
   mémoire, pas de layout ; baselines snapshot et clés de cache en jeu.
2. **Présentation UIKit de `StoryViewerView+Content.shareStory()`** — la scène
   est corrigée ici ; la migration `.sheet(item:)` + `ShareSheet` (doctrine
   215i/216i) demande de porter l'état dans `StoryViewerView.swift`.
3. **`CallManager:2903`** — correct par nature (question sur toutes les scènes),
   documenté dans le test pour ne pas être « convergé » par erreur.
