# Plan — Iteration 71i (2026-06-30) — iOS

## Objectif
Rendre le flow de sécurité 2FA (`TwoFactorSetupView.swift`) compatible Dynamic Type en
migrant les tailles de police figées vers `MeeshyFont.relative`, sans changement visuel au
réglage par défaut.

## Base de départ
- Branche : `claude/upbeat-euler-mulqrg` resync sur `main` HEAD (`d5f4a3f`).
- Dernière itération iOS mergée : 70i (`ContactCardView` palette + VoiceOver).

## Étapes
1. [x] Identifier toutes les occurrences `.font(.system(size:))` de `TwoFactorSetupView.swift`
   (39 sites, 3 sous-vues).
2. [x] Catégoriser : 28 texte/icône-inline → migrer ; 9 glyphes hero + 2 grilles monospace
   bornées + 1 déjà text-style → garder figé.
3. [x] Swap mécanique `.system(size: N, weight:, design:)` → `MeeshyFont.relative(N, weight:,
   design:)` (poids + design préservés). `MeeshyUI` déjà importé.
4. [x] Commenter les 2 grilles de codes de secours gardées figées (keep non-évident).
5. [ ] Push branche + ouvrir PR.
6. [ ] CI `iOS Tests` verte (compile Xcode 26.1.x + tests 18.2).
7. [ ] Merge dans `main` ; supprimer la branche ; mettre à jour `branch-tracking.md`.

## Risques / Validation
- SwiftUI ne compile pas sous Linux → validation via CI `ios-tests.yml`.
- Swap purement typographique, helper déjà testé (`AccessibilityHelpersTests`) → risque faible.
- Pas de nouveau test (aucune nouvelle logique ; comportement = scaling système).

## Différés (reportés)
- Dynamic Type : `ConversationDashboardView` (43), `StoryViewerView+Content` (38),
  `InviteFriendsSheet` (33)… un écran à la fois.
- Glass : sheets plein écran `ConversationView`, `MessageOverlayMenu`.
- Ladder catégoriel arc-en-ciel + tints `sectionHeader` hex.
