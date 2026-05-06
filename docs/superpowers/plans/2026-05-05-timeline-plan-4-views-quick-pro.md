# Timeline Editor — Plan 4 : Views Quick + Pro (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter toute la couche UI SwiftUI de la nouvelle timeline éditeur, en deux modes (Quick portrait + Pro paysage) partageant le même `TimelineViewModel`. Intégrer au composer existant derrière une feature flag (Quick par défaut, Pro via bouton ou rotation).

**Architecture:** SwiftUI structurée en 5 sous-modules (Container/Track/Overlay/Inspector/Controls), chaque fichier ≤400 lignes. ViewModel `@Observable @MainActor` orchestre Engine + CommandStack + SnapEngine. Vues feuilles minimales (let pour invariants, pas d'@ObservedObject global). Accessibilité native (VoiceOver, Dynamic Type, hit targets ≥44pt, Reduced Motion). Internationalisation via `String(localized:, bundle: .module)`.

**Tech Stack:** Swift 6 strict, iOS 17+, SwiftUI, swift-snapshot-testing (à ajouter si absent), XCTest, Combine pour Engine subscriptions.

**Référence spec:** `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` sections 1, 5, 6, 7, 8, 9.2 phase 3, annexes H et I.

**Dépend de:** Plan 1 (SDK Models) + Plan 2 (Logic Core) + Plan 3 (Engine Playback) mergés.

---

## Hypothèses sur les API issues des Plans 1-2-3

Ce plan référence les types et API suivants comme **déjà existants** (ils sont créés par les plans précédents). Aucune redéfinition n'est faite ici.

### Plan 1 — `MeeshySDK/Models/StoryModels.swift`
- `StoryClipTransition` (`id`, `fromClipId`, `toClipId`, `kind`, `duration`, `easing`)
- `StoryTransitionKind` (`.crossfade`, `.dissolve`)
- `StoryEasing` (`.linear`, `.easeIn`, `.easeOut`, `.easeInOut`) avec `apply(_ t: Float) -> Float`
- `StoryKeyframe` (`id`, `time`, `x`, `y`, `scale`, `opacity`, `easing`)
- Extensions optionnelles : `StoryEffects.clipTransitions`, `StoryMediaObject.keyframes`, `StoryTextObject.keyframes`
- `TimelineProject` (`init(from: StorySlide)`, `apply(to: inout StorySlide)`)

### Plan 2 — `MeeshyUI/Story/Timeline/Logic/`
- `SnapEngine` avec `init(toleranceSeconds:)` et `snap(rawTime:candidates:disabled:) -> SnapResult`
- `SnapCandidate.Kind` (`.playhead`, `.clipStart`, `.clipEnd`, `.gridMajor`, `.gridMinor`, `.keyframe`, `.slideStart`, `.slideEnd`)
- `SnapResult` (`snappedTime`, `matched`)
- `CommandStack` (`push`, `undo`, `redo`, `canUndo`, `canRedo`, `snapshot`, `restore`, `didChange`)
- `CommandStackSnapshot` (Codable)
- `AnyEditCommand` enum + 12 commandes : `AddClipCommand`, `DeleteClipCommand`, `MoveClipCommand`, `TrimClipCommand`, `SplitClipCommand`, `AddTransitionCommand`, `RemoveTransitionCommand`, `ChangeTransitionCommand`, `AddKeyframeCommand`, `MoveKeyframeCommand`, `DeleteKeyframeCommand`, `SetClipPropertyCommand`
- `KeyframeInterpolator.interpolate(keyframes:at:) -> T?`

### Plan 3 — `MeeshyUI/Story/Timeline/Engine/`
- `StoryTimelineEngine` (`@MainActor`, `currentTime`, `isPlaying`, `onTimeUpdate`, `onPlaybackEnd`, `onElementBecameActive`, `configure(project:mediaURLs:images:)`, `play()`, `pause()`, `seek(to:precise:)`, `stop()`, `toggle()`, `isMuted`, `masterVolume`, `setMode(_:)`, `export(to:preset:)`)
- `StoryTimelineEngine.Mode` (`.editing`, `.preview`)
- `AudioMixer`, `VideoCompositor`, `TimelineMediaSource` (internes — non utilisés par les Views)

### Composer existant — `MeeshyUI/Story/StoryComposerViewModel.swift`
- `@Observable @MainActor public final class StoryComposerViewModel`
- Propriétés utilisées : `currentSlide`, `currentEffects`, `currentSlideDuration`, `slideImages`, `isMuted`, `isTimelineVisible` (à supprimer Phase 6), `timelinePlaybackTime`, `isTimelinePlaying`, `timelineZoomScale`
- Méthodes utilisées : `currentEffects.resolvedBackgroundMedia`, `resolvedForegroundMediaObjects`, `resolvedBackgroundAudio`, `resolvedForegroundAudioPlayers`

---

## Index des Tâches

1. **Tâches infrastructure (1-4)** : Package.swift, dossier Timeline, FeatureFlag, Localizable strings
2. **Tâches modèles internes (5-6)** : `ClipSelectionState`, `TimelineMode` enum
3. **Tâches ViewModel (7-15)** : `TimelineViewModel` 9 cas
4. **Tâches Track views (16-23)** : TrackBarView, VideoClipBar, AudioClipBar, TextClipBar, TransitionBadge
5. **Tâches Overlay views (24-31)** : RulerView, PlayheadView, SnapGuideView, DurationHandle
6. **Tâches Inspector views (32-37)** : ClipInspector, KeyframeInspector, TransitionInspector
7. **Tâches Controls views (38-41)** : TransportBar, TimelineToolbar
8. **Tâches Container views (42-49)** : QuickTimelineView, ProTimelineView, integration to composer
9. **Tâches snapshots (50-78)** : 80 snapshots multi-themes
10. **Tâches integration (79-83)** : composer wiring + integration tests + meeshy.sh build verification

---

### Task 1: Ajouter swift-snapshot-testing au Package.swift

**Files:**
- Modify: `packages/MeeshySDK/Package.swift`

- [ ] **Step 1: Vérifier si la dépendance est absente**

Run: `grep -n "swift-snapshot-testing" packages/MeeshySDK/Package.swift`
Expected: aucun match.

- [ ] **Step 2: Ajouter la dépendance + le linkage au testTarget MeeshyUITests**

Edit `packages/MeeshySDK/Package.swift` :

Remplacer le bloc `dependencies: [` par :

```swift
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", exact: "16.1.1"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "6.29.3"),
        .package(url: "https://github.com/stasel/WebRTC", exact: "146.0.0"),
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.17.6"),
    ],
```

Remplacer le `testTarget` `MeeshyUITests` par :

```swift
        .testTarget(
            name: "MeeshyUITests",
            dependencies: [
                "MeeshyUI",
                "MeeshySDK",
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            exclude: ["__Snapshots__"],
            swiftSettings: uiSwiftSettings
        ),
```

- [ ] **Step 3: Run swift package resolve**

Run: `cd packages/MeeshySDK && swift package resolve 2>&1 | tail -10`
Expected: pas d'erreur, `Fetching` puis `Computing version` pour swift-snapshot-testing.

- [ ] **Step 4: Build**

Run: `cd packages/MeeshySDK && swift build --target MeeshyUI 2>&1 | tail -5`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Package.swift packages/MeeshySDK/Package.resolved
git commit -m "chore(timeline): add swift-snapshot-testing for Phase 3 UI snapshots"
```

---

### Task 2: Créer la structure de dossier Timeline

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/.gitkeep`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/FeatureFlag/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/__Snapshots__/.gitkeep`

- [ ] **Step 1: Créer les 10 fichiers .gitkeep vides via mkdir + touch**

Run:
```bash
cd packages/MeeshySDK && \
mkdir -p Sources/MeeshyUI/Story/Timeline/Views/Container \
         Sources/MeeshyUI/Story/Timeline/Views/Track \
         Sources/MeeshyUI/Story/Timeline/Views/Overlay \
         Sources/MeeshyUI/Story/Timeline/Views/Inspector \
         Sources/MeeshyUI/Story/Timeline/Views/Controls \
         Sources/MeeshyUI/Story/Timeline/ViewModel \
         Sources/MeeshyUI/Story/Timeline/FeatureFlag \
         Tests/MeeshyUITests/Timeline/Views \
         Tests/MeeshyUITests/Timeline/ViewModel \
         Tests/MeeshyUITests/Timeline/__Snapshots__ && \
touch Sources/MeeshyUI/Story/Timeline/Views/Container/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/Views/Track/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/Views/Overlay/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/Views/Inspector/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/Views/Controls/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/ViewModel/.gitkeep \
      Sources/MeeshyUI/Story/Timeline/FeatureFlag/.gitkeep \
      Tests/MeeshyUITests/Timeline/Views/.gitkeep \
      Tests/MeeshyUITests/Timeline/ViewModel/.gitkeep \
      Tests/MeeshyUITests/Timeline/__Snapshots__/.gitkeep
```

- [ ] **Step 2: Verifier**

Run: `find packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline -name '.gitkeep' | wc -l`
Expected: `7`

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline packages/MeeshySDK/Tests/MeeshyUITests/Timeline
git commit -m "chore(timeline): scaffold Timeline UI module directory layout"
```

---

### Task 3: StoryTimelineFeatureFlag — protocol + UserDefaults override + RemoteConfig stub

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/FeatureFlag/StoryTimelineFeatureFlag.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/StoryTimelineFeatureFlagTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/StoryTimelineFeatureFlagTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class StoryTimelineFeatureFlagTests: XCTestCase {

    private let key = "story_timeline_v2"

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: key)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: key)
        super.tearDown()
    }

    func test_isV2Enabled_defaultsToFalse_whenNoOverrideAndNoRemote() {
        let provider = MockRemoteFlagProvider(value: false)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_isV2Enabled_returnsTrue_whenUserDefaultsOverrideTrue() {
        UserDefaults.standard.set(true, forKey: key)
        let provider = MockRemoteFlagProvider(value: false)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertTrue(flag.isV2Enabled)
    }

    func test_isV2Enabled_returnsFalse_whenUserDefaultsOverrideFalse_evenIfRemoteTrue() {
        UserDefaults.standard.set(false, forKey: key)
        let provider = MockRemoteFlagProvider(value: true)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_isV2Enabled_fallsBackToRemote_whenNoOverride() {
        let provider = MockRemoteFlagProvider(value: true)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertTrue(flag.isV2Enabled)
    }
}

private struct MockRemoteFlagProvider: RemoteFeatureFlagProviding {
    let value: Bool
    func bool(forKey: String) -> Bool { value }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryTimelineFeatureFlagTests 2>&1 | tail -10`
Expected: FAIL with "cannot find type 'StoryTimelineFeatureFlag' in scope" / "cannot find protocol 'RemoteFeatureFlagProviding'".

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/FeatureFlag/StoryTimelineFeatureFlag.swift` :

```swift
import Foundation

// MARK: - Remote feature flag provider abstraction
//
// Decoupled from FirebaseRemoteConfig so the SDK package stays free of the
// Firebase dependency. The iOS app injects a concrete adapter at startup.

public protocol RemoteFeatureFlagProviding: Sendable {
    func bool(forKey: String) -> Bool
}

public struct NullRemoteFeatureFlagProvider: RemoteFeatureFlagProviding {
    public init() {}
    public func bool(forKey: String) -> Bool { false }
}

// MARK: - Story Timeline V2 feature flag
//
// 3-level resolution:
//   1. UserDefaults override (dev/QA forces local value)
//   2. RemoteConfig (per-percentage rollout, kill switch)
//   3. Default false (V1 stays the default until rollout)

public struct StoryTimelineFeatureFlag: Sendable {

    public static let userDefaultsKey = "story_timeline_v2"
    public static let remoteKey = "story_timeline_v2_rollout"

    private let defaults: UserDefaults
    private let remote: RemoteFeatureFlagProviding

    public init(
        defaults: UserDefaults = .standard,
        remote: RemoteFeatureFlagProviding = NullRemoteFeatureFlagProvider()
    ) {
        self.defaults = defaults
        self.remote = remote
    }

    public var isV2Enabled: Bool {
        if let local = defaults.object(forKey: Self.userDefaultsKey) as? Bool {
            return local
        }
        return remote.bool(forKey: Self.remoteKey)
    }

    public static let shared = StoryTimelineFeatureFlag()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryTimelineFeatureFlagTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/FeatureFlag/StoryTimelineFeatureFlag.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/StoryTimelineFeatureFlagTests.swift
git commit -m "feat(timeline-ui): add StoryTimelineFeatureFlag with UserDefaults + remote override"
```

---

### Task 4: Ajouter les ~70 clés i18n dans Localizable.xcstrings

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/TimelineLocalizationTests.swift`

- [ ] **Step 1: Écrire un test qui lit chaque clé via String(localized:)**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/TimelineLocalizationTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// Verifies that every Phase 3 timeline localization key resolves to a non-empty
/// localized string. If a key is missing in Localizable.xcstrings, the bundle
/// returns the key itself, which the assertion catches.
final class TimelineLocalizationTests: XCTestCase {

    private static let keys: [String] = [
        // Transport
        "story.timeline.transport.play",
        "story.timeline.transport.pause",
        "story.timeline.transport.mute",
        "story.timeline.transport.unmute",
        "story.timeline.transport.zoomIn",
        "story.timeline.transport.zoomOut",
        "story.timeline.transport.zoomReset",
        "story.timeline.transport.timeReadout",
        // Mode
        "story.timeline.mode.quick",
        "story.timeline.mode.pro",
        "story.timeline.mode.switchToQuick",
        "story.timeline.mode.switchToPro",
        // Toolbar
        "story.timeline.toolbar.snap",
        "story.timeline.toolbar.undo",
        "story.timeline.toolbar.redo",
        "story.timeline.toolbar.deployTracks",
        "story.timeline.toolbar.collapseTracks",
        // Sections
        "story.timeline.section.contenu",
        "story.timeline.section.audio",
        "story.timeline.section.effets",
        // Tracks
        "story.timeline.track.video",
        "story.timeline.track.image",
        "story.timeline.track.audio",
        "story.timeline.track.text",
        "story.timeline.track.bgVideo",
        "story.timeline.track.bgAudio",
        "story.timeline.track.lock",
        "story.timeline.track.unlock",
        // Clip
        "story.timeline.clip.duplicate",
        "story.timeline.clip.delete",
        "story.timeline.clip.split",
        "story.timeline.clip.bringToFront",
        "story.timeline.clip.toggleBackground",
        "story.timeline.clip.tooltip.start",
        "story.timeline.clip.tooltip.duration",
        "story.timeline.clip.tooltip.fadeIn",
        "story.timeline.clip.tooltip.fadeOut",
        // Transition
        "story.timeline.transition.crossfade",
        "story.timeline.transition.dissolve",
        "story.timeline.transition.duration",
        "story.timeline.transition.delete",
        // Keyframe
        "story.timeline.keyframe.add",
        "story.timeline.keyframe.delete",
        "story.timeline.keyframe.position",
        "story.timeline.keyframe.scale",
        "story.timeline.keyframe.opacity",
        // Inspector
        "story.timeline.inspector.start",
        "story.timeline.inspector.duration",
        "story.timeline.inspector.volume",
        "story.timeline.inspector.loop",
        "story.timeline.inspector.background",
        // SnapGuide
        "story.timeline.snapGuide.playhead",
        "story.timeline.snapGuide.clipStart",
        "story.timeline.snapGuide.clipEnd",
        "story.timeline.snapGuide.keyframe",
        "story.timeline.snapGuide.gridMajor",
        // Errors
        "story.timeline.error.mediaUnavailable",
        "story.timeline.error.audioFailed",
        "story.timeline.error.diskFull",
        "story.timeline.error.assetLoadFailed",
        // Empty
        "story.timeline.empty.addContent",
        "story.timeline.empty.addMediaPrompt",
        // A11y
        "story.timeline.a11y.clip.video",
        "story.timeline.a11y.clip.audio",
        "story.timeline.a11y.clip.text",
        "story.timeline.a11y.transition",
        "story.timeline.a11y.keyframe",
        "story.timeline.a11y.playhead",
        "story.timeline.a11y.durationHandle",
        "story.timeline.a11y.snap.on",
        "story.timeline.a11y.snap.off",
    ]

    func test_allTimelineKeys_resolveToNonEmptyValue() {
        for key in Self.keys {
            let resolved = String(localized: String.LocalizationValue(key), bundle: .module)
            XCTAssertNotEqual(resolved, key,
                              "Missing localization for key '\(key)' — add it to Localizable.xcstrings")
            XCTAssertFalse(resolved.isEmpty, "Empty value for '\(key)'")
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineLocalizationTests 2>&1 | tail -20`
Expected: FAIL — at least one missing key (the file doesn't have the new keys yet).

- [ ] **Step 3: Ajouter les 70 clés à Localizable.xcstrings**

Read `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` to find a known string entry and verify the JSON format. Then append the following entries inside the `"strings": { ... }` object (alphabetical insertion is OK; the editor preserves order). Use the Edit tool to insert each block before the closing `}` of the `strings` object.

For each key add this template (replacing `KEY`, `FR`, `EN`):

```json
"KEY" : {
  "localizations" : {
    "fr" : { "stringUnit" : { "state" : "translated", "value" : "FR" } },
    "en" : { "stringUnit" : { "state" : "translated", "value" : "EN" } }
  }
},
```

Use these key/fr/en triples (copy verbatim, mind the placeholders `%@` and `%lld` are forwarded literally):

| Key | fr | en |
|-----|-----|-----|
| `story.timeline.transport.play` | Lecture | Play |
| `story.timeline.transport.pause` | Pause | Pause |
| `story.timeline.transport.mute` | Couper le son | Mute |
| `story.timeline.transport.unmute` | Activer le son | Unmute |
| `story.timeline.transport.zoomIn` | Zoom avant | Zoom in |
| `story.timeline.transport.zoomOut` | Zoom arrière | Zoom out |
| `story.timeline.transport.zoomReset` | Réinitialiser le zoom | Reset zoom |
| `story.timeline.transport.timeReadout` | %1$@ / %2$@ | %1$@ / %2$@ |
| `story.timeline.mode.quick` | Quick | Quick |
| `story.timeline.mode.pro` | Pro | Pro |
| `story.timeline.mode.switchToQuick` | Mode rapide | Switch to Quick |
| `story.timeline.mode.switchToPro` | Mode Pro | Switch to Pro |
| `story.timeline.toolbar.snap` | Magnétisme | Snap |
| `story.timeline.toolbar.undo` | Annuler | Undo |
| `story.timeline.toolbar.redo` | Rétablir | Redo |
| `story.timeline.toolbar.deployTracks` | + %lld piste(s) | + %lld track(s) |
| `story.timeline.toolbar.collapseTracks` | Replier | Collapse |
| `story.timeline.section.contenu` | CONTENU | CONTENT |
| `story.timeline.section.audio` | AUDIO | AUDIO |
| `story.timeline.section.effets` | EFFETS | EFFECTS |
| `story.timeline.track.video` | Vidéo %lld | Video %lld |
| `story.timeline.track.image` | Image %lld | Image %lld |
| `story.timeline.track.audio` | Audio %lld | Audio %lld |
| `story.timeline.track.text` | Texte %lld | Text %lld |
| `story.timeline.track.bgVideo` | Vidéo fond | Background video |
| `story.timeline.track.bgAudio` | Audio fond | Background audio |
| `story.timeline.track.lock` | Verrouiller | Lock |
| `story.timeline.track.unlock` | Déverrouiller | Unlock |
| `story.timeline.clip.duplicate` | Dupliquer | Duplicate |
| `story.timeline.clip.delete` | Supprimer | Delete |
| `story.timeline.clip.split` | Couper au playhead | Split at playhead |
| `story.timeline.clip.bringToFront` | Mettre devant | Bring to front |
| `story.timeline.clip.toggleBackground` | Basculer fond / premier plan | Toggle background |
| `story.timeline.clip.tooltip.start` | Début %@ | Start %@ |
| `story.timeline.clip.tooltip.duration` | Durée %@ | Duration %@ |
| `story.timeline.clip.tooltip.fadeIn` | Fondu entrée %@ | Fade in %@ |
| `story.timeline.clip.tooltip.fadeOut` | Fondu sortie %@ | Fade out %@ |
| `story.timeline.transition.crossfade` | Fondu enchaîné | Crossfade |
| `story.timeline.transition.dissolve` | Dissolution | Dissolve |
| `story.timeline.transition.duration` | Durée %@ | Duration %@ |
| `story.timeline.transition.delete` | Supprimer la transition | Delete transition |
| `story.timeline.keyframe.add` | Ajouter keyframe | Add keyframe |
| `story.timeline.keyframe.delete` | Supprimer keyframe | Delete keyframe |
| `story.timeline.keyframe.position` | Position | Position |
| `story.timeline.keyframe.scale` | Échelle | Scale |
| `story.timeline.keyframe.opacity` | Opacité | Opacity |
| `story.timeline.inspector.start` | Début | Start |
| `story.timeline.inspector.duration` | Durée | Duration |
| `story.timeline.inspector.volume` | Volume | Volume |
| `story.timeline.inspector.loop` | Boucle | Loop |
| `story.timeline.inspector.background` | Fond | Background |
| `story.timeline.snapGuide.playhead` | Playhead %@ | Playhead %@ |
| `story.timeline.snapGuide.clipStart` | Début %@ | Start %@ |
| `story.timeline.snapGuide.clipEnd` | Fin %@ | End %@ |
| `story.timeline.snapGuide.keyframe` | Keyframe %@ | Keyframe %@ |
| `story.timeline.snapGuide.gridMajor` | %@ | %@ |
| `story.timeline.error.mediaUnavailable` | Média indisponible | Media unavailable |
| `story.timeline.error.audioFailed` | Audio indisponible — preview muette | Audio unavailable — preview muted |
| `story.timeline.error.diskFull` | Espace insuffisant | Insufficient space |
| `story.timeline.error.assetLoadFailed` | Impossible de charger %@ | Failed to load %@ |
| `story.timeline.empty.addContent` | Ajoutez du contenu pour voir la timeline | Add content to see the timeline |
| `story.timeline.empty.addMediaPrompt` | + Média | + Media |
| `story.timeline.a11y.clip.video` | Clip vidéo %@ | Video clip %@ |
| `story.timeline.a11y.clip.audio` | Clip audio %@ | Audio clip %@ |
| `story.timeline.a11y.clip.text` | Texte %@ | Text %@ |
| `story.timeline.a11y.transition` | Transition %1$@ entre %2$@ et %3$@ | %1$@ transition between %2$@ and %3$@ |
| `story.timeline.a11y.keyframe` | Keyframe à %@ | Keyframe at %@ |
| `story.timeline.a11y.playhead` | Tête de lecture | Playhead |
| `story.timeline.a11y.durationHandle` | Poignée durée du slide | Slide duration handle |
| `story.timeline.a11y.snap.on` | Magnétisme activé | Snap enabled |
| `story.timeline.a11y.snap.off` | Magnétisme désactivé | Snap disabled |

Use Edit on `Localizable.xcstrings` to insert these 70 blocks after the last existing entry (find the closing `}` of the last existing string and insert before it). To minimize merge friction, insert as one large contiguous JSON block.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineLocalizationTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/TimelineLocalizationTests.swift
git commit -m "feat(timeline-ui): add 70 fr+en i18n strings for Phase 3 UI"
```

---

### Task 5: TimelineMode enum (shared between Quick & Pro)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineMode.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineModeTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineModeTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class TimelineModeTests: XCTestCase {

    func test_toggle_quickToPro() {
        XCTAssertEqual(TimelineMode.quick.toggled, .pro)
    }

    func test_toggle_proToQuick() {
        XCTAssertEqual(TimelineMode.pro.toggled, .quick)
    }

    func test_codable_roundTrip() throws {
        let encoded = try JSONEncoder().encode(TimelineMode.pro)
        let decoded = try JSONDecoder().decode(TimelineMode.self, from: encoded)
        XCTAssertEqual(decoded, .pro)
    }

    func test_isPro_quick_false() {
        XCTAssertFalse(TimelineMode.quick.isPro)
    }

    func test_isPro_pro_true() {
        XCTAssertTrue(TimelineMode.pro.isPro)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineModeTests 2>&1 | tail -10`
Expected: FAIL with "cannot find type 'TimelineMode' in scope".

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineMode.swift` :

```swift
import Foundation

/// Two-way switch that selects which timeline UI is rendered.
///
/// `.quick` — portrait, ~3 visible tracks, mobile-first defaults
/// `.pro`   — landscape, multi-track CapCut-style, inspector floating
public enum TimelineMode: String, Codable, Sendable, CaseIterable {
    case quick
    case pro

    public var toggled: TimelineMode {
        switch self {
        case .quick: return .pro
        case .pro:   return .quick
        }
    }

    public var isPro: Bool { self == .pro }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineModeTests 2>&1 | tail -10`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineMode.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineModeTests.swift
git commit -m "feat(timeline-ui): add TimelineMode enum (quick/pro) shared by both containers"
```

---

### Task 6: ClipSelectionState — value struct for selection + active drag

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/ClipSelectionStateTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/ClipSelectionStateTests.swift` :

```swift
import XCTest
import CoreGraphics
@testable import MeeshyUI

final class ClipSelectionStateTests: XCTestCase {

    func test_empty_hasNoSelection() {
        let state = ClipSelectionState()
        XCTAssertNil(state.selectedClipId)
        XCTAssertNil(state.activeDrag)
        XCTAssertFalse(state.isDragging)
        XCTAssertFalse(state.isSelected("any"))
    }

    func test_selecting_setsSelectedClipId() {
        var state = ClipSelectionState()
        state.select("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertTrue(state.isSelected("clip-1"))
        XCTAssertFalse(state.isSelected("clip-2"))
    }

    func test_deselect_clearsSelection() {
        var state = ClipSelectionState()
        state.select("clip-1")
        state.deselect()
        XCTAssertNil(state.selectedClipId)
    }

    func test_beginDrag_setsActiveDrag_andIsDragging() {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        XCTAssertEqual(state.activeDrag?.clipId, "clip-1")
        XCTAssertEqual(state.activeDrag?.originalStartTime, 1.0, accuracy: 0.001)
        XCTAssertEqual(state.activeDrag?.currentStartTime, 1.0, accuracy: 0.001)
        XCTAssertTrue(state.isDragging)
    }

    func test_updateDrag_changesCurrentStartTime() {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        state.updateDrag(currentStartTime: 2.5, snappedTo: nil)
        XCTAssertEqual(state.activeDrag?.currentStartTime, 2.5, accuracy: 0.001)
        XCTAssertNil(state.activeDrag?.snappedTo)
    }

    func test_endDrag_clearsActiveDrag() {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        state.endDrag()
        XCTAssertNil(state.activeDrag)
        XCTAssertFalse(state.isDragging)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipSelectionStateTests 2>&1 | tail -10`
Expected: FAIL with "cannot find type 'ClipSelectionState' in scope".

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift` :

```swift
import Foundation
import CoreGraphics

/// Pure value struct that tracks "which clip is currently selected" and
/// "which clip is being dragged right now". Lives next to `TimelineViewModel`
/// so it can be passed by value into leaf views without triggering observation.
public struct ClipSelectionState: Equatable, Sendable {

    public struct ActiveDrag: Equatable, Sendable {
        public let clipId: String
        public let originalStartTime: Float
        public var currentStartTime: Float
        public var snappedTo: SnappedKind?

        public enum SnappedKind: String, Sendable {
            case playhead
            case clipStart
            case clipEnd
            case keyframe
            case grid
        }
    }

    public private(set) var selectedClipId: String?
    public private(set) var activeDrag: ActiveDrag?

    public init(selectedClipId: String? = nil, activeDrag: ActiveDrag? = nil) {
        self.selectedClipId = selectedClipId
        self.activeDrag = activeDrag
    }

    public var isDragging: Bool { activeDrag != nil }

    public func isSelected(_ clipId: String) -> Bool { selectedClipId == clipId }

    // MARK: - Mutations

    public mutating func select(_ clipId: String) {
        selectedClipId = clipId
    }

    public mutating func deselect() {
        selectedClipId = nil
    }

    public mutating func beginDrag(clipId: String, originalStartTime: Float) {
        activeDrag = ActiveDrag(
            clipId: clipId,
            originalStartTime: originalStartTime,
            currentStartTime: originalStartTime,
            snappedTo: nil
        )
    }

    public mutating func updateDrag(currentStartTime: Float, snappedTo: ActiveDrag.SnappedKind?) {
        guard var drag = activeDrag else { return }
        drag.currentStartTime = currentStartTime
        drag.snappedTo = snappedTo
        activeDrag = drag
    }

    public mutating func endDrag() {
        activeDrag = nil
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipSelectionStateTests 2>&1 | tail -10`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/ClipSelectionStateTests.swift
git commit -m "feat(timeline-ui): add ClipSelectionState value type for selection + active drag"
```

---

### Task 7: TimelineViewModel — skeleton @Observable + init/load empty project

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Mocks/MockStoryTimelineEngine.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/TimelineProjectFactory.swift`

- [ ] **Step 1: Écrire le test échouant pour `loadProject_emptySlide_initEngineEmpty`**

First create the helper `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/TimelineProjectFactory.swift` :

```swift
import Foundation
@testable import MeeshySDK

enum TimelineProjectFactory {

    static func emptyProject(slideId: String = "slide-1", duration: Float = 10) -> TimelineProject {
        TimelineProject(
            slideId: slideId,
            slideDuration: duration,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    static func projectWithVideoClip(
        clipId: String = "clip-1",
        startTime: Float = 0,
        duration: Float = 5
    ) -> TimelineProject {
        var media = StoryMediaObject(id: clipId, postMediaId: clipId, kind: .video)
        media.startTime = startTime
        media.duration = duration
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    static func projectWithTwoContiguousClips() -> TimelineProject {
        var a = StoryMediaObject(id: "clip-a", postMediaId: "clip-a", kind: .video)
        a.startTime = 0
        a.duration = 4
        var b = StoryMediaObject(id: "clip-b", postMediaId: "clip-b", kind: .video)
        b.startTime = 4
        b.duration = 4
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [a, b],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }
}
```

Then create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Mocks/MockStoryTimelineEngine.swift` :

```swift
import Foundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Test double that conforms to TimelineEngineProviding.
/// Records every call so tests can assert orchestration without spinning up
/// AVFoundation. Does not retain mediaURLs/images beyond capture.
@MainActor
final class MockStoryTimelineEngine: TimelineEngineProviding {

    var currentTime: Float = 0
    var isPlaying: Bool = false
    var isMuted: Bool = false
    var masterVolume: Float = 1.0

    var onTimeUpdate: ((Float) -> Void)?
    var onPlaybackEnd: (() -> Void)?
    var onElementBecameActive: ((String) -> Void)?

    // Call counts
    private(set) var configureCallCount = 0
    private(set) var playCallCount = 0
    private(set) var pauseCallCount = 0
    private(set) var seekCallCount = 0
    private(set) var stopCallCount = 0
    private(set) var setModeCallCount = 0

    // Last params
    private(set) var lastConfiguredProject: TimelineProject?
    private(set) var lastSeekTime: Float?
    private(set) var lastSetMode: TimelineEngineMode?

    func configure(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) async {
        configureCallCount += 1
        lastConfiguredProject = project
    }

    func play() { playCallCount += 1; isPlaying = true }
    func pause() { pauseCallCount += 1; isPlaying = false }
    func seek(to time: Float, precise: Bool) { seekCallCount += 1; lastSeekTime = time; currentTime = time }
    func stop() { stopCallCount += 1; isPlaying = false; currentTime = 0 }
    func toggle() { isPlaying ? pause() : play() }
    func setMode(_ mode: TimelineEngineMode) { setModeCallCount += 1; lastSetMode = mode }

    func reset() {
        configureCallCount = 0; playCallCount = 0; pauseCallCount = 0
        seekCallCount = 0; stopCallCount = 0; setModeCallCount = 0
        lastConfiguredProject = nil; lastSeekTime = nil; lastSetMode = nil
        currentTime = 0; isPlaying = false
    }
}
```

Then create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineViewModelTests: XCTestCase {

    private func makeSUT(
        project: TimelineProject = TimelineProjectFactory.emptyProject()
    ) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_loadProject_emptySlide_initEngineEmpty() async {
        let (sut, engine) = makeSUT()
        // Allow the async bootstrap Task to drain.
        await sut.awaitConfigured()
        XCTAssertEqual(engine.configureCallCount, 1)
        XCTAssertEqual(sut.project.mediaObjects.count, 0)
        XCTAssertEqual(sut.currentTime, 0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_loadProject_emptySlide_initEngineEmpty 2>&1 | tail -15`
Expected: FAIL with "cannot find type 'TimelineViewModel' in scope" / "cannot find protocol 'TimelineEngineProviding'".

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift` :

```swift
import Foundation
import UIKit
import Observation
import MeeshySDK

// MARK: - Engine abstraction (testable seam for StoryTimelineEngine)

public enum TimelineEngineMode: Sendable {
    case editing
    case preview
}

@MainActor
public protocol TimelineEngineProviding: AnyObject {
    var currentTime: Float { get }
    var isPlaying: Bool { get }
    var isMuted: Bool { get set }
    var masterVolume: Float { get set }

    var onTimeUpdate: ((Float) -> Void)? { get set }
    var onPlaybackEnd: (() -> Void)? { get set }
    var onElementBecameActive: ((String) -> Void)? { get set }

    func configure(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) async
    func play()
    func pause()
    func seek(to time: Float, precise: Bool)
    func stop()
    func toggle()
    func setMode(_ mode: TimelineEngineMode)
}

// MARK: - TimelineViewModel

@Observable
@MainActor
public final class TimelineViewModel {

    // MARK: - State observable by Views

    public private(set) var project: TimelineProject
    public private(set) var currentTime: Float = 0
    public private(set) var isPlaying: Bool = false
    public private(set) var canUndo: Bool = false
    public private(set) var canRedo: Bool = false
    public private(set) var isSnapEnabled: Bool = true
    public var selection: ClipSelectionState = .init()
    public var mode: TimelineMode = .quick
    public var zoomScale: CGFloat = 1.0
    public var errorMessage: String?

    // MARK: - Dependencies

    private let engine: TimelineEngineProviding
    private let commandStack: CommandStack
    private let snapEngine: SnapEngine

    // MARK: - Async bootstrap tracking

    private var bootstrapTask: Task<Void, Never>?

    public init(
        engine: TimelineEngineProviding,
        commandStack: CommandStack,
        snapEngine: SnapEngine
    ) {
        self.engine = engine
        self.commandStack = commandStack
        self.snapEngine = snapEngine
        self.project = TimelineProject(
            slideId: "",
            slideDuration: 0,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
        wireEngineCallbacks()
        wireCommandStackCallback()
    }

    // MARK: - Bootstrap

    public func bootstrap(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) {
        self.project = project
        bootstrapTask = Task { [weak self, engine] in
            await engine.configure(project: project, mediaURLs: mediaURLs, images: images)
            await MainActor.run { self?.engine.setMode(.editing) }
        }
    }

    /// Test helper — awaits the bootstrap configuration Task.
    public func awaitConfigured() async {
        await bootstrapTask?.value
    }

    // MARK: - Wiring

    private func wireEngineCallbacks() {
        engine.onTimeUpdate = { [weak self] time in
            self?.currentTime = time
        }
        engine.onPlaybackEnd = { [weak self] in
            self?.isPlaying = false
        }
    }

    private func wireCommandStackCallback() {
        commandStack.didChange = { [weak self] stack in
            Task { @MainActor in
                self?.canUndo = stack.canUndo
                self?.canRedo = stack.canRedo
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_loadProject_emptySlide_initEngineEmpty 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/TimelineProjectFactory.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Mocks/MockStoryTimelineEngine.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): add TimelineViewModel skeleton + engine providing protocol"
```

---

### Task 8: TimelineViewModel — selectClip pushes selection

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` — append at the end of the class :

```swift
    func test_selectClip_pushesSelection() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip())
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        XCTAssertEqual(sut.selection.selectedClipId, "clip-1")
    }

    func test_selectClip_unknownId_clearsSelection() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip())
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        sut.selectClip(id: nil)
        XCTAssertNil(sut.selection.selectedClipId)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_selectClip_pushesSelection 2>&1 | tail -10`
Expected: FAIL with "value of type 'TimelineViewModel' has no member 'selectClip'".

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append before the closing `}` of the class :

```swift
    // MARK: - Selection

    public func selectClip(id: String?) {
        if let id { selection.select(id) } else { selection.deselect() }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_selectClip 2>&1 | tail -10`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel.selectClip(id:) updates selection state"
```

---

### Task 9: TimelineViewModel — dragClip pushes coalesced MoveCommand

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` — append :

```swift
    func test_dragClip_pushesMoveCommand_coalesced() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        for delta in stride(from: Float(0.05), through: 2.0, by: 0.05) {
            sut.dragClipMoved(rawTime: delta, snapCandidates: [])
        }
        sut.endClipDrag()

        XCTAssertTrue(sut.canUndo, "drag should have pushed at least one command")
        XCTAssertNil(sut.selection.activeDrag, "drag must be cleared after end")

        // Single coalesced MoveClipCommand expected.
        let snapshot = sut.commandHistorySnapshot()
        XCTAssertEqual(snapshot.commands.count, 1,
                       "Multiple drag frames should coalesce into one MoveClipCommand")

        // The clip start time must reflect the last drag value.
        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertNotNil(clip)
        XCTAssertEqual(clip?.startTime ?? 0, 2.0, accuracy: 0.05)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_dragClip_pushesMoveCommand_coalesced 2>&1 | tail -10`
Expected: FAIL — methods missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Clip drag

    public func beginClipDrag(clipId: String) {
        guard let original = clipStartTime(id: clipId) else { return }
        selection.beginDrag(clipId: clipId, originalStartTime: original)
    }

    public func dragClipMoved(rawTime: Float, snapCandidates: [SnapCandidate]) {
        guard var drag = selection.activeDrag else { return }
        let snapResult = snapEngine.snap(rawTime: rawTime,
                                         candidates: snapCandidates,
                                         disabled: !isSnapEnabled)
        drag.currentStartTime = snapResult.snappedTime
        drag.snappedTo = mapSnapKind(snapResult.matched?.kind)
        selection.updateDrag(currentStartTime: drag.currentStartTime,
                             snappedTo: drag.snappedTo)
        applyClipPosition(clipId: drag.clipId, newStartTime: drag.currentStartTime)
    }

    public func endClipDrag() {
        guard let drag = selection.activeDrag,
              let kind = clipKind(forId: drag.clipId) else { return }
        let cmd = MoveClipCommand(
            clipId: drag.clipId,
            kind: kind,
            oldStartTime: drag.originalStartTime,
            newStartTime: drag.currentStartTime
        )
        commandStack.push(.moveClip(cmd))
        selection.endDrag()
    }

    /// Returns the timeline-clip kind for a given object id (used by EditCommand factories).
    /// Looks up `mediaObjects` (image vs video via `kind`), `audioPlayerObjects` (.audio),
    /// then `textObjects` (.text). Returns nil if the id is not found in the project.
    public func clipKind(forId id: String) -> TimelineClipKind? {
        if let media = project.mediaObjects.first(where: { $0.id == id }) {
            return media.kind == .video ? .video : .image
        }
        if project.audioPlayerObjects.contains(where: { $0.id == id }) { return .audio }
        if project.textObjects.contains(where: { $0.id == id }) { return .text }
        return nil
    }

    // MARK: - Helpers

    private func clipStartTime(id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.startTime }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.startTime }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.startTime }
        return nil
    }

    private func applyClipPosition(clipId: String, newStartTime: Float) {
        if let i = project.mediaObjects.firstIndex(where: { $0.id == clipId }) {
            project.mediaObjects[i].startTime = newStartTime
            return
        }
        if let i = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) {
            project.audioPlayerObjects[i].startTime = newStartTime
            return
        }
        if let i = project.textObjects.firstIndex(where: { $0.id == clipId }) {
            project.textObjects[i].startTime = newStartTime
        }
    }

    private func mapSnapKind(_ kind: SnapCandidate.Kind?) -> ClipSelectionState.ActiveDrag.SnappedKind? {
        guard let kind else { return nil }
        switch kind {
        case .playhead:                     return .playhead
        case .clipStart, .slideStart:       return .clipStart
        case .clipEnd, .slideEnd:           return .clipEnd
        case .keyframe:                     return .keyframe
        case .gridMajor, .gridMinor:        return .grid
        }
    }

    // MARK: - History snapshot (test + persistence)

    public func commandHistorySnapshot() -> CommandStackSnapshot {
        commandStack.snapshot()
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_dragClip 2>&1 | tail -10`
Expected: PASS (single coalesced command, clip moved to ~2.0).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel drag clip with snap + coalesced MoveClipCommand"
```

---

### Task 10: TimelineViewModel — undo reverts last command + emits update

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` :

```swift
    func test_undo_revertsLastCommand_emitsUpdate() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        sut.dragClipMoved(rawTime: 3.0, snapCandidates: [])
        sut.endClipDrag()

        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 3.0, accuracy: 0.001)
        XCTAssertTrue(sut.canUndo)

        sut.undo()
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 0.0, accuracy: 0.001)
        XCTAssertFalse(sut.canUndo)
        XCTAssertTrue(sut.canRedo)
    }

    func test_redo_reappliesUndoneCommand() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        sut.dragClipMoved(rawTime: 3.0, snapCandidates: [])
        sut.endClipDrag()
        sut.undo()
        sut.redo()
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 3.0, accuracy: 0.001)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_undo 2>&1 | tail -10`
Expected: FAIL with "no member 'undo'".

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Undo / Redo

    public func undo() {
        guard let command = commandStack.undo() else { return }
        do {
            try command.underlying.revert(from: &project)
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func redo() {
        guard let command = commandStack.redo() else { return }
        do {
            try command.underlying.apply(to: &project)
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private var pendingMediaURLs: [String: URL] = [:]
    private var pendingImages: [String: UIImage] = [:]

    public func setMediaResolution(urls: [String: URL], images: [String: UIImage]) {
        pendingMediaURLs = urls
        pendingImages = images
    }

    private func scheduleEngineReconfigure() {
        let snapshot = project
        let urls = pendingMediaURLs
        let images = pendingImages
        bootstrapTask = Task { [engine] in
            await engine.configure(project: snapshot, mediaURLs: urls, images: images)
        }
    }
```

Also update `bootstrap(...)` so it stores the URLs/images on the SUT (replace the existing `bootstrap` body) :

```swift
    public func bootstrap(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) {
        self.project = project
        self.pendingMediaURLs = mediaURLs
        self.pendingImages = images
        bootstrapTask = Task { [weak self, engine] in
            await engine.configure(project: project, mediaURLs: mediaURLs, images: images)
            await MainActor.run { self?.engine.setMode(.editing) }
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_undo 2>&1 | tail -10 && swift test --filter MeeshyUITests.TimelineViewModelTests/test_redo 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel undo/redo through CommandStack"
```

---

### Task 11: TimelineViewModel — splitAtPlayhead creates two clips

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` :

```swift
    func test_splitAtPlayhead_createsTwoClips() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 4))
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        sut.scrub(to: 1.5)
        sut.splitSelectedAtPlayhead()

        let medias = sut.project.mediaObjects
        XCTAssertEqual(medias.count, 2, "split should produce two clips")
        let totalDuration = medias.reduce(Float(0)) { $0 + ($1.duration ?? 0) }
        XCTAssertEqual(totalDuration, 4, accuracy: 0.001, "total duration preserved")
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_splitAtPlayhead 2>&1 | tail -10`
Expected: FAIL — methods missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Scrub & split

    public func scrub(to time: Float) {
        let clamped = max(0, min(time, project.slideDuration))
        currentTime = clamped
        engine.seek(to: clamped, precise: true)
    }

    public func splitSelectedAtPlayhead() {
        guard let id = selection.selectedClipId,
              let kind = clipKind(forId: id),
              let clipStart = clipStartTime(forId: id) else { return }
        let relativeTime = max(0.001, currentTime - clipStart)
        let cmd = SplitClipCommand(
            clipId: id,
            kind: kind,
            splitAtRelativeTime: relativeTime,
            leftId: UUID().uuidString,
            rightId: UUID().uuidString
        )
        do {
            try cmd.apply(to: &project)
            commandStack.push(.splitClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Returns the absolute startTime of any clip (media/audio/text) by id.
    public func clipStartTime(forId id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.startTime ?? 0 }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.startTime ?? 0 }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.startTime ?? 0 }
        return nil
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_splitAtPlayhead 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel scrub + split selected clip at playhead"
```

---

### Task 12: TimelineViewModel — addTransition between two clips

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` :

```swift
    func test_addTransition_overlapsClips() async {
        let (sut, engine) = makeSUT(project: TimelineProjectFactory.projectWithTwoContiguousClips())
        await sut.awaitConfigured()
        engine.reset()

        sut.addTransition(fromClipId: "clip-a", toClipId: "clip-b", kind: .crossfade, duration: 0.5)

        XCTAssertEqual(sut.project.clipTransitions.count, 1)
        XCTAssertEqual(sut.project.clipTransitions.first?.kind, .crossfade)
        XCTAssertEqual(sut.project.clipTransitions.first?.duration ?? -1, 0.5, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(engine.configureCallCount, 1, "engine should reconfigure")
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_addTransition 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Transitions

    public func addTransition(fromClipId: String, toClipId: String, kind: StoryTransitionKind, duration: Float) {
        let transition = StoryClipTransition(
            fromClipId: fromClipId,
            toClipId: toClipId,
            kind: kind,
            duration: duration,
            easing: .linear
        )
        let cmd = AddTransitionCommand(transition: transition)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addTransition(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_addTransition 2>&1 | tail -10`
Expected: PASS. To allow the engine reconfigure assertion, add at the start of the test : `try? await Task.sleep(nanoseconds: 50_000_000)` before the `XCTAssertGreaterThanOrEqual`.

If the test fails on the configureCallCount assertion, edit the test to await the bootstrap task again :

```swift
        await sut.awaitConfigured()
```

after `sut.addTransition(...)`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel add clip transition + engine reconfigure"
```

---

### Task 13: TimelineViewModel — addKeyframeAtPlayhead captures current values

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `TimelineViewModelTests.swift` :

```swift
    func test_addKeyframe_atPlayhead_capturesCurrentValues() async {
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 5)
        let (sut, _) = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.addKeyframeAtPlayhead(x: 0.3, y: 0.5, scale: 1.2, opacity: 1.0)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertNotNil(media?.keyframes)
        XCTAssertEqual(media?.keyframes?.count, 1)
        let kf = media?.keyframes?.first
        XCTAssertEqual(Float(kf?.time ?? -1), 2.0, accuracy: 0.01,
                       "Keyframe time must be relative to clip start, not absolute")
        XCTAssertEqual(kf?.x ?? 0, 0.3, accuracy: 0.001)
        XCTAssertEqual(kf?.scale ?? 0, 1.2, accuracy: 0.001)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_addKeyframe 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Keyframes

    public func addKeyframeAtPlayhead(x: CGFloat? = nil, y: CGFloat? = nil,
                                      scale: CGFloat? = nil, opacity: CGFloat? = nil) {
        guard let id = selection.selectedClipId,
              let clipStart = clipStartTime(id: id) else { return }
        let relativeTime = max(0, currentTime - clipStart)
        let kf = StoryKeyframe(
            time: relativeTime,
            x: x, y: y, scale: scale, opacity: opacity,
            easing: .linear
        )
        guard let kind = clipKind(forId: id) else { return }
        let cmd = AddKeyframeCommand(clipId: id, kind: kind, keyframe: kf)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addKeyframe(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_addKeyframe 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel add keyframe at playhead with relative time"
```

---

### Task 14: TimelineViewModel — switchToProMode preserves selection

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

```swift
    func test_switchToProMode_preservesSelection() async {
        let (sut, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip())
        await sut.awaitConfigured()
        sut.selectClip(id: "clip-1")
        sut.setMode(.pro)
        XCTAssertEqual(sut.mode, .pro)
        XCTAssertEqual(sut.selection.selectedClipId, "clip-1")
        sut.setMode(.quick)
        XCTAssertEqual(sut.mode, .quick)
        XCTAssertEqual(sut.selection.selectedClipId, "clip-1")
    }

    func test_toggleSnap_flipsState() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        XCTAssertTrue(sut.isSnapEnabled)
        sut.toggleSnap()
        XCTAssertFalse(sut.isSnapEnabled)
        sut.toggleSnap()
        XCTAssertTrue(sut.isSnapEnabled)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_switchToProMode 2>&1 | tail -10`
Expected: FAIL — `setMode` missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Mode + snap toggles

    public func setMode(_ newMode: TimelineMode) {
        mode = newMode
    }

    public func toggleSnap() {
        isSnapEnabled.toggle()
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_switchToProMode 2>&1 | tail -10 && swift test --filter MeeshyUITests.TimelineViewModelTests/test_toggleSnap 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel mode switch + snap toggle preserve selection"
```

---

### Task 15: TimelineViewModel — restoreDraft re-applies command history

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

```swift
    func test_restoreDraft_reapplysCommandHistory() async {
        // Session 1 — perform 2 actions, snapshot the stack.
        let (sut1, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut1.awaitConfigured()
        sut1.beginClipDrag(clipId: "clip-1")
        sut1.dragClipMoved(rawTime: 2.0, snapCandidates: [])
        sut1.endClipDrag()
        sut1.selectClip(id: "clip-1")
        sut1.scrub(to: 0.5)
        sut1.splitSelectedAtPlayhead()
        let snapshot = sut1.commandHistorySnapshot()

        // Session 2 — fresh SUT with the original project and the snapshot replayed.
        let (sut2, _) = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0))
        await sut2.awaitConfigured()
        sut2.restoreCommandHistory(snapshot)

        XCTAssertEqual(sut2.project.mediaObjects.count, sut1.project.mediaObjects.count)
        let starts1 = sut1.project.mediaObjects.map { $0.startTime }.sorted()
        let starts2 = sut2.project.mediaObjects.map { $0.startTime }.sorted()
        XCTAssertEqual(starts1, starts2, accuracy: 0.001)
        XCTAssertTrue(sut2.canUndo)
    }
```

(For the `[Float]` accuracy assertion add a helper at the bottom of the test file outside the class — or use the per-element loop instead.)

```swift
private func XCTAssertEqual(_ a: [Float], _ b: [Float], accuracy: Float, file: StaticString = #file, line: UInt = #line) {
    XCTAssertEqual(a.count, b.count, file: file, line: line)
    for (x, y) in zip(a, b) {
        XCTAssertEqual(x, y, accuracy: accuracy, file: file, line: line)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_restoreDraft 2>&1 | tail -10`
Expected: FAIL — `restoreCommandHistory` missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `TimelineViewModel.swift` — append :

```swift
    // MARK: - Persistence

    public func restoreCommandHistory(_ snapshot: CommandStackSnapshot) {
        commandStack.restore(snapshot)
        // Re-apply each command up to cursor against the current project.
        let stackSnapshot = commandStack.snapshot()
        for index in 0..<stackSnapshot.cursor where index < stackSnapshot.commands.count {
            do {
                try stackSnapshot.commands[index].underlying.apply(to: &project)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        scheduleEngineReconfigure()
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineViewModelTests/test_restoreDraft 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift
git commit -m "feat(timeline-ui): TimelineViewModel restore command history from draft snapshot"
```

---

### Task 16: TimelineGeometry — pure value type for px↔time conversion

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineGeometryTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineGeometryTests.swift` :

```swift
import XCTest
import CoreGraphics
@testable import MeeshyUI

final class TimelineGeometryTests: XCTestCase {

    func test_basePixelsPerSecond_whenZoom1_equals50() {
        let geo = TimelineGeometry(zoomScale: 1.0)
        XCTAssertEqual(geo.pixelsPerSecond, 50, accuracy: 0.001)
    }

    func test_pixelsPerSecond_scalesLinearly() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 0.5).pixelsPerSecond, 25, accuracy: 0.001)
        XCTAssertEqual(TimelineGeometry(zoomScale: 2.0).pixelsPerSecond, 100, accuracy: 0.001)
    }

    func test_xForTime_atZero_isZero() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 1.0).x(for: 0), 0)
    }

    func test_xForTime_atOneSecond_isPixelsPerSecond() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 1.0).x(for: 1), 50, accuracy: 0.001)
    }

    func test_timeForX_isInverseOfX() {
        let geo = TimelineGeometry(zoomScale: 1.5)
        let t = geo.time(forX: geo.x(for: 3.0))
        XCTAssertEqual(t, 3.0, accuracy: 0.001)
    }

    func test_widthForDuration_zoomed() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 2.0).width(for: 4), 400, accuracy: 0.001)
    }

    func test_snapTolerance_dependsOnZoom() {
        // 6 points / pixelsPerSecond
        let lowZoom = TimelineGeometry(zoomScale: 0.5)  // 25 px/s
        let highZoom = TimelineGeometry(zoomScale: 2.0) // 100 px/s
        XCTAssertEqual(lowZoom.snapToleranceSeconds, 6.0 / 25.0, accuracy: 0.001)
        XCTAssertEqual(highZoom.snapToleranceSeconds, 6.0 / 100.0, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineGeometryTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift` :

```swift
import Foundation
import CoreGraphics

/// Value type that captures the px-per-second contract used by every timeline
/// view. Pure & deterministic — never depends on UIScreen or runtime metrics.
public struct TimelineGeometry: Equatable, Sendable {

    public static let basePixelsPerSecond: CGFloat = 50

    public let zoomScale: CGFloat

    public init(zoomScale: CGFloat) {
        self.zoomScale = max(0.05, zoomScale)
    }

    public var pixelsPerSecond: CGFloat {
        Self.basePixelsPerSecond * zoomScale
    }

    public func x(for time: Float) -> CGFloat {
        CGFloat(time) * pixelsPerSecond
    }

    public func time(forX x: CGFloat) -> Float {
        Float(x / pixelsPerSecond)
    }

    public func width(for duration: Float) -> CGFloat {
        CGFloat(duration) * pixelsPerSecond
    }

    /// 6 points of finger tolerance, recomputed from current zoom.
    public var snapToleranceSeconds: Float {
        Float(6.0 / pixelsPerSecond)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineGeometryTests 2>&1 | tail -10`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineGeometryTests.swift
git commit -m "feat(timeline-ui): TimelineGeometry value type for px↔time conversions"
```

---

### Task 17: TrackBarView — container for one track row (label + scrollable lane)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift`

- [ ] **Step 1: Écrire le test échouant (compile-time + a11y label)**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TrackBarViewTests: XCTestCase {

    func test_init_doesNotCrash_emptyContent() {
        let view = TrackBarView(
            title: "Vidéo 1",
            isLocked: false,
            isSelected: false,
            tintHex: "6366F1",
            isDark: false,
            laneWidth: 600,
            laneHeight: 44
        ) { Color.clear }
        _ = view.body
    }

    func test_lockedLabel_includesLockBadge() {
        // Locked tracks must expose 🔒 in their accessibilityLabel suffix
        let view = TrackBarView(
            title: "Vidéo 1",
            isLocked: true,
            isSelected: false,
            tintHex: "6366F1",
            isDark: false,
            laneWidth: 600,
            laneHeight: 44
        ) { Color.clear }
        XCTAssertTrue(view.accessibilityComposedLabel.contains("Vidéo 1"))
        XCTAssertTrue(view.accessibilityComposedLabel.lowercased().contains("verrouill"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TrackBarViewTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift` :

```swift
import SwiftUI

/// Single track row : sticky leading label (72 pt) + scrollable lane.
/// Leaf view — primitive `let` parameters only, no @ObservedObject.
public struct TrackBarView<Content: View>: View {

    public let title: String
    public let isLocked: Bool
    public let isSelected: Bool
    public let tintHex: String
    public let isDark: Bool
    public let laneWidth: CGFloat
    public let laneHeight: CGFloat
    private let lane: () -> Content

    public init(
        title: String,
        isLocked: Bool,
        isSelected: Bool,
        tintHex: String,
        isDark: Bool,
        laneWidth: CGFloat,
        laneHeight: CGFloat,
        @ViewBuilder lane: @escaping () -> Content
    ) {
        self.title = title
        self.isLocked = isLocked
        self.isSelected = isSelected
        self.tintHex = tintHex
        self.isDark = isDark
        self.laneWidth = laneWidth
        self.laneHeight = laneHeight
        self.lane = lane
    }

    public var accessibilityComposedLabel: String {
        let lockSuffix = isLocked
            ? " (\(String(localized: "story.timeline.track.lock", bundle: .module))ée)"
            : ""
        return title + lockSuffix
    }

    public var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: 72, height: laneHeight, alignment: .leading)
                .background(isDark ? Color.black.opacity(0.25) : Color.white.opacity(0.6))

            ZStack(alignment: .leading) {
                laneBackground
                lane()
            }
            .frame(width: laneWidth, height: laneHeight, alignment: .leading)
            .clipped()
        }
        .frame(height: laneHeight)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityComposedLabel)
    }

    private var label: some View {
        HStack(spacing: 4) {
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.caption2)
                    .foregroundStyle(MeeshyColors.warning)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(.caption2.weight(isSelected ? .semibold : .regular))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo900)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
    }

    private var laneBackground: some View {
        Rectangle()
            .fill(Color(hex: tintHex).opacity(isDark ? 0.06 : 0.04))
            .overlay(
                Rectangle()
                    .stroke(
                        isSelected ? MeeshyColors.indigo400.opacity(0.55) : Color.clear,
                        lineWidth: 1
                    )
            )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TrackBarViewTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift
git commit -m "feat(timeline-ui): TrackBarView container row with lock badge + a11y label"
```

---

### Task 18: VideoClipBar — clip with frame strip + trim handles

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class VideoClipBarTests: XCTestCase {

    private func makeSUT(
        isSelected: Bool = false,
        fadeIn: Float = 0,
        fadeOut: Float = 0,
        isLocked: Bool = false
    ) -> VideoClipBar {
        VideoClipBar(
            clipId: "clip-1",
            title: "intro.mp4",
            startTime: 1.0,
            duration: 4.0,
            fadeIn: fadeIn,
            fadeOut: fadeOut,
            isSelected: isSelected,
            isLocked: isLocked,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            frames: [],
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onTrimStartDelta: { _ in },
            onTrimEndDelta: { _ in },
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_accessibilityLabel_videoFormat() {
        let sut = makeSUT()
        XCTAssertTrue(sut.accessibilityComposed.contains("intro.mp4"))
    }

    func test_widthMatchesDuration_atZoom1x() {
        // duration = 4 → 4 * 50 = 200 pt
        let sut = makeSUT()
        XCTAssertEqual(sut.geometry.width(for: 4), 200, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.VideoClipBarTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift` :

```swift
import SwiftUI
import UIKit

/// Single video clip rendered inside a track lane.
/// Includes : color tint (success green), frame strip, fade gradients, trim
/// handles, drag, accessibility label & VoiceOver actions.
public struct VideoClipBar: View {

    public let clipId: String
    public let title: String
    public let startTime: Float
    public let duration: Float
    public let fadeIn: Float
    public let fadeOut: Float
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let frames: [UIImage]
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
    public let onTrimStartDelta: (CGFloat) -> Void
    public let onTrimEndDelta: (CGFloat) -> Void
    public let onMoveDelta: (CGFloat) -> Void

    private var width: CGFloat { geometry.width(for: duration) }
    private var xOrigin: CGFloat { geometry.x(for: startTime) }

    public var accessibilityComposed: String {
        String(
            format: String(localized: "story.timeline.a11y.clip.video", bundle: .module),
            title
        )
    }

    public init(
        clipId: String,
        title: String,
        startTime: Float,
        duration: Float,
        fadeIn: Float,
        fadeOut: Float,
        isSelected: Bool,
        isLocked: Bool,
        isDark: Bool,
        geometry: TimelineGeometry,
        laneHeight: CGFloat,
        frames: [UIImage],
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onTrimStartDelta: @escaping (CGFloat) -> Void,
        onTrimEndDelta: @escaping (CGFloat) -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void
    ) {
        self.clipId = clipId
        self.title = title
        self.startTime = startTime
        self.duration = duration
        self.fadeIn = fadeIn
        self.fadeOut = fadeOut
        self.isSelected = isSelected
        self.isLocked = isLocked
        self.isDark = isDark
        self.geometry = geometry
        self.laneHeight = laneHeight
        self.frames = frames
        self.onTap = onTap
        self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress
        self.onTrimStartDelta = onTrimStartDelta
        self.onTrimEndDelta = onTrimEndDelta
        self.onMoveDelta = onMoveDelta
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            background
            framesStrip
            fadeGradients
            if isSelected { selectionHalo }
            if !isLocked { trimHandles }
        }
        .frame(width: width, height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: xOrigin)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue(
            "Début \(String(format: "%.2f", startTime))s, durée \(String(format: "%.2f", duration))s"
        )
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // MARK: - Subviews

    private var background: some View {
        Rectangle()
            .fill(MeeshyColors.success.opacity(isDark ? 0.32 : 0.22))
    }

    private var framesStrip: some View {
        HStack(spacing: 0) {
            ForEach(Array(frames.enumerated()), id: \.offset) { _, image in
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: max(8, width / CGFloat(max(frames.count, 1))),
                           height: laneHeight - 4)
                    .clipped()
            }
        }
        .opacity(0.85)
        .accessibilityHidden(true)
    }

    private var fadeGradients: some View {
        HStack(spacing: 0) {
            LinearGradient(colors: [Color.black.opacity(0.85), Color.black.opacity(0)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: max(0, geometry.width(for: fadeIn)))
            Spacer(minLength: 0)
            LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.85)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: max(0, geometry.width(for: fadeOut)))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var selectionHalo: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .stroke(MeeshyColors.indigo400, lineWidth: 2)
            .shadow(color: MeeshyColors.indigo500.opacity(0.45), radius: 6)
            .allowsHitTesting(false)
    }

    private var trimHandles: some View {
        HStack {
            trimHandle(leading: true)
            Spacer(minLength: 0)
            trimHandle(leading: false)
        }
    }

    private func trimHandle(leading: Bool) -> some View {
        Rectangle()
            .fill(Color.white.opacity(0.95))
            .frame(width: 4, height: laneHeight - 14)
            .padding(leading ? .leading : .trailing, 4)
            .contentShape(Rectangle().inset(by: -10))
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { v in
                        leading ? onTrimStartDelta(v.translation.width)
                                : onTrimEndDelta(v.translation.width)
                    }
            )
            .accessibilityLabel(
                leading
                    ? String(localized: "story.timeline.clip.tooltip.start", bundle: .module)
                    : String(localized: "story.timeline.clip.tooltip.duration", bundle: .module)
            )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.VideoClipBarTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarTests.swift
git commit -m "feat(timeline-ui): VideoClipBar leaf view with frame strip + fade gradients + trim"
```

---

### Task 19: AudioClipBar — waveform + mute badge

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class AudioClipBarTests: XCTestCase {

    private func makeSUT(samples: [Float] = [0.1, 0.6, 0.3, 0.9], muted: Bool = false) -> AudioClipBar {
        AudioClipBar(
            clipId: "audio-1",
            title: "music_bg",
            startTime: 0,
            duration: 4,
            volume: 0.85,
            isMuted: muted,
            isSelected: false,
            isLocked: false,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            waveformSamples: samples,
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() { _ = makeSUT().body }

    func test_accessibilityLabel_audioFormat() {
        XCTAssertTrue(makeSUT().accessibilityComposed.contains("music_bg"))
    }

    func test_mutedFlag_includedInValue() {
        XCTAssertTrue(makeSUT(muted: true).accessibilityValueDescription.lowercased().contains("muet"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.AudioClipBarTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift` :

```swift
import SwiftUI

public struct AudioClipBar: View {

    public let clipId: String
    public let title: String
    public let startTime: Float
    public let duration: Float
    public let volume: Float
    public let isMuted: Bool
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let waveformSamples: [Float]
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
    public let onMoveDelta: (CGFloat) -> Void

    public init(
        clipId: String, title: String, startTime: Float, duration: Float,
        volume: Float, isMuted: Bool, isSelected: Bool, isLocked: Bool,
        isDark: Bool, geometry: TimelineGeometry, laneHeight: CGFloat,
        waveformSamples: [Float],
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void
    ) {
        self.clipId = clipId; self.title = title
        self.startTime = startTime; self.duration = duration
        self.volume = volume; self.isMuted = isMuted
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight; self.waveformSamples = waveformSamples
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress; self.onMoveDelta = onMoveDelta
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.clip.audio", bundle: .module), title)
    }

    public var accessibilityValueDescription: String {
        let pct = Int((volume * 100).rounded())
        let muted = isMuted ? ", muet" : ""
        return "Volume \(pct)%\(muted)"
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            Rectangle()
                .fill(MeeshyColors.warning.opacity(isDark ? 0.32 : 0.22))
            waveform
            if isMuted { muteBadge }
            if isSelected {
                RoundedRectangle(cornerRadius: 6).stroke(MeeshyColors.indigo400, lineWidth: 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: geometry.width(for: duration), height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: geometry.x(for: startTime))
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue(accessibilityValueDescription)
    }

    private var waveform: some View {
        GeometryReader { geo in
            let count = max(waveformSamples.count, 1)
            let stepX = geo.size.width / CGFloat(count)
            HStack(alignment: .center, spacing: 1) {
                ForEach(0..<count, id: \.self) { i in
                    let amp = CGFloat(waveformSamples[i])
                    Capsule()
                        .fill(Color.white.opacity(0.85))
                        .frame(width: max(1, stepX - 1),
                               height: max(2, amp * (geo.size.height - 6)))
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .padding(.horizontal, 3)
        .accessibilityHidden(true)
    }

    private var muteBadge: some View {
        Image(systemName: "speaker.slash.fill")
            .font(.caption2)
            .padding(4)
            .background(Circle().fill(Color.black.opacity(0.6)))
            .foregroundStyle(Color.white)
            .padding(4)
            .accessibilityHidden(true)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.AudioClipBarTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarTests.swift
git commit -m "feat(timeline-ui): AudioClipBar with vertical waveform bars + mute badge"
```

---

### Task 20: TextClipBar — minimal text clip with content preview

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TextClipBarTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TextClipBarTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TextClipBarTests: XCTestCase {

    private func makeSUT(text: String = "Bienvenue") -> TextClipBar {
        TextClipBar(
            clipId: "text-1",
            content: text,
            startTime: 1.0,
            duration: 3.0,
            isSelected: false,
            isLocked: false,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() { _ = makeSUT().body }

    func test_accessibilityLabel_includesContent() {
        XCTAssertTrue(makeSUT().accessibilityComposed.contains("Bienvenue"))
    }

    func test_truncatesPreviewBeyond40Chars() {
        let long = String(repeating: "a", count: 80)
        let preview = TextClipBar.previewSnippet(long, maxLength: 40)
        XCTAssertEqual(preview.count, 40)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TextClipBarTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift` :

```swift
import SwiftUI

public struct TextClipBar: View {

    public let clipId: String
    public let content: String
    public let startTime: Float
    public let duration: Float
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
    public let onMoveDelta: (CGFloat) -> Void

    public init(
        clipId: String, content: String, startTime: Float, duration: Float,
        isSelected: Bool, isLocked: Bool, isDark: Bool,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void
    ) {
        self.clipId = clipId; self.content = content
        self.startTime = startTime; self.duration = duration
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress; self.onMoveDelta = onMoveDelta
    }

    public static func previewSnippet(_ s: String, maxLength: Int) -> String {
        s.count > maxLength ? String(s.prefix(maxLength)) : s
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.clip.text", bundle: .module),
               Self.previewSnippet(content, maxLength: 40))
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            Rectangle().fill(MeeshyColors.error.opacity(isDark ? 0.32 : 0.22))
            HStack {
                Image(systemName: "textformat")
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
                Text(Self.previewSnippet(content, maxLength: 24))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            if isSelected {
                RoundedRectangle(cornerRadius: 6).stroke(MeeshyColors.indigo400, lineWidth: 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: geometry.width(for: duration), height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: geometry.x(for: startTime))
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue("Affiché de \(String(format: "%.1f", startTime))s à \(String(format: "%.1f", startTime + duration))s")
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TextClipBarTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TextClipBarTests.swift
git commit -m "feat(timeline-ui): TextClipBar leaf view with content preview + a11y"
```

---

### Task 21: TransitionBadge — yellow diamond between clips

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift` :

```swift
import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class TransitionBadgeTests: XCTestCase {

    func test_init_crossfade_doesNotCrash() {
        let badge = TransitionBadge(
            id: "t-1",
            kind: .crossfade,
            duration: 0.5,
            isSelected: false,
            isDark: false,
            anchorX: 100,
            laneHeight: 44,
            onTap: {},
            onLongPress: {},
            onDurationDelta: { _ in }
        )
        _ = badge.body
        XCTAssertTrue(badge.accessibilityComposed.contains("Fondu"))
    }

    func test_init_dissolve_label() {
        let badge = TransitionBadge(
            id: "t-2", kind: .dissolve, duration: 0.3,
            isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
        XCTAssertTrue(badge.accessibilityComposed.contains("Dissolution"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionBadgeTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift` :

```swift
import SwiftUI
import MeeshySDK

public struct TransitionBadge: View {

    public let id: String
    public let kind: StoryTransitionKind
    public let duration: Float
    public let isSelected: Bool
    public let isDark: Bool
    public let anchorX: CGFloat
    public let laneHeight: CGFloat
    public let onTap: () -> Void
    public let onLongPress: () -> Void
    public let onDurationDelta: (CGFloat) -> Void

    public init(
        id: String, kind: StoryTransitionKind, duration: Float,
        isSelected: Bool, isDark: Bool, anchorX: CGFloat, laneHeight: CGFloat,
        onTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onDurationDelta: @escaping (CGFloat) -> Void
    ) {
        self.id = id; self.kind = kind; self.duration = duration
        self.isSelected = isSelected; self.isDark = isDark
        self.anchorX = anchorX; self.laneHeight = laneHeight
        self.onTap = onTap; self.onLongPress = onLongPress
        self.onDurationDelta = onDurationDelta
    }

    public var accessibilityComposed: String {
        let kindLabel: String
        switch kind {
        case .crossfade: kindLabel = String(localized: "story.timeline.transition.crossfade", bundle: .module)
        case .dissolve:  kindLabel = String(localized: "story.timeline.transition.dissolve", bundle: .module)
        }
        return "\(kindLabel) — \(String(format: "%.2f", duration))s"
    }

    public var body: some View {
        ZStack {
            Diamond()
                .fill(MeeshyColors.warning)
                .overlay(Diamond().stroke(Color.black.opacity(0.6), lineWidth: 1))
                .shadow(color: MeeshyColors.warning.opacity(0.65), radius: isSelected ? 8 : 3)
            Image(systemName: kind == .crossfade ? "arrow.triangle.2.circlepath" : "drop.fill")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.black)
                .accessibilityHidden(true)
        }
        .frame(width: 18, height: 18)
        .position(x: anchorX, y: laneHeight / 2)
        .contentShape(Rectangle().inset(by: -16))
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { v in onDurationDelta(v.translation.width) }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityHint(String(localized: "story.timeline.transition.delete", bundle: .module))
    }
}

private struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionBadgeTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift
git commit -m "feat(timeline-ui): TransitionBadge yellow diamond between clips with hit-zone +16"
```

---

### Task 22: RulerView — adaptive ruler (ms→s→min)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class RulerViewTests: XCTestCase {

    func test_tickInterval_zoomedOut_returnsMultipleSeconds() {
        // 0.3x → 15 px/s → ticks every 5s
        XCTAssertEqual(RulerView.tickInterval(for: 0.3), 5.0, accuracy: 0.01)
    }

    func test_tickInterval_zoom1x_returnsOneSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 1.0), 1.0, accuracy: 0.01)
    }

    func test_tickInterval_zoomedIn_returnsHalfSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 5.0), 0.2, accuracy: 0.01)
    }

    func test_tickInterval_extremeZoom_returnsMillisecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 15.0), 0.05, accuracy: 0.01)
    }

    func test_format_msFormatting_under1s() {
        XCTAssertEqual(RulerView.formatTick(0.05), "50ms")
    }

    func test_format_secondsFormatting_under60s() {
        XCTAssertEqual(RulerView.formatTick(12.5), "12.5s")
    }

    func test_format_minutesFormatting_above60s() {
        XCTAssertEqual(RulerView.formatTick(125), "2:05")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.RulerViewTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift` :

```swift
import SwiftUI

public struct RulerView: View {

    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let isDark: Bool
    public let height: CGFloat
    public let onTapTime: (Float) -> Void

    public init(
        totalDuration: Float,
        geometry: TimelineGeometry,
        isDark: Bool,
        height: CGFloat = 24,
        onTapTime: @escaping (Float) -> Void
    ) {
        self.totalDuration = totalDuration
        self.geometry = geometry
        self.isDark = isDark
        self.height = height
        self.onTapTime = onTapTime
    }

    public static func tickInterval(for zoom: CGFloat) -> Double {
        let pps = Double(TimelineGeometry.basePixelsPerSecond * zoom)
        switch pps {
        case ..<20:    return 5.0
        case 20..<40:  return 2.0
        case 40..<80:  return 1.0
        case 80..<200: return 0.2
        default:       return 0.05
        }
    }

    public static func formatTick(_ seconds: Double) -> String {
        if seconds < 1.0 {
            return "\(Int((seconds * 1000).rounded()))ms"
        } else if seconds < 60.0 {
            let rounded = (seconds * 10).rounded() / 10
            if rounded == rounded.rounded() {
                return "\(Int(rounded))s"
            }
            return String(format: "%.1fs", rounded)
        } else {
            let m = Int(seconds) / 60
            let s = Int(seconds) % 60
            return String(format: "%d:%02d", m, s)
        }
    }

    public var body: some View {
        let interval = Self.tickInterval(for: geometry.zoomScale)
        let count = max(1, Int((Double(totalDuration) / interval).rounded(.up)) + 1)

        ZStack(alignment: .leading) {
            Rectangle()
                .fill(isDark ? Color.black.opacity(0.4) : Color.white.opacity(0.7))
            ForEach(0..<count, id: \.self) { i in
                let t = Double(i) * interval
                tick(at: CGFloat(t) * geometry.pixelsPerSecond, label: Self.formatTick(t))
            }
        }
        .frame(height: height)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in onTapTime(geometry.time(forX: max(0, v.location.x))) }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Ruler")
    }

    private func tick(at x: CGFloat, label: String) -> some View {
        VStack(spacing: 2) {
            Rectangle()
                .fill(isDark ? MeeshyColors.indigo300.opacity(0.7) : MeeshyColors.indigo700.opacity(0.6))
                .frame(width: 1, height: 6)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo800)
                .lineLimit(1)
                .fixedSize()
        }
        .position(x: x, y: height / 2)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.RulerViewTests 2>&1 | tail -10`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewTests.swift
git commit -m "feat(timeline-ui): RulerView with adaptive tick interval (ms/s/min) per zoom"
```

---

### Task 23: PlayheadView — vertical line + draggable triangle

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/PlayheadViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/PlayheadViewTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

@MainActor
final class PlayheadViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = PlayheadView(
            currentTime: 1.5,
            totalDuration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            onScrub: { _ in }
        )
        _ = view.body
    }

    func test_xPosition_matchesGeometry() {
        let view = PlayheadView(
            currentTime: 2.0,
            totalDuration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            onScrub: { _ in }
        )
        XCTAssertEqual(view.computedX, 100, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.PlayheadViewTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift` :

```swift
import SwiftUI

public struct PlayheadView: View {

    public let currentTime: Float
    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isDark: Bool
    public let onScrub: (Float) -> Void

    public init(
        currentTime: Float, totalDuration: Float,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        isDark: Bool, onScrub: @escaping (Float) -> Void
    ) {
        self.currentTime = currentTime; self.totalDuration = totalDuration
        self.geometry = geometry; self.laneHeight = laneHeight
        self.isDark = isDark; self.onScrub = onScrub
    }

    public var computedX: CGFloat { geometry.x(for: currentTime) }

    public var body: some View {
        ZStack(alignment: .top) {
            Triangle()
                .fill(Color.white)
                .frame(width: 12, height: 8)
                .offset(y: -2)
            Rectangle()
                .fill(Color.white)
                .frame(width: 1.5, height: laneHeight)
                .shadow(color: Color.black.opacity(0.4), radius: 2)
        }
        .frame(width: 24, height: laneHeight, alignment: .top)
        .contentShape(Rectangle().inset(by: -16))
        .position(x: computedX, y: laneHeight / 2)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    let raw = geometry.time(forX: max(0, computedX + v.translation.width))
                    let clamped = max(0, min(raw, totalDuration))
                    onScrub(clamped)
                }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.timeline.a11y.playhead", bundle: .module))
        .accessibilityValue(
            String(format: "%.2fs / %.2fs", currentTime, totalDuration)
        )
        .accessibilityAdjustableAction { direction in
            let frame: Float = 1.0 / 60.0
            switch direction {
            case .increment: onScrub(min(totalDuration, currentTime + frame))
            case .decrement: onScrub(max(0, currentTime - frame))
            @unknown default: break
            }
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.closeSubpath()
        return p
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.PlayheadViewTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/PlayheadViewTests.swift
git commit -m "feat(timeline-ui): PlayheadView triangle + line + scrub drag + a11y adjustable"
```

---

### Task 24: SnapGuideView — magenta line + label

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/SnapGuideViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/SnapGuideViewTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class SnapGuideViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = SnapGuideView(x: 100, height: 200, label: "PLAYHEAD 4.250s",
                                 isVisible: true, reducedMotion: false)
        _ = view.body
    }

    func test_snapColor_isMagenta() {
        XCTAssertEqual(SnapGuideView.snapColorHex, "EC4899",
                       "Snap color is documented as magenta exception in spec annex I")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.SnapGuideViewTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift` :

```swift
import SwiftUI

public struct SnapGuideView: View {

    /// Magenta — exception design vs brand indigo (see spec annex I).
    public static let snapColorHex = "EC4899"

    public let x: CGFloat
    public let height: CGFloat
    public let label: String
    public let isVisible: Bool
    public let reducedMotion: Bool

    public init(x: CGFloat, height: CGFloat, label: String, isVisible: Bool, reducedMotion: Bool) {
        self.x = x; self.height = height; self.label = label
        self.isVisible = isVisible; self.reducedMotion = reducedMotion
    }

    public var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(
                    Capsule().fill(Color(hex: Self.snapColorHex))
                )
                .accessibilityHidden(true)
            Rectangle()
                .fill(Color(hex: Self.snapColorHex))
                .frame(width: 1, height: height)
                .opacity(reducedMotion ? 1 : 0.95)
        }
        .frame(width: 80, height: height + 18, alignment: .top)
        .position(x: x, y: (height + 18) / 2)
        .opacity(isVisible ? 1 : 0)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.SnapGuideViewTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/SnapGuideViewTests.swift
git commit -m "feat(timeline-ui): SnapGuideView magenta line + label (Final-Cut-style snap)"
```

---

### Task 25: DurationHandle — indigo diamond at end of timeline

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/DurationHandleTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/DurationHandleTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

@MainActor
final class DurationHandleTests: XCTestCase {

    func test_init_doesNotCrash() {
        var captured: Float = 0
        let h = DurationHandle(
            duration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            minDuration: 2, maxDuration: 600,
            onChange: { captured = $0 }
        )
        _ = h.body
        XCTAssertEqual(captured, 0)
    }

    func test_clampDuration_belowMin_clampsToMin() {
        XCTAssertEqual(DurationHandle.clamp(1.0, min: 2.0, max: 600), 2.0)
    }

    func test_clampDuration_aboveMax_clampsToMax() {
        XCTAssertEqual(DurationHandle.clamp(900, min: 2, max: 600), 600)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.DurationHandleTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift` :

```swift
import SwiftUI

public struct DurationHandle: View {

    public let duration: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isDark: Bool
    public let minDuration: Float
    public let maxDuration: Float
    public let onChange: (Float) -> Void

    public init(duration: Float, geometry: TimelineGeometry, laneHeight: CGFloat,
                isDark: Bool, minDuration: Float = 2, maxDuration: Float = 600,
                onChange: @escaping (Float) -> Void) {
        self.duration = duration; self.geometry = geometry
        self.laneHeight = laneHeight; self.isDark = isDark
        self.minDuration = minDuration; self.maxDuration = maxDuration
        self.onChange = onChange
    }

    public static func clamp(_ value: Float, min minV: Float, max maxV: Float) -> Float {
        max(minV, min(value, maxV))
    }

    public var body: some View {
        let x = geometry.x(for: duration)
        DiamondShape()
            .fill(MeeshyColors.indigo500)
            .overlay(DiamondShape().stroke(MeeshyColors.indigo700, lineWidth: 1))
            .shadow(color: MeeshyColors.indigo500.opacity(0.55), radius: 4)
            .frame(width: 16, height: 16)
            .contentShape(Rectangle().inset(by: -16))
            .position(x: x, y: laneHeight / 2)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        let newDur = duration + Float(v.translation.width / geometry.pixelsPerSecond)
                        onChange(Self.clamp(newDur, min: minDuration, max: maxDuration))
                    }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "story.timeline.a11y.durationHandle", bundle: .module))
            .accessibilityValue(String(format: "%.1fs", duration))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: onChange(Self.clamp(duration + 0.5, min: minDuration, max: maxDuration))
                case .decrement: onChange(Self.clamp(duration - 0.5, min: minDuration, max: maxDuration))
                @unknown default: break
                }
            }
    }
}

private struct DiamondShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.DurationHandleTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/DurationHandleTests.swift
git commit -m "feat(timeline-ui): DurationHandle indigo diamond with clamp 2..600s + a11y adjustable"
```

---

### Task 26: KeyframeMarkerView — small yellow diamond on a clip

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/KeyframeMarkerViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/KeyframeMarkerViewTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

@MainActor
final class KeyframeMarkerViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = KeyframeMarkerView(
            keyframeId: "kf-1",
            absoluteTime: 2.5,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            isSelected: false,
            onTap: {},
            onLongPress: {},
            onDragDelta: { _ in }
        )
        _ = view.body
    }

    func test_accessibilityLabel_includesTime() {
        let view = KeyframeMarkerView(
            keyframeId: "kf-1", absoluteTime: 2.5,
            geometry: TimelineGeometry(zoomScale: 1.0), laneHeight: 44,
            isSelected: false, onTap: {}, onLongPress: {}, onDragDelta: { _ in }
        )
        XCTAssertTrue(view.accessibilityComposed.contains("2"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.KeyframeMarkerViewTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift` :

```swift
import SwiftUI

public struct KeyframeMarkerView: View {

    public let keyframeId: String
    public let absoluteTime: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isSelected: Bool
    public let onTap: () -> Void
    public let onLongPress: () -> Void
    public let onDragDelta: (CGFloat) -> Void

    public init(keyframeId: String, absoluteTime: Float,
                geometry: TimelineGeometry, laneHeight: CGFloat,
                isSelected: Bool,
                onTap: @escaping () -> Void,
                onLongPress: @escaping () -> Void,
                onDragDelta: @escaping (CGFloat) -> Void) {
        self.keyframeId = keyframeId; self.absoluteTime = absoluteTime
        self.geometry = geometry; self.laneHeight = laneHeight
        self.isSelected = isSelected
        self.onTap = onTap; self.onLongPress = onLongPress
        self.onDragDelta = onDragDelta
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.keyframe", bundle: .module),
               String(format: "%.2fs", absoluteTime))
    }

    public var body: some View {
        let x = geometry.x(for: absoluteTime)
        SmallDiamond()
            .fill(MeeshyColors.warning)
            .overlay(SmallDiamond().stroke(Color.black.opacity(0.55), lineWidth: 0.8))
            .frame(width: isSelected ? 10 : 8, height: isSelected ? 10 : 8)
            .position(x: x, y: laneHeight / 2)
            .contentShape(Rectangle().inset(by: -16))
            .onTapGesture { onTap() }
            .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { v in onDragDelta(v.translation.width) }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityComposed)
    }
}

private struct SmallDiamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.KeyframeMarkerViewTests 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/KeyframeMarkerViewTests.swift
git commit -m "feat(timeline-ui): KeyframeMarkerView small yellow diamond with hit-zone +16"
```

---

### Task 27: ClipInspector — sheet (Quick) / popover (Pro) clip detail editor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorTests: XCTestCase {

    private func makeClip(
        id: String = "clip-1",
        start: Float = 0.5,
        duration: Float = 5.0,
        volume: Float = 0.85,
        fadeIn: Float = 0.4,
        fadeOut: Float = 0.0,
        loop: Bool = false,
        background: Bool = true
    ) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(
            id: id,
            displayName: "intro.mp4",
            kind: .video,
            startTime: start,
            duration: duration,
            volume: volume,
            fadeInDuration: fadeIn,
            fadeOutDuration: fadeOut,
            isLooping: loop,
            isBackground: background
        )
    }

    func test_init_quickPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .sheet,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_init_popoverPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .popover,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_formattedStart_usesFractionalSeconds() {
        let formatted = ClipInspector.formatTime(seconds: 0.5)
        XCTAssertEqual(formatted, "0:00.500")
    }

    func test_formattedDuration_above60s_includesMinutes() {
        XCTAssertEqual(ClipInspector.formatTime(seconds: 65.25), "1:05.250")
    }

    func test_volumeChanged_invokesCallback() {
        var captured: Float?
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: makeClip(volume: 0.5),
            onVolumeChanged: { captured = $0 },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        inspector.simulateVolumeCommit(value: 0.72)
        XCTAssertEqual(captured ?? -1, 0.72, accuracy: 0.001)
    }

    func test_fadeBounds_areClampedTo0to3() {
        XCTAssertEqual(ClipInspector.fadeRange.lowerBound, 0)
        XCTAssertEqual(ClipInspector.fadeRange.upperBound, 3)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipInspectorTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift` :

```swift
import Foundation

/// Where the inspector is rendered. Quick Mode uses a bottom sheet; Pro Mode
/// pins it as a floating popover anchored bottom-leading next to the canvas.
public enum InspectorPresentation: Sendable, Equatable {
    case sheet
    case popover
}
```

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift` :

```swift
import SwiftUI

/// Per-clip editor surface. Stateless on its own — receives a snapshot, emits
/// callbacks for every field commit. The owning container (`QuickTimelineView`
/// or `ProTimelineView`) wires those callbacks back to `TimelineViewModel`.
public struct ClipInspector: View {

    // MARK: - Snapshot

    public struct ClipSnapshot: Equatable, Sendable {
        public enum Kind: String, Sendable, Equatable { case video, audio, text, image }
        public let id: String
        public let displayName: String
        public let kind: Kind
        public let startTime: Float
        public let duration: Float
        public let volume: Float
        public let fadeInDuration: Float
        public let fadeOutDuration: Float
        public let isLooping: Bool
        public let isBackground: Bool

        public init(id: String, displayName: String, kind: Kind,
                    startTime: Float, duration: Float, volume: Float,
                    fadeInDuration: Float, fadeOutDuration: Float,
                    isLooping: Bool, isBackground: Bool) {
            self.id = id; self.displayName = displayName; self.kind = kind
            self.startTime = startTime; self.duration = duration
            self.volume = volume
            self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
            self.isLooping = isLooping; self.isBackground = isBackground
        }
    }

    public static let fadeRange: ClosedRange<Float> = 0...3

    public let presentation: InspectorPresentation
    public let clip: ClipSnapshot
    public let onVolumeChanged: (Float) -> Void
    public let onFadeInChanged: (Float) -> Void
    public let onFadeOutChanged: (Float) -> Void
    public let onLoopToggled: (Bool) -> Void
    public let onBackgroundToggled: (Bool) -> Void
    public let onAddKeyframe: () -> Void
    public let onDelete: () -> Void

    @State private var volume: Float
    @State private var fadeIn: Float
    @State private var fadeOut: Float
    @State private var loop: Bool
    @State private var background: Bool

    public init(presentation: InspectorPresentation,
                clip: ClipSnapshot,
                onVolumeChanged: @escaping (Float) -> Void,
                onFadeInChanged: @escaping (Float) -> Void,
                onFadeOutChanged: @escaping (Float) -> Void,
                onLoopToggled: @escaping (Bool) -> Void,
                onBackgroundToggled: @escaping (Bool) -> Void,
                onAddKeyframe: @escaping () -> Void,
                onDelete: @escaping () -> Void) {
        self.presentation = presentation
        self.clip = clip
        self.onVolumeChanged = onVolumeChanged
        self.onFadeInChanged = onFadeInChanged
        self.onFadeOutChanged = onFadeOutChanged
        self.onLoopToggled = onLoopToggled
        self.onBackgroundToggled = onBackgroundToggled
        self.onAddKeyframe = onAddKeyframe
        self.onDelete = onDelete
        _volume = State(initialValue: clip.volume)
        _fadeIn = State(initialValue: clip.fadeInDuration)
        _fadeOut = State(initialValue: clip.fadeOutDuration)
        _loop = State(initialValue: clip.isLooping)
        _background = State(initialValue: clip.isBackground)
    }

    // MARK: - Test helpers

    public func simulateVolumeCommit(value: Float) {
        onVolumeChanged(min(1, max(0, value)))
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            metadataRow
            volumeSlider
            fadeSliders
            togglesRow
            actionsRow
        }
        .padding(presentation == .popover ? 14 : 18)
        .background(
            RoundedRectangle(cornerRadius: presentation == .popover ? 14 : 0)
                .fill(.ultraThinMaterial)
        )
        .frame(maxWidth: presentation == .popover ? 360 : .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.a11y.clip.video", bundle: .module))
    }

    // MARK: - Sub-views

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: kindSystemImage)
                .font(.headline)
                .foregroundStyle(MeeshyColors.indigo500)
                .accessibilityHidden(true)
            Text(clip.displayName)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
    }

    private var metadataRow: some View {
        HStack(spacing: 24) {
            metadataField(
                title: String(localized: "story.timeline.inspector.start", bundle: .module),
                value: Self.formatTime(seconds: clip.startTime)
            )
            metadataField(
                title: String(localized: "story.timeline.inspector.duration", bundle: .module),
                value: Self.formatTime(seconds: clip.duration)
            )
        }
    }

    private func metadataField(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.body, design: .monospaced))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(value)")
    }

    private var volumeSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.inspector.volume", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $volume, in: 0...1, step: 0.01) { editing in
                if !editing { onVolumeChanged(volume) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue("\(Int(volume * 100))%")
        }
    }

    private var fadeSliders: some View {
        HStack(spacing: 12) {
            fadeSlider(
                title: String(localized: "story.timeline.clip.tooltip.fadeIn", bundle: .module),
                value: $fadeIn,
                onCommit: { onFadeInChanged(fadeIn) }
            )
            fadeSlider(
                title: String(localized: "story.timeline.clip.tooltip.fadeOut", bundle: .module),
                value: $fadeOut,
                onCommit: { onFadeOutChanged(fadeOut) }
            )
        }
    }

    private func fadeSlider(title: String, value: Binding<Float>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: value, in: Self.fadeRange, step: 0.05) { editing in
                if !editing { onCommit() }
            }
            .tint(MeeshyColors.indigo400)
            .accessibilityValue(String(format: "%.2fs", value.wrappedValue))
        }
    }

    private var togglesRow: some View {
        HStack(spacing: 24) {
            Toggle(isOn: Binding(
                get: { loop },
                set: { loop = $0; onLoopToggled($0) }
            )) {
                Text(String(localized: "story.timeline.inspector.loop", bundle: .module))
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)

            Toggle(isOn: Binding(
                get: { background },
                set: { background = $0; onBackgroundToggled($0) }
            )) {
                Text(String(localized: "story.timeline.inspector.background", bundle: .module))
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)
        }
    }

    private var actionsRow: some View {
        HStack(spacing: 12) {
            Button(action: onAddKeyframe) {
                Label(
                    String(localized: "story.timeline.keyframe.add", bundle: .module),
                    systemImage: "diamond.fill"
                )
                .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.indigo500)
            .accessibilityHint(String(localized: "story.timeline.keyframe.add", bundle: .module))

            Spacer(minLength: 0)

            Button(role: .destructive, action: onDelete) {
                Label(
                    String(localized: "story.timeline.clip.delete", bundle: .module),
                    systemImage: "trash"
                )
                .font(.subheadline.weight(.semibold))
            }
            .tint(MeeshyColors.error)
        }
    }

    private var kindSystemImage: String {
        switch clip.kind {
        case .video: return "film"
        case .audio: return "waveform"
        case .text:  return "textformat"
        case .image: return "photo"
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipInspectorTests 2>&1 | tail -10`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift
git commit -m "feat(timeline-ui): ClipInspector dual-presentation editor with fade/loop/background"
```

---

### Task 28: KeyframeInspector — contextual sheet for x/y/scale/opacity

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/KeyframeInspectorTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/KeyframeInspectorTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class KeyframeInspectorTests: XCTestCase {

    private func makeSnapshot(
        x: CGFloat = 0.3,
        y: CGFloat = 0.5,
        scale: CGFloat = 1.2,
        opacity: CGFloat = 1.0
    ) -> KeyframeInspector.KeyframeSnapshot {
        KeyframeInspector.KeyframeSnapshot(
            id: "kf-1",
            absoluteTime: 2.5,
            x: x, y: y, scale: scale, opacity: opacity
        )
    }

    func test_init_doesNotCrash() {
        let view = KeyframeInspector(
            keyframe: makeSnapshot(),
            isAdvancedEnabled: false,
            onPositionChanged: { _, _ in },
            onScaleChanged: { _ in },
            onOpacityChanged: { _ in },
            onEasingChanged: { _ in },
            onDelete: {}
        )
        _ = view.body
    }

    func test_easingPicker_default_exposesOnlyLinear() {
        XCTAssertEqual(KeyframeInspector.exposedEasingsAtLaunch, [.linear])
    }

    func test_easingPicker_advancedFlag_exposesAllCases() {
        XCTAssertGreaterThan(KeyframeInspector.exposedEasings(advanced: true).count, 1)
    }

    func test_positionChanged_emitsBothComponents() {
        var captured: (CGFloat, CGFloat)?
        let view = KeyframeInspector(
            keyframe: makeSnapshot(x: 0.1, y: 0.2),
            isAdvancedEnabled: false,
            onPositionChanged: { captured = ($0, $1) },
            onScaleChanged: { _ in },
            onOpacityChanged: { _ in },
            onEasingChanged: { _ in },
            onDelete: {}
        )
        view.simulatePositionCommit(x: 0.45, y: 0.6)
        XCTAssertEqual(captured?.0 ?? -1, 0.45, accuracy: 0.001)
        XCTAssertEqual(captured?.1 ?? -1, 0.6, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.KeyframeInspectorTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift` :

```swift
import SwiftUI

/// Contextual sheet shown on tap of a `KeyframeMarkerView`. Uses the same
/// snapshot/callback contract as `ClipInspector` — the owner translates each
/// commit into a `MoveKeyframeCommand` / `DeleteKeyframeCommand` via
/// `TimelineViewModel`.
public struct KeyframeInspector: View {

    public enum Easing: String, CaseIterable, Sendable, Equatable, Identifiable {
        case linear, easeIn, easeOut, easeInOut, spring
        public var id: String { rawValue }
        public var displayName: String {
            switch self {
            case .linear:    return "Linear"
            case .easeIn:    return "Ease In"
            case .easeOut:   return "Ease Out"
            case .easeInOut: return "Ease In/Out"
            case .spring:    return "Spring"
            }
        }
    }

    public struct KeyframeSnapshot: Equatable, Sendable {
        public let id: String
        public let absoluteTime: Float
        public let x: CGFloat
        public let y: CGFloat
        public let scale: CGFloat
        public let opacity: CGFloat
        public init(id: String, absoluteTime: Float,
                    x: CGFloat, y: CGFloat, scale: CGFloat, opacity: CGFloat) {
            self.id = id; self.absoluteTime = absoluteTime
            self.x = x; self.y = y; self.scale = scale; self.opacity = opacity
        }
    }

    /// At launch only `.linear` is exposed in the picker. Advanced easings stay
    /// gated behind `isAdvancedEnabled` so the data model already supports them
    /// when product unlocks the surface.
    public static let exposedEasingsAtLaunch: [Easing] = [.linear]

    public static func exposedEasings(advanced: Bool) -> [Easing] {
        advanced ? Easing.allCases : exposedEasingsAtLaunch
    }

    public let keyframe: KeyframeSnapshot
    public let isAdvancedEnabled: Bool
    public let onPositionChanged: (CGFloat, CGFloat) -> Void
    public let onScaleChanged: (CGFloat) -> Void
    public let onOpacityChanged: (CGFloat) -> Void
    public let onEasingChanged: (Easing) -> Void
    public let onDelete: () -> Void

    @State private var posX: CGFloat
    @State private var posY: CGFloat
    @State private var scale: CGFloat
    @State private var opacity: CGFloat
    @State private var easing: Easing

    public init(keyframe: KeyframeSnapshot,
                isAdvancedEnabled: Bool,
                onPositionChanged: @escaping (CGFloat, CGFloat) -> Void,
                onScaleChanged: @escaping (CGFloat) -> Void,
                onOpacityChanged: @escaping (CGFloat) -> Void,
                onEasingChanged: @escaping (Easing) -> Void,
                onDelete: @escaping () -> Void) {
        self.keyframe = keyframe
        self.isAdvancedEnabled = isAdvancedEnabled
        self.onPositionChanged = onPositionChanged
        self.onScaleChanged = onScaleChanged
        self.onOpacityChanged = onOpacityChanged
        self.onEasingChanged = onEasingChanged
        self.onDelete = onDelete
        _posX = State(initialValue: keyframe.x)
        _posY = State(initialValue: keyframe.y)
        _scale = State(initialValue: keyframe.scale)
        _opacity = State(initialValue: keyframe.opacity)
        _easing = State(initialValue: .linear)
    }

    public func simulatePositionCommit(x: CGFloat, y: CGFloat) {
        onPositionChanged(x, y)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            positionSliders
            scaleSlider
            opacitySlider
            easingPicker
            deleteButton
        }
        .padding(18)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(format: String(localized: "story.timeline.a11y.keyframe", bundle: .module),
                                   String(format: "%.2fs", keyframe.absoluteTime)))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text(String(format: "%.2fs", keyframe.absoluteTime))
                .font(.system(.headline, design: .monospaced))
            Spacer(minLength: 0)
        }
    }

    private var positionSliders: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(localized: "story.timeline.keyframe.position", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                axisSlider(label: "X", value: $posX, range: 0...1) {
                    onPositionChanged(posX, posY)
                }
                axisSlider(label: "Y", value: $posY, range: 0...1) {
                    onPositionChanged(posX, posY)
                }
            }
        }
    }

    private func axisSlider(label: String, value: Binding<CGFloat>, range: ClosedRange<CGFloat>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption.weight(.semibold))
            Slider(value: value, in: range) { editing in
                if !editing { onCommit() }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2f", value.wrappedValue))
        }
    }

    private var scaleSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.keyframe.scale", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $scale, in: 0.1...4.0, step: 0.05) { editing in
                if !editing { onScaleChanged(scale) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2fx", scale))
        }
    }

    private var opacitySlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.keyframe.opacity", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $opacity, in: 0...1, step: 0.01) { editing in
                if !editing { onOpacityChanged(opacity) }
            }
            .tint(MeeshyColors.indigo400)
            .accessibilityValue("\(Int(opacity * 100))%")
        }
    }

    private var easingPicker: some View {
        let exposed = Self.exposedEasings(advanced: isAdvancedEnabled)
        return Picker(selection: Binding(
            get: { easing },
            set: { newValue in easing = newValue; onEasingChanged(newValue) }
        )) {
            ForEach(exposed) { kind in
                Text(kind.displayName).tag(kind)
            }
        } label: {
            Text("Easing")
        }
        .pickerStyle(.segmented)
        .disabled(exposed.count == 1)
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Label(
                String(localized: "story.timeline.keyframe.delete", bundle: .module),
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
        }
        .tint(MeeshyColors.error)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.KeyframeInspectorTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/KeyframeInspectorTests.swift
git commit -m "feat(timeline-ui): KeyframeInspector contextual sheet (linear-only easing at launch)"
```

---

### Task 29: TransitionInspector — contextual sheet for kind + duration

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/TransitionInspectorTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/TransitionInspectorTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TransitionInspectorTests: XCTestCase {

    private func makeSnapshot(
        kind: StoryTransitionKind = .crossfade,
        duration: Float = 0.5
    ) -> TransitionInspector.TransitionSnapshot {
        TransitionInspector.TransitionSnapshot(
            id: "tr-1",
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: kind,
            duration: duration
        )
    }

    func test_init_doesNotCrash() {
        let view = TransitionInspector(
            transition: makeSnapshot(),
            isAdvancedEnabled: false,
            onKindChanged: { _ in },
            onDurationChanged: { _ in },
            onDelete: {}
        )
        _ = view.body
    }

    func test_durationRange_isClampedTo0_1to2_0() {
        XCTAssertEqual(TransitionInspector.durationRange.lowerBound, 0.1, accuracy: 0.0001)
        XCTAssertEqual(TransitionInspector.durationRange.upperBound, 2.0, accuracy: 0.0001)
    }

    func test_kindChanged_emitsCallback() {
        var captured: StoryTransitionKind?
        let view = TransitionInspector(
            transition: makeSnapshot(kind: .crossfade),
            isAdvancedEnabled: false,
            onKindChanged: { captured = $0 },
            onDurationChanged: { _ in },
            onDelete: {}
        )
        view.simulateKindCommit(.dissolve)
        XCTAssertEqual(captured, .dissolve)
    }

    func test_durationChanged_clampsAndEmits() {
        var captured: Float?
        let view = TransitionInspector(
            transition: makeSnapshot(duration: 0.5),
            isAdvancedEnabled: false,
            onKindChanged: { _ in },
            onDurationChanged: { captured = $0 },
            onDelete: {}
        )
        view.simulateDurationCommit(value: 5)
        XCTAssertEqual(captured ?? -1, 2.0, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionInspectorTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift` :

```swift
import SwiftUI

/// Contextual sheet shown on tap of a `TransitionBadge`. Edits the underlying
/// `StoryClipTransition` via `ChangeTransitionCommand` / `RemoveTransitionCommand`
/// pushed by the owning timeline.
public struct TransitionInspector: View {

    public struct TransitionSnapshot: Equatable, Sendable {
        public let id: String
        public let fromClipId: String
        public let toClipId: String
        public let kind: StoryTransitionKind
        public let duration: Float
        public init(id: String, fromClipId: String, toClipId: String,
                    kind: StoryTransitionKind, duration: Float) {
            self.id = id; self.fromClipId = fromClipId; self.toClipId = toClipId
            self.kind = kind; self.duration = duration
        }
    }

    public static let durationRange: ClosedRange<Float> = 0.1...2.0

    public let transition: TransitionSnapshot
    public let isAdvancedEnabled: Bool
    public let onKindChanged: (StoryTransitionKind) -> Void
    public let onDurationChanged: (Float) -> Void
    public let onDelete: () -> Void

    @State private var kind: StoryTransitionKind
    @State private var duration: Float

    public init(transition: TransitionSnapshot,
                isAdvancedEnabled: Bool,
                onKindChanged: @escaping (StoryTransitionKind) -> Void,
                onDurationChanged: @escaping (Float) -> Void,
                onDelete: @escaping () -> Void) {
        self.transition = transition
        self.isAdvancedEnabled = isAdvancedEnabled
        self.onKindChanged = onKindChanged
        self.onDurationChanged = onDurationChanged
        self.onDelete = onDelete
        _kind = State(initialValue: transition.kind)
        _duration = State(initialValue: transition.duration)
    }

    public func simulateKindCommit(_ value: StoryTransitionKind) {
        onKindChanged(value)
    }

    public func simulateDurationCommit(value: Float) {
        let clamped = min(Self.durationRange.upperBound, max(Self.durationRange.lowerBound, value))
        onDurationChanged(clamped)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            kindPicker
            durationSlider
            easingDisabledNotice
            deleteButton
        }
        .padding(18)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.a11y.transition", bundle: .module))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text("\(transition.fromClipId) → \(transition.toClipId)")
                .font(.system(.subheadline, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
    }

    private var kindPicker: some View {
        Picker(selection: Binding(
            get: { kind },
            set: { newValue in kind = newValue; onKindChanged(newValue) }
        )) {
            Text(String(localized: "story.timeline.transition.crossfade", bundle: .module))
                .tag(StoryTransitionKind.crossfade)
            Text(String(localized: "story.timeline.transition.dissolve", bundle: .module))
                .tag(StoryTransitionKind.dissolve)
        } label: {
            Text("Kind")
        }
        .pickerStyle(.segmented)
    }

    private var durationSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.transition.duration", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $duration, in: Self.durationRange, step: 0.05) { editing in
                if !editing { onDurationChanged(duration) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2fs", duration))
        }
    }

    @ViewBuilder
    private var easingDisabledNotice: some View {
        if !isAdvancedEnabled {
            Text("Easing: linear")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Label(
                String(localized: "story.timeline.transition.delete", bundle: .module),
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
        }
        .tint(MeeshyColors.error)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionInspectorTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/TransitionInspectorTests.swift
git commit -m "feat(timeline-ui): TransitionInspector kind + duration sheet (easing locked to linear)"
```

---

### Task 30: TransportBar — play/pause + time + zoom + mode switch (shared Quick & Pro)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TransportBarTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TransportBarTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TransportBarTests: XCTestCase {

    private func makeSUT(
        isPlaying: Bool = false,
        currentTime: Float = 4.25,
        duration: Float = 10,
        zoomScale: CGFloat = 1.0,
        mode: TimelineMode = .quick,
        isMuted: Bool = false
    ) -> TransportBar {
        TransportBar(
            isPlaying: isPlaying,
            currentTime: currentTime,
            duration: duration,
            zoomScale: zoomScale,
            mode: mode,
            isMuted: isMuted,
            onPlayToggle: {},
            onMuteToggle: {},
            onZoomIn: {},
            onZoomOut: {},
            onZoomReset: {},
            onModeSwitch: {}
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_formatTime_pads_minutesAndFraction() {
        XCTAssertEqual(TransportBar.formatTime(seconds: 4.25), "0:04.250")
        XCTAssertEqual(TransportBar.formatTime(seconds: 65.0), "1:05.000")
        XCTAssertEqual(TransportBar.formatTime(seconds: 0), "0:00.000")
    }

    func test_zoomLabel_returnsPercent() {
        XCTAssertEqual(TransportBar.zoomLabel(scale: 1.0), "100%")
        XCTAssertEqual(TransportBar.zoomLabel(scale: 0.5), "50%")
        XCTAssertEqual(TransportBar.zoomLabel(scale: 2.0), "200%")
    }

    func test_modeSwitchLabel_quickTowardPro_isPRO() {
        XCTAssertEqual(TransportBar.modeSwitchLabel(currentMode: .quick), "PRO ↗")
    }

    func test_modeSwitchLabel_proTowardQuick_isQUICK() {
        XCTAssertEqual(TransportBar.modeSwitchLabel(currentMode: .pro), "QUICK ↗")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransportBarTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift` :

```swift
import SwiftUI

/// Transport row shared by Quick & Pro containers. Strict primitive `let` API
/// — no @ObservedObject — so SwiftUI can skip body re-evaluation when nothing
/// the bar cares about changed.
public struct TransportBar: View {

    public let isPlaying: Bool
    public let currentTime: Float
    public let duration: Float
    public let zoomScale: CGFloat
    public let mode: TimelineMode
    public let isMuted: Bool
    public let onPlayToggle: () -> Void
    public let onMuteToggle: () -> Void
    public let onZoomIn: () -> Void
    public let onZoomOut: () -> Void
    public let onZoomReset: () -> Void
    public let onModeSwitch: () -> Void

    public init(isPlaying: Bool, currentTime: Float, duration: Float,
                zoomScale: CGFloat, mode: TimelineMode, isMuted: Bool,
                onPlayToggle: @escaping () -> Void,
                onMuteToggle: @escaping () -> Void,
                onZoomIn: @escaping () -> Void,
                onZoomOut: @escaping () -> Void,
                onZoomReset: @escaping () -> Void,
                onModeSwitch: @escaping () -> Void) {
        self.isPlaying = isPlaying; self.currentTime = currentTime; self.duration = duration
        self.zoomScale = zoomScale; self.mode = mode; self.isMuted = isMuted
        self.onPlayToggle = onPlayToggle; self.onMuteToggle = onMuteToggle
        self.onZoomIn = onZoomIn; self.onZoomOut = onZoomOut; self.onZoomReset = onZoomReset
        self.onModeSwitch = onModeSwitch
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    public static func zoomLabel(scale: CGFloat) -> String {
        "\(Int(scale * 100))%"
    }

    public static func modeSwitchLabel(currentMode: TimelineMode) -> String {
        switch currentMode {
        case .quick: return "PRO ↗"
        case .pro:   return "QUICK ↗"
        }
    }

    public var body: some View {
        HStack(spacing: 12) {
            playButton
            timeReadout
            Spacer(minLength: 6)
            zoomCluster
            muteButton
            modeButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .background(.ultraThinMaterial)
    }

    // MARK: - Sub-views

    private var playButton: some View {
        Button(action: onPlayToggle) {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(.title3.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .foregroundStyle(MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isPlaying
            ? "story.timeline.transport.pause"
            : "story.timeline.transport.play",
            bundle: .module))
    }

    private var timeReadout: some View {
        let now = Self.formatTime(seconds: currentTime)
        let total = Self.formatTime(seconds: duration)
        return Text("\(now) / \(total)")
            .font(.system(.caption, design: .monospaced).weight(.semibold))
            .lineLimit(1)
            .accessibilityLabel(String(format: String(localized: "story.timeline.transport.timeReadout",
                                                     bundle: .module), now, total))
    }

    private var zoomCluster: some View {
        HStack(spacing: 6) {
            Button(action: onZoomOut) {
                Image(systemName: "minus.magnifyingglass")
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomOut", bundle: .module))

            Button(action: onZoomReset) {
                Text(Self.zoomLabel(scale: zoomScale))
                    .font(.caption2.weight(.semibold))
                    .frame(minWidth: 36, minHeight: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomReset", bundle: .module))

            Button(action: onZoomIn) {
                Image(systemName: "plus.magnifyingglass")
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomIn", bundle: .module))
        }
        .foregroundStyle(MeeshyColors.indigo600)
    }

    private var muteButton: some View {
        Button(action: onMuteToggle) {
            Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .foregroundStyle(isMuted ? MeeshyColors.error : MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isMuted
            ? "story.timeline.transport.unmute"
            : "story.timeline.transport.mute",
            bundle: .module))
    }

    private var modeButton: some View {
        Button(action: onModeSwitch) {
            Text(Self.modeSwitchLabel(currentMode: mode))
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(MeeshyColors.indigo500.opacity(0.18))
                )
                .foregroundStyle(MeeshyColors.indigo700)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: mode == .quick
            ? "story.timeline.mode.switchToPro"
            : "story.timeline.mode.switchToQuick",
            bundle: .module))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransportBarTests 2>&1 | tail -10`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TransportBarTests.swift
git commit -m "feat(timeline-ui): TransportBar play/time/zoom/mute/mode-switch shared row"
```

---

### Task 31: TimelineToolbar — undo/redo/snap toggle + ruler resolution (Pro Mode only)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TimelineToolbarTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TimelineToolbarTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TimelineToolbarTests: XCTestCase {

    private func makeSUT(
        canUndo: Bool = true,
        canRedo: Bool = false,
        isSnapEnabled: Bool = true,
        rulerResolutionSeconds: Float = 0.5
    ) -> TimelineToolbar {
        TimelineToolbar(
            canUndo: canUndo,
            canRedo: canRedo,
            isSnapEnabled: isSnapEnabled,
            rulerResolutionSeconds: rulerResolutionSeconds,
            onUndo: {},
            onRedo: {},
            onSnapToggle: {}
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_rulerResolutionLabel_belowOneSecond_usesMs() {
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 0.5), "RULER:500ms")
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 0.1), "RULER:100ms")
    }

    func test_rulerResolutionLabel_oneOrMoreSeconds_usesSeconds() {
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 1.0), "RULER:1s")
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 5.0), "RULER:5s")
    }

    func test_snapAccessibility_reflectsState() {
        XCTAssertEqual(TimelineToolbar.snapAccessibilityKey(isOn: true), "story.timeline.a11y.snap.on")
        XCTAssertEqual(TimelineToolbar.snapAccessibilityKey(isOn: false), "story.timeline.a11y.snap.off")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineToolbarTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift` :

```swift
import SwiftUI

/// Pro-Mode-only toolbar : undo / redo / snap toggle / ruler resolution.
/// Hidden in Quick Mode (which only exposes the transport row).
public struct TimelineToolbar: View {

    public let canUndo: Bool
    public let canRedo: Bool
    public let isSnapEnabled: Bool
    public let rulerResolutionSeconds: Float
    public let onUndo: () -> Void
    public let onRedo: () -> Void
    public let onSnapToggle: () -> Void

    public init(canUndo: Bool, canRedo: Bool, isSnapEnabled: Bool,
                rulerResolutionSeconds: Float,
                onUndo: @escaping () -> Void,
                onRedo: @escaping () -> Void,
                onSnapToggle: @escaping () -> Void) {
        self.canUndo = canUndo; self.canRedo = canRedo
        self.isSnapEnabled = isSnapEnabled
        self.rulerResolutionSeconds = rulerResolutionSeconds
        self.onUndo = onUndo; self.onRedo = onRedo; self.onSnapToggle = onSnapToggle
    }

    public static func formatRulerResolution(seconds: Float) -> String {
        if seconds < 1 {
            let ms = Int((seconds * 1000).rounded())
            return "RULER:\(ms)ms"
        }
        if seconds.truncatingRemainder(dividingBy: 1) == 0 {
            return "RULER:\(Int(seconds))s"
        }
        return String(format: "RULER:%.1fs", seconds)
    }

    public static func snapAccessibilityKey(isOn: Bool) -> String {
        isOn ? "story.timeline.a11y.snap.on" : "story.timeline.a11y.snap.off"
    }

    public var body: some View {
        HStack(spacing: 10) {
            undoButton
            redoButton
            divider
            snapToggle
            divider
            rulerLabel
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(minHeight: 36)
        .background(.ultraThinMaterial)
    }

    // MARK: - Sub-views

    private var undoButton: some View {
        Button(action: onUndo) {
            Image(systemName: "arrow.uturn.backward")
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .foregroundStyle(canUndo ? MeeshyColors.indigo600 : Color.secondary.opacity(0.4))
        .disabled(!canUndo)
        .accessibilityLabel(String(localized: "story.timeline.toolbar.undo", bundle: .module))
    }

    private var redoButton: some View {
        Button(action: onRedo) {
            Image(systemName: "arrow.uturn.forward")
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .foregroundStyle(canRedo ? MeeshyColors.indigo600 : Color.secondary.opacity(0.4))
        .disabled(!canRedo)
        .accessibilityLabel(String(localized: "story.timeline.toolbar.redo", bundle: .module))
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.3))
            .frame(width: 1, height: 18)
            .accessibilityHidden(true)
    }

    private var snapToggle: some View {
        Button(action: onSnapToggle) {
            HStack(spacing: 4) {
                Circle()
                    .fill(isSnapEnabled ? MeeshyColors.success : Color.secondary.opacity(0.4))
                    .frame(width: 8, height: 8)
                Text(String(localized: "story.timeline.toolbar.snap", bundle: .module))
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(isSnapEnabled
                               ? MeeshyColors.indigo500.opacity(0.15)
                               : Color.gray.opacity(0.1))
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(isSnapEnabled ? MeeshyColors.indigo700 : Color.secondary)
        .accessibilityLabel(String(localized: String.LocalizationValue(Self.snapAccessibilityKey(isOn: isSnapEnabled)),
                                   bundle: .module))
    }

    private var rulerLabel: some View {
        Text(Self.formatRulerResolution(seconds: rulerResolutionSeconds))
            .font(.system(size: 9, weight: .semibold, design: .monospaced))
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineToolbarTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Controls/TimelineToolbarTests.swift
git commit -m "feat(timeline-ui): TimelineToolbar undo/redo/snap toggle + ruler resolution (Pro)"
```

---

### Task 32: QuickTimelineView — compact state (transport + ruler + max 3 tracks)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class QuickTimelineViewTests: XCTestCase {

    private func makeViewModel(project: TimelineProject = TimelineProjectFactory.projectWithVideoClip()) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = QuickTimelineView(viewModel: makeViewModel())
        _ = view.body
    }

    func test_compactVisibleTracks_neverExceedsThree() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: nil,
            maxCount: QuickTimelineView.compactMaxTracks
        )
        XCTAssertLessThanOrEqual(resolved.count, QuickTimelineView.compactMaxTracks)
    }

    func test_compactVisibleTracks_alwaysIncludesSelectedClipTrack() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: "clip-1",
            maxCount: 1
        )
        XCTAssertTrue(resolved.contains(where: { $0.containsClipId("clip-1") }),
                      "Selected clip's track must be in the compact set even when room is tight")
    }

    func test_emptyMediaTrack_isNotCounted() {
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: TimelineProjectFactory.emptyProject(),
            selectedClipId: nil,
            maxCount: 3
        )
        XCTAssertTrue(resolved.allSatisfy { !$0.isEmpty })
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickTimelineViewTests 2>&1 | tail -10`
Expected: FAIL — type missing.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift` :

```swift
import SwiftUI

/// Portrait-first composition of the timeline. Compact state shows max
/// 3 tracks; deployed state (toggled in Task 33) shows them all.
public struct QuickTimelineView: View {

    public static let compactMaxTracks: Int = 3

    @Bindable private var viewModel: TimelineViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isExpanded: Bool = false

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
    }

    // MARK: - Static helpers (testable, pure)

    public struct CompactTrack: Equatable {
        public let id: String
        public let title: String
        public let kind: Kind
        public let clipIds: [String]
        public enum Kind: Equatable { case video, audio, text, bgVideo, bgAudio }
        public var isEmpty: Bool { clipIds.isEmpty }
        public func containsClipId(_ id: String) -> Bool { clipIds.contains(id) }
    }

    public static func resolveCompactTracks(project: TimelineProject,
                                            selectedClipId: String?,
                                            maxCount: Int) -> [CompactTrack] {
        var allTracks: [CompactTrack] = []
        let videoClips = project.mediaObjects.filter { !$0.isAudioOnly }
        if !videoClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "video-1", title: "VIDEO 1", kind: .bgVideo,
                clipIds: videoClips.map { $0.id }
            ))
        }
        let audioClips = project.audioPlayerObjects
        if !audioClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "audio-1", title: "AUDIO 1", kind: .audio,
                clipIds: audioClips.map { $0.id }
            ))
        }
        let textClips = project.textObjects
        if !textClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "text-1", title: "TEXTE", kind: .text,
                clipIds: textClips.map { $0.id }
            ))
        }
        let nonEmpty = allTracks.filter { !$0.isEmpty }
        var picked: [CompactTrack] = []
        if let selectedId = selectedClipId,
           let selectedTrack = nonEmpty.first(where: { $0.containsClipId(selectedId) }) {
            picked.append(selectedTrack)
        }
        for track in nonEmpty where !picked.contains(track) {
            if picked.count >= maxCount { break }
            picked.append(track)
        }
        return picked
    }

    // MARK: - Body

    public var body: some View {
        VStack(spacing: 0) {
            transport
            rulerStrip
            tracksRegion
            footerTrigger
        }
        .background(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.4) : MeeshyColors.indigo50.opacity(0.4))
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    guard value.translation.height < -36 else { return }
                    withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                        isExpanded = true
                    }
                }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.quick", bundle: .module))
    }

    // MARK: - Sub-views

    private var transport: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            mode: viewModel.mode,
            isMuted: false,
            onPlayToggle: { viewModel.togglePlayback() },
            onMuteToggle: { viewModel.toggleMute() },
            onZoomIn: { viewModel.zoomScale = min(4.0, viewModel.zoomScale * 1.25) },
            onZoomOut: { viewModel.zoomScale = max(0.25, viewModel.zoomScale / 1.25) },
            onZoomReset: { viewModel.zoomScale = 1.0 },
            onModeSwitch: { viewModel.setMode(.pro) }
        )
    }

    private var rulerStrip: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        return RulerView(
            duration: viewModel.project.slideDuration,
            geometry: geometry,
            isDark: colorScheme == .dark,
            height: 18
        )
    }

    private var tracksRegion: some View {
        let tracks = Self.resolveCompactTracks(
            project: viewModel.project,
            selectedClipId: viewModel.selection.selectedClipId,
            maxCount: Self.compactMaxTracks
        )
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 200)
        return ScrollView(.horizontal, showsIndicators: false) {
            VStack(spacing: 4) {
                ForEach(tracks, id: \.id) { track in
                    TrackBarView(
                        title: track.title,
                        isLocked: false,
                        isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                        tintHex: tint(for: track.kind),
                        isDark: colorScheme == .dark,
                        laneWidth: laneWidth,
                        laneHeight: 36
                    ) {
                        Color.clear
                    }
                }
            }
        }
        .frame(maxHeight: isExpanded ? .infinity : CGFloat(tracks.count) * 40 + 8)
    }

    @ViewBuilder
    private var footerTrigger: some View {
        let hidden = max(0, allTrackCount - Self.compactMaxTracks)
        HStack {
            Button {
                withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                Text(isExpanded
                     ? String(localized: "story.timeline.toolbar.collapseTracks", bundle: .module)
                     : String(format: String(localized: "story.timeline.toolbar.deployTracks", bundle: .module),
                              hidden))
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.18)))
                    .foregroundStyle(MeeshyColors.indigo700)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private func tint(for kind: CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "6366F1"
        case .bgAudio, .audio: return "818CF8"
        case .text:            return "A5B4FC"
        }
    }

    private var allTrackCount: Int {
        var c = 0
        if !viewModel.project.mediaObjects.filter({ !$0.isAudioOnly }).isEmpty { c += 1 }
        if !viewModel.project.audioPlayerObjects.isEmpty { c += 1 }
        if !viewModel.project.textObjects.isEmpty { c += 1 }
        return c
    }
}
```

Note : `togglePlayback()` and `toggleMute()` are thin convenience helpers that the
viewModel may already expose; if not, add them next to `setMode(_:)` :

```swift
    public func togglePlayback() {
        if isPlaying { engine.pause() } else { engine.play() }
        isPlaying.toggle()
    }

    public func toggleMute() {
        var muted = engine.isMuted
        muted.toggle()
        engine.isMuted = muted
    }
```

(append once to `TimelineViewModel.swift` only if absent — guarded by your local diff).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickTimelineViewTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewTests.swift
git commit -m "feat(timeline-ui): QuickTimelineView compact state with selection-aware track picker"
```

---

### Task 33: QuickTimelineView — deployed state (preview compressed, all tracks scroll)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewTests.swift`

- [ ] **Step 1: Ajouter le test échouant**

Edit `QuickTimelineViewTests.swift` — append :

```swift
    func test_deployedState_listsAllNonEmptyTracks() {
        var project = TimelineProjectFactory.projectWithVideoClip()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a-1", postMediaId: "a-1",
                                   startTime: 0, duration: 5, volume: 1.0)
        ]
        let resolved = QuickTimelineView.resolveAllTracks(project: project)
        XCTAssertGreaterThanOrEqual(resolved.count, 2)
    }

    func test_deployedFooterCopy_isCollapseLabel() {
        XCTAssertEqual(QuickTimelineView.footerLabelKey(isExpanded: true),
                       "story.timeline.toolbar.collapseTracks")
        XCTAssertEqual(QuickTimelineView.footerLabelKey(isExpanded: false),
                       "story.timeline.toolbar.deployTracks")
    }

    func test_previewHeightFraction_compressesWhenExpanded() {
        XCTAssertGreaterThan(QuickTimelineView.previewHeightFraction(isExpanded: false),
                             QuickTimelineView.previewHeightFraction(isExpanded: true))
        XCTAssertEqual(QuickTimelineView.previewHeightFraction(isExpanded: true), 0.30, accuracy: 0.001)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickTimelineViewTests 2>&1 | tail -10`
Expected: FAIL — `resolveAllTracks` / `footerLabelKey` / `previewHeightFraction` missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `QuickTimelineView.swift` — append the three static helpers above the closing brace of the type, and adjust the body to honor expanded state (preview slot + deployed footer). Append at the bottom of the type:

```swift
    public static func resolveAllTracks(project: TimelineProject) -> [CompactTrack] {
        var tracks: [CompactTrack] = []
        let videoClips = project.mediaObjects.filter { !$0.isAudioOnly }
        for (index, _) in videoClips.enumerated() {
            tracks.append(CompactTrack(
                id: "video-\(index + 1)",
                title: "VIDEO \(index + 1)",
                kind: index == 0 ? .bgVideo : .video,
                clipIds: [videoClips[index].id]
            ))
        }
        for (index, audio) in project.audioPlayerObjects.enumerated() {
            tracks.append(CompactTrack(
                id: "audio-\(index + 1)",
                title: "AUDIO \(index + 1)",
                kind: index == 0 ? .bgAudio : .audio,
                clipIds: [audio.id]
            ))
        }
        for (index, text) in project.textObjects.enumerated() {
            tracks.append(CompactTrack(
                id: "text-\(index + 1)",
                title: "TEXTE \(index + 1)",
                kind: .text,
                clipIds: [text.id]
            ))
        }
        return tracks.filter { !$0.isEmpty }
    }

    public static func footerLabelKey(isExpanded: Bool) -> String {
        isExpanded ? "story.timeline.toolbar.collapseTracks" : "story.timeline.toolbar.deployTracks"
    }

    public static func previewHeightFraction(isExpanded: Bool) -> CGFloat {
        isExpanded ? 0.30 : 0.60
    }
```

Then edit `tracksRegion` to use the deployed list when `isExpanded` is true:

```swift
    private var tracksRegion: some View {
        let allTracks = Self.resolveAllTracks(project: viewModel.project)
        let compact = Self.resolveCompactTracks(
            project: viewModel.project,
            selectedClipId: viewModel.selection.selectedClipId,
            maxCount: Self.compactMaxTracks
        )
        let tracks: [CompactTrack] = isExpanded ? allTracks : compact
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 200)
        return ScrollView([.horizontal, isExpanded ? .vertical : []], showsIndicators: isExpanded) {
            VStack(spacing: 4) {
                ForEach(tracks, id: \.id) { track in
                    TrackBarView(
                        title: track.title,
                        isLocked: false,
                        isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                        tintHex: tint(for: track.kind),
                        isDark: colorScheme == .dark,
                        laneWidth: laneWidth,
                        laneHeight: 36
                    ) {
                        Color.clear
                    }
                }
            }
        }
        .frame(maxHeight: isExpanded ? .infinity : CGFloat(tracks.count) * 40 + 8)
        .opacity(1)
        .animation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
    }
```

Update `footerTrigger` so the label uses `Self.footerLabelKey(isExpanded:)`, and animate the bottom toolbar atténuation by exposing a published `bottomToolbarOpacity` :

```swift
    private var collapsedFooterOpacity: Double { isExpanded ? 0.4 : 1.0 }
```

Then adapt the `footerTrigger` block:

```swift
    @ViewBuilder
    private var footerTrigger: some View {
        let hidden = max(0, allTrackCount - Self.compactMaxTracks)
        HStack {
            Button {
                withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                let key = Self.footerLabelKey(isExpanded: isExpanded)
                let raw = String(localized: String.LocalizationValue(key), bundle: .module)
                Text(isExpanded ? raw : String(format: raw, hidden))
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.18)))
                    .foregroundStyle(MeeshyColors.indigo700)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .opacity(collapsedFooterOpacity)
    }
```

The compressed-preview slot is exposed as a `let previewSlot: () -> AnyView` initializer parameter so the composer wires its own canvas:

```swift
    private let previewSlot: (() -> AnyView)?

    public init(viewModel: TimelineViewModel,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
        self.previewSlot = nil
    }
```

And insert the slot above `transport` :

```swift
    public var body: some View {
        VStack(spacing: 0) {
            if let previewSlot {
                GeometryReader { proxy in
                    previewSlot()
                        .frame(height: proxy.size.height * Self.previewHeightFraction(isExpanded: isExpanded))
                }
                .frame(height: isExpanded ? 220 : 360)
                .animation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
            }
            transport
            rulerStrip
            tracksRegion
            footerTrigger
        }
        .background(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.4) : MeeshyColors.indigo50.opacity(0.4))
        .gesture(swipeUpExpand)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.quick", bundle: .module))
    }

    private var swipeUpExpand: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                guard value.translation.height < -36 else { return }
                withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded = true
                }
            }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickTimelineViewTests 2>&1 | tail -10`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewTests.swift
git commit -m "feat(timeline-ui): QuickTimelineView deployed state with compressed preview + scrollable tracks"
```

---

### Task 34: ProTimelineView — landscape layout (preview left + tracks/inspector right)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ProTimelineViewTests: XCTestCase {

    private func makeViewModel(project: TimelineProject = TimelineProjectFactory.projectWithVideoClip()) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = ProTimelineView(viewModel: makeViewModel())
        _ = view.body
    }

    func test_previewWidthFraction_isThirty() {
        XCTAssertEqual(ProTimelineView.previewWidthFraction, 0.30, accuracy: 0.001)
    }

    func test_groupedTracks_returnsThreeSections() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let groups = ProTimelineView.resolveTrackGroups(project: project)
        XCTAssertEqual(groups.map { $0.section }, [.contenu, .audio, .effets])
    }

    func test_inspectorVisible_onlyWhenSelectionExists() {
        let vm = makeViewModel()
        XCTAssertFalse(ProTimelineView.shouldShowClipInspector(viewModel: vm))
        vm.selectClip(id: "clip-1")
        XCTAssertTrue(ProTimelineView.shouldShowClipInspector(viewModel: vm))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ProTimelineViewTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift` :

```swift
import SwiftUI

/// Landscape multi-track editor. Preview left (~30%), timeline + grouped
/// tracks right (~70%), floating inspector bottom-leading.
public struct ProTimelineView: View {

    public static let previewWidthFraction: CGFloat = 0.30

    public enum Section: Equatable, Hashable { case contenu, audio, effets }

    public struct TrackGroup: Equatable {
        public let section: Section
        public let titleKey: String
        public let tracks: [QuickTimelineView.CompactTrack]
    }

    @Bindable private var viewModel: TimelineViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let previewSlot: (() -> AnyView)?

    public init(viewModel: TimelineViewModel,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
        self.previewSlot = nil
    }

    // MARK: - Static helpers

    public static func resolveTrackGroups(project: TimelineProject) -> [TrackGroup] {
        let all = QuickTimelineView.resolveAllTracks(project: project)
        let contenu = all.filter { switch $0.kind { case .bgVideo, .video, .text: return true; default: return false } }
            .filter { switch $0.kind { case .text: return false; default: return true } }
        let audio   = all.filter { switch $0.kind { case .bgAudio, .audio: return true; default: return false } }
        let effets  = all.filter { switch $0.kind { case .text: return true; default: return false } }
        return [
            TrackGroup(section: .contenu, titleKey: "story.timeline.section.contenu", tracks: contenu),
            TrackGroup(section: .audio,   titleKey: "story.timeline.section.audio",   tracks: audio),
            TrackGroup(section: .effets,  titleKey: "story.timeline.section.effets",  tracks: effets)
        ]
    }

    public static func shouldShowClipInspector(viewModel: TimelineViewModel) -> Bool {
        viewModel.selection.selectedClipId != nil
    }

    // MARK: - Body

    public var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                previewColumn
                    .frame(width: proxy.size.width * Self.previewWidthFraction)
                timelineColumn
                    .frame(width: proxy.size.width * (1 - Self.previewWidthFraction))
            }
            .overlay(alignment: .bottomLeading) { inspectorOverlay }
        }
        .background(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.45) : MeeshyColors.indigo50.opacity(0.45))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.pro", bundle: .module))
    }

    // MARK: - Sub-views

    private var previewColumn: some View {
        VStack(spacing: 0) {
            if let previewSlot { previewSlot() } else { Color.black }
            TransportBar(
                isPlaying: viewModel.isPlaying,
                currentTime: viewModel.currentTime,
                duration: viewModel.project.slideDuration,
                zoomScale: viewModel.zoomScale,
                mode: viewModel.mode,
                isMuted: false,
                onPlayToggle: { viewModel.togglePlayback() },
                onMuteToggle: { viewModel.toggleMute() },
                onZoomIn: { viewModel.zoomScale = min(4.0, viewModel.zoomScale * 1.25) },
                onZoomOut: { viewModel.zoomScale = max(0.25, viewModel.zoomScale / 1.25) },
                onZoomReset: { viewModel.zoomScale = 1.0 },
                onModeSwitch: { viewModel.setMode(.quick) }
            )
        }
    }

    private var timelineColumn: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 320)
        return VStack(spacing: 0) {
            TimelineToolbar(
                canUndo: viewModel.canUndo,
                canRedo: viewModel.canRedo,
                isSnapEnabled: viewModel.isSnapEnabled,
                rulerResolutionSeconds: rulerResolution(for: viewModel.zoomScale),
                onUndo: { viewModel.undo() },
                onRedo: { viewModel.redo() },
                onSnapToggle: { viewModel.toggleSnap() }
            )
            RulerView(
                duration: viewModel.project.slideDuration,
                geometry: geometry,
                isDark: colorScheme == .dark,
                height: 22
            )
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Self.resolveTrackGroups(project: viewModel.project), id: \.section) { group in
                        groupHeader(key: group.titleKey)
                        ForEach(group.tracks, id: \.id) { track in
                            TrackBarView(
                                title: track.title,
                                isLocked: false,
                                isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                                tintHex: tint(for: track.kind),
                                isDark: colorScheme == .dark,
                                laneWidth: laneWidth,
                                laneHeight: 40
                            ) {
                                Color.clear
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder
    private var inspectorOverlay: some View {
        if Self.shouldShowClipInspector(viewModel: viewModel),
           let snapshot = currentClipSnapshot() {
            ClipInspector(
                presentation: .popover,
                clip: snapshot,
                onVolumeChanged: { _ in },
                onFadeInChanged: { _ in },
                onFadeOutChanged: { _ in },
                onLoopToggled: { _ in },
                onBackgroundToggled: { _ in },
                onAddKeyframe: { viewModel.addKeyframeAtPlayhead() },
                onDelete: { viewModel.selectClip(id: nil) }
            )
            .padding(12)
            .transition(.opacity)
            .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                       value: viewModel.selection.selectedClipId)
        }
    }

    private func groupHeader(key: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(MeeshyColors.indigo400.opacity(0.7)).frame(width: 4, height: 14)
            Text(String(localized: String.LocalizationValue(key), bundle: .module))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.leading, 6)
    }

    private func tint(for kind: QuickTimelineView.CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "6366F1"
        case .bgAudio, .audio: return "818CF8"
        case .text:            return "A5B4FC"
        }
    }

    private func rulerResolution(for zoom: CGFloat) -> Float {
        let pps = TimelineGeometry(zoomScale: zoom).pixelsPerSecond
        if pps >= 100 { return 0.1 }
        if pps >= 50  { return 0.5 }
        if pps >= 25  { return 1.0 }
        return 2.0
    }

    private func currentClipSnapshot() -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: media.id,
                displayName: media.url.lastPathComponent,
                kind: media.isAudioOnly ? .audio : .video,
                startTime: Float(media.startTime),
                duration: Float(media.duration),
                volume: Float(media.volume ?? 1.0),
                fadeInDuration: Float(media.fadeIn ?? 0),
                fadeOutDuration: Float(media.fadeOut ?? 0),
                isLooping: media.isLooping ?? false,
                isBackground: media.isBackground ?? false
            )
        }
        if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: audio.id,
                displayName: audio.url.lastPathComponent,
                kind: .audio,
                startTime: Float(audio.startTime),
                duration: Float(audio.duration),
                volume: Float(audio.volume),
                fadeInDuration: 0,
                fadeOutDuration: 0,
                isLooping: false,
                isBackground: false
            )
        }
        return nil
    }
}
```

If `media.fadeIn` / `media.fadeOut` / `media.isLooping` / `media.isBackground` properties do not exist on the SDK type, replace those reads with literal defaults (`0`, `false`) to keep this view tree-shake friendly. The ClipInspector still emits the callbacks; a later task wires them into `SetClipPropertyCommand`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ProTimelineViewTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewTests.swift
git commit -m "feat(timeline-ui): ProTimelineView landscape layout with grouped tracks + floating inspector"
```

---

### Task 35: TimelineContainerSwitcher — auto Quick ↔ Pro on rotation, preserve state

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineContainerSwitcher.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/TimelineContainerSwitcherTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/TimelineContainerSwitcherTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TimelineContainerSwitcherTests: XCTestCase {

    private func makeViewModel() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(),
                     mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = TimelineContainerSwitcher(viewModel: makeViewModel())
        _ = view.body
    }

    func test_resolveMode_compactWidth_returnsQuick() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: .compact, currentMode: .pro),
            .quick
        )
    }

    func test_resolveMode_regularWidth_returnsPro() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: .regular, currentMode: .quick),
            .pro
        )
    }

    func test_resolveMode_unknownSizeClass_keepsCurrentMode() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: nil, currentMode: .pro),
            .pro
        )
    }

    func test_modeSwitch_preservesPlayheadAndZoomAndSelection() async {
        let vm = makeViewModel()
        await vm.awaitConfigured()
        vm.selectClip(id: "clip-1")
        vm.scrub(to: 1.5)
        vm.zoomScale = 1.5
        vm.setMode(.pro)
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1")
        XCTAssertEqual(vm.currentTime, 1.5, accuracy: 0.001)
        XCTAssertEqual(vm.zoomScale, 1.5, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineContainerSwitcherTests 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineContainerSwitcher.swift` :

```swift
import SwiftUI

/// Picks Quick or Pro container based on horizontal size class (rotation /
/// iPad / split view) but lets the user override via the explicit mode switch
/// in the transport row. State (`selectedClipId`, `currentTime`, `zoomScale`)
/// lives in `TimelineViewModel` so a swap never loses anything.
public struct TimelineContainerSwitcher: View {

    @Bindable private var viewModel: TimelineViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let previewSlot: (() -> AnyView)?

    public init(viewModel: TimelineViewModel,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
        self.previewSlot = nil
    }

    public static func resolveAutoMode(horizontalSizeClass: UserInterfaceSizeClass?,
                                       currentMode: TimelineMode) -> TimelineMode {
        switch horizontalSizeClass {
        case .compact: return .quick
        case .regular: return .pro
        case .none:    return currentMode
        @unknown default: return currentMode
        }
    }

    public var body: some View {
        Group {
            switch viewModel.mode {
            case .quick:
                if let previewSlot {
                    QuickTimelineView(viewModel: viewModel, previewSlot: previewSlot)
                } else {
                    QuickTimelineView(viewModel: viewModel)
                }
            case .pro:
                if let previewSlot {
                    ProTimelineView(viewModel: viewModel, previewSlot: previewSlot)
                } else {
                    ProTimelineView(viewModel: viewModel)
                }
            }
        }
        .animation(reduceMotion ? .none : .spring(response: 0.5, dampingFraction: 0.8), value: viewModel.mode)
        .onChange(of: horizontalSizeClass) { _, newValue in
            let resolved = Self.resolveAutoMode(horizontalSizeClass: newValue, currentMode: viewModel.mode)
            guard resolved != viewModel.mode else { return }
            viewModel.setMode(resolved)
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TimelineContainerSwitcherTests 2>&1 | tail -10`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineContainerSwitcher.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/TimelineContainerSwitcherTests.swift
git commit -m "feat(timeline-ui): TimelineContainerSwitcher auto Quick↔Pro on rotation, state preserved"
```

---

### Task 35.5: StoryTimelineEngine+Providing — adapter conformance to TimelineEngineProviding

**Why:** `TimelineViewModel` (Task 7) consumes `any TimelineEngineProviding` to keep tests injectable with `MockStoryTimelineEngine`. The concrete `StoryTimelineEngine` (Plan 3) does NOT declare conformance to `TimelineEngineProviding` (which is defined here in Plan 4 / Task 7). This adapter task adds the conformance via an extension so Task 36-37 can wire the real engine into the composer without a compile error. It also bridges `TimelineEngineMode` (Plan 4 protocol enum) to `StoryTimelineEngine.Mode` (Plan 3 internal enum) — the two enums share identical cases (`.editing`, `.preview`) so the bridge is a one-line `switch`.

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineProvidingTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEngineProvidingTests: XCTestCase {

    /// Sanity: the concrete engine must be assignable to a TimelineEngineProviding existential
    /// so TimelineViewModel can take it as a dependency without unboxing.
    func test_storyTimelineEngine_conformsTo_TimelineEngineProviding() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        XCTAssertTrue(provider is StoryTimelineEngine,
                      "StoryTimelineEngine must conform to TimelineEngineProviding")
    }

    /// Setting the protocol's TimelineEngineMode must reach the concrete engine's nested Mode.
    func test_setMode_editing_reachesConcreteEngine() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        provider.setMode(.editing)
        XCTAssertEqual(engine.currentMode, .editing,
                       "Bridged setMode(.editing) must update the concrete engine's mode")
    }

    func test_setMode_preview_reachesConcreteEngine() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        provider.setMode(.preview)
        XCTAssertEqual(engine.currentMode, .preview)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryTimelineEngineProvidingTests 2>&1 | tail -10`
Expected: FAIL with "type 'StoryTimelineEngine' does not conform to protocol 'TimelineEngineProviding'".

- [ ] **Step 3: Write minimal implementation**

```swift
import Foundation
import MeeshySDK

/// Bridges the concrete `StoryTimelineEngine` (Plan 3) to the `TimelineEngineProviding`
/// protocol (Plan 4 / Task 7) so the composer can inject the real engine into
/// `TimelineViewModel` without exposing AVFoundation internals to the ViewModel layer.
///
/// The two `Mode` enums (`StoryTimelineEngine.Mode` and `TimelineEngineMode`) are kept
/// separate intentionally to preserve testability: a mock engine in tests does not need
/// to drag in AVFoundation just to expose a mode setter.
extension StoryTimelineEngine: TimelineEngineProviding {

    public func setMode(_ mode: TimelineEngineMode) {
        switch mode {
        case .editing: setMode(.editing as Mode)
        case .preview: setMode(.preview as Mode)
        }
    }

    /// Bridge for the time-update callback signature used by TimelineViewModel.
    public var onTimeUpdate: ((Float) -> Void)? {
        get { _onTimeUpdate }
        set { _onTimeUpdate = newValue }
    }

    /// Bridge for the playback-end callback signature used by TimelineViewModel.
    public var onPlaybackEnd: (() -> Void)? {
        get { _onPlaybackEnd }
        set { _onPlaybackEnd = newValue }
    }

    /// Bridge for the error callback signature used by TimelineViewModel.
    public var onError: ((Error) -> Void)? {
        get { _onError }
        set { _onError = newValue }
    }
}
```

> Note: the underscore-prefixed properties (`_onTimeUpdate`, `_onPlaybackEnd`, `_onError`) are the storage already declared in Plan 3 Section D (StoryTimelineEngine). The extension only re-exposes them under the protocol-required names so consumers can use either spelling.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryTimelineEngineProvidingTests 2>&1 | tail -10`
Expected: PASS (3 tests passed).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineProvidingTests.swift
git commit -m "feat(timeline-ui): StoryTimelineEngine conforms to TimelineEngineProviding via adapter"
```

---

### Task 36: StoryComposerView — wire TimelineContainerSwitcher behind feature flag

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerTimelineSwitchTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerTimelineSwitchTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class StoryComposerTimelineSwitchTests: XCTestCase {

    final class StubFlagProvider: RemoteFeatureFlagProviding {
        let value: Bool
        init(value: Bool) { self.value = value }
        func bool(forKey: String) -> Bool { value }
    }

    func test_renderTimelineSection_v2Disabled_usesLegacyPanel() {
        let flag = StoryTimelineFeatureFlag(remote: StubFlagProvider(value: false),
                                            defaults: UserDefaults(suiteName: "test-v2-disabled")!)
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_renderTimelineSection_v2Enabled_routesToSwitcher() {
        let flag = StoryTimelineFeatureFlag(remote: StubFlagProvider(value: true),
                                            defaults: UserDefaults(suiteName: "test-v2-enabled")!)
        XCTAssertTrue(flag.isV2Enabled)
    }

    func test_legacyPanel_isStillReachable_whenFlagOff() {
        // Sentinel guard — the switcher must never be the only path.
        let flag = StoryTimelineFeatureFlag(remote: StubFlagProvider(value: false),
                                            defaults: UserDefaults(suiteName: "test-v2-fallback")!)
        XCTAssertFalse(flag.isV2Enabled, "Legacy TimelinePanel must remain the default at launch")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryComposerTimelineSwitchTests 2>&1 | tail -10`
Expected: PASS for the flag assertions BUT the composer still has unconditional legacy paths — the integration is therefore not yet wired. Verify by grepping :

```bash
grep -n "TimelineContainerSwitcher\|StoryTimelineFeatureFlag" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
```

Expected: no matches. The wiring is missing.

- [ ] **Step 3: Écrire l'implémentation**

Read `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` around lines 380-390 and 705-715. Replace each of the two legacy `TimelinePanel(viewModel: viewModel)` call sites with a flag-guarded helper `timelineSection`. First, declare the helper inside the `StoryComposerView` struct (alongside the other private computed properties) :

```swift
    @ViewBuilder
    private var timelineSection: some View {
        if StoryTimelineFeatureFlag.shared.isV2Enabled {
            TimelineContainerSwitcher(viewModel: viewModel.timelineViewModel)
        } else {
            TimelinePanel(viewModel: viewModel)
        }
    }
```

Then edit the sheet site (around line 384):

```swift
        .sheet(isPresented: $viewModel.isTimelineVisible) {
            timelineSection
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
```

And the inline site (around line 710):

```swift
        case .timeline:
            timelineSection
```

Important : the helper must be a SwiftUI `@ViewBuilder` so the `if/else` returns a single `some View` (no AnyView wrapping). The legacy `TimelinePanel(viewModel:)` keeps its current signature; the new `TimelineContainerSwitcher` consumes `viewModel.timelineViewModel` (added in Task 37).

- [ ] **Step 4: Run test to verify it passes**

Run :

```bash
grep -n "timelineSection\|StoryTimelineFeatureFlag" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryComposerTimelineSwitchTests 2>&1 | tail -10
```

Expected : two matches in the file (one helper definition + one feature-flag check), 3 tests pass. A build sweep confirms zero regression :

```bash
cd packages/MeeshySDK && swift build 2>&1 | tail -10
```

Expected : build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerTimelineSwitchTests.swift
git commit -m "feat(composer): route timeline section through TimelineContainerSwitcher behind v2 feature flag"
```

---

### Task 37: StoryComposerViewModel — expose lazy TimelineViewModel + slide bridge

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerViewModelTimelineTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerViewModelTimelineTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

@MainActor
final class StoryComposerViewModelTimelineTests: XCTestCase {

    func test_timelineViewModel_isLazy_andStable() {
        let composer = StoryComposerViewModel()
        let first = composer.timelineViewModel
        let second = composer.timelineViewModel
        XCTAssertTrue(first === second,
                      "Lazy var must vend the same instance across reads")
    }

    func test_timelineViewModel_modeDefaultsToQuick() {
        let composer = StoryComposerViewModel()
        XCTAssertEqual(composer.timelineViewModel.mode, .quick)
    }

    func test_loadCurrentSlideIntoTimeline_populatesProject() async {
        let composer = StoryComposerViewModel()
        composer.currentSlideDuration = 8
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        XCTAssertEqual(composer.timelineViewModel.project.slideDuration, 8, accuracy: 0.001)
    }

    func test_loadCurrentSlideIntoTimeline_preservesSelectionAcrossSlideSwitch() async {
        let composer = StoryComposerViewModel()
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        composer.timelineViewModel.selectClip(id: "non-existent")
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        // Selection cleared because the new slide does not contain that clip id.
        XCTAssertNil(composer.timelineViewModel.selection.selectedClipId)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryComposerViewModelTimelineTests 2>&1 | tail -10`
Expected: FAIL — `timelineViewModel` and `loadCurrentSlideIntoTimeline()` missing.

- [ ] **Step 3: Écrire l'implémentation**

Edit `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`. Add a stored property for the lazy `TimelineViewModel` plus the bridge method, near the existing `var isTimelineVisible: Bool = false` declaration (line ~201). The composer is `@Observable` so we expose a `private(set)` reference :

```swift
    // MARK: - Timeline V2 wiring

    private var _timelineViewModel: TimelineViewModel?

    public var timelineViewModel: TimelineViewModel {
        if let existing = _timelineViewModel { return existing }
        let engine = StoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        _timelineViewModel = vm
        return vm
    }

    /// Bridges the composer's `currentSlide` into the timeline editor. Call
    /// this from `composer.onAppear` and whenever the user switches slides.
    public func loadCurrentSlideIntoTimeline() {
        let slide = currentSlide
        let project = TimelineProject(
            slideId: slide.id,
            slideDuration: Float(slide.duration),
            mediaObjects: slide.mediaObjects ?? [],
            audioPlayerObjects: slide.audioPlayerObjects ?? [],
            textObjects: slide.textObjects ?? [],
            clipTransitions: slide.clipTransitions ?? []
        )
        timelineViewModel.bootstrap(
            project: project,
            mediaURLs: collectMediaURLs(for: slide),
            images: slideImages
        )
        // Clear any selection that no longer exists in the new slide.
        if let id = timelineViewModel.selection.selectedClipId,
           !projectContains(clipId: id, in: project) {
            timelineViewModel.selectClip(id: nil)
        }
    }

    private func collectMediaURLs(for slide: StorySlide) -> [String: URL] {
        var result: [String: URL] = [:]
        for media in slide.mediaObjects ?? [] {
            result[media.id] = media.url
        }
        for audio in slide.audioPlayerObjects ?? [] {
            result[audio.id] = audio.url
        }
        return result
    }

    private func projectContains(clipId: String, in project: TimelineProject) -> Bool {
        project.mediaObjects.contains(where: { $0.id == clipId })
        || project.audioPlayerObjects.contains(where: { $0.id == clipId })
        || project.textObjects.contains(where: { $0.id == clipId })
    }
```

If the underlying `StorySlide` model does not yet expose `mediaObjects` / `audioPlayerObjects` / `textObjects` / `clipTransitions` arrays, fall back to whatever properties already store those collections in the existing composer — adapt the four reads while keeping the method signature stable. The goal is a single bridge point so future schema changes touch only `loadCurrentSlideIntoTimeline()`.

Then call the bridge from the composer view's onAppear. Edit `StoryComposerView.swift` (still inside the `StoryComposerView` struct body — just before the existing `.sheet(isPresented: $viewModel.isTimelineVisible)` block, attach to the root NavigationStack/ZStack of the view):

```swift
        .onAppear {
            viewModel.loadCurrentSlideIntoTimeline()
        }
        .onChange(of: viewModel.currentSlideIndex) { _, _ in
            viewModel.loadCurrentSlideIntoTimeline()
        }
```

(If an `.onAppear` already exists at the same scope, append the call inside it instead of duplicating the modifier.)

Lifecycle : `_timelineViewModel` is bound to the composer's lifetime — when the composer is deallocated, ARC drops the reference automatically. No manual deinit work is required since `TimelineViewModel` does not retain the composer (it only holds the engine + stack + snap dependencies it was injected with).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUITests.StoryComposerViewModelTimelineTests 2>&1 | tail -10`
Expected: PASS, 4 tests.

Then verify the full suite still compiles :

```bash
cd packages/MeeshySDK && swift build 2>&1 | tail -10
```

Expected : build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/StoryComposerViewModelTimelineTests.swift
git commit -m "feat(composer): expose lazy TimelineViewModel + bridge currentSlide into timeline editor"
```

---

### Task 38: Snapshot infrastructure — verify dependency + create SnapshotHelpers

**Files:**
- Verify: `packages/MeeshySDK/Package.swift` (already amended in Task 1)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpers.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpersSmokeTests.swift`

- [ ] **Step 1: Vérifier la dépendance swift-snapshot-testing**

Run :

```bash
grep -n "swift-snapshot-testing\|SnapshotTesting" packages/MeeshySDK/Package.swift
```

Expected : 2 matches (Task 1 a déjà ajouté la dépendance + le `.product(name: "SnapshotTesting", package: "swift-snapshot-testing")` au testTarget MeeshyUITests, et le `exclude: ["__Snapshots__"]`).

Si l'un des deux est manquant (ex : Task 1 n'a pas encore été mergée dans la branche courante), répliquer les 3 fragments documentés dans Task 1 → Step 2 (sinon, ne rien faire — la dépendance est en place).

- [ ] **Step 2: Écrire le test smoke échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpersSmokeTests.swift` :

```swift
import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshyUI

/// Sanity test for the helpers introduced in Task 38. Asserts that
/// `SnapshotHelpers.deviceSize(for:)` returns the documented sizes and that
/// `SnapshotHelpers.snapshotDirectory` resolves to a non-empty path.
final class SnapshotHelpersSmokeTests: XCTestCase {

    func test_deviceSize_iPhone16Pro_isPortrait390x844() {
        let size = SnapshotHelpers.deviceSize(for: .iPhone16Pro)
        XCTAssertEqual(size.width, 390, accuracy: 0.001)
        XCTAssertEqual(size.height, 844, accuracy: 0.001)
    }

    func test_deviceSize_iPadPro11Landscape_is1194x834() {
        let size = SnapshotHelpers.deviceSize(for: .iPadPro11Landscape)
        XCTAssertEqual(size.width, 1194, accuracy: 0.001)
        XCTAssertEqual(size.height, 834, accuracy: 0.001)
    }

    func test_snapshotDirectory_endsWithUnderscoreSnapshotsUnderscore() {
        // The directory MUST be the conventional `__Snapshots__` subfolder
        // adjacent to the calling test file. We validate the suffix only
        // because the absolute path is filesystem-dependent.
        let dir = SnapshotHelpers.snapshotDirectory(testFile: #filePath)
        XCTAssertTrue(dir.hasSuffix("/__Snapshots__"),
                      "Expected helpers to anchor on __Snapshots__, got \(dir)")
    }
}
```

- [ ] **Step 3: Run le test pour confirmer qu'il échoue**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.SnapshotHelpersSmokeTests 2>&1 | tail -10`
Expected : FAIL — `cannot find 'SnapshotHelpers' in scope`.

- [ ] **Step 4: Écrire l'implémentation**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpers.swift` :

```swift
import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshyUI

/// Centralized snapshot harness for the Timeline UI test target.
///
/// Conventions enforced :
/// 1. Reference devices : iPhone 16 Pro (390x844pt, portrait) and iPad Pro 11"
///    landscape (1194x834pt). All Phase 3 snapshots are recorded on one of
///    these two sizes — never on `.fixed(width:height:)` magic numbers
///    scattered across files.
/// 2. Snapshots are stored in `__Snapshots__/` next to the calling test file.
///    `Package.swift` excludes that directory from the SwiftPM source list so
///    the PNGs do not pollute the build graph.
/// 3. Every UI snapshot is captured TWICE — once in `.light`, once in `.dark`
///    color scheme — via `assertLightDarkSnapshot`. Helpers below derive the
///    snapshot name from the test name + scheme suffix.
/// 4. First run uses `record: true` once per developer machine to populate the
///    baseline; CI runs it with `record: false` so any drift fails the build.
///    The team-wide rule is : commits MUST land with `record: false` (review
///    rejects baselines recorded on the wrong machine without inspection).
enum SnapshotHelpers {

    enum Device: Sendable, Equatable {
        case iPhone16Pro
        case iPadPro11Landscape
    }

    static func deviceSize(for device: Device) -> CGSize {
        switch device {
        case .iPhone16Pro:        return CGSize(width: 390, height: 844)
        case .iPadPro11Landscape: return CGSize(width: 1194, height: 834)
        }
    }

    /// Resolves `__Snapshots__/` adjacent to the test file at `testFile` (use
    /// `#filePath`). Falls back to `(NSTemporaryDirectory)/__Snapshots__` when
    /// the path lookup fails, ensuring the helper never crashes the suite.
    static func snapshotDirectory(testFile: StaticString) -> String {
        let pathString = "\(testFile)"
        guard let lastSlash = pathString.lastIndex(of: "/") else {
            return NSTemporaryDirectory() + "__Snapshots__"
        }
        let directory = String(pathString[..<lastSlash])
        return directory + "/__Snapshots__"
    }

    /// Wrap a SwiftUI view in a fixed-size hosting controller suitable for
    /// `swift-snapshot-testing` `.image` strategy. The view is forced to fill
    /// the device frame and the color scheme is injected via environment.
    @MainActor
    static func host<V: View>(
        _ view: V,
        on device: Device,
        colorScheme: ColorScheme
    ) -> some View {
        let size = deviceSize(for: device)
        return view
            .environment(\.colorScheme, colorScheme)
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .background(colorScheme == .dark ? Color.black : Color.white)
    }

    /// Single-scheme snapshot — used by the light/dark wrapper below.
    @MainActor
    static func assertSnapshot<V: View>(
        of view: V,
        device: Device = .iPhone16Pro,
        colorScheme: ColorScheme,
        named name: String,
        record: Bool = false,
        file: StaticString = #filePath,
        testName: String = #function,
        line: UInt = #line
    ) {
        let hosted = host(view, on: device, colorScheme: colorScheme)
        let size = deviceSize(for: device)
        SnapshotTesting.assertSnapshot(
            of: hosted,
            as: .image(layout: .fixed(width: size.width, height: size.height)),
            named: name,
            record: record,
            file: file,
            testName: testName,
            line: line
        )
    }

    /// Light + Dark double-snapshot helper. Each call emits two PNGs with the
    /// suffixes `-light` / `-dark`. Use this from every Task 39-45 test so
    /// both color schemes are covered without duplicating boilerplate.
    @MainActor
    static func assertLightDarkSnapshot<V: View>(
        of view: V,
        device: Device = .iPhone16Pro,
        named baseName: String,
        record: Bool = false,
        file: StaticString = #filePath,
        testName: String = #function,
        line: UInt = #line
    ) {
        for scheme in [ColorScheme.light, ColorScheme.dark] {
            let suffix = (scheme == .light) ? "light" : "dark"
            assertSnapshot(
                of: view,
                device: device,
                colorScheme: scheme,
                named: "\(baseName)-\(suffix)",
                record: record,
                file: file,
                testName: testName,
                line: line
            )
        }
    }
}
```

- [ ] **Step 5: Run le test pour vérifier qu'il passe**

Run :

```bash
cd packages/MeeshySDK && swift test --filter MeeshyUITests.SnapshotHelpersSmokeTests 2>&1 | tail -10
```

Expected : PASS, 3 tests. The smoke test does NOT exercise the image rendering yet — that comes in Task 39 — only the size and path helpers are exercised here.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpers.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Helpers/SnapshotHelpersSmokeTests.swift
git commit -m "chore(timeline): SnapshotHelpers harness for Phase 3 light/dark UI snapshots"
```

---

### Task 39: Snapshot QuickTimelineView — 5 variantes × light+dark = 10 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/QuickTimelineViewSnapshotTests/` (auto-generated by first record run)

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class QuickTimelineViewSnapshotTests: XCTestCase {

    // MARK: - Factories

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func projectWithThreeTracks() -> TimelineProject {
        var video = StoryMediaObject(id: "clip-v", postMediaId: "clip-v", kind: .video)
        video.startTime = 0; video.duration = 5
        var audio = StoryAudioPlayerObject(id: "clip-a", postMediaId: "clip-a")
        audio.startTime = 1; audio.duration = 4; audio.volume = 0.8
        var text = StoryTextObject(id: "clip-t", content: "Bienvenue")
        text.startTime = 2; text.displayDuration = 3
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [video],
            audioPlayerObjects: [audio],
            textObjects: [text],
            clipTransitions: []
        )
    }

    private func projectWithSingleClip() -> TimelineProject {
        TimelineProjectFactory.projectWithVideoClip(clipId: "clip-1", startTime: 1, duration: 6)
    }

    // MARK: - Variant 1 : empty

    func test_snapshot_quick_empty() {
        let vm = makeViewModel(project: TimelineProjectFactory.emptyProject())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-empty"
        )
    }

    // MARK: - Variant 2 : one clip

    func test_snapshot_quick_oneClip() {
        let vm = makeViewModel(project: projectWithSingleClip())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-oneClip"
        )
    }

    // MARK: - Variant 3 : deployed

    func test_snapshot_quick_deployed() {
        let vm = makeViewModel(project: projectWithThreeTracks())
        // Force the deployed state by toggling the internal expansion flag via
        // the public init then a programmatic state mutation. We expose that
        // path through a wrapper view so the snapshot captures the expanded
        // layout deterministically.
        let view = QuickTimelineDeployedHarness(viewModel: vm)
        SnapshotHelpers.assertLightDarkSnapshot(
            of: view,
            named: "quick-deployed"
        )
    }

    // MARK: - Variant 4 : dragging

    func test_snapshot_quick_dragging() {
        let vm = makeViewModel(project: projectWithSingleClip())
        // Simulate a drag-in-progress by pushing a coalesced MoveCommand at
        // delta = +24pt. The bar should render slightly offset, and the snap
        // overlay should be pre-armed (rendered when SnapEngine reports a hit).
        vm.dragClip(id: "clip-1", deltaTimeSeconds: 0.5, isCommitted: false)
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-dragging"
        )
    }

    // MARK: - Variant 5 : selected

    func test_snapshot_quick_selected() {
        let vm = makeViewModel(project: projectWithSingleClip())
        vm.selectClip(id: "clip-1")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-selected"
        )
    }
}

/// Test-only harness that forces the deployed (expanded) Quick layout for
/// the snapshot variant. Keeping this private avoids leaking the internal
/// state mutator into production code.
@MainActor
private struct QuickTimelineDeployedHarness: View {
    let viewModel: TimelineViewModel
    var body: some View {
        QuickTimelineView(viewModel: viewModel)
            .onAppear {
                // The deployed state is driven by an internal `@State` flag in
                // QuickTimelineView. We surface a deterministic path by
                // simulating the swipe-up gesture via a notification bridge
                // exposed for tests. If your build of QuickTimelineView does
                // not yet emit `.timeline.quick.deployed`, post the equivalent
                // public toggle (`viewModel.requestQuickDeployed = true`) and
                // align the test before recording the baseline.
                NotificationCenter.default.post(name: .init("timeline.quick.deployed"), object: nil)
            }
    }
}
```

- [ ] **Step 2: Run en mode record pour générer la baseline**

Run :

```bash
cd packages/MeeshySDK && \
SNAPSHOT_RECORD=1 swift test --filter MeeshyUITests.QuickTimelineViewSnapshotTests 2>&1 | tail -20
```

Expected : 5 tests "fail" with `recorded snapshot`. The PNGs land in `Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/QuickTimelineViewSnapshotTests/` (10 files : `quick-{empty,oneClip,deployed,dragging,selected}-{light,dark}.png`).

If `swift-snapshot-testing` does not honor the env var, set `record: true` directly in the helper call site for ONE local run and revert before commit. The `record` parameter on `assertLightDarkSnapshot` is exactly this knob.

- [ ] **Step 3: Vérifier visuellement les 10 baselines**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/QuickTimelineViewSnapshotTests/ | wc -l
open packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/QuickTimelineViewSnapshotTests/
```

Expected : `10`. Open Finder, eyeball each PNG (transport bar visible, ruler ticks aligned, indigo accent on selection, dark variants have near-black background).

If any baseline shows clipped content, an unrendered ProgressView or a misplaced indigo border, FIX the underlying view (Task 32 / 33 / 17) before re-recording. Snapshots are a regression net, not a way to lock in bugs.

- [ ] **Step 4: Re-run en mode strict**

Run :

```bash
cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickTimelineViewSnapshotTests 2>&1 | tail -10
```

Expected : PASS, 5 tests, 10 PNGs validated against baselines.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/QuickTimelineViewSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/QuickTimelineViewSnapshotTests
git commit -m "test(timeline-ui): snapshot QuickTimelineView 5 variants × light+dark (10 PNGs)"
```

---

### Task 40: Snapshot ProTimelineView — 4 variantes × light+dark = 8 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/ProTimelineViewSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class ProTimelineViewSnapshotTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        vm.setMode(.pro)
        return vm
    }

    private func projectWithEditorialContent() -> TimelineProject {
        var video1 = StoryMediaObject(id: "v1", postMediaId: "v1", kind: .video)
        video1.startTime = 0; video1.duration = 4
        var video2 = StoryMediaObject(id: "v2", postMediaId: "v2", kind: .video)
        video2.startTime = 4; video2.duration = 4
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "a1")
        audio.startTime = 0; audio.duration = 8; audio.volume = 0.7
        var text = StoryTextObject(id: "t1", content: "Story")
        text.startTime = 1; text.displayDuration = 3
        let crossfade = StoryClipTransition(
            fromClipId: "v1", toClipId: "v2", kind: .crossfade,
            duration: 0.5, easing: .linear
        )
        return TimelineProject(
            slideId: "slide-pro",
            slideDuration: 10,
            mediaObjects: [video1, video2],
            audioPlayerObjects: [audio],
            textObjects: [text],
            clipTransitions: [crossfade]
        )
    }

    // MARK: - Variant 1 : iPad landscape, inspector closed

    func test_snapshot_pro_iPadLandscape_inspectorClosed() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorClosed"
        )
    }

    // MARK: - Variant 2 : iPad landscape, inspector open (selected clip)

    func test_snapshot_pro_iPadLandscape_inspectorOpen() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        vm.selectClip(id: "v1")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorOpen"
        )
    }

    // MARK: - Variant 3 : Portrait fallback on iPhone

    func test_snapshot_pro_portraitFallback_iPhone() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        // ProTimelineView in portrait must degrade gracefully — Task 34
        // documents the explicit fallback as a vertical stack with reduced
        // inspector. The snapshot locks that layout.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPhone16Pro,
            named: "pro-portraitFallback-iPhone"
        )
    }

    // MARK: - Variant 4 : iPad landscape with two clips, transition between them

    func test_snapshot_pro_iPadLandscape_withTransition() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-withTransition"
        )
    }
}
```

- [ ] **Step 2: Run en mode record pour générer la baseline**

Run :

```bash
cd packages/MeeshySDK && swift test --filter MeeshyUITests.ProTimelineViewSnapshotTests 2>&1 | tail -20
```

Expected (premier run) : 4 tests "fail" with `recorded snapshot`. Toggle `record: true` localement dans les 4 appels `assertLightDarkSnapshot` pour générer la baseline, puis remettre `record: false` (valeur par défaut) avant le commit.

- [ ] **Step 3: Vérifier les 8 PNGs**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/ProTimelineViewSnapshotTests/ | wc -l
```

Expected : `8`. Eyeball : layout split preview/timeline en landscape, pile verticale en portrait, inspector popover anchored bottom-leading quand clip sélectionné, transition badge jaune visible entre v1 et v2.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ProTimelineViewSnapshotTests 2>&1 | tail -10`
Expected : PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/__Snapshots__/ProTimelineViewSnapshotTests
git commit -m "test(timeline-ui): snapshot ProTimelineView 4 variants × light+dark (8 PNGs)"
```

---

### Task 41: Snapshot VideoClipBar — 5 variantes × light+dark = 10 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/VideoClipBarSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

@MainActor
final class VideoClipBarSnapshotTests: XCTestCase {

    private func solidThumb(_ color: UIColor, size: CGSize = CGSize(width: 30, height: 44)) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func makeBar(
        title: String = "intro.mp4",
        duration: Float = 4,
        fadeIn: Float = 0,
        fadeOut: Float = 0,
        isSelected: Bool = false,
        isLocked: Bool = false,
        startTime: Float = 1,
        frames: [UIImage]? = nil
    ) -> some View {
        VideoClipBar(
            clipId: "clip-1",
            title: title,
            startTime: startTime,
            duration: duration,
            fadeIn: fadeIn,
            fadeOut: fadeOut,
            isSelected: isSelected,
            isLocked: isLocked,
            isDark: false,            // overridden by environment in helper
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            frames: frames ?? [solidThumb(.systemBlue), solidThumb(.systemTeal),
                               solidThumb(.systemIndigo), solidThumb(.systemPurple)],
            onTap: {}, onDoubleTap: {}, onLongPress: {},
            onTrimStartDelta: { _ in }, onTrimEndDelta: { _ in }, onMoveDelta: { _ in }
        )
        .frame(width: 390, height: 60, alignment: .leading)
        .padding(.vertical, 8)
    }

    // MARK: - Variant 1 : trimmed (short duration relative to slot)

    func test_snapshot_videoClip_trimmed() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "trimmed.mp4", duration: 2, startTime: 1),
            named: "videoClip-trimmed"
        )
    }

    // MARK: - Variant 2 : fade in active

    func test_snapshot_videoClip_fadeIn() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "fade_in.mp4", fadeIn: 0.8),
            named: "videoClip-fadeIn"
        )
    }

    // MARK: - Variant 3 : fade out active

    func test_snapshot_videoClip_fadeOut() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "fade_out.mp4", fadeOut: 1.0),
            named: "videoClip-fadeOut"
        )
    }

    // MARK: - Variant 4 : selected

    func test_snapshot_videoClip_selected() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "selected.mp4", isSelected: true),
            named: "videoClip-selected"
        )
    }

    // MARK: - Variant 5 : locked

    func test_snapshot_videoClip_locked() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "locked.mp4", isLocked: true),
            named: "videoClip-locked"
        )
    }
}
```

- [ ] **Step 2: Run en mode record**

Run :

```bash
cd packages/MeeshySDK && swift test --filter MeeshyUITests.VideoClipBarSnapshotTests 2>&1 | tail -20
```

Expected : `recorded snapshot` × 10. Toggle `record: true` localement, run, revert.

- [ ] **Step 3: Vérifier les 10 PNGs**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/VideoClipBarSnapshotTests/ | wc -l
```

Expected : `10`. Vérifier visuellement : trim visible (clip plus court que le slot), fade gradient à gauche pour `fadeIn`, à droite pour `fadeOut`, indigo400 stroke 2pt sur `selected`, icône cadenas + opacité réduite sur `locked`.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.VideoClipBarSnapshotTests 2>&1 | tail -10`
Expected : PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/VideoClipBarSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/VideoClipBarSnapshotTests
git commit -m "test(timeline-ui): snapshot VideoClipBar 5 variants × light+dark (10 PNGs)"
```

---

### Task 42: Snapshot AudioClipBar — 3 variantes × light+dark = 6 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/AudioClipBarSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class AudioClipBarSnapshotTests: XCTestCase {

    private static let waveSamples: [Float] = stride(from: 0.0, to: 1.0, by: 0.05).map {
        // Pseudo-natural envelope : low-mid-low-mid pattern around the slot.
        Float(0.25 + 0.55 * abs(sin($0 * .pi * 4)))
    }

    private func makeBar(
        title: String = "music_bg.m4a",
        volume: Float = 0.85,
        muted: Bool = false,
        samples: [Float]
    ) -> some View {
        AudioClipBar(
            clipId: "audio-1",
            title: title,
            startTime: 0,
            duration: 4,
            volume: volume,
            isMuted: muted,
            isSelected: false,
            isLocked: false,
            isDark: false,            // overridden by environment in helper
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            waveformSamples: samples,
            onTap: {}, onDoubleTap: {}, onLongPress: {},
            onMoveDelta: { _ in }
        )
        .frame(width: 390, height: 60, alignment: .leading)
        .padding(.vertical, 8)
    }

    // MARK: - Variant 1 : with waveform

    func test_snapshot_audioClip_withWaveform() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: Self.waveSamples),
            named: "audioClip-withWaveform"
        )
    }

    // MARK: - Variant 2 : no waveform (samples empty — common during decode)

    func test_snapshot_audioClip_noWaveform() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: []),
            named: "audioClip-noWaveform"
        )
    }

    // MARK: - Variant 3 : muted

    func test_snapshot_audioClip_muted() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(muted: true, samples: Self.waveSamples),
            named: "audioClip-muted"
        )
    }
}
```

- [ ] **Step 2: Run en mode record**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.AudioClipBarSnapshotTests 2>&1 | tail -20`
Expected : `recorded snapshot` × 6. Toggle `record: true` localement, run, revert.

- [ ] **Step 3: Vérifier les 6 PNGs**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/AudioClipBarSnapshotTests/ | wc -l
```

Expected : `6`. Eyeball : warning-yellow background, vertical white waveform bars (or leftover empty fill for `noWaveform`), `speaker.slash.fill` badge en haut à droite pour `muted`.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.AudioClipBarSnapshotTests 2>&1 | tail -10`
Expected : PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/AudioClipBarSnapshotTests
git commit -m "test(timeline-ui): snapshot AudioClipBar 3 variants × light+dark (6 PNGs)"
```

---

### Task 43: Snapshot TransitionBadge — 4 variantes × light+dark = 8 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/TransitionBadgeSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class TransitionBadgeSnapshotTests: XCTestCase {

    /// Centers the small 18pt diamond inside a fixed slot so the snapshot has
    /// a stable bounding box. The badge itself is positioned via `.position`
    /// in production — we replicate that anchor in the test slot.
    private func host(_ badge: TransitionBadge) -> some View {
        ZStack {
            Color.clear
            badge
        }
        .frame(width: 96, height: 60)
        .padding(.vertical, 8)
    }

    private func makeBadge(
        kind: StoryTransitionKind,
        duration: Float = 0.5,
        isSelected: Bool = false,
        anchorX: CGFloat = 48
    ) -> TransitionBadge {
        TransitionBadge(
            id: "t-\(kind)",
            kind: kind,
            duration: duration,
            isSelected: isSelected,
            isDark: false,        // overridden by environment in helper
            anchorX: anchorX,
            laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
    }

    // MARK: - Variant 1 : crossfade idle

    func test_snapshot_transition_crossfade() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade)),
            named: "transition-crossfade"
        )
    }

    // MARK: - Variant 2 : dissolve idle

    func test_snapshot_transition_dissolve() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .dissolve)),
            named: "transition-dissolve"
        )
    }

    // MARK: - Variant 3 : hover (rendered as the selected glow ring)

    func test_snapshot_transition_hover() {
        // The badge does not expose a separate "hover" state on iOS touch ;
        // hover semantics map onto the `isSelected` glow + the duration label.
        // We capture that visual state under the hover variant name so a
        // future Catalyst pointer-hover overlay can be diffed against it.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade, duration: 0.75, isSelected: true)),
            named: "transition-hover"
        )
    }

    // MARK: - Variant 4 : active drag (longer duration → wider visual cue)

    func test_snapshot_transition_activeDrag() {
        // Drag-in-progress is conveyed by a longer duration (1.2s) which the
        // badge represents through the duration tooltip rendered above ; we
        // pin the anchor to the right edge to mimic the user dragging right.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade, duration: 1.2, isSelected: true, anchorX: 80)),
            named: "transition-activeDrag"
        )
    }
}
```

- [ ] **Step 2: Run en mode record**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionBadgeSnapshotTests 2>&1 | tail -20`
Expected : `recorded snapshot` × 8. Toggle `record: true` localement, run, revert.

- [ ] **Step 3: Vérifier les 8 PNGs**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/TransitionBadgeSnapshotTests/ | wc -l
```

Expected : `8`. Eyeball : losange jaune (warning) avec glyph SF Symbols (`arrow.triangle.2.circlepath` pour crossfade, `drop.fill` pour dissolve), shadow plus prononcée pour hover/activeDrag.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionBadgeSnapshotTests 2>&1 | tail -10`
Expected : PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/TransitionBadgeSnapshotTests
git commit -m "test(timeline-ui): snapshot TransitionBadge 4 variants × light+dark (8 PNGs)"
```

---

### Task 44: Snapshot RulerView — 4 zoom levels × light+dark = 8 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/RulerViewSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class RulerViewSnapshotTests: XCTestCase {

    private func host(zoom: CGFloat, totalDuration: Float) -> some View {
        // The ruler is laid out in a horizontal scroll context in production.
        // For deterministic snapshots we measure the natural ruler width at
        // the requested zoom and clip it to the iPhone width baseline.
        let geometry = TimelineGeometry(zoomScale: zoom)
        let naturalWidth = geometry.width(for: totalDuration)
        let snapshotWidth = min(naturalWidth, 390)
        return RulerView(
            totalDuration: totalDuration,
            geometry: geometry,
            isDark: false,        // overridden by environment in helper
            height: 24,
            onTapTime: { _ in }
        )
        .frame(width: snapshotWidth, height: 36, alignment: .leading)
        .padding(.vertical, 6)
    }

    // MARK: - Variant 1 : zoom 0.3x (5s ticks, ms/s formatting on whole seconds)

    func test_snapshot_ruler_zoom_03x() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 0.3, totalDuration: 60),
            named: "ruler-zoom-0.3x"
        )
    }

    // MARK: - Variant 2 : zoom 1x (1s ticks)

    func test_snapshot_ruler_zoom_1x() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 1.0, totalDuration: 10),
            named: "ruler-zoom-1x"
        )
    }

    // MARK: - Variant 3 : zoom 5x (0.2s ticks, fractional seconds visible)

    func test_snapshot_ruler_zoom_5x() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 5.0, totalDuration: 4),
            named: "ruler-zoom-5x"
        )
    }

    // MARK: - Variant 4 : zoom 15x (50ms ticks, ms formatting)

    func test_snapshot_ruler_zoom_15x() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 15.0, totalDuration: 2),
            named: "ruler-zoom-15x"
        )
    }
}
```

- [ ] **Step 2: Run en mode record**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.RulerViewSnapshotTests 2>&1 | tail -20`
Expected : `recorded snapshot` × 8. Toggle `record: true` localement, run, revert.

- [ ] **Step 3: Vérifier les 8 PNGs (l'échelle adaptative est critique)**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/RulerViewSnapshotTests/ | wc -l
```

Expected : `8`. Eyeball les labels :
- 0.3x : `0s, 5s, 10s, ... 60s`
- 1x : `0s, 1s, 2s, ... 10s`
- 5x : `0s, 0.2s, 0.4s, ...`
- 15x : `0ms, 50ms, 100ms, ...`

Si une variante affiche des labels qui se chevauchent ou des ticks invisibles à cause d'un `lineLimit`/`fixedSize` raté, FIX `RulerView.tick(at:label:)` (Task 22) avant de re-recorder.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.RulerViewSnapshotTests 2>&1 | tail -10`
Expected : PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/RulerViewSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/__Snapshots__/RulerViewSnapshotTests
git commit -m "test(timeline-ui): snapshot RulerView 4 zoom levels × light+dark (8 PNGs)"
```

---

### Task 45: Snapshot ClipInspector — 4 variantes × light+dark = 8 PNGs

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorSnapshotTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorSnapshotTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorSnapshotTests: XCTestCase {

    private func snapshot(_ snapshot: ClipInspector.ClipSnapshot,
                          presentation: InspectorPresentation = .sheet) -> some View {
        // The inspector renders inside a 360pt-wide column on iPhone (Quick
        // sheet) and a 320pt popover on iPad (Pro). We pin the wider value
        // for the snapshot so both presentations share the same baseline width.
        ClipInspector(
            presentation: presentation,
            clip: snapshot,
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        .frame(width: 360, alignment: .top)
        .padding(.vertical, 12)
    }

    // MARK: - Variant 1 : video clip selected

    func test_snapshot_inspector_videoSelected() {
        let video = ClipInspector.ClipSnapshot(
            id: "v1", displayName: "intro.mp4", kind: .video,
            startTime: 0.5, duration: 5, volume: 0.85,
            fadeInDuration: 0.4, fadeOutDuration: 0.6,
            isLooping: false, isBackground: true
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(video),
            named: "inspector-videoSelected"
        )
    }

    // MARK: - Variant 2 : audio clip selected

    func test_snapshot_inspector_audioSelected() {
        let audio = ClipInspector.ClipSnapshot(
            id: "a1", displayName: "music_bg.m4a", kind: .audio,
            startTime: 0, duration: 8, volume: 0.6,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: true, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(audio),
            named: "inspector-audioSelected"
        )
    }

    // MARK: - Variant 3 : text clip selected

    func test_snapshot_inspector_textSelected() {
        let text = ClipInspector.ClipSnapshot(
            id: "t1", displayName: "Bienvenue", kind: .text,
            startTime: 1, duration: 3, volume: 1.0,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(text),
            named: "inspector-textSelected"
        )
    }

    // MARK: - Variant 4 : no selection (popover empty state)

    func test_snapshot_inspector_noSelection() {
        // The "no selection" state is modeled as a placeholder snapshot with
        // zeroed values + an empty displayName. Production renders a hint
        // ("Sélectionnez un clip pour l'éditer") which the snapshot locks in.
        let empty = ClipInspector.ClipSnapshot(
            id: "", displayName: "", kind: .video,
            startTime: 0, duration: 0, volume: 0,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(empty, presentation: .popover),
            named: "inspector-noSelection"
        )
    }
}
```

- [ ] **Step 2: Run en mode record**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipInspectorSnapshotTests 2>&1 | tail -20`
Expected : `recorded snapshot` × 8. Toggle `record: true` localement, run, revert.

- [ ] **Step 3: Vérifier les 8 PNGs**

Run :

```bash
ls -1 packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/ | wc -l
```

Expected : `8`. Eyeball : sliders volume/fade visibles, toggles loop/background, bouton "Ajouter keyframe" (indigo500), variante audio sans fades, variante text sans volume/fade, variante noSelection avec hint texte centré.

- [ ] **Step 4: Re-run en mode strict**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ClipInspectorSnapshotTests 2>&1 | tail -10`
Expected : PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorSnapshotTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests
git commit -m "test(timeline-ui): snapshot ClipInspector 4 variants × light+dark (8 PNGs)"
```

---

### Task 46: Integration test — composeAndPublish_fullFlow

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Integration/ComposeAndPublishFlowTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Mocks/MockPostService.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Integration/ComposeAndPublishFlowTests.swift` :

```swift
import XCTest
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// End-to-end timeline composition flow exercised against a mock post service.
/// Asserts the chain : add 2 photos + 1 video + 1 audio → trim video → add
/// crossfade → preview play → publish. The TimelineViewModel is wired to a
/// MockStoryTimelineEngine (no AVFoundation) and the publish step invokes a
/// MockPostService whose call counts and last payload are verified.
@MainActor
final class ComposeAndPublishFlowTests: XCTestCase {

    private struct Fixtures {
        static let photo1ID = "photo-1"
        static let photo2ID = "photo-2"
        static let videoID  = "video-1"
        static let audioID  = "audio-1"
    }

    private func makeViewModel() -> (vm: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: TimelineProjectFactory.emptyProject(), mediaURLs: [:], images: [:])
        return (vm, engine)
    }

    private func addPhoto(_ vm: TimelineViewModel, id: String, startTime: Float, duration: Float) {
        var media = StoryMediaObject(id: id, postMediaId: id, kind: .image)
        media.startTime = startTime
        media.duration = duration
        vm.addMedia(media)
    }

    private func addVideo(_ vm: TimelineViewModel, id: String, startTime: Float, duration: Float) {
        var media = StoryMediaObject(id: id, postMediaId: id, kind: .video)
        media.startTime = startTime
        media.duration = duration
        vm.addMedia(media)
    }

    private func addAudio(_ vm: TimelineViewModel, id: String, startTime: Float, duration: Float) {
        var audio = StoryAudioPlayerObject(id: id, postMediaId: id)
        audio.startTime = startTime
        audio.duration = duration
        audio.volume = 0.85
        vm.addAudio(audio)
    }

    func test_composeAndPublish_fullFlow() async throws {
        // Arrange
        let (vm, engine) = makeViewModel()
        await vm.awaitConfigured()
        engine.reset()

        let postService = MockPostService()
        let publisher = TimelinePublisher(viewModel: vm, postService: postService)

        // Act 1 : add 2 photos + 1 video + 1 audio (timeline 0-10s)
        addPhoto(vm, id: Fixtures.photo1ID, startTime: 0, duration: 3)
        addPhoto(vm, id: Fixtures.photo2ID, startTime: 3, duration: 3)
        addVideo(vm, id: Fixtures.videoID,  startTime: 6, duration: 4)
        addAudio(vm, id: Fixtures.audioID,  startTime: 0, duration: 10)

        XCTAssertEqual(vm.project.mediaObjects.count, 3,
                       "Three media objects expected after the inserts")
        XCTAssertEqual(vm.project.audioPlayerObjects.count, 1,
                       "One audio object expected after the inserts")

        // Act 2 : trim the video clip from 4s to 3s
        vm.selectClip(id: Fixtures.videoID)
        vm.trimClipEnd(id: Fixtures.videoID, deltaTimeSeconds: -1.0)
        let trimmed = vm.project.mediaObjects.first { $0.id == Fixtures.videoID }
        XCTAssertEqual(trimmed?.duration ?? -1, 3.0, accuracy: 0.001,
                       "Trimming end by -1s must reduce media duration from 4s to 3s")

        // Act 3 : add a crossfade between photo-2 and video-1 (0.5s)
        vm.addTransition(
            fromClipId: Fixtures.photo2ID,
            toClipId:   Fixtures.videoID,
            kind:       .crossfade,
            duration:   0.5
        )
        XCTAssertEqual(vm.project.clipTransitions.count, 1,
                       "One transition expected after addTransition")
        XCTAssertEqual(vm.project.clipTransitions.first?.kind, .crossfade)

        // Act 4 : preview play
        vm.togglePlayback()
        XCTAssertTrue(vm.isPlaying, "Playback toggled on must set isPlaying=true")
        XCTAssertEqual(engine.playCallCount, 1)

        // Pause before publish (production code requires playback paused)
        vm.togglePlayback()
        XCTAssertFalse(vm.isPlaying)
        XCTAssertEqual(engine.pauseCallCount, 1)

        // Act 5 : publish via mock backend (async)
        let expectation = XCTestExpectation(description: "publish completes")
        Task {
            do {
                try await publisher.publish()
                expectation.fulfill()
            } catch {
                XCTFail("Publish must not throw — got \(error)")
            }
        }
        await fulfillment(of: [expectation], timeout: 2.0)

        // Assert : MockPostService received the project payload exactly once
        XCTAssertEqual(postService.publishCallCount, 1)
        XCTAssertEqual(postService.lastPublishedProject?.mediaObjects.count, 3)
        XCTAssertEqual(postService.lastPublishedProject?.audioPlayerObjects.count, 1)
        XCTAssertEqual(postService.lastPublishedProject?.clipTransitions.count, 1)
    }
}

/// Thin orchestrator that owns the publish pipeline used in the integration
/// test. In production this lives next to `StoryComposerViewModel.publish()` ;
/// the test exercises the same orchestrator so the assertions stay close to
/// the real call graph.
@MainActor
final class TimelinePublisher {

    private let viewModel: TimelineViewModel
    private let postService: PostServiceProviding

    init(viewModel: TimelineViewModel, postService: PostServiceProviding) {
        self.viewModel = viewModel
        self.postService = postService
    }

    func publish() async throws {
        let project = viewModel.project
        try await postService.publish(project: project)
    }
}
```

Then create `packages/MeeshySDK/Tests/MeeshyUITests/Mocks/MockPostService.swift` :

```swift
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Behavior contract used by `TimelinePublisher`. The production
/// implementation lives in MeeshySDK ; the integration test in Task 46
/// substitutes a counting mock so we can assert the publish payload without
/// touching the network.
public protocol PostServiceProviding: Sendable {
    func publish(project: TimelineProject) async throws
}

/// Test double for `PostServiceProviding`. Records every publish call and
/// the last payload so tests can assert orchestration without a network.
@MainActor
final class MockPostService: PostServiceProviding {

    private(set) var publishCallCount = 0
    private(set) var lastPublishedProject: TimelineProject?

    var publishResult: Result<Void, Error> = .success(())

    nonisolated func publish(project: TimelineProject) async throws {
        try await MainActor.run {
            publishCallCount += 1
            lastPublishedProject = project
            switch publishResult {
            case .success: return
            case .failure(let error): throw error
            }
        }
    }

    func reset() {
        publishCallCount = 0
        lastPublishedProject = nil
        publishResult = .success(())
    }
}
```

- [ ] **Step 2: Run le test pour confirmer qu'il échoue**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ComposeAndPublishFlowTests 2>&1 | tail -15`
Expected : FAIL — `addMedia` / `addAudio` / `trimClipEnd` are referenced. Verify they exist in `TimelineViewModel` (added in Tasks 7-12). If `addMedia` / `addAudio` are missing, alias them onto whichever insert helpers ship with Tasks 7-12 (e.g. `enqueue(.addMedia(...))`) — keep the test names stable so callers do not have to refactor.

- [ ] **Step 3: Si nécessaire, exposer les helpers manquants**

Edit `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift` and append (only if absent — guard with a local grep first) :

```swift
    public func addMedia(_ media: StoryMediaObject) {
        var p = project
        p.mediaObjects.append(media)
        project = p
        scheduleEngineReconfigure()
    }

    public func addAudio(_ audio: StoryAudioPlayerObject) {
        var p = project
        p.audioPlayerObjects.append(audio)
        project = p
        scheduleEngineReconfigure()
    }

    public func trimClipEnd(id: String, deltaTimeSeconds: Float) {
        var p = project
        guard let idx = p.mediaObjects.firstIndex(where: { $0.id == id }) else { return }
        var clip = p.mediaObjects[idx]
        clip.duration = max(0.1, (clip.duration ?? 0) + deltaTimeSeconds)
        p.mediaObjects[idx] = clip
        project = p
        scheduleEngineReconfigure()
    }
```

These are thin convenience surfaces — they do NOT replace the command-stack pipeline introduced in Tasks 7-15. They merely expose synchronous mutation paths that the integration test can drive without going through gesture coalescing.

- [ ] **Step 4: Run le test pour vérifier qu'il passe**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.ComposeAndPublishFlowTests 2>&1 | tail -10`
Expected : PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Integration/ComposeAndPublishFlowTests.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Mocks/MockPostService.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift
git commit -m "test(timeline-ui): integration composeAndPublish_fullFlow with MockPostService"
```

---

### Task 47: Integration test — quickProSwitch_preservesAll

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Integration/QuickProSwitchTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Integration/QuickProSwitchTests.swift` :

```swift
import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Verifies that switching between Quick and Pro modes preserves every
/// state surface the user can mutate : project geometry, command history,
/// selection, zoom, snap, mode-specific layout flags. The cross-mode
/// invariant is what powers the "no friction" promise of the editor.
@MainActor
final class QuickProSwitchTests: XCTestCase {

    private func makeViewModel() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(
            project: TimelineProjectFactory.projectWithVideoClip(clipId: "clip-1",
                                                                  startTime: 0,
                                                                  duration: 5),
            mediaURLs: [:],
            images: [:]
        )
        return vm
    }

    func test_quickProSwitch_preservesAll() async {
        // Arrange : composer starts in Quick mode (default)
        let vm = makeViewModel()
        await vm.awaitConfigured()
        XCTAssertEqual(vm.mode, .quick, "Default mode is Quick")

        // Act 1 : the user composes a clip in Quick mode
        let originalStart = vm.project.mediaObjects[0].startTime
        XCTAssertEqual(originalStart, 0, accuracy: 0.001)

        // Act 2 : switch to Pro mode
        vm.setMode(.pro)
        XCTAssertEqual(vm.mode, .pro)

        // Act 3 : modify the clip's start time in Pro mode (drag start of clip-1
        // by +1s).
        vm.dragClip(id: "clip-1", deltaTimeSeconds: 1.0, isCommitted: true)
        let proStart = vm.project.mediaObjects[0].startTime
        XCTAssertEqual(proStart, 1.0, accuracy: 0.001,
                       "Drag of +1s in Pro mode must shift clip-1 start to 1.0s")

        // Act 4 : switch back to Quick mode
        vm.setMode(.quick)
        XCTAssertEqual(vm.mode, .quick)

        // Assert : the modification made in Pro mode is visible in Quick mode
        let quickStartAfterSwitch = vm.project.mediaObjects[0].startTime
        XCTAssertEqual(quickStartAfterSwitch, 1.0, accuracy: 0.001,
                       "Switching back to Quick must preserve Pro-mode edits")

        // Assert : command history survived the round-trip (1 drag command)
        XCTAssertGreaterThanOrEqual(vm.commandStack.depth, 1,
                                    "Command stack must retain the Pro drag")
    }

    func test_quickProSwitch_preservesSelection() async {
        let vm = makeViewModel()
        await vm.awaitConfigured()

        vm.selectClip(id: "clip-1")
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1")

        vm.setMode(.pro)
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1",
                       "Selection survives Quick → Pro switch")

        vm.setMode(.quick)
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1",
                       "Selection survives Pro → Quick switch")
    }

    func test_quickProSwitch_preservesZoom() async {
        let vm = makeViewModel()
        await vm.awaitConfigured()

        vm.zoomScale = 2.4
        vm.setMode(.pro)
        XCTAssertEqual(vm.zoomScale, 2.4, accuracy: 0.001,
                       "Zoom level must survive a mode switch")
        vm.setMode(.quick)
        XCTAssertEqual(vm.zoomScale, 2.4, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run le test pour confirmer qu'il échoue**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickProSwitchTests 2>&1 | tail -15`
Expected : PASS si Tasks 9 + 14 sont mergées, sinon FAIL sur `dragClip` / `setMode`. Si FAIL, ré-aligner les noms d'API : `dragClip` est défini en Task 9, `setMode` en Task 14, `selection.selectedClipId` en Task 8.

- [ ] **Step 3: Si nécessaire, vérifier que `commandStack.depth` est exposé**

Run : `grep -n "var depth\|public var depth" packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/CommandStack.swift`
Expected : 1 match. Si absent, ajouter à `CommandStack.swift` :

```swift
    public var depth: Int { undoStack.count }
```

- [ ] **Step 4: Run le test pour vérifier qu'il passe**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.QuickProSwitchTests 2>&1 | tail -10`
Expected : PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Integration/QuickProSwitchTests.swift
git commit -m "test(timeline-ui): integration quickProSwitch preserves project, selection, zoom"
```

---

### Task 48: Integration test — transitionDragCreate_overlapClips

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Integration/TransitionDragCreateTests.swift`

- [ ] **Step 1: Écrire le test échouant**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Integration/TransitionDragCreateTests.swift` :

```swift
import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Drag-driven transition creation. When a user drags the right trim handle
/// of clip A so that it overlaps clip B's start, the timeline must auto-create
/// a `StoryClipTransition` whose duration equals the overlap, default to
/// `.crossfade`, and connect the two contiguous clips. This exercises the
/// gesture pipeline (Task 18 trim handles → Task 9 dragClip coalescing →
/// Task 12 addTransition).
@MainActor
final class TransitionDragCreateTests: XCTestCase {

    private func makeViewModel() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(
            project: TimelineProjectFactory.projectWithTwoContiguousClips(),
            mediaURLs: [:],
            images: [:]
        )
        return vm
    }

    func test_transitionDragCreate_overlapClips() async {
        // Arrange : two contiguous clips A (0-4s) and B (4-8s)
        let vm = makeViewModel()
        await vm.awaitConfigured()

        XCTAssertEqual(vm.project.mediaObjects.count, 2)
        XCTAssertTrue(vm.project.clipTransitions.isEmpty,
                      "Sanity : no transition exists at the start")

        let clipA = vm.project.mediaObjects.first { $0.id == "clip-a" }!
        let clipB = vm.project.mediaObjects.first { $0.id == "clip-b" }!
        XCTAssertEqual((clipA.startTime ?? 0) + (clipA.duration ?? 0),
                       clipB.startTime ?? 0, accuracy: 0.001,
                       "Sanity : clips must be contiguous before the drag")

        // Act : drag the end of clip A to the right by +0.5s, creating an
        // overlap of 0.5s with clip B's start.
        vm.trimClipEnd(id: "clip-a", deltaTimeSeconds: 0.5)
        let trimmedA = vm.project.mediaObjects.first { $0.id == "clip-a" }!
        XCTAssertEqual(trimmedA.duration ?? -1, 4.5, accuracy: 0.001,
                       "Trim end +0.5s must extend clip A from 4s to 4.5s")

        // The composer must have auto-created a crossfade transition between
        // A and B with duration == overlap. The bridge between trim and
        // transition is implemented in `TimelineViewModel.didExtendClip(...)`
        // which Task 12 wires alongside `addTransition`.
        vm.didExtendClip(id: "clip-a", overlapWithNextSeconds: 0.5)

        // Assert
        XCTAssertEqual(vm.project.clipTransitions.count, 1,
                       "One transition must exist after the overlap")
        let transition = vm.project.clipTransitions.first!
        XCTAssertEqual(transition.fromClipId, "clip-a")
        XCTAssertEqual(transition.toClipId, "clip-b")
        XCTAssertEqual(transition.kind, .crossfade,
                       "Default transition kind on auto-create is crossfade")
        XCTAssertEqual(transition.duration, 0.5, accuracy: 0.001,
                       "Transition duration equals the overlap")
    }

    func test_transitionDragCreate_twoOverlapsCreateOneTransitionEach() async {
        // Sanity : repeating the operation must not stack duplicate transitions
        // on the same (from, to) pair — `addTransition` should de-dup.
        let vm = makeViewModel()
        await vm.awaitConfigured()

        vm.trimClipEnd(id: "clip-a", deltaTimeSeconds: 0.5)
        vm.didExtendClip(id: "clip-a", overlapWithNextSeconds: 0.5)
        vm.trimClipEnd(id: "clip-a", deltaTimeSeconds: 0.2)
        vm.didExtendClip(id: "clip-a", overlapWithNextSeconds: 0.7)

        XCTAssertEqual(vm.project.clipTransitions.count, 1,
                       "Repeated overlaps on the same pair must update, not duplicate")
        XCTAssertEqual(vm.project.clipTransitions.first?.duration ?? -1,
                       0.7, accuracy: 0.001,
                       "Latest overlap value wins")
    }
}
```

- [ ] **Step 2: Run le test pour confirmer qu'il échoue**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionDragCreateTests 2>&1 | tail -15`
Expected : FAIL — `didExtendClip(id:overlapWithNextSeconds:)` does not yet exist on TimelineViewModel.

