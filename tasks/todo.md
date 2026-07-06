# Éditeur de texte story — position libre, édition centrée, fonts & cadres variés

Branche : `claude/text-editor-enhancements-3ucvru`

## Demande (4 points)
1. Texte positionnable n'importe où ; au toucher : déplacer / scaler / tourner.
2. Pendant l'édition, le texte reprend le CENTRE de l'écran par-dessus le canvas.
3. Plus de fonts (calligraphique, dessin animé, futuriste, fantaisie, curve, tag)
   et graisses (fin / normal / semi-gras / gras) avec effet direct et visible sur le canvas.
4. Cadres plus variés : losange, bulle de nuage, bulle de conversation.

## Itérations
- [x] It.1 — Modèle SDK : 6 nouveaux `StoryTextStyle` (calligraphy, cartoon, futuristic,
      fantasy, curve, tag → Zapfino, ChalkboardSE-Bold, Futura-CondensedExtraBold,
      Papyrus, SavoyeLetPlain, MarkerFelt-Wide) + 3 nouveaux `StoryTextFrameShape`
      (diamond, cloud, speech) avec flag `usesCustomPath`.
- [x] It.2 — Résolution police : `storyFont` (SwiftUI) + `StoryTextFontResolver.baseFont`
      couvrent les nouveaux styles. Fix graisse : sur famille NOMMÉE, le trait `.weight`
      en attribut ne changeait pas la face rendue (canvas figé) → font matching CoreText
      au niveau famille (face concrète la plus proche : Futura-Bold, MarkerFelt-Thin…).
      Les styles système gardent le chemin par traits (design rounded/serif/mono préservé).
- [x] It.3 — Rendu cadres path-based dans `StoryTextLayer` : `frameMetrics` (encombrement +
      zone de glyphes centrée, testable) + `framePath` (losange inscrit exact, bulle BD à
      queue, nuage à bosses + bulles de pensée). Solide → CAShapeLayer + glyph sublayer ;
      glass → masque CAShapeLayer sur le backdrop. Formes à coins : comportement inchangé.
- [x] It.4 — Édition recentrée : `beginInlineTextEdit` recentre la calque au milieu du
      canvas (rotation annulée) SANS muter le modèle ; `reapplyInlineEditingIfNeeded`
      re-centre après chaque rebuild ; `endInlineTextEdit` restaure position/rotation
      réelles. Bascule directe texte A → texte B : A restauré immédiatement.
- [x] It.5 — UI : switch exhaustifs (`frameChipRadius`) ; les pickers (allCases) exposent
      automatiquement les nouveaux styles/formes.
- [x] It.6 — Tests : `StoryTextStyleAndFrameShapeTests` (SDK, parsing + Codable round-trip +
      usesCustomPath + fallbacks) ; `StoryTextLayerFrameGeometryTests` (UI, métriques des
      cadres, tracés dans les bounds, résolution famille nommée, graisse visible =
      deux faces distinctes, style système conservé).

## Review
- Point 1 : les gestes pan/pinch/rotate existaient déjà sur les textes (position normalisée
  clampée 0..1 = tout le canvas) ; le blocage perçu venait de l'édition « en place » —
  désormais l'édition est centrée et la sortie rend la manipulation immédiate.
- Compat descendante : décodeurs tolérants partout (rawValue inconnu → fallback bold/rounded),
  gateway Zod en `.passthrough()` (max 64 chars OK), web viewer `default:` OK, Android stocke
  `textStyle` en `String?` brut. Aucune migration nécessaire.
- ⚠️ Pas de toolchain Swift dans cet environnement Linux : `./apps/ios/meeshy.sh test` /
  `xcodebuild test -scheme MeeshySDK-Package` à lancer sur macOS pour valider.
