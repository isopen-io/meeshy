# Plan — Iteration-176i — BlockedTab empty-state → `EmptyStateView`

**Date**: 2026-07-20
**Branche**: `claude/laughing-thompson-755kz7` (repartie de `origin/main` @ `ee34b79`)
**Fichier**: `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift` (1 fichier)

## Objectif

Unifier l'état vide de `BlockedTab` (onglet contacts) avec celui de son écran
jumeau `BlockedUsersView` en réutilisant le primitive design-system
`EmptyStateView` — cohérence visuelle, guidage utilisateur (sous-titre),
VoiceOver groupé, apparition animée, icône accent.

## Étapes

1. [x] Sync : `git checkout -B claude/laughing-thompson-755kz7 origin/main`.
2. [x] Repérage : `BlockedTab.emptyState` = `VStack` custom ; `BlockedUsersView`
   utilise déjà `EmptyStateView`. Confirmer signature `EmptyStateView(icon:
   title:subtitle:)` et import `MeeshyUI` présent.
3. [x] Remplacer `emptyState` par `EmptyStateView` (icône
   `person.crop.circle.badge.checkmark`, titre = clé existante
   `contacts.blocked.empty`, sous-titre neuf `contacts.blocked.empty.subtitle`).
4. [x] Vérifier : `theme` toujours utilisé (`blockedRow`), aucun test n'assère
   l'ancien état vide, aucune référence à `hand.raised.slash` dans les suites.
5. [x] Docs analyse + plan.
6. [ ] Commit + push branche.

## Risques & mitigations

- **String catalog** : `contacts.blocked.empty.subtitle` est une clé neuve
  inline avec `defaultValue` — convention du repo (toutes les clés
  `*.empty.subtitle` existantes fonctionnent ainsi, aucune n'est pré-inscrite
  dans `Localizable.xcstrings`). Auto-extraite au build CI. Pas d'édition
  manuelle du catalog.
- **Layout** : `EmptyStateView` remplit `maxWidth/maxHeight: .infinity` avec
  Spacers internes → centré dans l'onglet, équivalent au `VStack` custom.
- **Régression tests** : nulle — état interne de vue non testé, `EmptyStateView`
  déjà couvert par les consommateurs existants.

## Verification finale

- Gate CI `iOS Tests`.
- Self-review Codex quality gate.
