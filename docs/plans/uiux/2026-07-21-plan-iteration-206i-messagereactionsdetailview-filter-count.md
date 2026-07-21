# Plan Iteration-206i — MessageReactionsDetailView reaction-filter VoiceOver count

## Objectif

Rendre les pilules de filtre de réactions (`reactionFilterCapsule`) lisibles par
VoiceOver : remplacer l'annonce « Toutes 5 » (compteur nu sans sens) par
« Toutes, 5 réaction(s), sélectionné ». Miroir exact de la doctrine appliquée au
frère `MessageViewsDetailView` en 195i (PR #2194).

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99`
- Base : `main` HEAD `9177fcf` (resync du jour)
- Itération : **206i** (strictement > 205i, plus haut en vol dans l'essaim)

## Étapes

1. [x] Resync `main`, reset branche de travail sur `origin/main`.
2. [x] `list_pull_requests` → confirmer `MessageReactionsDetailView.swift` absent
   de toute PR ouverte comme fichier modifié (0 collision).
3. [x] Ajouter `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(label)`
   + `.accessibilityValue("\(count) réaction(s)")` avant le trait `.isSelected`
   existant dans `reactionFilterCapsule`.
4. [x] Vérifier convention pluriel « (s) » + extraction inline (0 `.xcstrings`).
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99`.

## Portée

1 fichier iOS, +7 lignes, 1 clé i18n inline, 0 logique / 0 réseau / 0 layout /
0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de refonte du layout des pilules, du tri, ni du réseau (`loadReactionDetails`).
- Pas de migration `.xcstrings` (clés sœurs déjà purement inline).
