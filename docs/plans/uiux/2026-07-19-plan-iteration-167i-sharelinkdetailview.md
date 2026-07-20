# Plan — Itération 167i : `ShareLinkDetailView` (VoiceOver structurel)

**Date** : 2026-07-19 · **Piste** : iOS · **Branche** : `claude/laughing-thompson-cwu3q5` ·
**Base** : `main` HEAD `efedb69e4` · **Gate** : CI `iOS Tests`

## Objectif
Rendre `ShareLinkDetailView` (0 modifier a11y avant) entièrement lisible par VoiceOver, sans
toucher au layout, aux couleurs, à la copie visible ni à la logique.

## Étapes
1. [x] Resync branche sur `main` HEAD (branche précédente 149i mergée → restart depuis main).
2. [x] Sélection de surface : recherche d'une vue iOS non couverte / hors PR ouverte. Candidat
   retenu `ShareLinkDetailView` (0 a11y, polices sémantiques → risque minimal).
3. [x] Masquer le glyphe de statut d'en-tête (`.accessibilityHidden`).
4. [x] Grouper la carte d'en-tête (`.accessibilityElement(children: .combine)`).
5. [x] Annoncer l'état « copié » (`UIAccessibility.post(.announcement)`) + clé `shareLink.a11y.copied`.
6. [x] `actionButton` : masquer glyphe + label/trait `.isButton` explicites.
7. [x] `statCard` : masquer glyphe + combine value/label.
8. [x] `infoRow` : combine label/value.
9. [x] `sectionTitle` : trait `.isHeader` (rotor).
10. [x] Rédiger analyse + plan, mettre à jour `branch-tracking.md`.
11. [ ] Commit + push, ouvrir/mettre à jour la PR.

## Contraintes
- 1 fichier, additif pur (modifiers a11y), 0 logique / 0 test neuf.
- i18n code-only (`defaultValue`), 0 édition xcstrings (parité 100i/104i).
- Ne pas convertir les polices (déjà sémantiques → Dynamic Type OK).

## Vérification
- Build iOS non reproductible en local (hôte Linux) → gate = CI `iOS Tests` (compile Xcode 26.1.1,
  run simu 18.2). Revue statique : tous les changements sont des modifiers SwiftUI bien formés,
  additifs, sans nouveau symbole non résolu (`UIAccessibility` déjà transitivement dispo).
