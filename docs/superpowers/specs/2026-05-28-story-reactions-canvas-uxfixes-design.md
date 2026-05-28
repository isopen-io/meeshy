# Story Reactions + Canvas UX Fixes — design

**Date** : 2026-05-28
**Auteur** : Claude (Opus 4.7) — discussion avec @jcnm
**Statut** : Design — prêt pour writing-plans
**Effort estimé** : ~1.5–2 jours (peut glisser à 2.5j si H1/H2/H3 ne se confirment pas en investigation 2A ou 2C)
**Approche** : Fixes chirurgicaux par axe (Approche A retenue après brainstorming)
**Re-revue Opus 4.7** : 2026-05-28 — 5 erreurs draft corrigées (FeedComment SDK-side, CodingKeys manuel, computeLikedIds dual-path, GlassBackdropLayer default = blanc translucide pas noir, strip dismiss = délai préservé)

Distinct de `2026-05-28-story-canvas-unification-design.md` qui traite la
mutualisation des instances `StoryCanvasUIView` au niveau prefetcher (perf
mémoire). Le présent spec couvre **7 bugs UX/comportement** indépendants
identifiés sur le viewer + composer + canvas.

## Contexte

7 problèmes signalés sur les stories iOS (création + visualisation) :

1. **Full picker emoji ne réagit pas** quand on tape un emoji dans la sheet plein écran
2. **Hearts de commentaires** ne persistent pas et le compteur ne suit pas correctement
3. **Zoom de texte** (pinch) ne montre le résultat qu'au release, pas pendant le geste
4. **Loops audio/vidéo BG** : un média de fond < 6s doit boucler jusqu'à ≥ 6s de durée totale de slide
5. **Preview ≡ Viewer** : les frames glass/black du texte rendent comme cadres noirs uniformes dans le preview (qui EST le viewer)
6. **Slider bordure texte** : le panneau actuel propose 4 chips presets `Aucun/Fin/Moyen/Épais` ; tant que la sélection est `Aucun`, les couleurs sont grisées. L'utilisateur veut un slider continu + couleurs toujours actives.
7. **Animation big-reaction** invisible derrière le full picker quand l'utilisateur tape un emoji

### Architecture canvas — état actuel (à préserver)

```
StoryCanvasUIView (UIKit/CALayer)
   ├── .edit mode → StoryComposerView (composer)
   └── .play mode → StoryReaderRepresentable
                       ├── StoryViewerView (viewer)
                       └── StoryViewerView (isPreviewMode: true) — preview avant publication

SlideMiniPreview (SwiftUI approximatif)
   └── slide tray uniquement (5–10 miniatures simultanées)
```

**Préservé** : le canvas réel (`StoryCanvasUIView`) reste partagé entre composer / viewer / preview. `SlideMiniPreview` reste pour la tray (économie de RAM).

## Objectif

Corriger les 7 bugs sans introduire de divergence d'architecture. Chaque
chantier indépendant, testable isolément, mergeable en commit séparé.

## Spec par chantier

### Section 1 — Réactions

#### 1A. Full picker emoji story — dismiss + animation visible

**Symptôme** : tap sur un emoji dans `EmojiFullPickerSheet` (SDK Primitives) → rien ne se passe à l'écran.

**Cause** : le wiring (`onReact → triggerStoryReaction → sendReaction → POST /posts/:id/like`) est OK. Mais la sheet ne se dismiss pas après le tap, et l'animation `bigReactionEmoji` est rendue derrière la sheet plein écran → utilisateur ne voit aucun feedback.

**Fix** : factoriser dans `triggerStoryReaction` (StoryViewerView.swift:1004) un préambule qui dismiss **uniquement le full picker** immédiatement (sinon utilisateur ne voit rien). Le strip rapide garde son `asyncAfter(0.5)` existant — c'est un **feedback visuel délibéré** (écho de l'emoji choisi avant disparition) :