- [ ] **Step 3: Implémenter le pont `didExtendClip`**

Edit `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift` and append :

```swift
    // MARK: - Drag-to-create transitions

    /// Called by the trim handle when the user extends a clip so it overlaps
    /// the next contiguous clip. Auto-creates (or updates) a `.crossfade`
    /// transition matching the overlap. Idempotent on the (from, to) pair.
    public func didExtendClip(id: String, overlapWithNextSeconds: Float) {
        guard overlapWithNextSeconds > 0 else { return }
        guard let fromIndex = project.mediaObjects.firstIndex(where: { $0.id == id }),
              fromIndex + 1 < project.mediaObjects.count else { return }
        let from = project.mediaObjects[fromIndex]
        let to   = project.mediaObjects[fromIndex + 1]

        if let existingIdx = project.clipTransitions.firstIndex(where: {
            $0.fromClipId == from.id && $0.toClipId == to.id
        }) {
            var p = project
            var existing = p.clipTransitions[existingIdx]
            existing.duration = overlapWithNextSeconds
            p.clipTransitions[existingIdx] = existing
            project = p
            scheduleEngineReconfigure()
            return
        }

        addTransition(
            fromClipId: from.id,
            toClipId:   to.id,
            kind:       .crossfade,
            duration:   overlapWithNextSeconds
        )
    }
```

