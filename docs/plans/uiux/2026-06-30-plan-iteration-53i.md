# Plan — Iteration 53i (2026-06-30) — réconciliation collision 52i + cohérence teinte glass

## Objectif
iOS only. Rétablir la cohérence **code ↔ doc** sur `main` après la collision de deux agents
iOS « 52i », et figer la règle de teinte canonique pour le glass.

## Base
- Branche : `claude/upbeat-euler-mekcd1` (resynchronisée sur `main` post-#1083).

## Étapes
1. [x] `MentionSuggestionPanel` : retirer la teinte → `.adaptiveGlass(in: Rectangle())` + commentaire.
2. [x] `LocationPickerView` dropdown : retirer la teinte → `.adaptiveGlass(in: RoundedRectangle(12))` + commentaire.
3. [x] Dé-dupliquer `2026-06-30-plan-iteration-52i.md` (un plan consolidé, 3 surfaces).
4. [x] Réécrire `2026-06-30-iteration-52i.md` cohérent (3 surfaces, rationale neutre).
5. [x] `branch-tracking.md` : 52i ✅, lignes ⏳ dupliquées résolues, pointeur autoritaire MAJ.
6. [ ] Commit + push branche.
7. [ ] CI `ios-tests.yml` verte.
8. [ ] Merge dans `main`, marquer 53i ✅, supprimer la branche.

## Vérification
- `accentColor` toujours utilisé (avatars/icônes) → pas de var inutilisée.
- Aucune édition pbxproj (XcodeGen globbe les `.swift`).
- Pas de build local → CI iOS = gate.

## Non-objectifs (différés → 54i+)
`MessageOverlayMenu`, `MessageInfoSheet`, `InviteFriendsSheet`, `StatusBubbleOverlay`,
`CallEffectsOverlay`, `GlobalSearchView`, ladder catégoriel, polices figées.