```swift
private func triggerStoryReaction(_ emoji: String) {
    HapticFeedback.medium()
    // Full picker covers ENTIRE screen → must dismiss immediately so the big-reaction
    // animation (`bigReactionEmoji`) is visible. Strip is partial overlay → keep its
    // 0.5s dismissal delay below (deliberate visual echo, established UX).
    if showFullEmojiPicker {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showFullEmojiPicker = false
        }
    }
    // ... existing animation + count/state mutation + sendReaction(emoji)
    // ... existing `DispatchQueue.asyncAfter(0.5) { showEmojiStrip = false }` STAYS
}
```

Le `DispatchQueue.asyncAfter(0.5) { showEmojiStrip = false }` ligne 1028 est **conservé** (rectification du draft précédent qui le supprimait à tort).

**À auditer pendant l'impl** : vérifier que `EmojiFullPickerSheet.selectEmoji` (Primitives/EmojiReactionPicker.swift:417) déclenche bien `onReact?(emoji)`. Si le `Button` est intercepté par un gesture parent, corriger côté SDK.

**Fichiers touchés** :
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (triggerStoryReaction)
- (optionnel) `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift` (selectEmoji si rupture confirmée)

**Tests** :
- `StoryViewerReactionFlowTests.test_fullPicker_emojiTap_dismissesSheetAndPlaysAnimation`
- `StoryViewerReactionFlowTests.test_strip_emojiTap_dismissesStripAndPlaysAnimation`
- `StoryViewerReactionFlowTests.test_reactionFlight_API_isCalledWithCorrectEmoji_andStoryId`

#### 1B. Hearts de commentaires — persistence + counter

**Symptômes** :
- Le cœur appliqué sur un commentaire disparaît après refresh / changement de slide
- Le compteur ne reflète pas correctement le serveur

**3 bugs identifiés** :

**B.1** — `applyCommentReactionEvent` (StoryViewerView+Content.swift:1457) early-return si `!showCommentsOverlay`. L'event socket reçu plus tard est ignoré → drift entre optimistic et serveur.

**Fix B.1** : retirer le `guard showCommentsOverlay else { return }`. Conserver les deux autres guards (`postId == currentStory?.id`, `emoji == heartEmoji`). Précaution : si l'event arrive et que `storyComments` est vide (overlay jamais ouvert), `firstIndex(where:)` retourne `nil` et le code skip silencieusement — comportement OK, pas de crash, on ré-aligne au prochain load.

**B.2** — Au reload (`loadStoryCommentsAsync` ligne 1540), `storyComments` est remplacé mais `storyCommentLikedIds` n'est jamais recalculé. Deux chemins distincts à traiter :
- **Network path** (`fetchStoryCommentsFromNetwork`) : a accès à `response.data: [APIPostComment]` qui porte `currentUserReactions`. La fonction existante `Self.computeLikedIds(from: [APIPostComment])` (ligne 1527) marche directement.
- **Cache path** (`loadStoryCommentsAsync` cases `.fresh`/`.stale`) : reçoit `[FeedComment]` (déjà mappé). `FeedComment` ne porte PAS `currentUserReactions` aujourd'hui → impossible de recalculer.

**Fix B.2** :
1. Ajouter une overload `static func computeLikedIds(fromCachedComments: [FeedComment]) -> Set<String>` qui lit le nouveau champ (cf. B.3)
2. Appeler la bonne overload selon le chemin (network → APIPostComment, cache → FeedComment)
3. Mettre à jour `storyCommentLikedIds` à chaque hit (fresh, stale, network success)

**B.3** — `FeedComment` (défini SDK-side `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:221`) ne porte pas `currentUserReactions`. Le mapping `APIPostComment → FeedComment` (StoryViewerView+Content.swift:1398) drop ce champ.

**Fix B.3** :
1. Ajouter `public var currentUserReactions: [String]?` au struct `FeedComment` (SDK)
2. Ajouter `currentUserReactions` aux `CodingKeys` enum (ligne 261-262) — sinon le cache GRDB ne persiste PAS le champ (CodingKeys est strict dans ce fichier)
3. Étendre `init(from decoder:)` et `encode(to encoder:)` (lignes 265+ et suivantes) — ce sont des implémentations manuelles, pas synthétisées
4. Étendre l'init principal (ligne 243-254) avec `currentUserReactions: [String]? = nil`
5. Étendre le mapping `APIPostComment → FeedComment` (ligne 1398) pour propager le champ

