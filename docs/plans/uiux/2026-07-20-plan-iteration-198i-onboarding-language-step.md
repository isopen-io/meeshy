# Plan — Iteration 198i — Onboarding language step VoiceOver selected-state

- **Base** : `main` HEAD `61737bf`
- **Branche** : `claude/laughing-thompson-3rk09w`
- **Surface** : `StepLanguageView` (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`)
- **Numéro** : 198i (strictement > plus haut en vol observé — PR ouvertes jusqu'à 197i, #2207)

## Étapes

1. [x] Sync branche sur `main` HEAD.
2. [x] Vérifier absence de collision essaim (`list_pull_requests` : `OnboardingStepViews` seulement
   cité dans des *bodies* de PR comme candidat différé, jamais modifié).
3. [x] `languageTargetTab` → `.accessibilityAddTraits(isActive ? .isSelected : [])`.
4. [x] `languageCard` → `.accessibilityAddTraits(isSelected ? .isSelected : [])` + checkmark
   `.accessibilityHidden(true)`.
5. [x] Test source-level guard `OnboardingLanguageStepAccessibilityTests`.
6. [x] Docs analyse + plan + tracking.
7. [ ] Commit + push. Gate = CI `iOS Tests`.

## Non-objectifs

- Aucune migration i18n (titres déjà localisés), aucun changement visuel/logique/réseau.
- Ne pas toucher les autres steps (`StepPseudoView`, `StepPhoneView`, etc.).