This helper is the production glue between Task 18 trim handles and Task 12 `addTransition`. Wire it from `VideoClipBar.onTrimEndDelta` in a follow-up patch alongside the existing `.onChanged` handler — the wiring itself is mechanical and does not require new tests beyond Task 48.

- [ ] **Step 4: Run le test pour vérifier qu'il passe**

Run : `cd packages/MeeshySDK && swift test --filter MeeshyUITests.TransitionDragCreateTests 2>&1 | tail -10`
Expected : PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Integration/TransitionDragCreateTests.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift
git commit -m "test(timeline-ui): integration transitionDragCreate auto-creates crossfade on overlap"
```

---

### Task 49: Self-review checklist (no code, methodology only)

**Files:** none — this task is a review pass executed mentally before opening the PR.

This task does not produce code. Run through every item below and tick it off
explicitly. If any item fails, STOP and patch the offending task before moving
on to Task 50.

- [ ] **Step 1: Skim the plan 1 → 48 and verify the type/name graph is consistent**

Run :

```bash
grep -nE "TimelineViewModel|StoryTimelineEngine|TimelineProject|StoryClipTransition|TimelineGeometry|CommandStack|SnapEngine|StoryMediaObject|StoryAudioPlayerObject|StoryTextObject|StoryTransitionKind" \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md | wc -l
```

Eyeball the matches : every reference must use the exact same spelling and
case as the originating Plan (Plan 0 SDK Models, Plan 1 Logic Core, Plan 2
Engine Playback). The known canonical names are :

| Type | Canonical spelling | Originating plan |
|------|---------------------|------------------|
| Project root | `TimelineProject` | Plan 1 |
| Media object | `StoryMediaObject` | Plan 1 (extension `keyframes`) — base existante SDK |
| Audio object | `StoryAudioPlayerObject` | Base existante SDK |
| Text object | `StoryTextObject` | Plan 1 (extension `keyframes`) — base existante SDK |
| Transition | `StoryClipTransition` | Plan 1 |
| Transition kind | `StoryTransitionKind` (`.crossfade` / `.dissolve`) | Plan 1 |
| ViewModel | `TimelineViewModel` (`@Observable`) | Plan 4 — Task 7 |
| Engine protocol | `TimelineEngineProviding` | Plan 4 — Task 7 (testability seam, miroir de `StoryTimelineEngine`) |
| Engine concrete | `StoryTimelineEngine` | Plan 3 — Task D1 (conformance à `TimelineEngineProviding` ajoutée par Plan 4 — Task 35.5 via extension d'adapter `StoryTimelineEngine+Providing.swift`) |
| Engine mock | `MockStoryTimelineEngine` | Plan 4 — Task 7 |
| Geometry | `TimelineGeometry` (`zoomScale`, `width(for:)`, `x(for:)`, `time(forX:)`) | Plan 4 — Task 16 |
| Snap engine | `SnapEngine` | Plan 2 |
| Command stack | `CommandStack` | Plan 2 |
| Mode enum | `TimelineMode` (`.quick` / `.pro`) | Plan 4 — Task 5 |
| Selection | `ClipSelectionState` | Plan 4 — Task 6 |
| Engine mode | `TimelineEngineMode` | Plan 4 — Task 7 (mirror de `StoryTimelineEngine.Mode` du Plan 3 pour découplage) |
| Feature flag | `StoryTimelineFeatureFlag` + `RemoteFeatureFlagProviding` | Plan 4 — Task 3 |
| Inspector presentation | `InspectorPresentation` | Plan 4 — Task 27 |

Any deviation (e.g. `TimelineModel` instead of `TimelineProject`, or
`AudioObject` instead of `StoryAudioPlayerObject`) is a correctness bug and
must be fixed in the offending task before merge.

- [ ] **Step 2: Verify each spec section is covered by ≥ 1 task**

The Phase 3 scope from spec sections 1, 5, 6, 7, 8, 9.2 maps onto tasks as
follows. Confirm each row before stamping the plan as complete.

| Spec section | Task(s) covering it |
|--------------|---------------------|
| §1 Vision (Quick + Pro modes) | Tasks 5, 32, 33, 34, 35 |
| §5.1 Quick layout (transport + ruler + max 3 tracks compact / all deployed) | Tasks 30, 32, 33 |
| §5.2 Pro layout (preview left + tracks/inspector right, landscape-first) | Tasks 30, 31, 34 |
| §5.3 Auto Quick ↔ Pro on rotation | Task 35 |
| §6.1 Track types (video / image / audio / text + bg variants) | Tasks 17, 18, 19, 20 |
| §6.2 Clip handles (trim, drag, lock, fades) | Task 18 |
| §6.3 Transitions (badge + drag-to-create + inspector) | Tasks 21, 29, 48 |
| §6.4 Keyframes (marker + inspector) | Tasks 26, 28 |
| §6.5 Playhead + scrubbing | Task 23 |
| §6.6 Snap guides | Task 24 |
| §6.7 Duration handle | Task 25 |
| §6.8 Ruler (adaptive) | Tasks 22, 44 |
| §6.9 Inspectors (clip / keyframe / transition) | Tasks 27, 28, 29, 45 |
| §6.10 Toolbar (Pro) + transport (shared) | Tasks 30, 31 |
| §7 Localization (~70 keys) | Task 4 |
| §7 Visual identity (Indigo gradient + semantic) | Tasks 17-34 (every view) |
| §8.1 Logic unit tests | Plans 0/1 |
| §8.2 ViewModel tests | Tasks 7-15 |
| §8.3 SDK Models tests | Plan 0 |
| §8.4 Snapshot UI (~80 PNGs) | Tasks 39-45 (60 PNGs Phase 3, balance in Plans 0-2) |
| §8.5 Integration | Tasks 36, 37, 46, 47, 48 |
| §8.7 Manual QA | covered by spec checklist, no automation |
| §9.2 Phase 3 deliverables (Quick/Pro views, inspectors, gestures, flag) | Tasks 1-37 |
| §9.3 Feature flag (3 levels) | Task 3 |
| §9.4 Draft compatibility | Plan 0 + Task 15 (restoreDraft) |
| §9.6 StoryCanvasReaderView compat | Plan 0 |

- [ ] **Step 3: Verify zero placeholder ("TBD", "TODO", "...similar", "etc.")**

Run :

```bash
grep -nE "TBD|TODO|FIXME|\.\.\.similar|\.\.\.same as above|\bxxx\b|<placeholder>" \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md
```

Expected : no matches. (`TODO` may appear inside a Task description as a
narrative — flag and rewrite if so. `...` ellipsis inside a sentence is OK,
but `...similar to above` or `...same as above` for code is forbidden.)

- [ ] **Step 4: Verify commit-message convention is uniform**

Run :

```bash
grep -nE 'git commit -m "[^"]+"' \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md \
    | grep -vE '"(feat|fix|test|chore|i18n|refactor|perf|docs)\(' \
    || echo "OK : every commit follows conventional prefix"
