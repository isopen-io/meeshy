# Plan — Iteration 99i (2026-07-01)

## Objectif
Accessibilité `ForwardPickerSheet` (feuille « Transférer » un message) : **Dynamic Type** +
**VoiceOver** (glyphe d'état vide masqué + ligne de conversation regroupée). iOS exclusivement
(suffixe `i`). Branche = `claude/upbeat-euler-bx683k`, base = `main` HEAD `1df16a6d`.

## Diagnostic
- `ForwardPickerSheet.swift` : 9 sites `.font(.system(size:))` → la feuille ignore Dynamic Type.
- Glyphe décoratif d'état vide `bubble.left.and.bubble.right` (40pt) non masqué de VoiceOver.
- Ligne de conversation : titre/type/membres lus en 3 swipes séparés.
- Couleurs déjà tokenisées (accent déterministe + `MeeshyColors.success`) ; i18n déjà complet.

## Étapes
1. [x] Contention extrême (29 PRs) → `list_pull_requests` ; `ForwardPickerSheet` absent de toute
   PR/différé → retenu. Numéro 99i (> plus haute PR ouverte 98i).
2. [x] Ajouter `import MeeshyUI` (sécurité résolution `MeeshyFont` ; `MeeshyColors` déjà utilisé
   sans import → transitif, mais explicite = cohérent avec vues sœurs).
3. [x] Migrer 8/9 sites `.system(size:)` → `MeeshyFont.relative(size, weight:)` (weight préservé).
4. [x] Garder figé le glyphe d'état vide 40pt + `.accessibilityHidden(true)` (doctrine 74i/86i/90i).
5. [x] `.accessibilityElement(children: .combine)` sur le bloc titre/type/membres de la ligne.
6. [x] Rédiger analyse `2026-07-01-iteration-99i.md` + ce plan.
7. [ ] Commit + push branche + PR (99i).
8. [ ] Attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main` ; supprimer la branche mergée.
10. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 99i + ligne History) + 93i ✅.

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap mécanique.
- **`import MeeshyUI`** : `MeeshyColors` compilait déjà sans → import redondant = inoffensif,
  garantit `MeeshyFont.relative`.
- **`ConversationTitleLabel(font:)`** : accepte un `Font`, `MeeshyFont.relative` renvoie `Font` → OK.
- **Débordement glyphe** : seul l'état vide 40pt reste figé ; les glyphes inline scalent avec le texte.

## Hors-scope (différé, documenté dans l'analyse)
- Couleurs (déjà tokenisées).
- Autres grandes surfaces Dynamic Type (`ConversationListView+Overlays`, `EditPostSheet`,
  `AudioEffectsPanel`, `StoryTrayView`, `MessageOverlayMenu`) → 100i+.
