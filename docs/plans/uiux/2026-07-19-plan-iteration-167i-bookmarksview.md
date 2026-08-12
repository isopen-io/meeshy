# Plan Itération 167i — `BookmarksView` VoiceOver (état vide)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4`
**Branche** : `claude/laughing-thompson-v1pxwv` · **Gate** : CI `iOS Tests`

## Objectif
Regrouper l'état vide de `BookmarksView` en un seul élément VoiceOver (titre + sous-titre lus en
une annonce), en cohérence avec la doctrine des états vides frères (142i `FriendRequestListView`).

## Étapes
1. [x] Sync `main` (`efedb69e4`), reset branche désignée, vérifier PR ouvertes → 0 contention sur `BookmarksView`.
2. [x] `emptyState` → `.accessibilityElement(children: .combine)` (glyphe héros déjà `.accessibilityHidden(true)`).
3. [x] Test source-level `BookmarksViewAccessibilityTests` (2 assertions : masquage glyphe + combine).
4. [x] Analyse `2026-07-19-iteration-167i-bookmarksview.md` + ce plan + branch-tracking.
5. [ ] Commit + push branche + PR.

## Contraintes respectées
- 1 fichier prod + 1 test, 0 logique, 0 changement visuel, 0 clé i18n neuve.
- Typographie déjà sémantique → 0 conversion Dynamic Type. Glyphe héros 48pt gelé (84i) non touché.
- Suite matche `Bookmark` → phase 2, mais lecture source pure → inoffensive.

## Risques
- Aucun impact runtime (modificateur a11y pur). Test source-level → pas de dépendance simulateur.