Note : la `FeedComment` SDK est consommée par d'autres vues (feed, postes). L'ajout d'un champ optionnel `currentUserReactions: [String]?` est rétrocompatible — les vues qui ne le lisent pas ne changent rien.

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` (`FeedComment` struct + Codable manuel)
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (`applyCommentReactionEvent`, `loadStoryCommentsAsync`, `fetchStoryCommentsFromNetwork`, mapping ligne 1398, overload `computeLikedIds(fromCachedComments:)`)
- `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift` (étendre)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedCommentCodableTests.swift` (créer ou étendre)

**Tests** :
- `StoryViewerCommentReactionTests.test_applyEvent_whenOverlayClosed_stillUpdatesState`
- `StoryViewerCommentReactionTests.test_reloadComments_restoresLikedIdsFromCurrentUserReactions`
- `FeedCommentCodableTests.test_roundtrip_preservesCurrentUserReactions`

### Section 2 — Comportements canvas

#### 2A. Live text zoom pendant pinch

**Symptôme** : pinch sur un texte → le résultat ne s'affiche qu'au release.

**Investigation pendant impl** : `handlePinch.changed` (StoryCanvasUIView.swift:2333-2350) appelle `slide = updateScale(...)` qui devrait propager via `slide.didSet` → `rebuildLayers()`. 3 hypothèses à tester en RUNNING :

- **H1** : `updateScale` mute `scale` du modèle mais le `CATextLayer.string` ne change pas → texte ne re-render pas tant que `rebuildLayers` n'a pas recalculé `bounds`
- **H2** : `slide.didSet` est debounced via une `CATransaction` → `.changed` fire à 60Hz mais l'écran n'est rafraîchi qu'au `.ended`
- **H3** : `onItemModified?(slide)` callback retarde le commit via le ViewModel parent

**Fix** :
1. Reproduire en RUNNING + identifier l'hypothèse correcte
2. Si H1 : appliquer un `CATransform3DScale` live sur le `StoryTextLayer` (sans rebuild complet) — pattern déjà utilisé pour le BG (StoryCanvasUIView.swift:2333-2347). Commit la mutation modèle à `.ended` uniquement.
3. Si H2/H3 : retirer le batching pour les éléments texte ou aligner sur le pattern bg.
4. Si AUCUNE des trois ne se vérifie : documenter H4 (la nouvelle hypothèse trouvée) + valider avec @jcnm avant d'écrire du code.

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (handlePinch.changed + helpers texte live transform)

**Tests** :
- `StoryCanvasPinchTests.test_textPinch_changed_updatesLayerTransformLive` — instrumenter pour assert que `presentationLayer.transform` du `StoryTextLayer` reflète bien le scale courant entre `.began` et `.ended`

#### 2B. Loop ≥ 6s pour BG audio/vidéo < 6s

**Règle** : si un média BG (audio OU vidéo) a une durée `d` avec `0 < d < 6s`, la slide doit jouer pendant `n × d ≥ 6s` (`n = ceil(6 / d)`).

Le bouclage natif est déjà géré par `AVPlayerLooper` (`StoryBackgroundLayer.swift:612`). C'est seulement la **durée nominale de la slide** qui doit s'ajuster.

