# Itération 129i — Analyse UI/UX iOS : `CameraView`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/CameraView.swift`
**Base** : `main` HEAD (`806fc972`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`CameraView` est l'écran de capture photo/vidéo plein écran (topBar fermer/flash, sélecteur de mode
Photo/Vidéo, bouton de capture, bouton switch-caméra, indicateur d'enregistrement). Surface **fraîche** :
5 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **0 PR iOS ouverte** au démarrage
(#1396/#1395 mergées) → **0 contention**. Numéro **129i** (128i = `FeedPostCard` mergé #1397).

## Constat (avant 129i)

**5 `.font(.system(size:))`** :
- **3 glyphes de chrome bornés par un cadre tap de dimension fixe** : `xmark` (fermer, 18 bold) et
  `flashIcon` (16 semibold) dans des cercles tap **44×44** ; `camera.rotate.fill` (switch caméra, 22)
  dans un cercle tap **50×50**. Chacun porte déjà son `.accessibilityLabel`.
- **2 textes réactifs** : le libellé de l'onglet de mode (« Photo »/« Vidéo », 14 bold/medium) et le
  chrono d'enregistrement (16 semibold monospaced), tous deux dans des `HStack`/`VStack` sans cadre fixe.

## Corrections appliquées (1 fichier, 0 logique)

- **3/5 glyphes FIGÉS** + commentaires doctrine **82i** : `xmark`, `flashIcon` (cercles tap 44×44),
  `camera.rotate.fill` (cercle tap 50×50). Un glyphe borné par un cadre de dimension fixe garde
  `.font(.system(size:))` — le scaler ferait déborder/désaligner le glyphe hors de son cercle.
- **2/5 textes → `MeeshyFont.relative(...)`** : libellé d'onglet de mode
  (`relative(14, weight: selected ? .bold : .medium)`) et chrono d'enregistrement
  (`relative(16, weight: .semibold, design: .monospaced)`) → ces **vrais libellés texte** scalent
  désormais sous Dynamic Type.

Accessibilité : les 3 boutons icône-seul (fermer / flash / switch caméra) portent déjà leur
`.accessibilityLabel` (dont le flash un label d'état dynamique) → **intacts**, pas de `.accessibilityHidden`
(ce sont des contrôles porteurs de sens, pas des décorations). Palette (`MeeshyColors.error`, blanc/jaune
sur preview caméra sombre) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent. Les libellés « Photo »/« Vidéo » restent des chaînes littérales (gap i18n **pré-existant**,
  hors périmètre d'un sweep font/a11y — non introduit par cette itération).
- Aucun test ne référence `CameraView`/`CameraModel` → aucune régression de test.

## Statut

**TERMINÉE** — `CameraView` Dynamic Type + a11y soldé (2 textes → `relative`, 3 glyphes de chrome figés
commentés 82i, a11y déjà en place). Ne plus re-flagger les 3 glyphes figés (bornés par cadres tap fixes).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `CameraView` — 2 textes (onglet de mode, chrono) → `MeeshyFont.relative` ; 3 glyphes de chrome figés
  (cercles tap 44×44 ×2 + 50×50) commentés « doctrine 82i » ; a11y déjà en place (labels sur les 3 boutons
  icône). **SOLDÉ 129i.**
