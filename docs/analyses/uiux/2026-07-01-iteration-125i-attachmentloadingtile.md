# Itération 125i — Analyse UI/UX iOS : `AttachmentLoadingTile`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift`
**Base** : `main` HEAD (`e027b523`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

La tuile de chargement d'attachment affichée dans le tray du composer pendant la préparation
d'un média (décodage image / compression vidéo / thumbnail / ThumbHash). Rendu uniforme pour
messages, posts et stories. La tuile est un **carré de dimension fixe `size`×`size`** (défaut 56).
**0 PR ouverte iOS sur cette surface** au démarrage (#1382 `CallView`/effets, #1379 gateway —
disjoints) → 0 contention. Numéro **125i** (124i = `iPadRootView+Panels` mergé #1383).

## Constat (avant 125i)

Le fichier n'importait que `SwiftUI` + `MeeshySDK` (pas `MeeshyUI` → `MeeshyFont` inaccessible).
**6 `.font(.system(size:))`** : 1 est le **libellé réactif SOUS la tuile** (nom du type / message
d'erreur) ; 5 sont **bornés par le carré fixe de la tuile** (croix d'annulation dans un cercle fixe
18×18 ; label d'étape, icône + libellé d'erreur, glyphe play vidéo — tous à l'intérieur du carré
`size`×`size`).

## Corrections appliquées (1 fichier, 0 logique)

- **`import MeeshyUI`** ajouté.
- **1/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : le libellé sous la tuile (10 medium,
  hors du carré, dans un `VStack` → peut scaler).
- **5/6 glyphes/labels figés** + commentaires doctrine (contenu borné par le carré fixe `size`×`size`
  ou un cercle fixe, ne doit pas déborder) :
  - croix d'annulation (8 bold, cercle fixe 18×18, doctrine 86i) ;
  - label d'étape (8 semibold, borné par la tuile, déjà `minimumScaleFactor`) ;
  - icône d'erreur (16 bold) + libellé « Erreur » (8 semibold), bornés par la tuile ;
  - glyphe play vidéo (20), borné par la tuile.
- **2 `.accessibilityHidden(true)`** : icône d'erreur décorative (le libellé « Erreur » adjacent
  porte le sens) et glyphe play décoratif.

Palette (`MeeshyColors.error`, accent `prep.accentColor`, gris de thème) déjà conforme → **intacte**.
La croix d'annulation porte déjà `.accessibilityLabel` → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Statut

**TERMINÉE** — `AttachmentLoadingTile` Dynamic Type + a11y soldé. Ne plus re-flagger les 5 glyphes/
labels figés (bornés par la tuile fixe).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `AttachmentLoadingTile` — `import MeeshyUI` + 1 libellé (hors tuile) → `relative`, 5 glyphes/labels
  figés (bornés par le carré fixe `size`×`size` / cercle 18×18), 2 masquages décoratifs. **SOLDÉ 125i.**