**Fix** :
- Centraliser la règle dans `StoryDurationPolicy` (nouveau fichier sous `MeeshyUI/Story/Canvas/`, code pur sans dépendance UIKit — testable depuis `MeeshyUITests`)
- **Data flow** : la durée du média BG (`backgroundMediaDuration`) doit être disponible **avant** de programmer le timer de slide. Aujourd'hui `AVPlayer.duration` est résolu async via KVO sur `AVURLAsset`. Le `StoryReaderTimerController` doit attendre ce signal AVANT de démarrer le timer (ou re-programmer une fois la durée connue). Cas dégradé : si la durée arrive après que le timer a démarré avec la valeur `intrinsic`, on ajuste le timer dynamiquement à `adjustedDuration` (no-op si elle est déjà ≥ adjusted).
- Constante :
  ```swift
  public enum StoryDurationPolicy {
      public static let minimumLoopAccumulation: TimeInterval = 6.0

      public static func adjustedDuration(
          intrinsic: TimeInterval,
          backgroundMediaDuration: TimeInterval?
      ) -> TimeInterval {
          guard let d = backgroundMediaDuration, d > 0, d < minimumLoopAccumulation else {
              return intrinsic
          }
          let loops = ceil(minimumLoopAccumulation / d)
          return loops * d
      }
  }
  ```
