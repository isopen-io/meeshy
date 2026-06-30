# Plan — Iteration 53i (2026-06-30)

## Objectif
iOS only. **Adoption native iOS 26 Liquid Glass — lot 3** + **a11y** ciblé sur
`StatusBubbleOverlay` (dernier overlay flottant content-agnostic propre). Itération
bornée, « épurée » : 1 fichier, 2 changements orthogonaux, aucune surcharge ajoutée.

## Base
- Branche : `claude/upbeat-euler-esd2le` (resynchronisée sur `main` HEAD `43f2c24`, post #1076 = 52i).

## Changements

### `apps/ios/.../Components/StatusBubbleOverlay.swift` (app)
- [x] Bulle principale : `.background(RoundedRectangle.fill(.ultraThinMaterial).overlay(stroke).shadow)`
      → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))`
      **+** `.overlay(stroke dégradé accent)` **+** `.shadow(...)` conservés en surcouche.
- [x] Doc-comment inline (HIG, glass + stroke superposé, pas de glass-sur-glass).
- [x] a11y : `accessibilityLabel` dynamique localisé sur le bouton play/stop audio
      (`status.bubble.audio.play` / `status.bubble.audio.stop`), miroir de `MiniAudioPlayerBar`.

## Vérification
- [x] Le fichier importe déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Convention i18n respectée : `String(localized:defaultValue:bundle:)` inline (cohérent avec
      les clés `status.bubble.*` existantes, hors `.xcstrings`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `StatusBubbleControllerTests` / `…ReplyTests` testent le controller (présentation/reply) →
      inchangés, non impactés par le rendu glass.
- [ ] CI `ios-tests.yml` verte (compile Xcode 26.1.x + tests simulateur 18.2).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
