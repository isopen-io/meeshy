# Plan Iteration-210i — AudioPostComposerView recording-timer VoiceOver label + value

## Objectif

Rendre le chrono d'enregistrement lisible par VoiceOver : remplacer l'annonce
« 0:34 » (nombre nu sans contexte) par « Durée d'enregistrement, 0:34 » (capture)
/ « Durée enregistrée, 0:34 » (aperçu). Même doctrine label+value que 206i.

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (206i mergée → resync)
- Base : `main` HEAD `0acec4f` (inclut 206i/207i/208i mergées)
- Itération : **210i** (strictement > 209i, plus haut en vol dans l'essaim)

## Étapes

1. [x] Resync `main`, reset branche de travail sur `origin/main` (206i mergée).
2. [x] `list_pull_requests` → `AudioPostComposerView` absent de toute PR ouverte
   (0 occurrence) ; pas de recouvrement avec l'audit design-tokens #2246.
3. [x] Ajouter `.accessibilityLabel` (sensible à l'état recording/preview) +
   `.accessibilityValue(formattedDuration)` sur le `Text(formattedDuration)` du
   `durationLabel`.
4. [x] Vérifier extraction inline (0 `.xcstrings`), aligné sur les clés inline
   existantes du fichier.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +9 lignes, 2 clés i18n inline, 0 logique / 0 réseau / 0 layout /
0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de refonte des états `transcribing`/`idle` (contexte déjà présent).
- Pas de migration `.xcstrings` ni de touche aux tokens/couleurs (évite #2246).
