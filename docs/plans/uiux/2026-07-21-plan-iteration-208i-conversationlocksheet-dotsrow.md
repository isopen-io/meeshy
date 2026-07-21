# Plan Itération 208i — `ConversationLockSheet` rangée de points → progression VoiceOver

**Date** : 2026-07-21 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `22465a5`
**Branche** : `claude/laughing-thompson-150505` · **Gate** : CI `iOS Tests`

## Objectif
Rendre la progression de saisie du PIN perceptible en VoiceOver dans `ConversationLockSheet`,
dont la `dotsRow` ne convoie l'état (`N` chiffres saisis sur `M`) que par le remplissage
visuel des points.

## Étapes
1. [x] Sélection surface : `ConversationLockSheet.dotsRow` (137i = fonts-only, dots jamais traités ; 0 PR ouverte ; non re-flag).
2. [x] `.accessibilityElement(children: .ignore)` sur la rangée → supprime les ≤6 `Circle` muets.
3. [x] `.accessibilityLabel` (`conversation.lock.a11y.progress` = « Chiffres saisis »).
4. [x] `.accessibilityValue` (`conversation.lock.a11y.progress-value` = « %1$d sur %2$d », `currentPin.count` / `pinLength`).
5. [x] Commentaire doctrine (parité clavier code natif iOS).
6. [x] Analyse + plan + pointeur `branch-tracking.md`.
7. [ ] Commit, push, PR ; gate = CI `iOS Tests`.

## Contraintes de périmètre
- 1 fichier, 0 logique, 0 test neuf, 0 clé `.xcstrings` (2 clés inline `defaultValue`), 0 changement visuel.
- Parité stricte visuel/vocal : les valeurs annoncées (`currentPin.count`, `pinLength`) sont celles
  qui pilotent le remplissage des points (couvre `step == 2` → `confirmPin`).
- Pas d'exposition de secret : longueur PIN déjà fixe/connue ; seul le **nombre saisi** est annoncé
  (comportement du champ code natif Apple), jamais la valeur.

## Vérification
- Build/tests iOS non exécutables sous Linux (pas de toolchain Xcode/Swift) → gate = CI `iOS Tests`.
- APIs a11y iOS 14/16+ → plancher iOS 16, aucun `@available`.
