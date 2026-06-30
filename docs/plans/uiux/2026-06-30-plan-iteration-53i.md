# Plan — Iteration 53i (2026-06-30)

## Objectif
**iOS only.** Adoption native iOS 26 Liquid Glass — **lot 3** sur 2 surfaces flottantes
restées en `.ultraThinMaterial`, via l'atome SDK `adaptiveGlass`. Bornée, fidèle, « épurée ».

## Base
- Branche de travail tirée de `main` HEAD (resync systématique avant de commencer).
- Dernière itération iOS mergée : **52i** (`MentionSuggestionPanel` + `MiniAudioPlayerBar`).

## Changements

### 1. `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
3 panneaux flottants au-dessus de la `Map` :
- `searchBar` : `.background(RoundedRectangle(12).fill(.ultraThinMaterial).shadow)` →
  `.adaptiveGlass(in: RoundedRectangle(12)).clipShape(…).shadow(0.1, r8, y2)`.
- `searchResultsList` : idem `RoundedRectangle(12)` + `.shadow(0.15, r10, y4)`.
- `bottomCard` : `RoundedRectangle(20, continuous)` + `.shadow(0.1, r12, y-4)`.
- Verre **neutre** (chrome sur carte). Boutons internes (CTA accent, « Ma position »)
  inchangés (fills sur le verre).

### 2. `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
- `bubbleContent` : `.adaptiveGlass(in: RoundedRectangle(14, continuous)).clipShape(…)` +
  **liseré dégradé teinté avatar conservé en `.overlay`** + ombre — idiome `FloatingCallPillView`.
- `thoughtCircle` (cercles décoratifs 4/7/10 pt) : **laissés en material** (atomes décoratifs,
  risque clipping inutile).

## Hors périmètre (différé, documenté)
- `MessageInfoSheet.sectionBackground` (cartes de contenu en sheet → glass-everywhere =
  anti-pattern HIG), `MessageOverlayMenu` (glass-in-glass), `InviteFriendsSheet`,
  `ContactCardView` (écarté 52i).

## Vérification
- Pas de build SwiftUI local (Linux) → **CI `ios-tests.yml`** (compile Xcode 26.1.x + tests
  simu 18.2) est le gate.
- Aucun test n'asserte le fond matériau de ces vues (grep Tests = 0) → aucun test à mettre à jour.
- XcodeGen globe les `.swift` → pas d'édition `project.pbxproj`.

## Merge
- PR → CI verte → merge dans `main` → suppression de la branche → mise à jour
  `branch-tracking.md` (Dernière itération iOS = 53i).