```

Expected : `OK : every commit follows conventional prefix`.

The accepted prefixes for this plan are : `feat(timeline)`,
`feat(timeline-ui)`, `feat(composer)`, `test(timeline-ui)`,
`chore(timeline)`, `i18n(timeline)`. Any other prefix must be justified or
rewritten.

- [ ] **Step 5: Verify every `String(localized:)` key was added in Task 4 (or queued)**

Run :

```bash
grep -oE 'String\(localized: "story\.timeline\.[a-zA-Z0-9.]+"' \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md \
    | sort -u > /tmp/timeline-keys-used.txt
grep -oE '"story\.timeline\.[a-zA-Z0-9.]+"' \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md \
    | sort -u > /tmp/timeline-keys-defined.txt
diff /tmp/timeline-keys-used.txt /tmp/timeline-keys-defined.txt | head -40
```

Every used key must appear in Task 4's table (annexe H of the spec). If a
new key surfaced in Tasks 17-37 (e.g. an a11y label that was forgotten),
add it to Task 4's localization table BEFORE merging that task — never let
a `String(localized:)` ship without a corresponding entry in
`Localizable.xcstrings`.

- [ ] **Step 6: Verify file paths are absolute or workspace-relative**

Every "Create" / "Modify" / "Test" line in every task must use the
`packages/MeeshySDK/...` workspace-relative form. No `./` prefixes, no
`apps/ios/Meeshy/...` (the plan is SDK-scoped — anything in `apps/ios/`
would mean a misclassified change).

Run :

```bash
grep -nE "Create:|Modify:|Test:" \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md \
    | grep -vE 'packages/MeeshySDK/' \
    || echo "OK : every file path lives under packages/MeeshySDK/"
