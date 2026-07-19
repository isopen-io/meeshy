# Plan — Itération 167i : `BookmarksView` (état vide natif)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`efedb69e4`) ·
**Branche** : `claude/laughing-thompson-6l6vkb` · **Gate** : CI `iOS Tests`

## Objectif

Remplacer l'état vide fait main de `BookmarksView` par le composant natif
`ContentUnavailableView` (via l'atome de compat SDK `AdaptiveContentUnavailableView`), pour
gagner Dynamic Type complet + regroupement VoiceOver natif + couleurs sémantiques, tout en
réutilisant le design system et les clés i18n existantes — sans toucher la logique ni le rendu
des cartes.

## Étapes

1. [x] Sélection surface fraîche sans contention (0 PR ouverte touchant `BookmarksView` ;
   croisé via `list_pull_requests`). Numéro 167i > 166i en vol.
2. [x] `emptyState` : `VStack` hand-rolled → `AdaptiveContentUnavailableView(title, systemImage:
   "bookmark", description:)`.
3. [x] Réutiliser les clés `bookmarks.empty.title` / `bookmarks.empty.subtitle` existantes
   (0 clé neuve).
4. [x] `import MeeshyUI` explicite (parité `FeedView` / 165i).
5. [x] Conserver `.padding(.top, 80)` (offset vertical inchangé).
6. [x] Docs analyse + plan.
7. [ ] Commit, push, PR, gate CI `iOS Tests`.

## Non-régression

- 1 fichier Swift, 0 clé i18n, 0 logique, 0 test neuf, 0 mutation d'état.
- `theme` toujours utilisé (`backgroundGradient`) → injection inchangée.
- Chargement (`ProgressView`), pagination, `fullScreenCover` story : intacts.

## Statut

**TERMINÉE (dev)** — reste push + PR + CI.
