# Itération 113i — Analyse UI/UX iOS : `OnboardingFlowView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`
**Base** : `main` HEAD (`51a28527`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le shell du wizard d'inscription (top bar, progress bar interactive, en-tête d'étape,
`TabView` des 8 étapes, bottom bar). 112i a soldé `OnboardingStepViews` (le contenu des
étapes) ; 113i traite le **chrome** qui l'entoure. **0 PR ouverte iOS** au démarrage
(list_pull_requests vide) → 0 contention. Numéro **113i** (112i = `OnboardingStepViews`
mergé #1324).

## Constat (avant 113i)

Tout le texte du shell reposait sur **8 `.font(.system(size:))`** en tailles fixes — donc
non réactif au Dynamic Type : bouton retour (chevron + libellé), croix de fermeture,
icône + compteur d'étape, en-tête `funHeader`/`funSubtitle`, bouton « passer l'étape ».
Un seul glyphe vit dans un cadre tap de dimension fixe (croix 38×38).

## Corrections appliquées (1 fichier, 0 logique)

- **7/8 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : chevron retour (15),
  libellé « Retour » (14), icône d'étape (20), compteur `n/N` (13 rounded),
  `funHeader` (26 bold rounded), `funSubtitle` (14), « passer l'étape » (14).
- **1/8 glyphe figé** + commentaire doctrine : croix de fermeture (15, cadre tap fixe
  38×38 — l'icône ne doit pas déborder du cercle en tailles XXL, doctrine 82i).
- **`.accessibilityLabel("common.close")`** sur le bouton croix icon-only.
- **`.accessibilityHidden(true)`** sur l'icône d'étape décorative (le compteur `n/N` et
  l'en-tête portent déjà la position + le sens de l'étape).
- **`.accessibilityAddTraits(.isHeader)`** sur `funHeader` (navigation par rotor titres).

Palette (accent déterministe `currentStep.accentColor`, gris système du chrome) et style
Glass déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (`common.back`,
  `common.close`, `onboarding.skip-step` déjà présentes).

## Statut

**TERMINÉE** — chrome de `OnboardingFlowView` Dynamic Type + a11y soldé. Ne plus
re-flagger la croix figée (38×38).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `OnboardingFlowView` — 7 sites du chrome → `relative`, 1 croix figée (cadre tap 38×38),
  label croix, icône d'étape masquée du rotor, `funHeader` marqué header. **SOLDÉ 113i.**
