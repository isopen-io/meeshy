# Plan Itération 147i — `StatsTimelineChart` (Dynamic Type + VoiceOver)

**Date** : 2026-07-16 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `63cb684`
**Branche** : `claude/laughing-thompson-fakfjr` · **Gate** : CI `iOS Tests`

## Objectif

Rendre le graphe d'activité `StatsTimelineChart` accessible : (1) libellés d'axe scalables sous Dynamic
Type ; (2) VoiceOver qui restitue les **données** (total, pic, dernier jour) plutôt qu'un simple libellé
générique.

## Étapes

1. **Dynamic Type** — `import MeeshyUI` ; 2 × `.font(.system(size: 9))` → `MeeshyFont.relative(9)`.
2. **VoiceOver** — `.accessibilityElement(children: .ignore)` + `.accessibilityValue(...)` alimenté par un
   helper pur `accessibilitySummary(for:)` (total via `reduce`, pic via `max`, dernier jour via `last`,
   empty-state dédié).
3. **i18n** — 2 clés `stats.timeline.chart.a11y.summary` (3 args positionnels) + `.empty`, 5 langues,
   insertion chirurgicale dans `Localizable.xcstrings` (préserver le formatage Xcode, 0 reformatage global).
4. **Tests** — `StatsTimelineChartAccessibilityTests` : helper (vide / 3 points / point unique) + scan
   source (font relative, accessibilityValue/Element présents).

## Contention

Aucune : surfaces 140i→146i (PRs #1966→#1978) toutes distinctes de `StatsTimelineChart`. Fichier à un seul
call site (`UserStatsView`).

## Vérification

- Impossible de builder iOS dans l'environnement Linux (pas de Xcode/simu). Revue statique : les appels
  `String(localized:defaultValue:bundle:)` reproduisent à l'identique le pattern déjà présent dans le même
  fichier (label existant) ; `MeeshyFont.relative` est `public` (MeeshyUI) ; `TimelinePoint` init `public`
  (MeeshySDK). JSON `xcstrings` validé (`json.load`), diff = 70 insertions pures.
- Gate final = CI `iOS Tests` (compile Xcode 26.1.1 + run simu 18.2).

## Suivi

Post-merge : mettre à jour `branch-tracking.md` (pointeur iOS → 147i, base = nouveau `main` HEAD).
