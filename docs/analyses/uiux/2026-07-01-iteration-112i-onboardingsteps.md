# Itération 112i — Analyse UI/UX iOS : `OnboardingStepViews`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`
**Base** : `main` HEAD (`9408c957`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Les 8 étapes du wizard d'inscription (pseudo, téléphone, email, identité, mot de passe, langue,
profil, récap) + composants partagés (`GlassTextField`, `StepIllustration`, `PasswordStrengthBar`).
**0 PR ouverte iOS** au démarrage (PR web/calls uniquement, disjointes) → 0 contention. Numéro
**112i** (111i = `StatusBubbleOverlay` mergé #1317).

## Constat (avant 112i)

L'écrasante majorité du texte utilise déjà des styles sémantiques (`.callout`, `.footnote`,
`.caption`, `.title3`…) → déjà Dynamic-Type-conforme. `StepIllustration` est déjà
`.accessibilityHidden`. Défaut restant : **7 `.font(.system(size:))`** — 3 glyphes en cercles fixes /
héros décoratifs ≥40pt, 4 flags/indicateurs inline migrables.

## Corrections appliquées (1 fichier, 0 logique)

- **4/7 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : drapeau pays du picker (24),
  indicateur de correspondance mot de passe checkmark/xmark (20), drapeau de langue (26),
  checkmark de sélection de langue (20).
- **3/7 glyphes figés** + commentaires doctrine : `StepIllustration` hero (44, cercle fixe 100×100,
  ≥40pt, déjà `.accessibilityHidden`) ; `person.fill` placeholder profil (32, cercle fixe 80×80) ;
  `exclamationmark.triangle.fill` hero d'erreur du récap (50, ≥40pt).
- **2 `.accessibilityHidden(true)`** ajoutés sur les glyphes décoratifs `person.fill` (le nom sous
  l'aperçu porte le sens) et le héros d'erreur (le message d'erreur adjacent porte le sens).

Palette (accent d'étape déterministe `currentStep.accentColor`, sémantiques `MeeshyColors.success/
.error/.warning`) et le style Glass du formulaire déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (toutes les chaînes déjà `String(localized:)`).

## Statut

**TERMINÉE** — `OnboardingStepViews` Dynamic Type + a11y soldé. Ne plus re-flagger les 3 glyphes figés.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `OnboardingStepViews` — 4 flags/indicateurs → `relative`, 3 glyphes figés (illustration/profil/erreur,
  cercles fixes / héros ≥40), 2 masquages VoiceOver décoratifs. **SOLDÉ 112i.**
