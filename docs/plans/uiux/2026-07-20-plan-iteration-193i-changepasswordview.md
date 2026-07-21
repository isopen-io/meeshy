# Plan Iteration-193i — ChangePasswordView secureField VoiceOver

**Base** : `main` HEAD `75a5c96` (189i #2161)
**Branche** : `claude/laughing-thompson-g7sbac`
**Numéro** : 193i (> 192i #2167, plus haut en vol dans l'essaim)

## Cible

`apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift` → helper
`secureField(icon:title:text:placeholder:color:field:)` (3 usages).

## Étapes

1. [x] Vérifier l'absence de collision essaim (`ChangePasswordView` absente des
   17 PR ouvertes).
2. [x] Masquer le glyphe de tête décoratif → `.accessibilityHidden(true)`.
3. [x] Masquer le `Text(title)` visuel doublon → `.accessibilityHidden(true)`.
4. [x] Réassigner le rôle au champ → `SecureField.accessibilityLabel(title)`.
5. [x] Rédiger analyse + plan + entrée branch-tracking.
6. [ ] Commit + push branche + ouvrir PR.

## Contraintes

- 0 changement visuel, 0 logique, 0 clé i18n neuve, 0 test neuf.
- Pas de `.combine` sur le `SecureField` (casserait l'édition VoiceOver).
- Env Linux → pas de build Xcode local ; gate = CI `iOS Tests`.
