# Plan — Iteration-241i · Les nombres que la locale ne touchait pas

**Date** : 2026-08-24 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `5476dae7`
**Branche** : `claude/intelligent-noether-64z546`

## Constat

Suite (a) du pointeur 240i (« les 4 sites `label + accessibilityValue("\(count)")` »).
Le balayage en rend **dix**, et le pire n'était pas annoncé : `MessageOverlayMenu`
grave **deux orthographes du pourcentage** à trois lignes d'écart — `" %"` pour ce
que VoiceOver dit, `"%"` pour ce que l'écran montre. Le français veut l'espace
insécable, l'anglais non : graver l'une ou l'autre se trompe dans une locale sur
deux, et ce composant se trompait dans les deux à la fois.

## Correctif

`LocalizedNumber` — `exact(_:locale:)` + `percent(_:locale:)`.
`ReachMetricLabel.spokenCount` (239i) délègue à `exact` : la règle change
d'adresse, pas d'énoncé.

## Étapes

- [x] Inventaire mesuré (10 sites, 2 familles de défaut)
- [x] `LocalizedNumber` + délégation de `ReachMetricLabel.spokenCount`
- [x] 10 sites rebranchés (7 compteurs, 3 pourcentages + 2 textes visibles)
- [x] `LocalizedNumberTests` (10 tests, aucune chaîne CLDR nommée)
- [x] Garde `NumericAccessibilityValueGuardTests` (2 interdictions + consolidation + 4 auto-gardes)
- [x] Contrôles déterministes hors Swift : 568 fichiers, 0 contrevenant, 5/5 hôtes
- [x] Analyse
- [ ] Verdict CI — suite COMPLÈTE, en vérifiant le NOM du check (leçon 268)

## Hors périmètre (assumé, non « reporté »)

- **SDK** (`KeyframeInspector`, `StoryAudioCell`, `ComposerToolPanelHost`) : même
  défaut, mais la routine **interdit** de modifier les SDKs. À porter par la piste SDK.
- **Phrasé « Image 3 sur 10 »** : doute réel (clé i18n neuve + arbitrage), donc écarté
  par NIVEAU DE DOUTE (leçon 238i), pas par oubli.
