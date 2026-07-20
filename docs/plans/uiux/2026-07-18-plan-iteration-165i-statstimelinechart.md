# Plan — Itération 165i : `StatsTimelineChart` (Dynamic Type + VoiceOver)

**Date** : 2026-07-18 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`b36ffd7`) ·
**Branche** : `claude/laughing-thompson-wnteas` · **Gate** : CI `iOS Tests`

## Objectif
Rendre le graphique d'activité `StatsTimelineChart` accessible : libellés d'axe scalables (Dynamic Type)
et points explorables au VoiceOver, sans toucher la logique ni le rendu visuel.

## Étapes
1. [x] Sélection surface fraîche sans contention (0 PR ouverte, 0 doctrine, 2 `.system`).
2. [x] `.font(.system(size: 9))` × 2 (axes X/Y) → `MeeshyFont.relative(9)`.
3. [x] `LineMark` : `.accessibilityLabel(<jour>)` + `.accessibilityValue(<n messages>)`.
4. [x] `AreaMark` : `.accessibilityHidden(true)` (anti-doublon VoiceOver).
5. [x] Clé i18n `stats.timeline.point.a11y` plurielle (de/en/es/fr/pt-BR), insertion chirurgicale.
6. [x] Docs analyse + plan.
7. [ ] Commit, push, PR, gate CI `iOS Tests`.

## Non-régression
- 1 fichier Swift + 1 clé i18n (95 insertions catalogue, format Xcode préservé).
- 0 logique, 0 test neuf, 0 mutation d'état. Libellé global `stats.timeline.chart.a11y` intact.
- `MeeshyFont` atteignable via `@_exported import MeeshyUI` ; import explicite ajouté par convention.

## Statut
**TERMINÉE (dev)** — reste push + PR + CI.
