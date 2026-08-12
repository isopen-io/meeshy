# Plan — Iteration-208i (iOS) : VoiceOver des boutons photo d'onboarding

**Date** : 2026-07-21
**Branche de travail** : `claude/laughing-thompson-v6xduw` (base `main` HEAD `22465a5`)
**Fichier cible** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

## Objectif

Rendre accessibles à VoiceOver les deux boutons `camera.fill` icône-seule
(ajout bannière + ajout photo de profil) de l'étape d'onboarding
`profilePreviewCard`, qui étaient annoncés comme des « boutons » anonymes (P0
WCAG 4.1.2).

## Étapes

1. [x] Resync branche sur `main` HEAD `22465a5` ; choix du numéro `208i` (207i `CallJournalRow` déjà mergé sur `main` ; plus haute PR ouverte = 206i #2224).
2. [x] Vérifier la contention : `OnboardingStepViews.swift` absent des 9 PR ouvertes.
3. [x] Vérifier le défaut sur place (grep `accessibility*` : seul `person.fill`
       décoratif est `accessibilityHidden`, les 2 boutons n'ont aucun label).
4. [x] Ajouter `.accessibilityLabel` sur le bouton bannière
       (`onboarding.photo.banner.a11y`) et le bouton profil
       (`onboarding.photo.profile.a11y`), clés inline `defaultValue` (0 `.xcstrings`).
5. [x] Analyse `docs/analyses/uiux/2026-07-21-iteration-208i-onboardingstepviews-photobuttons.md`.
6. [x] Mettre à jour `docs/plans/uiux/branch-tracking.md`.
7. [ ] Commit + push sur la branche de travail.
8. [ ] CI `iOS Tests` = gate (build/tests non exécutables sous Linux).

## Contraintes respectées

- 1 fichier de code, +4 lignes, 0 logique / 0 visuel / 0 réseau / 0 SDK / 0 test.
- 2 clés i18n inline, aucune édition de catalogue (`Localizable.xcstrings`).
- Périmètre iOS-app-only (aucune modif Android/Web/Backend/SDK).

## Suite (209i)

`OnboardingFlowView.swift` — compteur d'étapes `Text("2/5")` sans
`.accessibilityLabel` (rôle « Étape N sur M » perdu). Surface fraîche vérifiée,
différée pour conserver 1 fichier/itération.
