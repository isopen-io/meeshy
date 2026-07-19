# Plan — Itération 170i : `VoiceProfileWizardView` (VoiceOver step-change)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4` · **Branche** : `claude/laughing-thompson-42yxa2`

## Objectif
Combler la seule lacune a11y réelle de l'assistant de profil vocal : les transitions d'étape
(consentement → âge → enregistrement → traitement → terminé) remplacent tout l'écran sans annonce
VoiceOver ni déplacement de focus.

## Étapes
1. [x] Sync `main` (`efedb69e4`), branche fraîche `claude/laughing-thompson-42yxa2`.
2. [x] Audit `VoiceProfileWizardView` : typographie déjà migrée (4 gels justifiés), palette tokenisée,
   a11y de base présente → seule lacune = annonce de changement d'étape.
3. [x] Vérifier la doctrine existante : `IncomingCallView` (`.screenChanged`), `CallView`
   (`.adaptiveOnChange` + `UIAccessibility.post`), `adaptiveOnChange` backport iOS 16.
4. [x] Ajouter `.adaptiveOnChange(of: viewModel.currentStep)` → `UIAccessibility.post(.screenChanged, …)`.
5. [x] Ajouter le helper pur `stepAnnouncement(for:)` (switch exhaustif 5 cas, réutilise l'i18n existant).
6. [x] Docs analyse + plan + tracking.
7. [ ] Commit + push `claude/laughing-thompson-42yxa2`.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n neuve, 0 swap palette, 0 test neuf.
- Compatibilité iOS 16+ via `adaptiveOnChange` (pas de duplication de logique).
- Choix `.screenChanged` (remplacement plein écran) plutôt que `.announcement`.

## Gate
CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).
