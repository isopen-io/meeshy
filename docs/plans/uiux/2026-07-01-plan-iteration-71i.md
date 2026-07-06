# Plan — Iteration 71i (2026-07-01) — iOS

## Objectif
Accessibilité Dynamic Type de `ConversationDashboardView` (tableau de bord analytique d'une
conversation). Un seul fichier de production, sans nouveau test (conversion structurelle 1:1),
sans collision avec les PR web en vol. Épuré, borné, doctrine 53i/54i/55i.

## Changements

### 1. Dynamic Type — 37 conversions
`apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift`
- `.font(.system(size: N, weight:, design:))` → `.font(MeeshyFont.relative(N, weight:, design:))`
  sur tout le contenu textuel en flux (carte santé IA, graphique, profils participants,
  activité par participant, sentiment, types de contenu, en-têtes de section, sélecteur de
  période, placeholder vide, icônes accompagnant du texte).
- `import MeeshyUI` déjà présent (le fichier consomme déjà `MeeshyColors`) — pas d'ajout.

### 2. Exceptions figées (6, commentées in-code `// Dynamic Type exception:`)
- Glyphe guillemet ouvrant décoratif (size 48, `offset(y:)` calé sur la taille).
- 2× labels d'axe Swift Charts (size 9, graphique de hauteur fixe 160 pt).
- `StatRing` valeur (size 14, `minimumScaleFactor(0.6)`) + caption (size 9) dans anneau fixe 60×60.
- `ArcGauge` score (size 34) positionné par géométrie radius-relative.

## Hors-scope (différé, ne pas re-flagger)
- `StatRing`/`ArcGauge` scalables via `@ScaledMetric` sur leur diamètre (lot dédié plus lourd).
- `CallView` / `FriendRequestListView` Dynamic Type (itérations suivantes).

## Vérification
- CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2) = gate.
- Pas de build SwiftUI local (Linux). Pattern identique à 55i (`ConversationInfoSheet`,
  déjà en `main`) : `import MeeshyUI` + `MeeshyFont.relative(...)`.

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Status : ⏳ push + CI → merge main
