# Plan — Iteration 165i (2026-07-18)

## Cible
`apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift` — graphe d'activité 30 jours
(`UserStatsView`). Résolution du P0 d'accessibilité `ACCESSIBILITY_AUDIT.md:340` (Chart sans
donnée VoiceOver) + Dynamic Type des labels d'axe.

## Base
`main` HEAD `0d3bbb1` (branche `claude/laughing-thompson-r5zuas`).

## Étapes
1. [x] Lire `StatsTimelineChart` + audit a11y + modèle `TimelinePoint` + site d'usage.
2. [x] `import MeeshyUI` pour `MeeshyFont`.
3. [x] `.font(.system(size: 9))` → `MeeshyFont.relative(9)` sur les 2 labels d'axe.
4. [x] Par `LineMark` : `.accessibilityLabel(date)` + `.accessibilityValue("<n> messages")`.
5. [x] `.accessibilityHidden(true)` sur l'`AreaMark` décoratif.
6. [x] `.accessibilityValue(accessibilitySummary)` de conteneur (total + peak, ou état vide).
7. [x] Helpers computed `totalMessages` / `peakPoint` hors `body`.
8. [x] Analyse + plan docs.
9. [ ] Commit + push + PR. Gate = CI `iOS Tests`.

## Contrainte
0 logique métier touchée, 0 test neuf, 1 fichier de prod. Anti-collision : aucune PR ouverte ne
touche `StatsTimelineChart`.