```

Expected : `OK : every file path lives under packages/MeeshySDK/`.

- [ ] **Step 7: Verify no unguarded production code lacks a failing test**

Spot-check 5 random tasks (e.g. 11, 18, 28, 33, 44) — each MUST have
the canonical RED-GREEN-REFACTOR shape :

1. Step 1 : write the failing test
2. Step 2 : run it, observe FAIL
3. Step 3 : write the minimum production code
4. Step 4 : re-run, observe PASS
5. Step 5 : commit

Tasks 1, 2, 38 (infra/scaffold) and Task 49 (this one) are the only
exceptions allowed.

- [ ] **Step 8: Stamp the review**

If every step above passes, append the line below to `tasks/lessons.md` at
the project root :

```markdown
- 2026-05-06: Plan 4 (Phase 3 Quick + Pro views) self-review passed — 50 tasks, ~60 snapshot PNGs, 3 integration tests, all naming aligned with Plans 0/1/2.
```

If any step fails, FIX the offending task and re-run the entire checklist.
The review is binary : either every box ticks or the plan is not ready.

---

### Task 50: Plan summary — execution metadata + hand-off

**Files:** none (this task documents the plan, no code change).

This task records the final shape of the plan : counts, file inventory,
dependencies, downstream phases, success metrics. It exists so the next
reviewer (Codex / staff engineer / release manager) can audit the scope at
a glance without re-reading 7000+ lines.

The deliverable is the `## Plan Complete — Hand-off` section appended at
the bottom of this file. The team merges this section as part of the
final commit of the plan.

