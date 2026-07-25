# Plan Iteration-211i — FloatingCallPillView call-duration VoiceOver label + value

## Objectif

Rendre la durée d'appel de la bannière réduite lisible par VoiceOver : remplacer
l'annonce « 02:34 » (nombre nu) par « Durée d'appel, 02:34 » sur l'état connecté,
sans toucher les états pré-connexion (« Sonnerie… » déjà correct). Continuité de
la doctrine label+value (206i/210i).

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (210i mergée → resync)
- Base : `main` HEAD `7d64035` (inclut 210i × 2 mergées)
- Itération : **211i** (strictement > 209i, plus haut en vol dans l'essaim)

## Étapes

1. [x] Resync `main`, reset branche de travail sur `origin/main` (210i mergée).
2. [x] `list_pull_requests` → `FloatingCallPillView` absent de toute PR ouverte
   (0 occurrence) ; pas de recouvrement avec l'audit design-tokens #2246.
3. [x] `statusLine` : libellé descripteur `a11y.call.pill.duration` + valeur
   `formattedDuration` sur l'état connecté ; label pré-connexion inchangé.
4. [x] Vérifier extraction inline (0 `.xcstrings`), aligné sur les clés
   `call.pill.*` du fichier ; trait `.updatesFrequently` conservé.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +6 lignes, 1 clé i18n inline, 0 logique / 0 réseau / 0 layout /
0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de refonte du conteneur `pillContent` (déjà labellisé) ni des boutons.
- Pas de migration `.xcstrings` ni de touche aux tokens/couleurs (évite #2246).
