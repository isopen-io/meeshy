# Itération 130i — Analyse UI/UX iOS : `ReelFeedCard`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`
**Base** : `main` HEAD (`1061dcb0`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`ReelFeedCard` est la carte Réel plein-cadre du feed (leaf view `Equatable`, wrappée par
`ReelFeedCardContainer`) : média en fond aspect-fill, badge logo Réel coin haut-droit, overlay bas
(auteur + méta reach + caption + barre d'actions like/commenter/repartager/enregistrer/partager).
Surface **fraîche** : 4 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **0 PR iOS
ouverte** au démarrage → **0 contention**. Numéro **130i** (129i = `CameraView` mergé #1399).

## Constat (avant 130i)

**4 `.font(.system(size:))`** — tous des **glyphes non bornés par un cadre de dimension fixe** :
- badge logo Réel `play.rectangle.on.rectangle.fill` (15 bold) — bouton `.padding(8)` + cercle
  `.ultraThinMaterial` (dimensionné par le glyphe, pas de `.frame` fixe), porte déjà son
  `.accessibilityLabel` ;
- glyphe de métrique inline `chart.bar.fill`/`eye.fill` (10 semibold) — apparié à un compteur `.caption2` ;
- glyphe d'action `actionGlyph` (18) + son **overlay de bordure accent** (18) dans un `ZStack` —
  apparié à un compteur `.footnote`.

## Corrections appliquées (1 fichier, 0 logique)

- **4/4 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles/poids) : badge Réel
  (`relative(15, weight: .bold)`), métrique inline (`relative(10, weight: .semibold)`), glyphe d'action
  + overlay de bordure (`relative(18)` ×2). Tous **scalent désormais avec le texte adjacent** (méta reach
  `.caption2`, compteurs d'action `.footnote`) sous Dynamic Type.
- **Overlay de bordure accent** migré **à la même taille** que le glyphe rempli sous-jacent → les deux
  couches du `ZStack` restent alignées sous Dynamic Type.

Aucun gel : aucun de ces glyphes n'est borné par un cadre de dimension fixe (le badge Réel est
`.padding`-driven, pas `.frame`-driven ; les glyphes d'action/métrique sont inline). → **`relative`, pas figé**.

Accessibilité déjà conforme → **intacte** : le badge Réel, le bouton like et les `reelButton` portent déjà
leur `.accessibilityLabel`/`Value`/`Hint`+`.isSelected` ; `metricInline` est un élément a11y combiné
(`children:.ignore` + label + value) ; l'overlay de bordure décoratif est aplati par le `Button` labellisé
parent (pas de `.accessibilityHidden` requis). Palette (`MeeshyColors.error/success/warning`, accent
`Color(hex: accentHex)`, blanc sur scrim) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent. `Equatable` + inputs primitifs `let` préservés (Zero-Unnecessary-Re-render intact ;
  `ReelFeedCardContainer` reste le seul point observant `activeReelId`).
- Aucun test ne référence `ReelFeedCard` → aucune régression de test.

## Statut

**TERMINÉE** — `ReelFeedCard` Dynamic Type soldé (4/4 glyphes → `relative`, a11y déjà en place). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ReelFeedCard` — 4/4 glyphes → `MeeshyFont.relative` (badge Réel `.padding`-driven, métrique inline,
  glyphe d'action + overlay de bordure aligné) ; aucun gel (aucun cadre fixe) ; a11y déjà en place.
  **SOLDÉ 130i.**
