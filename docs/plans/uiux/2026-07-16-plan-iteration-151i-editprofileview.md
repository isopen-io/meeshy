# Plan Itération 151i — `EditProfileView` (VoiceOver)

**Base** : `main` HEAD `cd93248`
**Branche** : `claude/laughing-thompson-xp2i27`
**Surface** : `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
**Gate** : CI `iOS Tests`

## Objectif
Poser la structure VoiceOver de l'écran d'édition de profil (Dynamic Type déjà soldé), sans changement de
logique ni nouvelle clé i18n.

## Étapes
1. [x] Titre d'écran → `.accessibilityAddTraits(.isHeader)`.
2. [x] `sectionHeader` → `children: .combine` + `.accessibilityLabel(title)` + `.isHeader`.
3. [x] `readOnlyRow` → `children: .combine` + label « titre, valeur ».
4. [x] `editableField` → icône + titre masqués, `TextField.accessibilityLabel(title)`.
5. [x] `bioField` → idem via constante locale `bioLabel`.
6. [x] Overlay de succès → checkmark masqué + `children: .combine` + `.isStaticText`.
7. [x] Rangée d'upload photo → `children: .combine`.
8. [x] Analyse `docs/analyses/uiux/2026-07-16-iteration-151i-editprofileview.md`.
9. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Non-régression
1 fichier, 0 logique, 0 test/clé i18n neuve. `accessibility` : 1 → 17.