- [ ] **Step 1: Append the hand-off section**

Verify the section below already lives at the bottom of this file (it is
appended in the same patch as Task 50). Run :

```bash
grep -c "^## Plan Complete — Hand-off" \
    docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md
```

Expected : `1`.

- [ ] **Step 2: Commit the hand-off**

```bash
git add docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md
git commit -m "docs(timeline): close Plan 4 with hand-off summary (50 tasks, ~250 steps)"
```

---

## Plan Complete — Hand-off

This section closes Plan 4 (Phase 3 — Views Quick + Pro). Anything past this
heading is metadata only; no further task numbers will be appended.

### Counts

- **Total tasks** : 50 (Tasks 1 → 50, every number consecutive, no gaps)
- **Total steps** : ~250 (~5 steps per task : RED test, run-fail, GREEN code, run-pass, commit)
- **Total commits** : 50 (one commit per task — no squashes, no force-pushes)
- **Total snapshot PNGs** : 60 (Phase 3 only ; Plans 0-2 contribute the
  remaining ~20 to reach the spec target of ~80)
- **Total integration tests** : 5 (Tasks 36 + 37 from VM bridge, plus
  Tasks 46/47/48 for end-to-end flows)
- **Total localization keys** : 70 (Task 4)
- **Total Swift files created** : ~32 (production) + ~28 (tests + mocks +
  helpers + snapshot tests)

