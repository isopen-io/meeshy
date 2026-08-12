# Plan — Itération 180i : VoiceOver `ConversationMediaGalleryView` (iOS)

**Date** : 2026-07-20
**Branche** : `claude/laughing-thompson-i2yer4` (base `main` HEAD `05491cc`, 166i)
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`
**Type** : accessibilité (VoiceOver) — 1 fichier, 0 logique, 0 test neuf.

## Contexte
Galerie plein écran de tous les médias visuels d'une conversation (swipe horizontal
image/vidéo, pinch-zoom, drag-to-dismiss, transport vidéo partagé). Surface **fraîche** :
0 analyse UI/UX antérieure, aucune PR ouverte, absente de la liste des surfaces soldées.
Typographie **déjà migrée** (`MeeshyFont.relative` partout) ; les 6 `.font(.system(size:))`
restants sont des glyphes/contrôles figés à dessein (doctrine 74i/82i/86i, déjà commentés).
→ Itération **purement VoiceOver**, 0 migration Dynamic Type.

## Lacunes réelles ciblées
1. **Compteur de page** `Text("\(n) / \(N)")` — lu « n barre oblique N » par VoiceOver ;
   position portée par le seul texte brut. (cf. doctrine 163i `AudioCarouselView`.)
2. **Image plein écran** (`galleryImagePage`) — le `ProgressiveCachedImage` n'a **aucun**
   `.accessibilityLabel` → élément VoiceOver **muet** quand on balaie la galerie.
3. **Rangée métadonnées** (dimensions + poids) — `"1920 × 1080"` lu « 1920 multiplication
   1080 » ; dimensions et poids lus comme arrêts séparés.

## Changements
1. Compteur → `.accessibilityLabel(galleryPositionAccessibilityLabel)` = « Média X sur Y »
   (clé `gallery.position`). Texte visible inchangé (`.contentTransition(.numericText())` conservé).
2. Image → `.accessibilityLabel(imageAccessibilityLabel(attachment))` (légende `captionMap`
   si fournie, sinon `gallery.image` = « Image ») + `.accessibilityAddTraits(.isImage)`.
3. Rangée métadonnées → `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel(mediaMetadataAccessibilityLabel(att))` (helper composant
   « %d par %d » localisé + poids, joints via `ListFormatter.localizedString(byJoining:)`
   locale-aware — précédent 164i) + `.accessibilityHidden` quand le résumé est vide.

## i18n
3 clés neuves **code-only** (`defaultValue:`, auto-extraction String Catalog, 0 édition
`.xcstrings`) : `gallery.position`, `gallery.image`, `gallery.dimensions`.

## Non-régression
- 1 fichier, 0 logique, 0 mutation d'état, 0 réseau, 0 changement visuel.
- Glyphe icône type média déjà `.accessibilityHidden(true)` (inchangé) ; rangée auteur déjà
  `.combine` (inchangée) ; 6 `.system(size:)` figés inchangés.
- Source-guards `ConversationMediaGalleryVideoControlsTests` : les 3 `.adaptiveGlass(` restent
  dans la fenêtre 2600 car du `controlsOverlay`, pas de `xmark.circle.fill`, pas de cercle blanc
  opaque → **vérifié** (script). Aucun autre test ne référence la surface.
- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).
