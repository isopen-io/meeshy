# Plan Itération 167i — `ActiveSessionsView` (VoiceOver)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4`
**Branche** : `claude/laughing-thompson-xek3tw` · **Gate** : CI `iOS Tests`

## Objectif

Combler les lacunes VoiceOver de l'écran de sécurité « Sessions actives » : information
d'état portée par la couleur/forme d'icône seule, et rangée de session fragmentée en éléments
disjoints.

## Étapes

1. [x] Resync `main` HEAD ; reset branche de travail sur `origin/main`.
2. [x] Vérifier la non-contention (`list_pull_requests` : 167i > 166i en vol ; cible libre).
3. [x] `sessionRow` : `.accessibilityHidden(true)` sur l'icône de tuile décorative (état
       repris textuellement par le badge + le libellé composé).
4. [x] `sessionRow` : `.accessibilityElement(children: .combine)` sur le `VStack` d'infos →
       unité VoiceOver cohérente ; bouton de révocation laissé séparé.
5. [x] Analyse + plan + tracking.
6. [ ] Commit + push branche.

## Garanties

- 1 fichier, 0 logique / 0 layout / 0 palette / 0 visuel.
- 0 clé i18n neuve (réutilisation des libellés localisés existants).
- 0 test neuf (sweep a11y pur, parité 164i).
- Dynamic Type déjà soldé (intact).
