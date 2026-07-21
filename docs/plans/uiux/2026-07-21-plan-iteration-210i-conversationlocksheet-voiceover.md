# Plan Itération 210i — `ConversationLockSheet` feedback VoiceOver

**Date** : 2026-07-21 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `22465a5` ·
**Branche** : `claude/laughing-thompson-gbl1zk` · **Gate** : CI `iOS Tests`

## Objectif

Rendre la saisie du PIN de `ConversationLockSheet` perceptible à VoiceOver (aujourd'hui 100 % visuelle :
points remplis + shake rouge). Complète 137i (gel des polices) sans y toucher.

## Étapes

- [x] Vérifier base à jour (`main` HEAD), rebrancher `claude/laughing-thompson-gbl1zk` depuis `origin/main`.
- [x] Confirmer surface fraîche : dernier commit fichier = 179i, absent des 80 derniers commits, 0 test
      référent, 137i n'a traité que les polices.
- [x] `dotsRow` → `.accessibilityElement(children: .ignore)` + label `conversation.lock.a11y.pinProgress` +
      value `pinProgressA11yValue` (`%1$d sur %2$d`).
- [x] `announcePinProgress()` gaté `isVoiceOverRunning` → appelé dans `appendDigit` (hors complétion) +
      `deleteLastDigit`.
- [x] `shakeAndReset` → annonce du message d'erreur localisé pour VoiceOver.
- [x] Revue statique : 0 import neuf, 2 clés i18n uniques, 0 logique de vérification touchée.
- [ ] Commit + push `-u origin`.
- [ ] Mettre à jour `branch-tracking.md`.
- [ ] Gate = CI `iOS Tests` (build iOS non reproductible en conteneur Linux).

## Revue

Changement additif pur (canal a11y), no-op VoiceOver éteint. 1 fichier, 0 réseau/SDK/layout/couleur.
