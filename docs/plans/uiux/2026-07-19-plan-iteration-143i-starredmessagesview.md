# Plan — Itération 143i : `StarredMessagesView` état vide → composant natif

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4`
**Branche** : `claude/laughing-thompson-rrt0o4` · **Gate** : CI `iOS Tests`

## Objectif

Remplacer l'état vide hand-rollé de `StarredMessagesView` par le composant design-system natif-first
`AdaptiveContentUnavailableView` (rend `ContentUnavailableView` d'Apple sur iOS 17+, fallback fidèle iOS 16),
déjà utilisé par `FeedView` et `CreateShareLinkView`.

## Motivation (mission)

- « Use native system components whenever possible. »
- « Minimize custom implementations when an Apple component already solves the problem. »
- « Continuously improve and consolidate the design system. Reduce duplicated UI. »
- « The UI must automatically adapt to every supported iOS version » (fallback iOS 16 intégré au wrapper).

## Étapes

1. [x] Sync branche depuis `main` HEAD (`efedb69e4`).
2. [x] Identifier le composant natif existant (`AdaptiveContentUnavailableView`) et ses usages (FeedView,
       CreateShareLinkView).
3. [x] Remplacer le `VStack` de `emptyState` par `AdaptiveContentUnavailableView(title, systemImage:,
       description:)` en réutilisant les clés i18n existantes et l'icône `star.circle`.
4. [x] Vérifier imports (`MeeshyUI` déjà présent, `MeeshyFont`/`MeeshyColors` toujours utilisés dans
       `StarredRow`) et non-régression du chemin peuplé.
5. [x] Rédiger analyse + plan + mise à jour du tracking.
6. [ ] Commit + push branche → CI `iOS Tests`.

## Contraintes

- 1 fichier, 0 logique, 0 clé i18n neuve, 0 test neuf.
- Ne pas toucher `StarredRow`, `StarredMessagesStore`, la navigation, la toolbar, le contextMenu.
- Build local impossible (toolchain Swift/Xcode absente sur l'environnement Linux) → validation par CI macOS.

## Vérification

- Inspection : signature `AdaptiveContentUnavailableView(_:systemImage:description:)` respectée.
- Chemin peuplé inchangé (seule la branche `store.snapshots.isEmpty` est modifiée).
- Aucun test ne référence la vue → pas de régression de suite.
