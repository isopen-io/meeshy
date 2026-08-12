# Iteration 198i — Onboarding language step: VoiceOver selected-state

**Surface** : `StepLanguageView` dans `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`
(étape « Langue » du carrousel d'inscription — jamais audité, absente de toute PR iOS ouverte).

## Constat

Deux surfaces de sélection sur cet écran signalaient leur état actif **par le visuel seul**,
sans exposer l'état à VoiceOver (violation HIG « ne jamais reposer sur la couleur seule »,
WCAG 1.4.1 — doctrine 149i/155i/163i/176i/177i/178i/186i/192i) :

1. **`languageTargetTab`** (sélecteur segmenté `Langue principale` / `Langue régionale`) — le segment
   actif n'était rendu que par le `fill` (couleur pleine vs 12 % d'opacité) + la couleur du texte
   (blanc vs teinte). Aucun `.accessibilityAddTraits(.isSelected)`. VoiceOver ne pouvait pas dire
   quel onglet cible était en cours d'édition.

2. **`languageCard`** (chaque langue de la grille) — la sélection était signalée par un checkmark
   (`checkmark.circle.fill`) **et** la couleur du fill/stroke. Deux déficits VoiceOver :
   - le `Button` n'annonçait pas « sélectionné » (pas de trait `.isSelected`) ;
   - le glyphe checkmark, non masqué, était fusionné dans le label du `Button` → annonce parasite
     « … checkmark circle fill ».

## Correctif

- `languageTargetTab` : `.accessibilityAddTraits(isActive ? .isSelected : [])` sur le `Button`.
- `languageCard` : `.accessibilityAddTraits(isSelected ? .isSelected : [])` sur le `Button` +
  `.accessibilityHidden(true)` sur le glyphe checkmark (décoratif une fois l'état porté par le trait).

Miroir exact des siblings prouvés `CallsTab.chip`, `RequestsTab`, `ConversationDashboardView.periodPicker`,
`ConversationInfoSheet.tabSelector`.

## Portée

- 1 fichier prod (`OnboardingStepViews.swift`, +3 modifiers / +1 accessibilityHidden), **0 logique /
  0 réseau / 0 changement visuel / 0 clé i18n neuve** (titres déjà localisés `onboarding.step.language.*`).
- 1 fichier test source-level neuf `OnboardingLanguageStepAccessibilityTests` (miroir
  `CallsTabAccessibilityTests`, non-`@MainActor`, auto-inclus par `xcodegen generate`).

## Vérification

- Gate = CI `iOS Tests` (build macOS/Xcode ; non reproductible en environnement Linux).
- Revue source : modifiers additifs uniquement, aucun impact runtime/visuel.

## Statut

✅ **Résolu 198i.** Ne plus re-flagger `StepLanguageView` pour l'état sélectionné VoiceOver
(`languageTargetTab` + `languageCard`) — soldé. Titres déjà localisés, fonts déjà relatives.
