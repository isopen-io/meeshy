# Itération 140i — Analyse UI/UX iOS : `StatsTimelineChart`

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift`
**Base** : `main` HEAD (`c735c016`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`StatsTimelineChart` est le graphique d'activité (Swift `Charts` : LineMark + AreaMark sur 30 jours) avec
axes X (dates) et Y (nombre de messages). Surface **fraîche** : 2 `.font(.system(size:))`, 0 commentaire
doctrine, 0 `relative`. Numéro **140i** (139i = `MentionSuggestionPanel` mergé #1450 ; on continue la traîne
à 2). **GitHub MCP en ré-auth au moment du dev** → la vérification de contention `list_pull_requests` n'a
pas pu tourner ; surface stats à très faible risque de contention (aucune PR calls/gateway ne touche un
graphique de stats) et **aucun test ne la référence** → risque de collision négligeable ; PR ouverte dès
reconnexion du MCP.

## Constat (avant 140i)

**2 `.font(.system(size: 9))`** — **libellés de graduation d'axe** Swift Charts (`AxisValueLabel()`), un
sur `.chartXAxis`, un sur `.chartYAxis` : de **vrais libellés texte** (dates / valeurs), non bornés par un
cadre fixe.

## Corrections appliquées (1 fichier, 0 logique)

- Ajout de **`import MeeshyUI`** (absent — le fichier n'importait que SwiftUI/Combine/Charts/MeeshySDK)
  requis pour `MeeshyFont.relative`.
- **2/2 `.font(.system(size: 9))` → `MeeshyFont.relative(9)`** : les libellés de graduation des axes X et Y
  **scalent désormais sous Dynamic Type** (`AxisValueLabel().font(_:)` accepte un `Font`).

Aucun gel : des libellés de graduation d'axe sont du vrai texte, non borné par un cadre de dimension fixe →
**`relative`, pas figé**. Palette (`theme.textMuted`, `Color(hex: color)` de la courbe) déjà conforme → non
touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. Le graphique porte déjà
  son `.accessibilityLabel` global (« Activity chart over 30 days ») → intact.
- Aucun test ne référence `StatsTimelineChart` → aucune régression de test.

## Statut

**TERMINÉE** — `StatsTimelineChart` Dynamic Type soldé (2/2 libellés d'axe → `relative`, `import MeeshyUI`
ajouté). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StatsTimelineChart` — 2/2 `AxisValueLabel().font` (axes X + Y) → `MeeshyFont.relative(9)` ;
  `import MeeshyUI` ajouté ; a11y globale déjà en place. **SOLDÉ 140i.**
