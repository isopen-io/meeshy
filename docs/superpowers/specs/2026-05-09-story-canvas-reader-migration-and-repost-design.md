# Story Canvas — Reader Migration + Phase 5 Repost

**Date** : 2026-05-09
**Author** : Claude (brainstorming session avec J. Charles N. M.)
**Status** : Approved (design phase) — Ready for implementation plan
**Worktree** : `.claude/worktrees/feat+story-canvas-fidelity`
**Related** :
- `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md` (spec mère — phases P0..P5)
- Phases P0/P1/P2/P3/P4 + Tasks 2.18/2.19 livrées (tag `story-canvas-p4-complete`, commits `8754f97b..828b9a03`)

---

## 1. Objectif et contrat

### 1.1 Objectif

Finaliser la refonte Story Canvas (spec mère §8) en livrant deux chantiers couplés :

1. **Reader migration** — supprimer les ~2400 lignes legacy SwiftUI de lecture (`StoryCanvasReaderView.swift`, `StoryCanvasReaderView+Timeline.swift`, `DraggableMediaView.swift`, `DraggableTextObjectView.swift`) et brancher les 4 call sites consommateurs sur le nouveau pipeline `StoryCanvasUIView` (mode `.play`) via une surface SwiftUI drop-in `StoryReaderRepresentable`.
2. **Phase 5 (spec mère §6)** — `RepostPayload` + `CanvasReprojector` + import dans le post composer + indicateur clamping + 7 tests, pour permettre la création d'un post natif depuis une story avec préservation des positions cross-aspect.

### 1.2 Contrat de design — zéro perte de feature, no trade-off

> Le Plan A garantit que **chacune des 16 features identifiées dans la review** (cf. §3) est portée dans le `StoryCanvasUIView` / `StoryRenderer` / `ReaderAudioMixer` **avant** que les call sites soient migrés. Aucune feature n'est supprimée silencieusement, aucune feature n'est « différée ». **Pas de trade-off entre features et performance** : les composants optimisés (Metal kernels, MPSImageGaussianBlur, VideoToolbox HW decode, PencilKit, ReaderAudioMixer sample-accurate, CALayer rasterization, ProMotion 60-120 Hz) sont utilisés **sur les 3 surfaces utilisateur** :
>
> | Surface | Mode | Pipeline rendu | Composants optimisés actifs |
> |---------|------|----------------|----------------------------|
> | **Reader** (`StoryViewerView`, `StoryRepostEmbedCell`, `FeedPostCard`, `UnifiedPostComposer` preview) | `.play` | `StoryReaderRepresentable → StoryCanvasUIView(mode:.play)` | TOUS : Metal filters, MPS blur, VideoToolbox decode, mixer audio, ProMotion 60 Hz, layer rasterization sur items statiques, AVPlayer pre-roll |
> | **Composer édition** (`StoryComposerView`) | `.edit` | `StoryComposerCanvasView → StoryCanvasUIView(mode:.edit)` | TOUS : Metal filters live preview, PencilKit drawing, ProMotion 120 Hz pour gestures, MPS blur stickers/glass UI |
> | **Composer preview** (toggle Play dans le composer) | `.play` | Même `StoryCanvasUIView` instance, `setMode(.play, time:.zero)` | TOUS : identique au Reader, par construction (même renderer) |
>
> **Identité bit-exact** : `StoryRenderer.render()` est la SEULE source de rendu, appelée par les 3 surfaces ET par `StoryAVCompositor` à l'export. Live preview composer = export AVFoundation = lecture viewer Reader = pixel-exact (cf. spec mère §4.3).
>
> Les acceptance criteria (cf. §10) incluent un test par régression. Les features SwiftUI du composer (toolbars, sheets, palettes, alerts, pickers, ProTimeline) restent **intactes** (cf. §3.2).

### 1.3 Améliorations en passant (gains nets, sans perte)

| Gain | Mécanique | Référence spec mère |
|------|-----------|---------------------|
| Audio sample-accurate (élimine 30-100 ms jitter) | `ReaderAudioMixer` (`AVAudioTime(hostTime:)`-driven, déjà livré 296 l.) | §1.1 divergence #7 |
| Suppression `.easeInOut(0.15s)` parasite sur opacity time-gated | `StoryRenderer.shouldFade` respecte `fadeIn`/`fadeOut` explicites uniquement | §1.1 divergence #6 |
| Cross-device fidelity iPad ↔ iPhone | `CanvasGeometry` linéaire (déjà livré P1) | §1.1 divergence #1 + #2 |
| Un seul `CADisplayLink` (vs 3 timers legacy) | Render-driven canvas + audio event-driven mixer | §4 |
| Live preview = export bit-exact | Les 4 call sites embed bénéficient automatiquement de la cohérence (StoryAVCompositor partage `StoryRenderer.render()`) | §5.2 |

### 1.4 Hypothèse vérifiée — modèle « 1 story = 1 slide »

Côté modèle Meeshy, **une `StoryItem` correspond 1:1 à un `StorySlide`**. Pas de tableau de slides intra-story. Le slide unique a une **timeline interne** (clipTransitions, keyframes) géré par le `StoryRenderer` à chaque frame en fonction de `currentTime`. La progression entre stories successives (Bob 1 → Bob 2 → Bob 3 → Alice 1 → ...) est gérée par le shell `StoryViewerView` (apps/ios), pas par le Reader Representable. Le Representable rend UN slide unique en mode `.play` et notifie `onCompletion` quand `currentTime ≥ effectiveSlideDuration()`.

---

## 2. Découpage en 2 plans indépendants

| Plan | Spec | Périmètre | PR |
|------|------|-----------|----|
| **A** (ce document) | `2026-05-09-story-canvas-reader-migration-and-repost-design.md` | Reader migration + Phase 5 RepostPayload | 1 PR mergeable seul |
| **B** (séparé) | `2026-05-09-story-canvas-phase4-followups-design.md` | Synthetic video track + SSIM tolerance + cache layer-tree (follow-ups Phase 4) | 1 PR mergeable seul |

Les deux plans sont indépendants. A peut démarrer immédiatement. B peut être parallélisé ou enchaîné.

---

## 3. Audit de régression — 16 features legacy à porter

Audit fait à partir du diff `StoryCanvasReaderView` (1732 l.) + `StoryCanvasReaderView+Timeline.swift` (94 l.) ↔ `StoryCanvasUIView` (762 l.) + `StoryRenderer` (156 l.) + `Layers/*.swift` au moment du brainstorming (2026-05-09). Tag d'état : `story-canvas-p4-complete`.

