# Plan Itération 150i — `DeleteAccountView` : feedback VoiceOver de validation

**Date** : 2026-07-16 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`60503a1`)
**Branche** : `claude/laughing-thompson-11e8cz` · **Gate** : CI `iOS Tests`

## Objectif

Rendre accessible le passage « phrase invalide → phrase valide » du champ de confirmation de
suppression de compte, aujourd'hui purement visuel (checkmark + déverrouillage du bouton).

## Étapes

1. [x] Sync `main`, créer/reset la branche de travail depuis `main` HEAD.
2. [x] Audit `DeleteAccountView` : le `TextField` de confirmation n'a pas de `.accessibilityValue` ;
       le checkmark de validation n'est ni labellisé ni masqué.
3. [x] Ajouter `.accessibilityValue(confirmationPhraseAccessibilityValue)` sur le `TextField`.
4. [x] Masquer le checkmark de validation (`.accessibilityHidden(true)`).
5. [x] Ajouter la computed property privée `confirmationPhraseAccessibilityValue`
       (« Phrase correcte » / « Phrase incomplete », 2 clés i18n inline).
6. [x] Rédiger analyse + plan, mettre à jour `branch-tracking.md`.
7. [ ] Commit + push, ouvrir la PR, laisser tourner CI `iOS Tests`.

## Non-objectifs

- Aucune modif de la logique de suppression, de l'état, du visuel ou du hint de bouton préexistant.
- Aucun changement Android / Web / Backend / SDK.

## Risques

- **Nul côté logique** (changement additif a11y, aucune branche de contrôle nouvelle).
- Build iOS non reproductible localement (Linux) → validation par revue + CI `iOS Tests`.
