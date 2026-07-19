# Plan — Itération 165i : `EditProfileView` (VoiceOver + Dynamic Type)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-j1xn2r` · **Gate** : CI `iOS Tests`

## Objectif

Passe VoiceOver de l'écran d'édition du profil. Dynamic Type déjà soldé (2 glyphes décoratifs figés). Cible
les 3 lacunes d'accessibilité restantes, sans toucher la logique.

## Étapes

1. **`readOnlyRow`** (section Compte) — icône décorative `.accessibilityHidden(true)` ; regrouper la rangée
   (`.accessibilityElement(children: .combine)`) + `.accessibilityLabel` « <titre> : <valeur> »
   (`profile.edit.readonly.a11y`, `%1$@ : %2$@`).
2. **Compteur bio** — `.accessibilityLabel` « N caractères sur M » (`profile.edit.bio.count.a11y`,
   `%1$d caractères sur %2$d`) → supprime la lecture « slash » et le signal couleur-seul.
3. **Overlay succès** — `checkmark.circle.fill` (48) `.accessibilityHidden(true)` ; regrouper l'overlay
   (`combine` + `.isStaticText`) → libellé parlé « Profil mis à jour ».

## Contraintes

- 1 fichier (`EditProfileView.swift`), 0 logique, 0 test neuf.
- 2 clés i18n auto-extraites (pas d'édition manuelle du `Localizable.xcstrings`).
- Ne pas toucher les 2 `.font(.system(size:))` figés (badge caméra 30×30, héros succès 48pt).

## Validation

- Compile/tests : gate CI `iOS Tests` (Xcode indisponible en local Linux → revue statique + CI).
- `EditProfileViewModelTests` (ViewModel) non impacté par des changements View-only.

## Sortie

Analyse : `docs/analyses/uiux/2026-07-19-iteration-165i-editprofileview.md`.
Mise à jour du pointeur dans `docs/plans/uiux/branch-tracking.md`.
