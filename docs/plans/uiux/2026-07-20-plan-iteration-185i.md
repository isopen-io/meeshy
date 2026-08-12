# Plan — Iteration 185i

**Objectif** : aligner l'état vide de `FriendRequestListView` sur le composant
design-system natif `AdaptiveContentUnavailableView` (HIG + Dynamic Type + dédup).

## Étapes

1. [x] Resync : `git checkout -B claude/laughing-thompson-2id4mx origin/main`
   (branche 176i déjà mergée #2097).
2. [x] Vérifier collision essaim (`list_pull_requests`) → `FriendRequestListView`
   absent de toute PR ouverte (165i→184i).
3. [x] Remplacer le `VStack` custom de `emptyState` par
   `AdaptiveContentUnavailableView(title, systemImage: "person.2.slash", description:)`,
   clés i18n réutilisées, `.frame(maxWidth/maxHeight: .infinity)` pour le centrage.
4. [x] Analyse : `docs/analyses/uiux/2026-07-20-iteration-185i.md`.
5. [x] Tracking : pointeur autoritaire 185i.
6. [ ] Commit + push `-u origin claude/laughing-thompson-2id4mx`.

## Contraintes respectées

- 1 fichier de prod, 0 logique / 0 réseau / 0 clé i18n neuve / 0 test neuf.
- Composant SDK `public` déjà importé — aucune nouvelle dépendance.
- Gate = CI « iOS Tests » (toolchain absente localement).