| # | Feature | Localisation legacy | Couvert dans Canvas actuel ? | Sous-section |
|---|---------|--------------------|:----------------------------:|--------------|
| 1 | `resolvedText(for:)` textObjects multilingue | `StoryCanvasReaderView.swift:605` | ❌ | A1.a |
| 2 | `resolvedContent(preferredLanguage:)` slide content | `StoryCanvasReaderView.swift:378` | ❌ (helper SDK existe l.1236, non câblé) | A1.a |
| 3 | Background layer (color/gradient/image + thumbHash placeholder) | `StoryCanvasReaderView.swift:227-345` | ❌ (Canvas = `backgroundColor = .black`) | A1.b |
| 4 | `backgroundTransform` (scale/offsetX/offsetY/rotation) | `StoryCanvasReaderView.swift:265-268` | ❌ | A1.b |
| 5 | `backgroundAudio` + `backgroundAudioVariants[lang]` | `StoryCanvasReaderView.swift:978` | ❌ | A1.c |
| 6 | Background video looping (`AVPlayerLooper`, mute) | `StoryCanvasReaderView.swift:661-664` | ❌ | A1.b+c |
| 7 | `audioPlayerObjects` foreground (`StoryAudioPlayerObject` startTime/duration/fade) | `StoryCanvasReaderView.swift:1483-1598` | ❌ (mixer existant 296 l. mais non câblé au Canvas) | A1.c |
| 8 | Audio ducking (foregroundSoundDidStart → bg × 0.5) | `StoryCanvasReaderView.swift:1203` | ❌ (à ajouter au mixer via `scheduleVolumeFade`) | A1.c |
| 9 | `fadeOutThenStop()` au dismiss | `StoryCanvasReaderView.swift:1141` | ❌ (mixer fades l.187 partiel, pas global) | A1.c |
| 10 | `KeyframeInterpolator` interpolate position/scale/opacity | `StoryCanvasReaderView+Timeline.swift:51-92` | ❌ (interpolator existe au SDK, non câblé Canvas) | A1.d |
| 11 | `clipTransitions` crossfade entre clips vidéo | `StoryCanvasReaderView+Timeline.swift:10-23` | ❌ | A1.d |
| 12 | Mute/Unmute NotificationCenter (`.storyComposerMuteCanvas`/`.storyComposerUnmuteCanvas`) | `StoryCanvasReaderView.swift:1054-1083` | ❌ | A1.c |
| 13 | `StoryEffects.opening` reveal/fade-in (`RevealCircleShape`) | `StoryViewerView.swift:474` | ❌ | A1.d |
| 14 | Image preloading via `CacheCoordinator.images` | `StoryCanvasReaderView.swift:916-965` | ❌ | A1.b |
| 15 | `onCompletion` quand `currentTime ≥ effectiveSlideDuration` | implicite via `currentTime` Published + parent observer | ❌ (Canvas n'expose pas `onCompletion`) | A1.a |
| 16 | **Filter live preview** (`slide.effects.filter` + Metal kernels) | `StoryComposerView.swift:78,1433-1434` (composer) ; `filterOverlay` (reader l.347) | ❌ (`StoryFilteredLayer` livré P3 mais non référencé dans `StoryRenderer`) | A1.e |

**Conclusion** : un drop-in naïf supprimerait toutes ces features. A1 (port playback runtime) est le vrai chantier ; A2-A5 ne représentent que ~25 % du travail.

### 3.1 Note sur le drawing read-only

`StoryRenderer.render()` (l.84-99) rend déjà le `slide.effects.drawingData` PencilKit en mode `.play` via rasterisation `PKDrawing.image(from:scale:)` et layer `zPosition = 9999`. **Aucune régression sur le drawing read-only** : le composer publie un drawing → le reader l'affiche correctement aujourd'hui via le canvas optimisé. Cette feature est explicitement **préservée et améliorée** (rasterisation Metal-backed PencilKit vs ancien rendu SwiftUI).

### 3.2 Inventaire composer — features SwiftUI préservées

Toutes les features ci-dessous **restent dans `StoryComposerView.swift` (1844 l.) et fichiers SwiftUI associés sans modification**. Elles écrivent dans le `slide` (via `viewModel`) qui est rendu par `StoryComposerCanvasView` → `StoryCanvasUIView` mode `.edit`.

| Catégorie | Feature | Fichier source | Statut |
|-----------|---------|----------------|:------:|
| Toolbars | `ContextualToolbar` (top + bottom) | StoryComposerView.swift l.658 | ✅ inchangé |
| Tools | 6 tool modes (`media`, `drawing`, `text`, `texture`, `filters`, `timeline`) | StoryComposerViewModel.swift l.8 | ✅ inchangé |
| Sheets | `StoryFilterPicker` / `StoryFilterGridView` | StoryFilterPicker.swift / StoryFilterGridView.swift | ✅ inchangé |
| Sheets | `StoryMusicPicker` (background music) | StoryMusicPicker.swift | ✅ inchangé |
| Sheets | `StoryAudioPanel` (foreground audio settings) | StoryAudioPanel.swift | ✅ inchangé |
| Sheets | `StoryVoiceRecorder` (record voice-over) | StoryVoiceRecorder.swift | ✅ inchangé |
| Sheets | `StoryTextEditorView` (multiline text edit) | StoryTextEditorView.swift | ✅ inchangé |
| Sheets | `DrawingToolbarPanel` (color/brush picker) | StoryComposerView.swift l.836 | ✅ inchangé |
| Sheets | Transitions picker (`opening`, `closing`) | StoryComposerView.swift l.1295 | ✅ inchangé |
| Sheets | `audioEditorItem` / `mediaAudioEditorItem` (full-screen audio editor) | StoryComposerView.swift l.292,302 | ✅ inchangé |
| Sheets | `EditingMediaImage` / `EditingMediaVideo` (per-element edit) | StoryComposerView.swift l.398,409 | ✅ inchangé |
| Pickers | `PhotosPicker` foreground media (images + videos) | StoryComposerView.swift l.92,932 | ✅ inchangé |
| Pickers | `fileImporter` audio document | StoryComposerView.swift l.287 | ✅ inchangé |
| Pickers | Background palette (color/gradient/image) | StoryComposerView.swift §"Story Background Picker Palette" l.9 | ✅ inchangé |
| Drawing | `PKCanvasView.undoManager?.undo()/.redo()` | StoryComposerView.swift l.841,846 | ✅ inchangé |
| Drawing | `DrawingTool` enum (pen, marker, eraser, etc.) | StoryComposerView.swift l.77 | ✅ inchangé |
| Timeline | `ProTimelineView` (Plans 1-4 v2 timeline editor) | Timeline/Views/Container/ProTimelineView.swift | ✅ inchangé |
| Timeline | `QuickTimelineView` | Timeline/Views/Container/QuickTimelineView.swift | ✅ inchangé |
| Timeline | `TimelineViewModel` + helpers | Timeline/ViewModel/* | ✅ inchangé |
| Background | `backgroundTransform` (zoom/pan/rotation gestures du composer) | StoryComposerViewModel.swift l.138-162 | ✅ inchangé (s'applique via A1.b qui rend le transform) |
| Drafts | Restore draft alert + `lostMediaCount` | StoryComposerView.swift l.173,178 | ✅ inchangé |
| Drafts | `StoryOfflineQueueBootstrap` | StoryOfflineQueueBootstrap.swift | ✅ inchangé |
| Discard | Discard alert | StoryComposerView.swift l.172 | ✅ inchangé |
| Publish | Visibility selector (PUBLIC/CONNECTIONS/etc.) | StoryComposerView.swift l.177 | ✅ inchangé |
| Publish | `storyLanguage` selector (langue de publication) | StoryComposerView.swift l.104 | ✅ inchangé |
| Publish | `openingEffect` / `closingEffect` | StoryComposerView.swift l.182-183 | ✅ inchangé |
| Publish | `publishTask` flow | StoryComposerView.swift l.118 | ✅ inchangé |
| Persistence | `StoryComposerViewModel` slide state + canvas zoom + tool active | StoryComposerViewModel.swift | ✅ inchangé |
| Sync canvas | Real-time `slide` ↔ `viewModel.slide` (Task 2.18) | StoryComposerView.swift l.279-285 | ✅ inchangé |
| Media coordinator | `StoryMediaCoordinator` (load + cache foreground media) | StoryMediaCoordinator.swift | ✅ inchangé |
| Media loader | `StoryMediaLoader` | StoryMediaLoader.swift | ✅ inchangé |
| Slide manager | `StorySlideManager` (multi-slide preview/draft) | StorySlideManager.swift | ✅ inchangé |
| Slide renderer SwiftUI | `StorySlideRenderer` (preview thumbnails) | StorySlideRenderer.swift | ✅ inchangé (génère thumbnails composer-side, pas de canvas runtime) |

**Engagement composer** : aucune de ces features n'est touchée. Le `StoryComposerView` continue de fonctionner exactement comme aujourd'hui, avec le bénéfice automatique des composants optimisés du `StoryCanvasUIView` (Metal filters live preview, MPS blur, ProMotion 120 Hz pour gestures, PencilKit Metal-backed, layer rasterization) **dès que les régressions A1 sont portées**.

### 3.3 Composants optimisés actifs par surface (matrice)

| Composant optimisé | Reader (`.play`) | Composer (`.edit`) | Composer (`.play` preview) |
|---------------------|:----------------:|:------------------:|:--------------------------:|
| `CADisplayLink` ProMotion adaptatif | ✅ 60 Hz | ✅ 120 Hz pour gestures | ✅ 60 Hz |
| Custom Metal kernels (`StoryFilteredLayer`, vintage + bw-contrast) | ✅ via A1.e | ✅ via A1.e (live preview slider intensity) | ✅ via A1.e |
| `MPSImageGaussianBlur` (glass UI, glow stickers) | ✅ existant P3 | ✅ existant P3 | ✅ existant P3 |
| VideoToolbox HW decode + `MTKTextureLoader` (drop vidéo 4K) | ✅ existant P3 | ✅ existant P3 | ✅ existant P3 |
| PencilKit (`PKCanvasView` Metal-backed) | N/A read-only via rasterized image | ✅ existant P3 (drawing tool) | N/A (mode .play) |
| `ReaderAudioMixer` (`AVAudioEngine` + `AVAudioTime(hostTime:)` sample-accurate) | ✅ via A1.c | ✅ via A1.c (preview audio panel) | ✅ via A1.c |
| `AVPlayer.preroll(atRate:)` 100 ms avant `startTime` | ✅ existant Layers/StoryMediaLayer.swift | ✅ existant | ✅ existant |
| `CALayer` rasterization sur items statiques | ✅ existant `Layers/StoryMediaLayer.swift:75` | ⚠️ désactivé pendant gestures actives, réactivé après | ✅ existant |
| `CacheCoordinator.shared.images` SHA256 + LRU | ✅ via A1.b | ✅ via A1.b (background images) | ✅ via A1.b |
| `CADisplayLink.preferredFrameRateRange = (60…120)` | ✅ 60 préféré | ✅ 120 préféré | ✅ 60 préféré |
| `UIPointerInteraction` (trackpad) | N/A | ✅ existant | N/A |
| `UIContextMenuInteraction` (long-press items) | N/A | ✅ existant | N/A |
| `UIAccessibility` VoiceOver | ✅ existant | ✅ existant | ✅ existant |
| `traitCollectionDidChange` (Stage Manager / Split View) | ✅ existant l.292 | ✅ existant | ✅ existant |
| `willResignActive`/`didBecomeActive` lifecycle (AVPlayer pause/resume + bg video) | ✅ existant l.301 + via A1.b pour bg | ✅ existant + via A1.b | ✅ existant + via A1.b |
| Reduce Motion (cuts secs au lieu de fades) | ✅ existant | N/A (édition source) | ✅ existant |
| RTL languages (`NSAttributedString` auto direction) | ✅ existant | ✅ existant | ✅ existant |

**Aucun composant optimisé livré P0-P4 n'est désactivé sur l'une des 3 surfaces.** Toutes les améliorations spec mère §4.6 (11 ajouts cross-device UX) restent actives partout.

### 3.4 Performance targets (référence spec mère §4.7)

Les targets perf ne sont pas dégradés. Les acceptance criteria du Plan A vérifient qu'après portage A1 :

| Action | iPhone 16 Pro | iPad Pro M2 | iPhone 16 base | iPhone SE 3 |
|--------|:-------------:|:-----------:|:--------------:|:-----------:|
| Edit gesture (drag) | 120 fps | 120 fps | 60 fps | 60 fps |
| Play preview | 60 fps | 60 fps | 60 fps | 60 fps |
| Cold canvas → first paint | < 250 ms | < 250 ms | < 350 ms | < 500 ms |
| Drop vidéo 4K → premier frame | < 60 ms | < 50 ms | < 100 ms | < 150 ms |
| Pinch/rotate 12 objets | 120 fps | 120 fps | 60 fps | 60 fps |
| Slider filtre intensité | 120 fps | 120 fps | 120 fps | 60 fps |

Mesures via `MXSignpostMetric` + `os_signpost`. Run manuel via Instruments (CI Xcode différé).

---

## 4. Architecture cible

### 4.1 Vue d'ensemble

```
SwiftUI shell (apps/ios + MeeshyUI)
│
├── StoryViewerView (full-screen, multi-StoryItem progression) ─┐
├── StoryRepostEmbedCell (feed embed, mute=true)               │
├── FeedPostCard (indirect via cell)                            ├── StoryReaderRepresentable
└── UnifiedPostComposer (repost preview, mute=false)            │   (UIViewRepresentable)
                                                                │
                                                                ▼
                                                  StoryCanvasUIView (mode = .play)
                                                  ├── StoryReaderContext { languages, mute, onCompletion, postMediaURLResolver }
                                                  ├── StoryBackgroundLayer (NEW)
                                                  ├── itemsContainer
                                                  │   ├── StoryMediaLayer (existant)
                                                  │   ├── StoryTextLayer (existant, lit translations chain)
                                                  │   ├── StoryStickerLayer (existant)
                                                  │   └── StoryFilteredLayer (existant, BRANCHE en A1.e)
                                                  ├── ReaderAudioMixer (existant, BRANCHE en A1.c)
                                                  │   ├── background (bg audio + variants + ducking)
                                                  │   └── foreground (audioPlayerObjects)
                                                  └── displayLink → onCompletion timing
```

### 4.2 Nouvelle API `StoryReaderContext`

```swift
public struct StoryReaderContext: Sendable {
    public let preferredLanguages: [String]    // resolution chain (Prisme Linguistique)
    public let mute: Bool                       // initial mute state
    public let onCompletion: (@Sendable () -> Void)?
    public let postMediaURLResolver: (@Sendable (String) -> URL?)?  // postMediaId → URL
    public let imageCache: (any ReadableCacheStore<UIImage>)?       // CacheCoordinator.shared.images
}

extension StoryCanvasUIView {
    public func setReaderContext(_ context: StoryReaderContext)
}
```

Le `mode = .edit` ignore le contexte (édition source, pas de résolution multilingue). Le `mode = .play` consomme tous les champs.

### 4.3 Nouvelle API `StoryReaderRepresentable`

```swift
public struct StoryReaderRepresentable: UIViewRepresentable {
    let storyItem: StoryItem
    let preferredLanguages: [String]
    let mute: Bool
    let onCompletion: (() -> Void)?

    // Drop-in inits matching legacy StoryCanvasReaderView API
    public init(story: StoryItem,
                preferredLanguage: String? = nil,
                preferredLanguages: [String] = [],
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false,
                onCompletion: (() -> Void)? = nil)

    public init(repost: RepostContent,
                preferredContentLanguages: [String]? = nil,
                mute: Bool = false)

    public init(post: APIPost,
                preferredLanguage: String? = nil,
                preferredLanguages: [String] = [],
                mute: Bool = false)

    public func makeUIView(context: Context) -> StoryCanvasUIView
    public func updateUIView(_ view: StoryCanvasUIView, context: Context)
    public static func dismantleUIView(_ view: StoryCanvasUIView, coordinator: Coordinator)
}
```

**Conversion `StoryItem → StorySlide`** (helper SDK, à ajouter) :

```swift
extension StoryItem {
    /// Reconstruit un `StorySlide` renderable depuis un `StoryItem` publié.
    /// Résout le contenu via Prisme Linguistique avant l'instanciation.
    public func toRenderableSlide(preferredLanguages: [String]) -> StorySlide
}
```

**Resolution chain** : le call site fournit `preferredLanguages` via `AuthManager.shared.currentUser?.preferredContentLanguages` + (`customDestinationLanguage` si défini). Jamais `Locale.current` (CLAUDE.md racine — Prisme Linguistique).

---

## 5. Sous-sections A1 — port playback runtime

### 5.1 A1.a — Prisme Linguistique + onCompletion timing (~1 j)

**Helpers SDK à ajouter** :

```swift
// Models/StoryModels.swift
extension StoryTextObject {
    public func resolvedText(preferredLanguages: [String]) -> String {
        guard let translations = translations else { return text }
        for lang in preferredLanguages {
            if let t = translations[lang] { return t }
        }
        return text
    }
}

extension StoryAudioBackground {
    public func resolvedPostMediaId(preferredLanguages: [String]) -> String {
        guard let variants = backgroundAudioVariants, !variants.isEmpty else { return postMediaId }
        for lang in preferredLanguages {
            if let v = variants.first(where: { $0.language == lang }) { return v.postMediaId }
        }
        return postMediaId
    }
}
```

**Branchement Canvas** :

- `StoryRenderer.render(slide:, into:, at:, mode:, languages:)` — nouvelle param `languages: [String]`. Quand non vide en mode `.play`, les `StoryTextLayer` reçoivent `obj.resolvedText(preferredLanguages: languages)`. Pas de changement en mode `.edit`.
- `StoryCanvasUIView.setReaderContext(_)` stocke `preferredLanguages`, propagé à `rebuildLayers()` puis `StoryRenderer.render()`.

**onCompletion timing** :

- `StoryCanvasUIView.displayLinkTick` ajoute : si `mode == .play && currentTime ≥ slide.effectiveSlideDuration()` ET `!completionFired`, `completionFired = true` puis `context.onCompletion?()`.
- `setMode(.edit, time: .zero)` reset `completionFired = false`.

**Tests** (Swift Testing dans `Tests/MeeshyUITests/Story/Reader/`) :

- `test_textObject_renders_translatedContent_whenAvailable` — fixture avec `translations["fr"]="Bonjour"`, render avec `languages=["fr"]` → snapshot inclut "Bonjour"
- `test_textObject_fallsBack_to_originalText_when_noMatch` — `languages=["de"]`, fallback `obj.text`
- `test_textObject_emptyLanguages_returnsOriginal` — `languages=[]` retourne `obj.text` brut (mode édition, pas de prisme)
- `test_backgroundAudio_resolvesVariant_byLanguageChain` — variants `[en, fr]`, chain `[fr]` → variant fr
- `test_canvasNeverUsesLocale_current_for_content` — assertion architecturale (grep aucune `Locale.current` dans `Canvas/`)
- `test_onCompletion_fires_when_currentTime_reaches_effectiveDuration`
- `test_onCompletion_fires_only_once_per_play`
- `test_onCompletion_resets_when_setMode_play_replays`

### 5.2 A1.b — Background layer + image preloading (~1.5 j)

**Nouveau layer** :

```swift
// Canvas/Layers/StoryBackgroundLayer.swift
public final class StoryBackgroundLayer: CALayer {
    public enum Kind: Sendable {
        case solidColor(UIColor)
        case gradient(colors: [UIColor], direction: GradientDirection)
        case image(postMediaId: String, thumbHash: String?)
        case video(postMediaId: String, looping: Bool, mute: Bool)
    }

    private var avPlayer: AVPlayer?
    private var avPlayerLayer: AVPlayerLayer?
    private var avPlayerLooper: AVPlayerLooper?
    private var contentLayer: CALayer?
    private var thumbHashPlaceholder: CALayer?

    public func configure(kind: Kind,
                          transform: BackgroundTransform?,
                          geometry: CanvasGeometry,
                          resolver: PostMediaURLResolver,
                          imageCache: any ReadableCacheStore<UIImage>)

    public func handleAppLifecycle(active: Bool)  // pause/resume video
}

public struct BackgroundTransform: Sendable, Equatable {
    public var scale: Double
    public var offsetX: Double
    public var offsetY: Double
    public var rotation: Double
}
```

- **Parent** : `StoryCanvasUIView.rootLayer.insertSublayer(backgroundLayer, at: 0)` (sous `itemsContainer`).
- **Image** : `imageCache.read(postMediaId)` async → si .fresh/.stale on attache `cgImage` immédiatement ; sinon décode `thumbHash` (helper existant `ThumbHashDecoder.decode(_:size:)` à vérifier ; sinon ajout) en placeholder, puis fetch network via `postMediaURLResolver` → `URLSession.shared.data(from:)` → `imageCache.write` → swap.
- **Video** : `AVPlayer` + `AVPlayerLooper` (looping=true) ; muted=true par défaut côté reader si `context.mute == true` OU si la story n'a pas de `backgroundAudio` actif (le bg video est silencieux par défaut, sons portés par `backgroundAudio`).
- **Transform** : `setAffineTransform(CGAffineTransform.identity.translatedBy(dx, dy).rotated(by:).scaledBy(x:, y:))` autour de `anchorPoint = (0.5, 0.5)`.
- **Reduce Motion** : si `UIAccessibility.isReduceMotionEnabled`, désactive l'animation programmatique du transform (le transform statique reste appliqué).
- **Lifecycle** : `StoryCanvasUIView.handleWillResignActive`/`handleDidBecomeActive` (l.313-319 existants) appellent `backgroundLayer.handleAppLifecycle(active:)`.

**Branchement Renderer** :

```swift
extension StoryRenderer {
    static func renderBackground(slide: StorySlide,
                                 into geometry: CanvasGeometry,
                                 at time: CMTime,
                                 mode: RenderMode,
                                 languages: [String]) -> StoryBackgroundLayer.Kind {
        if let url = slide.mediaURL { return .image(postMediaId: ..., thumbHash: ...) }
        if let bgVideo = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .video }) {
            return .video(postMediaId: bgVideo.postMediaId, looping: bgVideo.loop, mute: ...)
        }
        if let bg = slide.effects.backgroundColor { return .solidColor(...) }
        return .solidColor(.black)
    }
}
```

**Tests** :

- `test_backgroundLayer_solidColor_rendersFullSize`
- `test_backgroundLayer_gradient_directionMatchesEffects`
- `test_backgroundLayer_image_loadsPlaceholderFromThumbHash`
- `test_backgroundLayer_image_swapsToCachedImageWhenAvailable`
- `test_backgroundLayer_image_fetchesFromNetworkOnCacheMiss`
- `test_backgroundLayer_video_loopsAndMutes`
- `test_backgroundTransform_scaleOffsetRotation_applied`
- `test_backgroundVideo_pausesOnWillResign`
- `test_backgroundVideo_resumesOnDidBecomeActive`

### 5.3 A1.c — Audio (mixer integration + ducking + fadeOut + mute observers) (~2 j)

**Extensions au `ReaderAudioMixer` existant** :

```swift
extension ReaderAudioMixer {
    /// Background audio layer (replaces legacy `backgroundPlayer` + `backgroundAudioLooper`).
    public func configureBackground(audio: StoryAudioBackground,
                                    url: URL,
                                    looping: Bool) throws

    /// Volume ducking when foreground sounds play.
    public var duckingEnabled: Bool { get set }     // default false
    public var duckedBackgroundVolume: Float { get set }  // default 0.5
    /// Triggered automatically by foreground entry start/end events.
    /// Internally schedules volume ramps via `scheduleVolumeFade(...)`.

    /// Global fade-out + stop, replaces legacy `fadeOutThenStop()`.
    public func fadeOutAndStop(duration: TimeInterval = 0.5) async
}
```

- `ReaderAudioMixer.configureBackground` : crée une 5ème entrée interne (clé `__bg__`) avec scheduling sample-accurate. Le looping est géré via `scheduleEntry` qui redécode au cycle suivant (pattern existant dans le mixer).
- **Ducking** : observer interne sur les entries foreground — quand `play()` est invoqué, si au moins une entry foreground est active à `t`, on schedule fade `bgEntry.volume: 1.0 → 0.5` (ou `duckedBackgroundVolume`) sur 300 ms ; quand toutes les foreground sont terminées, fade retour `0.5 → 1.0` sur 300 ms. Tout via `scheduleVolumeFade` (existant l.209 du mixer).
- **fadeOutAndStop** : itère toutes les entries, schedule fade `current → 0` sur `duration`, attend, puis appelle `stop()`. Le legacy `fadeOutThenStop()` faisait ça via Timer ; on le remplace par `Task.sleep` + ramp natif.

**Branchement Canvas** :

```swift
extension StoryCanvasUIView {
    private var audioMixer: ReaderAudioMixer { ... }

    private func configureAudio(slide: StorySlide,
                                resolver: PostMediaURLResolver,
                                languages: [String],
                                mute: Bool) async throws {
        // Background
        if let bg = slide.effects.backgroundAudio,
           let bgPostId = bg.resolvedPostMediaId(preferredLanguages: languages),
           let bgURL = resolver(bgPostId) {
            try audioMixer.configureBackground(audio: bg, url: bgURL, looping: true)
        }
        // Foreground audioPlayerObjects (existing API)
        if let audios = slide.effects.audioPlayerObjects {
            let urls = audios.compactMap { ($0.id, resolver($0.postMediaId)) }
                             .reduce(into: [String: URL]()) { acc, pair in
                                 if let url = pair.1 { acc[pair.0] = url }
                             }
            try audioMixer.configure(audios: audios, urls: urls)
        }
        audioMixer.duckingEnabled = true
        audioMixer.setMute(mute)
    }

    private func observeMuteNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(handleComposerMute),
                       name: .storyComposerMuteCanvas, object: nil)
        nc.addObserver(self, selector: #selector(handleComposerUnmute),
                       name: .storyComposerUnmuteCanvas, object: nil)
    }

    @objc private func handleComposerMute() { audioMixer.setMute(true) }
    @objc private func handleComposerUnmute() { audioMixer.setMute(false) }
}
```

- `setMode(.play, time:)` appelle `audioMixer.play()` ; `setMode(.edit, ...)` appelle `audioMixer.pause()`.
- `viewWillDisappear` (depuis le VC parent ou via `dismantleUIView`) appelle `audioMixer.fadeOutAndStop()` async.

**Tests** :

- `test_audioMixer_configureBackground_loops`
- `test_audioMixer_configureBackground_resolvesVariantForLanguage`
- `test_audioMixer_ducking_lowersBgVolumeWhenForegroundPlays`
- `test_audioMixer_ducking_restoresBgVolumeWhenForegroundEnds`
- `test_audioMixer_fadeOutAndStop_completesWithinDuration`
- `test_canvas_observesComposerMuteNotification`
- `test_canvas_observesComposerUnmuteNotification`
- `test_canvas_pausesAudio_onSetModeEdit`
- `test_canvas_resumesAudio_onSetModePlay`

### 5.4 A1.d — Keyframes + clipTransitions + opening reveal (~1 j)

**Keyframes** — réutiliser `KeyframeInterpolator.interpolate(keyframes:, at:)` (existe SDK) dans le port de `StoryCanvasReaderView+Timeline.swift` :

```swift
extension StoryRenderer {
    static func applyKeyframes(item: any RenderableItem & KeyframedItem,
                               at time: Double) -> (position: CGPoint?, scale: Double?, opacity: Double?) {
        guard let frames = item.keyframes, !frames.isEmpty else { return (nil, nil, nil) }
        let local = max(0, time - (item.startTime ?? 0))
        let xs = frames.compactMap { $0.x.map { (time: $0.time, value: $0) } }  // ...
        let position = (KeyframeInterpolator.interpolate(keyframes: xs, at: local),
                        KeyframeInterpolator.interpolate(keyframes: ys, at: local))
        let scale = KeyframeInterpolator.interpolate(keyframes: scales, at: local)
        let opacity = KeyframeInterpolator.interpolate(keyframes: opacities, at: local)
        return (CGPoint(x: position.0 ?? 0, y: position.1 ?? 0), scale, opacity)
    }
}
```

- Appliqué dans `StoryRenderer.render()` quand `mode == .play` après le calcul des positions/scales statiques. Override les valeurs si keyframe défini à `time`.
- `mode == .edit` : ignore les keyframes (l'utilisateur voit les valeurs canoniques sans interpolation).

**ClipTransitions crossfade** — port direct de `StoryCanvasReaderView+Timeline.swift:10-23` :

```swift
extension StoryRenderer {
    static func clipTransitionOpacity(for media: StoryMediaObject,
                                      transitions: [StoryClipTransition]?,
                                      at time: Double) -> Double {
        guard let ts = transitions else { return 1.0 }
        // For each transition where this media is the from/to clip, compute crossfade opacity
        // (linear ramp over transition.duration)
        ...
    }
}
```

**Opening reveal** — porter `RevealCircleShape` (SwiftUI) en `CALayer` mask animation :

```swift
extension StoryRenderer {
    static func applyOpening(_ effect: StoryTransitionEffect?,
                             rootLayer: CALayer,
                             elapsed: Double) {
        guard let effect = effect else { return }
        switch effect {
        case .reveal:
            // Animate circle mask from radius=0 to radius=hypot(w,h) over 0.5s
            let mask = CAShapeLayer()
            ...
        case .fade:
            // Animate rootLayer.opacity 0 → 1 over 0.5s
            ...
        }
    }
}
```

- Appelé une seule fois au début du playback (`setMode(.play, time: .zero)`). `currentTime > 0.5` → effect terminé, ne rien réappliquer.

**Tests** :

- `test_keyframes_position_interpolatedAtMidPoint`
- `test_keyframes_scale_interpolatedAtMidPoint`
- `test_keyframes_opacity_interpolatedAtMidPoint`
- `test_keyframes_emptyFrames_returnsNilOverrides`
- `test_clipTransition_crossfade_opacityRampsLinearly`
- `test_clipTransition_outsideTransitionWindow_opacity1`
- `test_opening_reveal_animatesMaskRadius`
- `test_opening_fade_animatesOpacity`
- `test_opening_appliedOnlyOnce_perPlay`

### 5.5 A1.e — Filter pipeline branchement (~0.5 j)

`StoryFilteredLayer` (CAMetalLayer) est livré P3 mais non câblé. Branchement :

```swift
extension StoryCanvasUIView {
    private func updateFilterLayer() {
        guard let filterRaw = slide.effects.filter,
              let filter = StoryFilter(rawValue: filterRaw) else {
            filteredLayer?.removeFromSuperlayer()
            filteredLayer = nil
            return
        }
        let intensity = slide.effects.filterIntensity ?? 1.0
        if filteredLayer == nil {
            let layer = StoryFilteredLayer()
            // insert above itemsContainer, below editOverlayLayer
            rootLayer.insertSublayer(layer, above: itemsContainer)
            filteredLayer = layer
        }
        filteredLayer?.setFilter(filter, intensity: Float(intensity))
        filteredLayer?.sourceLayer = itemsContainer  // or rootLayer if filter applies to bg too
    }
}
```

- `rebuildLayers()` (l.263) appelle `updateFilterLayer()`.
- `updateUIView(_:)` (composer Representable) appelle aussi `updateFilterLayer()` quand `slide.effects.filter` ou `filterIntensity` change.
- Slider intensity du composer → @Binding slide.effects.filterIntensity → updateUIView → setFilter(intensity:).
- Live preview composer ET viewer reader bénéficient.

**Tests** :

- `test_filter_appliedWhenEffectsFilterSet`
- `test_filter_removedWhenEffectsFilterNil`
- `test_filterIntensity_propagatesToMetalKernel`
- `test_filter_liveUpdate_onSlideChange` (composer scenario)

---

## 6. A2 — `StoryReaderRepresentable` (~1 j)

Voir §4.3 pour la signature. Implémentation :

```swift
public struct StoryReaderRepresentable: UIViewRepresentable {
    // ... fields (cf. §4.3)

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let slide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext(
            preferredLanguages: preferredLanguages,
            mute: mute,
            onCompletion: onCompletion,
            postMediaURLResolver: { [storyItem] postId in
                storyItem.media.first { $0.id == postId }.flatMap { URL(string: $0.url ?? "") }
            },
            imageCache: CacheCoordinator.shared.images
        ))
        return view
    }

    public func updateUIView(_ view: StoryCanvasUIView, context: Context) {
        // Re-resolve content if preferredLanguages changed (e.g. user switches language mid-session)
        let newSlide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        if !newSlide.effects.isEqualForRender(to: view.slide.effects) {
            view.slide = newSlide
        }
        // Mute can change at runtime (StoryViewerView press-and-hold pause)
        view.setReaderContext(... updated mute ...)
    }

    public static func dismantleUIView(_ view: StoryCanvasUIView, coordinator: Coordinator) {
        // Triggered when SwiftUI removes the view (cell scroll-off, viewer dismiss).
        // Schedule async fadeOut without blocking.
        Task { @MainActor in
            await view.audioMixer.fadeOutAndStop()
        }
    }
}
```

**Init `(repost:)` et `(post:)`** — convertissent en `StoryItem` synthétique puis appellent `init(story:)` (pattern legacy `StoryCanvasReaderView.swift:117-149`).

---

## 7. A3 — Migration des 4 call sites (~0.5 j)

Renames mécaniques :

| Fichier | Avant | Après |
|---------|-------|-------|
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:450` | `StoryCanvasReaderView(story: outgoing, preferredLanguage: ...)` | `StoryReaderRepresentable(story: outgoing, preferredLanguage: ...)` |
| idem `:464` | `StoryCanvasReaderView(story: story, preferredLanguage: ...)` | `StoryReaderRepresentable(story: story, preferredLanguage: ...)` |
| `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift:32` | `StoryCanvasReaderView(repost:, preferredContentLanguages:, mute: true)` | `StoryReaderRepresentable(repost:, preferredContentLanguages:, mute: true)` |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:215` | (aucune) — utilise `StoryRepostEmbedCell` | (aucune) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift:225` | `StoryCanvasReaderView(story:, mute: false)` | `StoryReaderRepresentable(story:, mute: false)` |

**Smoke tests post-migration** (run manuel device + simulator) :

- Full-screen viewer : tap sur une story → progression entre StoryItems, audio joue, transitions intra-slide visibles, dismiss gesture OK, transitions inter-stories OK
- Embed cell feed : story repost dans le feed apparaît, autoplay muted, aspect 9:16, accessibility tap → fullscreen préservée
- Composer repost : embed dans `UnifiedPostComposer` joue avec audio, mute pendant Pro Timeline preview via NotificationCenter respecté
- Multilingue : switcher la langue user dans Settings → re-affichage stories montre la traduction correcte
- Audio : background music joue ; voix-off s'active à `startTime` exact ; ducking fonctionne ; fadeOut au dismiss
- Backgrounds : stories texte avec gradient/image/video s'affichent correctement
- Filter : story avec filter appliqué rend filtré
- Keyframes : story avec items animés via keyframes joue les animations
- ClipTransitions : story avec crossfade entre clips vidéo joue le crossfade
- Opening : story avec opening reveal joue l'effet une fois

---

## 8. A4 — Suppression legacy (~0.5 j)

Fichiers supprimés :

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` (1732 l.)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift` (94 l.) — logique portée dans `StoryRenderer`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift` (426 l.) — non référencé après A3
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableTextObjectView.swift` (248 l.) — non référencé après A3

Total supprimé : **~2500 lignes**.

Vérifications post-suppression :
- `grep -r "StoryCanvasReaderView\|DraggableMediaView\|DraggableTextObjectView"` → 0 résultat (hors commit messages git)
- `./apps/ios/meeshy.sh build` → 0 erreur
- Tests existants `MeeshyUITests` passent

---

## 9. A5 — Phase 5 RepostPayload + CanvasReprojector + import composer (~2.5 j)

### 9.1 Modèle `RepostPayload`

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
public struct RepostPayload: Sendable, Codable {
    public let textObjects: [StoryTextObject]
    public let mediaObjects: [StoryMediaObject]
    public let stickers: [StorySticker]
    public let drawings: PKDrawing?            // PencilKit, optional
    public let audioPlayerObjects: [StoryAudioPlayerObject]
    public let sourceCanvasSize: CGSize        // CanvasGeometry.designSize (1080×1920)
    public let sourceSlideId: String           // traçabilité
    public let sourceStoryItemId: String?      // pour attribution
}

extension StorySlide {
    public func extractRepostPayload(sourceStoryItemId: String? = nil) -> RepostPayload {
        RepostPayload(
            textObjects: effects.textObjects,
            mediaObjects: effects.mediaObjects ?? [],
            stickers: effects.stickerObjects ?? [],
            drawings: effects.drawing.flatMap { try? PKDrawing(data: $0) },
            audioPlayerObjects: effects.audioPlayerObjects ?? [],
            sourceCanvasSize: CanvasGeometry.designSize,
            sourceSlideId: id,
            sourceStoryItemId: sourceStoryItemId
        )
    }
}
```

### 9.2 `CanvasReprojector`

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift
public struct CanvasReprojector: Sendable {
    public let sourceSize: CGSize    // (1080, 1920)
    public let targetSize: CGSize    // (1080, 1080) ou (1080, 1350)

    public init(from sourceSize: CGSize, to targetSize: CGSize)

    public func reproject(_ obj: StoryTextObject) -> ReprojectedItem<StoryTextObject>
    public func reproject(_ obj: StoryMediaObject) -> ReprojectedItem<StoryMediaObject>
    public func reproject(_ obj: StorySticker) -> ReprojectedItem<StorySticker>
    public func reproject(_ drawing: PKDrawing) -> ReprojectedItem<PKDrawing>
    public func reproject(_ audio: StoryAudioPlayerObject) -> ReprojectedItem<StoryAudioPlayerObject>
}

public struct ReprojectedItem<T> {
    public let value: T
    public let warning: ReprojectionWarning?
}

public enum ReprojectionWarning: Sendable {
    case clamped(originalPosition: CGPoint, clampedPosition: CGPoint)
    case partialOutOfBounds
}
```

**Stratégie de reprojection** :
- **Position** : x normalisé (0-1) source → x normalisé target. Y idem. Si l'item dépasse `[0, 1]` après reprojection, clamp + flag `.clamped`.
- **Scale** : préservation en design pixels (taille perçue invariante). Donc `target.scale = source.scale × (sourceSize.width / targetSize.width)` si `targetSize.width == sourceSize.width`, ratio = 1, donc scale invariant. Pour 1080×1080 (target) ↔ 1080×1920 (source), width identique → scale invariant.
- **Aspect ratio (mediaObjects)** : invariant (stocké, cf. P1).
- **Rotation** : invariante.
- **PKDrawing** : reprojection via `bounds` → translate vers nouvelles coordonnées + scale uniforme. Si `drawing.bounds` dépasse target, clamp via `pkdrawing.transformed(using:)`.
- **AudioPlayerObjects** : pas de position visuelle, juste copie 1:1 (timing préservé : startTime, duration, fade — mais il faudra que le post composer supporte audioPlayerObjects, sinon ils sont ignorés).
- **Stickers** : `baseSize = 140` (cf. spec mère §3.3), `targetSize.scale = sourceSize.scale × (sourceSize.width / targetSize.width)` = 1.0 → scale invariant.

### 9.3 Import dans `UnifiedPostComposer`

```swift
extension UnifiedPostComposer {
    public func importFromStory(_ payload: RepostPayload) {
        let projector = CanvasReprojector(
            from: payload.sourceCanvasSize,
            to: postDesignSize  // (1080, 1080) ou (1080, 1350) selon le format post
        )
        var warnings: [ReprojectionWarning] = []
        for obj in payload.textObjects {
            let result = projector.reproject(obj)
            self.viewModel.addTextObject(result.value)
            if let w = result.warning { warnings.append(w) }
        }
        // ... idem pour mediaObjects, stickers, drawings, audioPlayerObjects
        if !warnings.isEmpty {
            self.viewModel.showReprojectionWarnings(warnings)  // bandeau discret en haut
        }
    }
}
```

**Indicateur visuel** : `UnifiedPostComposer` affiche un bandeau discret en haut (couleur info/warning indigo) listant le nombre d'items clampés. Tap sur le bandeau → highlight les items concernés (overlay translucide jaune/warning) pour 2s.

### 9.4 Tests Phase 5 (spec mère §6.3, étendus à 16 tests pour drawings + audio)

7 tests core (spec mère §6.3) :
- `test_extractRepostPayload_preservesAllItems`
- `test_canvasReprojector_9_16_to_1_1_keepsCenteredItem`
- `test_canvasReprojector_9_16_to_1_1_clampsBottomItem`
- `test_canvasReprojector_preservesScale`
- `test_canvasReprojector_preservesAspectRatio`
- `test_canvasReprojector_preservesRotation`
- `test_canvasReprojector_preservesZIndexOrder`

9 tests additionnels :
- `test_extractRepostPayload_includesDrawings`
- `test_extractRepostPayload_includesAudioPlayerObjects`
- `test_canvasReprojector_drawing_reprojectedViaTransform`
- `test_canvasReprojector_drawing_clampedWhenOutOfBounds`
- `test_canvasReprojector_audio_passesThroughUnchanged`
- `test_canvasReprojector_9_16_to_4_5_targetWiderRatio`
- `test_canvasReprojector_9_16_to_4_5_clampsItemsOutsideNewBounds`
- `test_unifiedPostComposer_importFromStory_addsAllItems`
- `test_unifiedPostComposer_importFromStory_showsBannerWhenClampingOccurs`

---

## 10. Acceptance criteria

Le plan est considéré comme implémenté correctement quand :

1. ✅ Les 16 régressions de §3 passent leur test dédié (port playback runtime complet)
2. ✅ `StoryReaderRepresentable` est utilisable comme drop-in dans les 4 call sites (signatures compatibles)
3. ✅ Suppression effective des 4 fichiers legacy (~2500 lignes)
4. ✅ `grep -r "StoryCanvasReaderView\|DraggableMediaView\|DraggableTextObjectView"` retourne 0 occurrence dans les sources (excluant docs/commits)
5. ✅ Smoke tests (§7) passent sur device réel (iPhone 16 Pro + iPad Pro M2)
6. ✅ `RepostPayload` round-trip lossless (extract → reproject → reimport préserve items)
7. ✅ `CanvasReprojector` flag `.clamped` apparaît correctement sur items hors-cadre
8. ✅ `UnifiedPostComposer.importFromStory` consomme `RepostPayload` et affiche bandeau warning
9. ✅ 16 tests Phase 5 passent (7 core + 9 additionnels)
10. ✅ Composer mode `.play` (preview) joue avec audio + filter + keyframes + transitions, équivalent au reader
11. ✅ Composer mode `.edit` conserve **toutes** les features SwiftUI listées en §3.2 (toolbars, sheets, palettes, ProTimeline, undo/redo, drafts, visibility, publish flow), **plus** background layer + filter live preview via portage A1.b/A1.e
12. ✅ Performance targets §3.4 atteints sur iPhone 16 Pro / iPad Pro M2 / iPhone 16 / iPhone SE 3 (mesures Instruments)
13. ✅ Composants optimisés (Metal kernels, MPS blur, VideoToolbox decode, PencilKit, ReaderAudioMixer, ProMotion, CacheCoordinator) actifs sur les 3 surfaces (cf. matrice §3.3) — vérifié par tests d'intégration
14. ✅ Identité bit-exact `live preview composer = export AVFoundation = lecture viewer Reader` (test `test_export_matches_liveView_pixelExact`, déjà en place P4 task 4.3, à activer en Plan B après SSIM tolerance)
15. ✅ `./apps/ios/meeshy.sh build` succeed sans warning Swift 6
16. ✅ `xcodebuild test -scheme MeeshySDK-Package` passe (nouvelle baseline ≥ 576 tests + ~55 tests Plan A : 8 A1.a + 9 A1.b + 9 A1.c + 9 A1.d + 4 A1.e + 16 A5)

---

## 11. Plan d'exécution détaillé

| Sous-phase | Travail | Effort | Mergeable seul |
|------------|---------|-------:|:-------:|
| A1.a | Prisme Linguistique resolvers SDK + branchement Renderer + onCompletion + 8 tests | 1 j | ✅ |
| A1.b | StoryBackgroundLayer + transform + thumbHash + image cache + 9 tests | 1.5 j | ✅ |
| A1.c | ReaderAudioMixer extensions (bg + ducking + fadeOut) + branchement Canvas + mute observers + 9 tests | 2 j | ✅ |
| A1.d | KeyframeInterpolator port + clipTransitions + opening reveal + 9 tests | 1 j | ✅ |
| A1.e | StoryFilteredLayer branchement + 4 tests | 0.5 j | ✅ |
| A2 | StoryReaderRepresentable (3 inits + StoryItem→StorySlide helper) | 1 j | ✅ |
| A3 | Migration 4 call sites + smoke tests device | 0.5 j | ✅ |
| A4 | Suppression 4 fichiers legacy + verify | 0.5 j | ✅ |
| A5 | RepostPayload + CanvasReprojector + import composer + 16 tests | 2.5 j | ✅ |
| **Total** | | **~10.5 j** | |

### 11.1 Ordre de merge

A1.a → A1.b → A1.c → A1.d → A1.e → A2 → A3 → A4 → A5 (séquentiel).

Chaque sous-phase build sur la précédente (A1.x toutes consommées par A2 ; A2 consommé par A3 ; A4 dépend de A3 ; A5 indépendant de A1-A4 mais consomme `UnifiedPostComposer` migré).

**Possibles parallélisations** (si plusieurs devs) :
- A1.b et A1.d sont orthogonaux (background ≠ keyframes) → parallélisables
- A1.e indépendant des autres A1 → parallélisable
- A5 peut commencer dès A4 mergé (ne dépend pas de A1.x)

### 11.2 Risques par sous-phase

| Sous-phase | Risque | Mitigation |
|------------|--------|------------|
| A1.a | Locale.current accidentellement utilisé | Test architectural `test_canvasNeverUsesLocale_current_for_content` |
| A1.b | thumbHash placeholder pas net (LSB diffs) | Tolerance SSIM dans tests snapshot (Plan B) |
| A1.c | Ducking timing ≠ legacy (legacy était Timer-based, mixer est sample-accurate) | Comparer comportement utilisateur, accepter divergence si gain net (sample-accurate vs jitter) |
| A1.c | fadeOutAndStop async — race avec dismiss | Coordinator pattern : VC parent attend fadeOut avant deinit |
| A1.d | Keyframes interpolation non-déterministe (Float vs Double) | KeyframeInterpolator est en `Double` (cf. spec mère §3.5) |
| A1.e | StoryFilteredLayer Metal kernel manque texture source | sourceLayer = itemsContainer ; vérifier rendu CALayer→MTLTexture via `renderToTexture` |
| A2 | StoryItem.toRenderableSlide imparfait (data loss) | Round-trip test : `slide.toPreviewStoryItem().toRenderableSlide() == slide` |
| A3 | Régression cell scroll perf (UIViewRepresentable lifecycle) | Profiling Instruments avant/après ; targets §1.2 spec mère |
| A5 | PKDrawing reprojection bounds incorrect | Test fixture avec drawing en bord de canvas, vérifier clamp |

---

## 12. Fichiers ajoutés / modifiés / supprimés

### 12.1 Ajoutés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderContext.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/RepostPayload.swift` (ou ajouté à StoryModels.swift)

### 12.2 Modifiés

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` :
  - `StoryTextObject.resolvedText(preferredLanguages:)`
  - `StoryAudioBackground.resolvedPostMediaId(preferredLanguages:)`
  - `StoryItem.toRenderableSlide(preferredLanguages:)`
  - `StorySlide.extractRepostPayload(sourceStoryItemId:)`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` :
  - `configureBackground(audio:url:looping:)`
  - `duckingEnabled`, `duckedBackgroundVolume`
  - `fadeOutAndStop(duration:)`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` :
  - `setReaderContext(_)`
  - `observeMuteNotifications()`
  - `updateFilterLayer()`
  - branchement audio mixer (lifecycle play/pause/dismiss)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` :
  - `render(slide:into:at:mode:languages:)` (param ajouté)
  - `applyKeyframes(item:at:)`
  - `clipTransitionOpacity(...)`
  - `applyOpening(_:rootLayer:elapsed:)`
  - `renderBackground(slide:into:at:mode:languages:)`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (2 renames)
- `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift` (1 rename)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` (1 rename + `importFromStory(_)`)

### 12.3 Supprimés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableTextObjectView.swift`

### 12.4 Documentation

- `apps/ios/CLAUDE.md` : section « Story canvas (post-rewrite) » mise à jour avec architecture finale (Reader Representable, mixer, filter pipeline)
- `apps/ios/decisions.md` : décisions D-8 (Reader Representable vs UIViewControllerRepresentable), D-9 (port playback runtime contre régression)
- `packages/MeeshySDK/decisions.md` : choix mixer ducking sample-accurate vs Timer-based legacy

---

## 13. Hors-scope (différé)

- **Plan B (follow-ups Phase 4)** : synthetic video track + SSIM tolerance + cache layer-tree → spec dédiée `2026-05-09-story-canvas-phase4-followups-design.md`
- **Migration `apps/web` story renderer** : ce plan ne touche que iOS. La cohérence cross-platform sera traitée séparément.
- **Composer audioPlayerObjects panel UI** : si pas déjà fait, l'UI de gestion `audioPlayerObjects` côté composer reste hors scope (le modèle est déjà migré, le rendu est portéen A1.c).
- **Backward-compat avec stories existantes** : app pré-launch, migration franche autorisée (cf. spec mère §1.3).
- **CI Xcode** : différé tant que l'environnement n'est pas disponible (cf. spec mère §7.7).

---

**Fin du document.**
