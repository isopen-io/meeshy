# Itération 165i — Analyse UI/UX iOS : `StatsTimelineChart`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift`
**Base** : `main` HEAD (`b36ffd7`)
**Branche** : `claude/laughing-thompson-wnteas`
**Gate** : CI `iOS Tests`

## Contexte

`StatsTimelineChart` est le graphique d'activité (Swift Charts) rendu dans l'écran statistiques
(`UserStatsView` → section « ACTIVITE »). Il trace une `LineMark` + `AreaMark` par `TimelinePoint`
(date `String` + `messages: Int`) sur ~30 jours. Surface **fraîche** : 2 `.font(.system(size:))`, 0
commentaire doctrine, 0 `relative`. **Aucune PR ouverte ne touche `StatsTimelineChart`** (les PR iOS
ouvertes 140i–164i couvrent d'autres surfaces : `MessageViewsDetailView`, `SecurityVerificationView`,
`AudioPostComposerView`, `StoryViewerView+Content`, etc.) → **0 contention**. Numéro **165i** (139i =
`MentionSuggestionPanel`, dernière itération présente dans `main`).

## Constat (avant 165i)

1. **Dynamic Type absent** — 2 `.font(.system(size: 9))` sur les `AxisValueLabel` (axes X et Y). Ces
   **vrais libellés texte** (dates, comptes) ne scalaient pas sous Dynamic Type → texte figé à 9pt, en
   dessous de la lisibilité minimale HIG, sans réagir aux réglages « Larger Text ».
2. **VoiceOver opaque** — le graphique n'exposait qu'un seul `.accessibilityLabel` global statique
   (« Activity chart over 30 days ») ; les points individuels n'étaient **pas explorables**. Aucun
   accès au détail jour-par-jour ni à l'Audio Graph.

## Corrections appliquées (1 fichier Swift + 1 clé i18n)

- **Dynamic Type — 2/2 `.font(.system(size: 9))` → `MeeshyFont.relative(9)`** (axes X et Y). Ces libellés
  d'axe scalent désormais avec Dynamic Type (mappés sur `.caption2`, le style texte le plus petit qui reste
  scalable), tout en conservant leur rôle visuel discret.
- **VoiceOver — points explorables** : chaque `LineMark` porte désormais `.accessibilityLabel(<jour>)` +
  `.accessibilityValue(<n messages>)`. VoiceOver lit « 01/04, 12 messages » point par point et l'Audio
  Graph du chart devient disponible. L'`AreaMark` (doublon visuel du même point) est marqué
  `.accessibilityHidden(true)` → **pas d'éléments dupliqués**.
- **i18n** — nouvelle clé `stats.timeline.point.a11y` (« %d messages ») ajoutée au catalogue
  `Localizable.xcstrings` avec **variations plurielles** (`one`/`other`) dans les **5 langues** du
  catalogue (de, en, es, fr, pt-BR), consommée via le pattern maison
  `String(format: String(localized:), count)`. Le libellé global existant `stats.timeline.chart.a11y`
  (déjà traduit dans 5 langues) reste **intact**.

Aucun gel : les libellés d'axe n'ont pas de cadre de dimension fixe (Swift Charts gère le layout d'axe).
Palette (`theme.textMuted`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 fichier Swift** + **1 clé i18n** (95 insertions dans le catalogue, insertion chirurgicale au format
  Xcode `"key" : {` — aucun reformat du fichier), 0 logique, 0 mutation d'état, 0 test neuf. `MeeshyFont`
  est atteignable via `@_exported import MeeshyUI` (`MeeshyUIExports.swift`) ; l'import explicite est ajouté
  par cohérence avec la convention de migration (139i).
- Le parent `UserStatsView` (section « ACTIVITE » `.isHeader`) n'est **pas** touché.
- Aucun test ne référence `StatsTimelineChart` → aucune régression de test.

## Statut

**TERMINÉE** — `StatsTimelineChart` Dynamic Type + VoiceOver soldé (2/2 libellés d'axe → `relative` ;
points explorables par VoiceOver ; clé plurielle i18n ajoutée). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StatsTimelineChart` — 2/2 `AxisValueLabel` (axes X, Y) → `MeeshyFont.relative(9)` ; `LineMark` explorable
  VoiceOver (`.accessibilityLabel` jour + `.accessibilityValue` « %d messages » pluriel i18n) ; `AreaMark`
  `.accessibilityHidden(true)` (anti-doublon) ; libellé global `stats.timeline.chart.a11y` intact.
  **SOLDÉ 165i.**