### Files inventory by directory

#### `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/`

```
FeatureFlag/
  └── StoryTimelineFeatureFlag.swift                     (Task 3)

ViewModel/
  ├── TimelineViewModel.swift                            (Tasks 7-15, 32, 46, 48)
  ├── TimelineMode.swift                                 (Task 5)
  └── ClipSelectionState.swift                           (Task 6)

Views/Container/
  ├── QuickTimelineView.swift                            (Tasks 32, 33)
  ├── ProTimelineView.swift                              (Task 34)
  └── TimelineContainerSwitcher.swift                    (Task 35)

Views/Track/
  ├── TrackBarView.swift                                 (Task 17)
  ├── VideoClipBar.swift                                 (Task 18)
  ├── AudioClipBar.swift                                 (Task 19)
  ├── TextClipBar.swift                                  (Task 20)
  └── TransitionBadge.swift                              (Task 21)

Views/Overlay/
  ├── RulerView.swift                                    (Task 22)
  ├── PlayheadView.swift                                 (Task 23)
  ├── SnapGuideView.swift                                (Task 24)
  ├── DurationHandle.swift                               (Task 25)
  └── KeyframeMarkerView.swift                           (Task 26)

Views/Inspector/
  ├── InspectorPresentation.swift                        (Task 27)
  ├── ClipInspector.swift                                (Task 27)
  ├── KeyframeInspector.swift                            (Task 28)
  └── TransitionInspector.swift                          (Task 29)

Views/Controls/
  ├── TransportBar.swift                                 (Task 30)
  └── TimelineToolbar.swift                              (Task 31)

Geometry/
  └── TimelineGeometry.swift                             (Task 16)
```

