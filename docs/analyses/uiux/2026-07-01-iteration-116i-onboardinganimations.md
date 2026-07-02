# Itération 116i — Analyse UI/UX iOS : `OnboardingAnimations`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`
**Base** : `main` HEAD (`512798e1`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le décor animé du wizard d'inscription (`AnimatedStepBackground` : cercles concentriques,
ondes de signal, enveloppes flottantes, silhouettes, bouclier, globe + drapeaux, confettis…),
la barre de progression interactive (`InteractiveProgressBar`) et le CTA (`GlowingButton`).
**0 PR ouverte iOS** au démarrage (seule #1333 gateway ouverte) → 0 contention. Numéro
**116i** (115i = `CallView` mergé #1331).

## Constat (avant 116i)

**17 `.font(.system(size:))`** : **15** sont des glyphes de **décor animé** (SF Symbols +
emojis drapeaux à ~0.04–0.12 d'opacité, positionnés en absolu, animés en boucle) — pure
décoration, aucun sens porté ; **2** sont le vrai texte du CTA (`GlowingButton` : titre 16
semibold + icône 15 semibold). Le décor n'était pas masqué du rotor VoiceOver → les emojis
drapeaux (`🇫🇷🇬🇧🇪🇸…`, rendus en `Text`) auraient été lus par VoiceOver, polluant l'écran.

## Corrections appliquées (1 fichier, 0 logique)

- **`AnimatedStepBackground` → `.accessibilityHidden(true)`** sur la racine (un seul modifieur) :
  tout le décor animé (15 glyphes) sort du rotor VoiceOver d'un coup — plus aucun symbole/drapeau
  ambiant lu à voix haute.
- **Commentaire doctrine** sur `AnimatedStepBackground` : les 15 tailles `.system(size:)` restent
  **figées volontairement** (elles composent une animation en couches ; les faire scaler avec le
  Dynamic Type déformerait le positionnement) → ne plus les re-flagger.
- **2/17 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : le CTA `GlowingButton` (titre 16
  semibold, icône optionnelle 15 semibold) — vrai texte de bouton, désormais réactif au Dynamic Type.

Palette (`step.accentColor` déterministe, confettis décoratifs) et animations déjà conformes → **intactes**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Statut

**TERMINÉE** — `OnboardingAnimations` Dynamic Type + a11y soldé. Décor animé masqué du rotor +
tailles figées documentées ; CTA migré. Ne plus re-flagger les 15 glyphes de décor.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `OnboardingAnimations` — décor animé (`AnimatedStepBackground`) masqué VoiceOver d'un modifieur
  racine + 15 tailles figées documentées (décor en couches) ; 2 sites CTA `GlowingButton` migrés
  en `relative`. **SOLDÉ 116i.**
