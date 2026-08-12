# Plan — Iteration 217i : haptiques d'onboarding sur le design system

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-217i-onboarding-haptics-design-system.md`
**Base** : `main` HEAD `ffef1339e`
**Branche** : `claude/quirky-curie-16693v`

## Objectif

Faire passer les 9 derniers sites haptiques qui construisent un
`UIImpactFeedbackGenerator` à la volée par `HapticFeedback` (SSOT MeeshyUI), dont
**8 dans le parcours d'onboarding** — le seul parcours de l'app où le Taptic
Engine n'est jamais préchauffé, donc où le retour tactile est peu fiable.

## Étapes

1. **RED** — écrire `MeeshyTests/Unit/Views/OnboardingHapticDesignSystemTests.swift` :
   ancrage positif par site (6 tests / 17 assertions), verrou d'absence de
   `UI*FeedbackGenerator(` sur les 4 fichiers, conservation 1:1 par comptage.
2. **GREEN** — remplacer les 9 expressions :
   - `UIImpactFeedbackGenerator(style: .light).impactOccurred()` → `HapticFeedback.light()` (×8)
   - `UIImpactFeedbackGenerator(style: .medium).impactOccurred()` → `HapticFeedback.medium()` (×1)
3. **Vérifier** — pas de toolchain Swift sur Linux : correspondance de chaînes +
   contrôle d'équilibre des accolades au tokenizer. Gate réel = CI `iOS Tests`.
4. Mettre à jour `docs/plans/uiux/branch-tracking.md`.

## Invariants

- **0 `import` ajouté ou retiré.** `MeeshyUI` est déjà importé par les 4 fichiers ;
  `UIKit` n'y était jamais importé explicitement.
- **0 changement d'intensité.** `.light` → `light()`, `.medium` → `medium()`.
- **0 site perdu.** Le test compte les remplacements par fichier (1+1 / 2 / 4 / 1).
- **0 édition de `project.pbxproj`** : XcodeGen globbe `Meeshy*/**.swift`, la CI
  régénère.
- Aucun fichier hors des 4 cités n'est touché.

## Hors périmètre

`CallManager.playHaptic(_ style:)` / `playNotificationHaptic(_ type:)` :
wrappers **paramétrés**, sans équivalent dans l'API `HapticFeedback` actuelle.
Les convertir imposerait d'élargir l'API du SDK — décision hors d'un correctif de
surface. Le verrou de test ne balaie **pas** le repo pour cette raison ; il est
scopé aux 4 fichiers convergés. Élargissement documenté en suite 218i.

## Suites (218i+)

1. Surcharge `HapticFeedback` paramétrée par style → converger `CallManager` →
   élargir le verrou en balayage repo-wide.
2. `sensoryFeedback` (iOS 17+) adopté **dans** `HapticFeedback` derrière
   `@available`, jamais site par site.
3. `StoryViewerView+Content.shareStory()` — code mort, suppression +
   élargissement du verrou `UIActivityViewController` (suite 216i).
4. `MeeshyShareExtension` sans `Localizable.xcstrings` propre.
