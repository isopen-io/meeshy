# Story Reactions + Canvas UX Fixes — design

**Date** : 2026-05-28
**Auteur** : Claude (Opus 4.7) — discussion avec @jcnm
**Statut** : Design — prêt pour writing-plans
**Effort estimé** : ~1.5–2 jours
**Approche** : Fixes chirurgicaux par axe (Approche A retenue après brainstorming)

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

**Fix** : factoriser un préambule dans `triggerStoryReaction` (StoryViewerView.swift:1004) qui dismiss toutes les overlays bloquantes **avant** de lancer l'animation :

```swift
private func triggerStoryReaction(_ emoji: String) {
    HapticFeedback.medium()
    // Dismiss any overlay that would mask the big-reaction animation.
    if showFullEmojiPicker {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showFullEmojiPicker = false
        }
    }
    if showEmojiStrip {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showEmojiStrip = false
        }
    }
    // ... existing animation + count/state mutation + sendReaction(emoji)
}
```

Supprimer le `DispatchQueue.asyncAfter(0.5) { showEmojiStrip = false }` ligne 1028 (devenu redondant).

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

**B.1** — `applyCommentReactionEvent` (StoryViewerView+Content.swift:1446) early-return si `!showCommentsOverlay`. L'event socket reçu plus tard est ignoré → drift entre optimistic et serveur.

**Fix B.1** : retirer le `guard showCommentsOverlay else { return }`. L'état doit s'aligner sur le serveur que l'overlay soit ouvert ou fermé.

**B.2** — Au reload via cache (`loadStoryCommentsAsync` ligne 1530), `storyComments` est remplacé mais `storyCommentLikedIds` n'est jamais recalculé.

**Fix B.2** : appeler `storyCommentLikedIds = Self.computeLikedIds(from: response.data)` à chaque chargement (cache hit ET network). La fonction pure existe déjà ligne 1517 mais n'est appelée nulle part.

**B.3** — `FeedComment` mis en cache (`CacheCoordinator.shared.comments`) ne porte pas `currentUserReactions`. Au cache hit, on n'a aucun moyen de savoir si l'utilisateur avait liké.

**Fix B.3** : étendre `FeedComment` avec `currentUserReactions: [String]?` (transitoire, hydraté depuis `APIPostComment.currentUserReactions` au mapping ligne 1571). Le cache GRDB le persiste automatiquement via Codable.

**Fichiers touchés** :
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (applyCommentReactionEvent, loadStoryCommentsAsync, fetchStoryCommentsFromNetwork)
- `apps/ios/Meeshy/Features/Main/Models/StoryModels.swift` ou équivalent (FeedComment + currentUserReactions)
- `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift` (étendre les tests)

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
- Centraliser la règle dans `StoryDurationPolicy` (nouveau fichier sous `MeeshyUI/Story/Canvas/`, code pur sans dépendance UIKit — testable depuis `MeeshyUITests`) :
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

**Cause à confirmer pendant impl** : `StoryGlassBackdropLayer` a deux chemins (a) MPS texture via `setBackdropTexture()`, (b) fallback `CAFilter "gaussianBlur"`. Si AUCUN des deux n'est actif en mode `.play`, la couche reste sur sa couleur de fond par défaut (probablement noir).

**Fix** :
1. Vérifier dans `rebuildLayers()` (StoryCanvasUIView.swift:1286) que `backdropProvider` est appelé en mode `.play`. Si gaté à `.edit`, débloquer.
2. Vérifier que `StoryGlassBackdropLayer.init()` initialise `backgroundColor = clear` (pas opaque noir).
3. S'assurer que `setBackdropTexture()` est ré-appelé après chaque `rebuildLayers()` en `.play` mode.
4. Si AUCUNE de ces causes ne se vérifie : documenter la nouvelle cause + valider l'angle de fix avec @jcnm avant impl.

**Fichiers touchés** :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift` (init + defaults)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (rebuildLayers / backdropProvider gate)
- (potentiellement) `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackdropCapture.swift`

**Tests** :
- `StoryGlassBackdropLayerTests.test_defaultBackgroundColor_isClear`
- `StoryCanvasPlayModeTests.test_textWithGlassBackground_invokesBackdropProvider`

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

Le pattern `dismiss-then-react` (Section 1A) est appliqué dans `triggerStoryReaction`. Il bénéficie à **tous les chemins d'entrée** : strip rapide, full picker, et tout chemin futur. Aucune logique supplémentaire à section 1A.

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
| 1B | 3 | XCTest viewmodel + codable |
| 2A | 1 | XCTest UIKit gesture |
| 2B | 6 | Swift Testing (`@Test`) pure SDK |
| 2C | 2 | XCTest UIKit layer |
| 3 | 5 | XCTest viewmodel + snapshot |
| **Total** | **~20** | |

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
- Pas de migration du schema `FeedComment` en base : `currentUserReactions` est transitoire (hydraté depuis API, persisté dans le cache GRDB iOS uniquement)

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
