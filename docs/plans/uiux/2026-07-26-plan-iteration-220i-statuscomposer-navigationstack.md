# Plan — Iteration 220i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
**Axes** : intégration plateforme native (HIG) + accessibilité
**Base** : `main` HEAD `ffef1339e`
**Branche** : `claude/quirky-curie-2pvzn1`

## Pourquoi cette surface

Piste (d) du pointeur 219i, désormais débloquée : la PR #2275 qui détenait
`StatusComposerView` est **mergée**, et `list_pull_requests` (open) renvoie
**0 PR** → aucune collision d'essaim possible.

## Objectifs

1. **Migrer le dernier `NavigationView` de l'app** vers `NavigationStack`
   (`StatusComposerView` est l'unique fichier restant des 3 cibles balayées) et
   **réduire l'attendu de `NavigationContainerMigrationTests` à l'ensemble
   vide** — la migration entamée en 214i devient un invariant.
2. **Rendre le bouton « Publier » accessible pendant sa propre action** : son
   libellé bascule sur un `ProgressView` nu quand `isPublishing`, ce qui laisse
   le bouton **sans nom accessible** au moment exact où il travaille.

## Étapes

1. `NavigationView {` → `NavigationStack {` (1 mot-clé ; vérifier l'absence de
   `NavigationLink` / `navigationDestination` / `navigationViewStyle`).
2. `publishToolbarButton` : `.accessibilityLabel` fixe + `.accessibilityValue`
   (état en cours) + `.accessibilityHint` (raison du désactivé), miroir strict de
   `CreateTrackingLinkView.createButton`.
3. 2 clés a11y neuves, **traduites dans les 7 locales** du catalogue.
4. Tests : nouvelle suite `StatusComposerAccessibilityTests` + resserrage de
   `NavigationContainerMigrationTests`.
5. Vérification déterministe hors Xcode (Linux, pas de toolchain Swift), gate
   réel = CI `iOS Tests`.

## Non-objectifs

- Aucun changement visuel, de logique, de réseau ou de layout.
- Les 5 `NavigationView` de `packages/MeeshySDK/Sources/MeeshyUI/` restent
  **hors périmètre** (routine iOS-app uniquement).
- Les 6 clés `status.composer.*` absentes du catalogue relèvent d'un arriéré
  systémique (1 724 clés sur 2 586) → itération dédiée, pas un glissement.