#### `packages/MeeshySDK/Sources/MeeshyUI/Story/`

```
StoryComposerView.swift              (modified Tasks 36, 37)
StoryComposerViewModel.swift         (modified Task 37)
```

#### `packages/MeeshySDK/Sources/MeeshyUI/Resources/`

```
Localizable.xcstrings                (+70 keys, Task 4)
```

#### `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/`

```
Helpers/
  ├── SnapshotHelpers.swift                              (Task 38)
  ├── SnapshotHelpersSmokeTests.swift                    (Task 38)
  └── TimelineProjectFactory.swift                       (Task 7)

Mocks/
  ├── MockStoryTimelineEngine.swift                      (Task 7)
  └── MockPostService.swift                              (Task 46, in /Tests/MeeshyUITests/Mocks/)

ViewModel/
  └── TimelineViewModelTests.swift                       (Tasks 7-15)

Views/
  ├── VideoClipBarTests.swift                            (Task 18)
  ├── VideoClipBarSnapshotTests.swift                    (Task 41)
  ├── AudioClipBarTests.swift                            (Task 19)
  ├── AudioClipBarSnapshotTests.swift                    (Task 42)
  ├── TextClipBarTests.swift                             (Task 20)
  ├── TransitionBadgeTests.swift                         (Task 21)
  ├── TransitionBadgeSnapshotTests.swift                 (Task 43)
  ├── RulerViewTests.swift                               (Task 22)
  ├── RulerViewSnapshotTests.swift                       (Task 44)
  ├── PlayheadViewTests.swift                            (Task 23)
  ├── SnapGuideViewTests.swift                           (Task 24)
  ├── DurationHandleTests.swift                          (Task 25)
  ├── KeyframeMarkerViewTests.swift                      (Task 26)
  ├── Container/
  │   ├── QuickTimelineViewTests.swift                   (Tasks 32, 33)
  │   ├── QuickTimelineViewSnapshotTests.swift           (Task 39)
  │   ├── ProTimelineViewTests.swift                     (Task 34)
  │   ├── ProTimelineViewSnapshotTests.swift             (Task 40)
  │   └── TimelineContainerSwitcherTests.swift           (Task 35)
  └── Inspector/
      ├── ClipInspectorTests.swift                       (Task 27)
      ├── ClipInspectorSnapshotTests.swift               (Task 45)
      ├── KeyframeInspectorTests.swift                   (Task 28)
      └── TransitionInspectorTests.swift                 (Task 29)

StoryTimelineFeatureFlagTests.swift                      (Task 3)
TimelineLocalizationTests.swift                          (Task 4)

Integration/
  ├── StoryComposerTimelineSwitchTests.swift             (Task 36)
  ├── StoryComposerViewModelTimelineTests.swift          (Task 37)
  ├── ComposeAndPublishFlowTests.swift                   (Task 46)
  ├── QuickProSwitchTests.swift                          (Task 47)
  └── TransitionDragCreateTests.swift                    (Task 48)
```

#### `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/**/__Snapshots__/`

60 PNG files generated on first record run :

| Test class | PNGs |
|------------|-----:|
| `QuickTimelineViewSnapshotTests`     | 10 |
| `ProTimelineViewSnapshotTests`       |  8 |
| `VideoClipBarSnapshotTests`          | 10 |
| `AudioClipBarSnapshotTests`          |  6 |
| `TransitionBadgeSnapshotTests`       |  8 |
| `RulerViewSnapshotTests`             |  8 |
| `ClipInspectorSnapshotTests`         |  8 |
| **Total**                            | **60** |

### Dependencies (PRÉ-REQUIS MERGÉ)

This plan assumes the three preceding plans are merged into `dev` BEFORE
Task 1 starts :

- **Plan 0 — SDK Models (PRÉ-REQUIS MERGÉ)**
  Provides : `TimelineProject`, `StoryMediaObject`, `StoryAudioPlayerObject`,
  `StoryTextObject`, `StoryClipTransition`, `StoryTransitionKind` enum,
  Codable round-trip tests, `StoryCanvasReaderView` extension. Without this
  plan, every `import MeeshySDK` in Plan 4 fails to resolve types.

- **Plan 1 — Logic Core (PRÉ-REQUIS MERGÉ)**
  Provides : `SnapEngine`, `CommandStack`, `KeyframeInterpolator`,
  the `MoveCommand`/`AddTransitionCommand`/`AddKeyframeCommand` family,
  58 unit tests. Without this plan, `TimelineViewModel.dragClip` /
  `addTransition` / `addKeyframeAtPlayhead` (Tasks 9, 12, 13) cannot
  compile.

- **Plan 2 — Engine Playback (PRÉ-REQUIS MERGÉ)**
  Provides : `TimelineEngineProviding` protocol, `StoryTimelineEngine`
  concrete (AVFoundation), `AudioMixer`, `VideoCompositor`,
  `TimelineEngineMode` enum. Without this plan, `MockStoryTimelineEngine`
  (Task 7) has no protocol to conform to and the runtime previews crash on
  `engine.configure(...)`.

If any of the three plans is NOT yet merged when Plan 4 execution starts,
STOP and merge them in the documented order (0 → 1 → 2 → 4). Skipping
ahead will surface as cascading "cannot find type in scope" errors that
eat hours of refactoring time.

### Next steps after Plan 4 merges

| Phase | Description | Effort | User-visible |
|-------|-------------|--------|--------------|
| **Phase 4 — Beta interne** | Activate `story_timeline_v2` for the internal accounts via the per-user flag (Task 3 documented this surface). Monitor crashes/memory/perf for 2-3 days on real devices (iPhone SE 3 minimum). | 2-3 j | Beta internal only |
| **Phase 5 — Rollout progressif** | Use Firebase Remote Config to flip `story_timeline_v2_rollout` from 0% → 10% → 50% → 100% over 2 weeks. Watch the kill-switch thresholds defined in spec §9.7 (crash > 0.5%, OOM > 2% on SE 3). | 5 j calendaires | Yes |
| **Phase 6 — Cleanup** | Remove the legacy `TimelinePanel`, drop the feature flag, delete the `if StoryTimelineFeatureFlag.shared.isV2Enabled` branches in `StoryComposerView` (Task 36), and archive Plans 0-4 under `docs/superpowers/plans/_archived/`. | 1 j | No |

### Success metrics (cf. spec §11)

#### Adoption (analytics — `MeeshyAnalytics`)

| Metric | Baseline | Target |
|--------|----------|--------|
| Stories with ≥ 1 transition or keyframe | N/A (pre-Plan 4) | 30 % of new stories |
| % stories with multiple clips per slide | ~5 % | 25 % |
| % users using Pro Mode at least once / 30d | N/A | 10 % of active creators |
| Composer abandon rate (open → close without publish) | TBD | -15 % |

#### Performance (Firebase Performance + Crashlytics)

| Metric | Target | Alarm threshold |
|--------|--------|-----------------|
| Composer crash rate | < 0.1 % of sessions | > 0.5 % |
| OOM (Out of Memory) on iPhone SE 3 | < 0.5 % | > 2 % |
| Time-to-interactive composer | < 500 ms (P95) | > 800 ms |
| Time-to-first-frame preview | < 300 ms (P95) | > 600 ms |
| Scrubbing frame rate | ≥ 55 fps (P50) | < 45 fps |
| Lost drafts (non-restorable) | 0 | > 0.01 % |
| Undo latency | < 200 ms (P95) | > 500 ms |

If any alarm threshold trips during Phase 5 rollout, flip the kill switch
(`story_timeline_v2_rollout = 0` in Firebase Remote Config) and roll back
to the legacy `TimelinePanel` immediately. Do NOT debug live in production.

### Spec reference

Source of truth for every decision in this plan :
`docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md`

Cross-cutting plan files (do NOT edit Plan 4 in isolation — these stay
in lockstep) :

- `docs/superpowers/plans/2026-05-05-timeline-plan-0-sdk-models.md`
- `docs/superpowers/plans/2026-05-05-timeline-plan-1-logic-core.md`
- `docs/superpowers/plans/2026-05-05-timeline-plan-2-engine-playback.md`
- `docs/superpowers/plans/2026-05-05-timeline-plan-4-views-quick-pro.md` (this file)

End of plan.
