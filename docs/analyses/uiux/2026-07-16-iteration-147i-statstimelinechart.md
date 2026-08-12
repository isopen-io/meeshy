# Itération 147i — Analyse UI/UX iOS : `StatsTimelineChart`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift`
**Base** : `main` HEAD (`63cb684`)
**Branche** : `claude/laughing-thompson-fakfjr`
**Gate** : CI `iOS Tests`

## Contexte

`StatsTimelineChart` est le graphe d'activité (Swift `Charts` : `LineMark` + `AreaMark`) rendu dans
`UserStatsView` (section « ACTIVITÉ », `.frame(height: 180)`). Il trace 30 jours de volume de messages
(`[TimelinePoint]`). Surface **fraîche côté a11y/Dynamic Type** : 2 `.font(.system(size: 9))` sur les
libellés d'axe (taille figée) et un `.accessibilityLabel` **générique** — VoiceOver n'annonçait que
« Graphique d'activité sur 30 jours » **sans aucune donnée**.

La piste iOS est passée de la migration pure Dynamic Type (jusqu'à 139i) à des lots **a11y VoiceOver +
Dynamic Type** (140i→146i, PRs #1966→#1978). Numéro **147i** (146i = `VoiceProfileManageView` #1978, en
cours). Contention : les surfaces 140i→146i (ThemedBackButton, MyStoriesView, FriendRequestListView,
StoryExpiredContent, MessageViewsDetailView, ConversationDashboard, VoiceProfileManageView) sont **toutes
distinctes** de `StatsTimelineChart` → **0 contention**.

## Constat (avant 147i)

1. **2 `.font(.system(size: 9))`** sur `AxisValueLabel()` (axes X et Y) — taille absolue, ne scale **pas**
   sous Dynamic Type.
2. **VoiceOver aveugle aux données** : le `.accessibilityLabel` décrit le *type* de graphe mais aucune
   valeur. Un utilisateur VoiceOver n'a **aucun** accès au contenu (total, pic, dernier jour) — le graphe
   est purement visuel.

## Corrections appliquées (1 fichier + 2 clés i18n + 1 fichier de test)

- **2/2 `.font(.system(size: 9))` → `MeeshyFont.relative(9)`** (`import MeeshyUI` ajouté) : les libellés
  d'axe scalent désormais sous Dynamic Type (mapping `caption2`, cf. `MeeshyFont.textStyle(for:)`).
- **VoiceOver enrichi** : `.accessibilityElement(children: .ignore)` (le graphe se collapse en **un** élément
  cohérent) + `.accessibilityValue(Self.accessibilitySummary(for: timeline))`. VoiceOver lit maintenant
  « Graphique d'activité sur 30 jours, *N messages au total, pic de P en une journée, D le jour le plus
  récent* ».
- **Helper pur testable** `accessibilitySummary(for:)` : total (`reduce`), pic (`max`), dernier jour
  (`last`). Timeline vide → clé dédiée « Aucune activité enregistrée » (aucun compte fabriqué). Locale-aware
  via `String(localized:)`, positional `%1$lld`/`%2$lld`/`%3$lld` (ordre total/pic/récent stable dans les
  5 langues).
- **2 clés i18n neuves** (5 langues chacune : de/en/es/fr/pt-BR, format Xcode `xcstrings` préservé,
  insertion chirurgicale de 70 lignes, **0 reformatage**) :
  `stats.timeline.chart.a11y.summary`, `stats.timeline.chart.a11y.empty`.

## Tests (`StatsTimelineChartAccessibilityTests`)

- `accessibilitySummary` : timeline vide (valeur parlée, **0 chiffre fabriqué**) ; 3 points → total 17 +
  pic 9 + dernier 5 tous annoncés ; point unique.
- Scan source : `MeeshyFont.relative(9)` présent / `.system(size: 9)` absent ; `.accessibilityValue(...)` +
  `.accessibilityElement(children: .ignore)` présents.

## Périmètre / non-régression

- **1 fichier de prod**, 0 logique métier, 0 mutation d'état, 0 `@Published`. `StatsTimelineChart` n'a qu'un
  seul call site (`UserStatsView`) → rayon de risque nul. Le rendu visuel du graphe (marks, gradient,
  couleurs, grille) est **intact** ; seuls la police des axes et l'a11y changent.
- Classe de test hors tokens produit (`FINAL_PHASE_CLASS_PATTERN`) → phase 1 isolée, aucun état persistant
  touché.

## Statut

**TERMINÉE** — `StatsTimelineChart` Dynamic Type + VoiceOver soldé (axes `relative`, valeur a11y
data-driven, empty-state géré). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StatsTimelineChart` — 2/2 libellés d'axe → `MeeshyFont.relative(9)` ; `.accessibilityValue` = résumé
  data-driven (total/pic/dernier jour) via helper pur `accessibilitySummary(for:)` + empty-state ;
  `.accessibilityElement(children: .ignore)` ; 2 clés i18n × 5 langues. **SOLDÉ 147i.**
