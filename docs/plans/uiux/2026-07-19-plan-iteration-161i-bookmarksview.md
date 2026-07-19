# Plan — Itération 161i : `BookmarksView` (VoiceOver état vide) + note tarissement

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (main HEAD) ·
**Branche** : `claude/laughing-thompson-f7d2yn` · **Gate** : CI `iOS Tests`

## Objectif

Solder le dernier reliquat a11y-structure de l'écran « Favoris » (état vide non regroupé), et acter dans le
tracking le **tarissement** du filon a11y-structure sur écrans isolés → pivot vers passes state-of-the-art.

## Étapes

1. **État vide regroupé** : `VStack` de l'état vide → `.accessibilityElement(children: .combine)`. ✅
2. **Icône héros** : commentaire de gel doctrine (≥40pt, déjà `.accessibilityHidden(true)`). ✅
3. **Docs** : analyse + plan + pointeur tracking (note de tarissement + prochaines pistes SOTA). ✅

## Non-régression

- 1 fichier de code, 0 logique, 0 test neuf, 0 clé i18n neuve.
- ViewModel / `FeedPostCard` / navigation story non touchés ; aucun test ne référence la vue.

## Vérification

- `grep '.accessibilityElement(children: .combine)'` sur `BookmarksView.swift` → 1 occurrence (état vide).
- Gate : CI `iOS Tests`.

## Statut

**TERMINÉE** — poussée sur `claude/laughing-thompson-f7d2yn`, PR à venir.
