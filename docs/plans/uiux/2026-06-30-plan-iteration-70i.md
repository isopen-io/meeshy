# Plan — Iteration 70i (2026-06-30) — iOS

## Objectif
Épuration palette + complétude VoiceOver de `ContactCardView` (carte de contact partagée
dans une bulle). Un seul fichier de production + un test. Borné, épuré, sans collision avec
les PR web en vol.

## Changements

### 1. Palette — hex durs → tokens sémantiques charte
`apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
- `import MeeshyUI` ajouté (tokens `MeeshyColors`).
- Icône `phone.fill` : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
- Icône `envelope.fill` : `Color(hex: "3498DB")` → `MeeshyColors.info`.

### 2. A11y — VoiceOver annonce téléphones + e-mails
- `.accessibilityElement(children: .combine)` → `.accessibilityElement(children: .ignore)`.
- `.accessibilityLabel(...)` → `.accessibilityLabel(Self.accessibilityLabel(for: contact))`.
- Nouveau helper pur statique `ContactCardView.accessibilityLabel(for:)` : replie
  nom + (numéros joints `, `) + (e-mails joints `, `) — secours natif `defaultValue`, 2 clés
  neuves gérées par défaut (`contact-card.a11y-phones`, `contact-card.a11y-emails`).
- Hint d'action inchangé.

### 3. Test
`apps/ios/MeeshyTests/Unit/Components/ContactCardViewTests.swift` (nouveau) — 6 cas couvrant
le helper pur : nom toujours présent, annonce téléphone, annonce e-mail, jointure multiple,
les deux ensemble, omission quand absent. Assertions sur les **données** (locale-résilient).

## Hors-scope (différé, ne pas re-flagger)
- Fond `.ultraThinMaterial` conservé (glass-on-glass dans bulle).
- Polices figées conservées (`frame(width: 240)` borné par la bulle).

## Vérification
- CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2) = gate.
- Pas de build SwiftUI local (Linux).

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Status : ⏳ push + CI → merge main
