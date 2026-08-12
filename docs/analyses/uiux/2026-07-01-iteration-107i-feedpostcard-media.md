# Itération 107i — Analyse UI/UX iOS : `FeedPostCard+Media`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`
**Base** : `main` HEAD (`1e12f2d7`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte de contention

`106i` pris par un autre agent (PR #1301 `AudioEffectsPanel`) → cette itération prend **107i**.
`FeedPostCard+Media` = **surface non réclamée** (0 PR, hors #1300 calls / #1301 AudioEffectsPanel).

## Constat (avant 107i)

Rendu média des posts du feed. Les grilles multi-images (2/3/4/5+) portaient déjà
`.accessibilityLabel`/`Hint`/`.isButton` sur chaque cellule tap. Défauts restants :
- **13 `.font(.system(size:))`** non scalables (Dynamic Type) : durées vidéo/audio, nom de
  fichier + taille + pages du document, nom de lieu + coordonnées, badge `+N`, glyphes.
- **Glyphes décoratifs non masqués** du rotor VoiceOver (play/waveform d'overlay, doc.fill,
  mappin, arrow.up.right, badge `+N`).

## Corrections appliquées (1 fichier, 0 logique)

- **10/13 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight + `.monospaced` des
  durées préservés) : badge `+N`, durées vidéo/audio, glyphe `waveform` audio, nom de fichier /
  taille / pages du document, nom de lieu / coordonnées, glyphe `arrow.up.right.circle.fill`.
- **3/13 glyphes figés** + commentaires doctrine 86i (cadres de dimension fixe) :
  `play.fill` 12 (cercle 30/36), `doc.fill` 24 (cadre 48×56), `mappin.circle.fill` 28 (cadre 64×64).
- **6 `.accessibilityHidden(true)`** : overlays vidéo/audio de `galleryImageView` (la cellule
  galerie parente porte déjà le libellé), badge `+N` (le tap parent annonce « N de plus »),
  glyphes `doc.fill` / `mappin` / `arrow.up.right` (le nom de fichier / lieu porte le sens).

Palette (accent déterministe `Color(hex:)`, `theme.*`) et Liquid Glass (`.ultraThinMaterial`
de l'overlay vidéo) déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (les labels de grille existaient déjà).
- Vue de cellule de liste : aucun `@ObservedObject` ajouté → pattern « Zero re-render » préservé.

## Statut

**TERMINÉE** — `FeedPostCard+Media` Dynamic Type + VoiceOver soldé. Ne plus re-flagger les 3
glyphes figés (cadres fixes).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `FeedPostCard+Media` — 10 `relative` (durées/document/lieu/badge), 3 glyphes figés (play/doc/mappin),
  6 `.accessibilityHidden`. **SOLDÉ 107i.**