- Brancher dans `StoryReaderTimerController` (le calcul de durée de slide en mode `.play`) avant de programmer le `Timer.scheduledTimer` ou le `displayLink` qui fait avancer la progress bar.
- Brancher aussi côté composer si le composer calcule une durée prévisionnelle (à confirmer pendant l'impl).

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift` (nouveau, SDK pur)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` (si nécessaire)

**Tests** :
- `StoryDurationPolicyTests.test_bgVideo_2_5s_durationIsExactly_7_5s` (3 × 2.5)
- `StoryDurationPolicyTests.test_bgVideo_5_9s_durationIsExactly_11_8s` (2 × 5.9)
- `StoryDurationPolicyTests.test_bgVideo_6_0s_durationIsIntrinsic_6s` (pas de multiplication)
- `StoryDurationPolicyTests.test_bgAudio_4s_durationIsExactly_8s` (2 × 4)
- `StoryDurationPolicyTests.test_noBgMedia_durationFallsBackToIntrinsic`
- `StoryDurationPolicyTests.test_bgMedia_durationZero_fallsBackToIntrinsic`

#### 2C. Glass backdrop noir dans viewer/preview

**Symptôme** : texte avec `backgroundStyle: .glass` apparaît comme cadre noir uni dans le viewer (et donc dans le preview, qui EST le viewer).

**Cause à confirmer pendant impl** : `StoryGlassBackdropLayer` a deux chemins (a) MPS texture via `setBackdropTexture()`, (b) fallback `CAFilter "gaussianBlur"`. **Rectification du draft** : `StoryGlassBackdropLayer.init()` ligne 52 pose `backgroundColor = UIColor.white.withAlphaComponent(0.18).cgColor` — donc la couleur de fond par défaut est BLANC translucide, pas noir. Le cadre noir vient donc d'ailleurs.

Hypothèses ré-orientées :
- **H1** : Le `CAFilter "gaussianBlur"` n'est pas supporté en mode `.play` (déprécié / privé API). Sans filtre, le layer rend juste son backgroundColor blanc — mais SI la couche au-dessus (le `CATextLayer`) a un `backgroundColor` noir ou un état rendu différent, l'apparence finale est noire.
- **H2** : `setBackdropTexture()` n'est jamais appelé en mode `.play` parce que `StoryBackdropCapture.captureCanvasBackdrop` (cf. StoryBackdropCapture.swift) est gaté à `.edit` ou n'a pas accès à la canvas snapshot en mode `.play`.
- **H3** : Le `bounds` de `StoryGlassBackdropLayer` est `.zero` en mode `.play` à cause d'une race entre l'attache du layer et le layout. Un layer 0×0 avec backgroundColor blanc translucide est invisible — le noir perçu est en réalité le `CATextLayer` parent.

**Fix** :
1. Reproduire en RUNNING + inspecter la couche dans le debugger (Xcode View Hierarchy)
2. Si H1 : remplacer le fallback `CAFilter` par un `UIVisualEffectView` snapshot baked dans le layer, OU forcer la capture MPS aussi en `.play` mode
3. Si H2 : étendre `StoryBackdropCapture` pour fonctionner en `.play` mode (besoin d'une snapshot canvas même quand le user n'édite pas)
4. Si H3 : assurer le layout chain entre attach + bounds set, possiblement via `setNeedsLayout` après `rebuildLayers`
5. Si AUCUNE des trois ne se vérifie : documenter H4 + valider avec @jcnm avant code

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift` (selon H choisie)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (rebuildLayers / backdropProvider gate)
- (potentiellement) `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackdropCapture.swift`

**Tests** :
- `StoryCanvasPlayModeTests.test_textWithGlassBackground_invokesBackdropProvider` (à adapter selon la cause confirmée)
- `StoryGlassBackdropLayerTests.test_initialBackgroundColor_isWhiteTranslucent` (snapshot de l'état attendu)
- Test snapshot end-to-end : `StoryViewerView_GlassBackdropSnapshotTests.test_textWithGlassBg_renderedInPlayMode` (visuel : pas de cadre noir, blur visible)

### Section 3 — UX bordure texte

#### 3A. Slider continu + couleurs toujours actives

**Avant** (`TextEditToolOptions.swift:211-238`) :
- 4 chips presets `Aucun / Fin (2pt) / Moyen (4pt) / Épais (8pt)`
- Palette de couleurs `.disabled(borderColor == nil)` et `.opacity(0.4)` (grisée par défaut)
- `Aucun` → `borderColor = nil`, `borderWidth = nil`

**Après** :
- Un `Slider(value: $borderWidth, in: 0...12, step: 0.5)` continu, tint `MeeshyColors.brandPrimary`, encadré par icônes (`text.below.photo` gauche / `bold` droite)
- À l'ouverture du tool `border`, si état neutre (`borderColor == nil && borderWidth == nil`) : initialiser `borderColor = "FFFFFF"` (blanc) et `borderWidth = 4` (défaut médian)
- Palette de couleurs **toujours active** (suppression de `.disabled` + `.opacity`)
- Tap d'une couleur → `borderColor = hex` (jamais `nil`)
- Slider à `0` → `borderWidth = 0`, `borderColor` conservé → rien ne se rend (cf. 3B). L'utilisateur peut remonter sans re-choisir une couleur.

**Étiquette numérique** : à ajouter à droite du slider (cohérence avec `sizeOptions` du même fichier).

#### 3B. Render `borderWidth = 0` invisible

Aujourd'hui (`StoryTextLayer.swift:75-79`) :
```swift
if let borderHex = text.borderColor, let borderColor = parseHexColor(borderHex) {
    let widthPx = CGFloat(text.borderWidth ?? 3.0)
    strokeAttrs[.strokeColor] = borderColor.cgColor
    strokeAttrs[.strokeWidth] = -(widthPx / max(designFontSize, 1)) * 100.0
}
```

**Fix** : guard `widthPx > 0` avant d'appliquer le stroke. Garantit que `borderWidth = 0` ⇔ aucun trait, quelle que soit la couleur.

#### 3C. Modèle inchangé

`borderColor: String?` et `borderWidth: Double?` existent déjà sur `StoryTextObject`. Pas de migration. Stories existantes avec `borderColor == nil` continuent à rendre sans bordure ; le tool initialise les défauts au premier ouvert.

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift` (panneau `borderOptions`)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` (guard `widthPx > 0`)

**Tests** :
- `TextEditToolOptionsBorderTests.test_openBorderTool_initializesDefaults_whenNeutral`
- `TextEditToolOptionsBorderTests.test_openBorderTool_keepsExistingValues_whenAlreadySet`
- `TextEditToolOptionsBorderTests.test_colorPalette_alwaysEnabled_evenWithZeroWidth`
- `StoryTextLayerTests.test_borderWidth_zero_rendersNoStroke` (snapshot)
- `StoryTextLayerTests.test_borderWidth_4_rendersStroke_atMidIntensity` (snapshot)

### Section 4 — Cohérence cross-chantier (animation reaction visibility)

Le pattern `dismiss-full-picker-immediately + keep-strip-delay` (Section 1A) règle la visibilité de l'animation `bigReactionEmoji` pour les **deux** chemins d'entrée :
- **Full picker** : dismiss immédiat synchrone avec l'animation (sinon écran couvert, utilisateur ne voit rien)
- **Strip** : dismiss après 0.5s (existant ; feedback visuel délibéré de l'emoji choisi)

Aucune logique supplémentaire à 1A. Cette section sert de documentation transverse pour les futurs chemins de réaction (ex : tap direct sur canvas, raccourci clavier) — la règle est : **si l'overlay couvre l'animation, dismisser immédiatement ; sinon, garder l'écho visuel.**

## Order d'implémentation suggéré

1. **Section 4 / 1A** (animation + full picker dismiss) — quick win, débloque la perception du Full picker
2. **Section 1B** (hearts comments persistence + counter) — 3 bugs isolés
3. **Section 3** (border slider UX) — change concret de design, peu de risque
4. **Section 2A** (live text zoom) — investigation-first
5. **Section 2B** (loop 6s) — feature pure, isolée dans `StoryDurationPolicy`
6. **Section 2C** (glass backdrop) — investigation + fix canvas

## Tests transverses

| Section | Tests ajoutés | Type |
|---|---|---|
| 1A | 3 | XCTest viewmodel + integration |
| 1B | 4 | XCTest viewmodel + Swift Testing codable (MeeshySDKTests) |
| 2A | 1 | XCTest UIKit gesture |
| 2B | 6 | Swift Testing (`@Test`) pure SDK |
| 2C | 2 | XCTest UIKit layer |
| 3 | 5 | XCTest viewmodel + snapshot |
| **Total** | **~21** | |

## Risques + mitigations

| Risque | Mitigation |
|---|---|
| `EmojiFullPickerSheet.onReact` non déclenché par tap (gesture intercepté) | Investiguer en RUNNING au début de Section 1A. Si confirmé, fix côté SDK. |
| `handlePinch.changed` debounced via `CATransaction` global | Investigation H1/H2/H3 avant fix (Section 2A) |
| `StoryGlassBackdropLayer` defaults dépendent du device | Tests snapshot sur 2+ devices (iPhone 16 Pro + iPhone SE 3) |
| Slider bordure mute `borderColor` à la valeur 0 (Bug B.3-style) | Test `test_colorPalette_alwaysEnabled_evenWithZeroWidth` couvre ce cas |
| Changement de durée de slide (2B) cassant la timeline d'audio overlays | Couvrir par test integration `StoryReaderTimerControllerTests.test_audioOverlaySync_withLoopedBG` |

## Hors-scope

- Pas de refonte de `SlideMiniPreview` (la tray garde son approximation SwiftUI — décision @jcnm)
- Pas d'introduction d'un mode `.preview` distinct de `.play` (Approche B rejetée — divergence pas justifiée aujourd'hui)
- Pas de migration du schema `FeedComment` en base backend : le champ `currentUserReactions` est ajouté **côté model SDK Swift** (`FeedModels.swift`) et persisté dans le cache GRDB iOS uniquement. Le backend continue à le servir via `APIPostComment.currentUserReactions` (déjà existant).
- Pas d'event queue persistante pour les `applyCommentReactionEvent` reçus quand `storyComments` est vide (overlay jamais ouvert) — on s'aligne au prochain reload. Acceptable car les events socket sont éphémères et le state serveur est toujours autoritaire au load suivant.

## Décisions architecturales

| Décision | Choix | Justification |
|---|---|---|
| Mode canvas | `.edit` / `.play` inchangé | Preview ≡ viewer ; pas de divergence |
| `SlideMiniPreview` | Conservé | Économie RAM sur 5–10 miniatures |
| Slider bordure | 0–12pt, step 0.5, défaut 4 | Recommandation @jcnm validée |
| Min loop | 6.0s constante centralisée | Règle @jcnm uniforme audio + vidéo |
| `FeedComment.currentUserReactions` | Champ transitoire optionnel | Pas de migration backend, hydraté au mapping |

## Prochaine étape

Exécuter `superpowers:writing-plans` pour générer le plan d'implémentation par chantier (TDD increments, branches Git, ordre de merge).
