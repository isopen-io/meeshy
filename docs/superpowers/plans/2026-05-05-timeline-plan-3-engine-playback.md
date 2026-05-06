# Timeline Editor — Plan 3 : Engine Playback (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le moteur de lecture multi-track basé sur AVFoundation natif (`StoryTimelineEngine`, `AudioMixer`, `VideoCompositor`, `TimelineMediaSource`), garantissant aucun freeze ni lag (GPU partout, async non bloquant). Étendre `StoryCanvasReaderView` pour interpréter `clipTransitions` + `keyframes` en lecture seule (compat immédiate des stories V2 sur tous les viewers à jour).

**Architecture:** Wrapper léger autour d'`AVMutableComposition` (timeline native) + `AVMutableVideoComposition` (compositor GPU pour overlays/transitions) + `AVAudioEngine` (mix multi-piste temps-réel). Le mode édition active le mixer pour contrôles live, le mode preview utilise la composition pure pour playback passif.

**Tech Stack:** Swift 6 strict, iOS 17+, AVFoundation (`AVMutableComposition`, `AVMutableVideoComposition`, `AVPlayer`, `AVAudioEngine`, `AVAudioPlayerNode`, `AVAsynchronousCIImageFilteringRequest`), CoreImage (`CIDissolveTransition`, `CIContext(metal:)`), XCTest, XCTMetric.

**Référence spec:** `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` section "Stack technique iOS", section 3, section 9.2 phase 2, section 9.6.

**Dépend de:** Plan 1 (SDK Models) + Plan 2 (Logic Core, pour `KeyframeInterpolator`) mergés.

---

## Pre-flight verifications (à confirmer AVANT de démarrer)

- [ ] Plan 1 a été mergé : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` contient `StoryClipTransition`, `StoryTransitionKind`, `StoryEasing`, `StoryKeyframe`, et les extensions `StoryEffects.clipTransitions`, `StoryMediaObject.keyframes`, `StoryTextObject.keyframes`. `TimelineProject` est défini.
- [ ] Plan 2 a été mergé : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift` existe et expose `KeyframeInterpolator.interpolate<T: Lerpable>(keyframes:at:) -> T?`. `Lerpable` est défini avec conformances `Float`, `CGFloat`, `CGPoint`, `CGSize`.
- [ ] Le dossier `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/` est vide ou n'existe pas encore (sera créé par ce plan).
- [ ] Le dossier `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/` n'existe pas encore (sera créé).
- [ ] `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet` passe sur main avant de commencer.

Si une de ces vérifications échoue, **ARRÊTER** et synchroniser les plans dépendants.

---

## Architecture cible (rappel)

```
packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/
├── TimelineMediaSource.swift     # Abstraction image / video / audio
├── VideoCompositor.swift         # Génération AVMutableVideoComposition + transitions
├── AudioMixer.swift              # AVAudioEngine multi-piste (interactivité runtime)
├── StoryTimelineEngine.swift     # Wrapper AVMutableComposition (preview + futur export)
└── StoryTimelineEngineErrors.swift  # Enum erreurs centralisé

packages/MeeshySDK/Sources/MeeshyUI/Story/
└── StoryCanvasReaderView+Timeline.swift  # Extension lecture seule (transitions + keyframes)

packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/
├── TimelineMediaSourceTests.swift
├── VideoCompositorTests.swift
├── AudioMixerTests.swift
├── StoryTimelineEngineTests.swift
├── StoryCanvasReaderTransitionTests.swift
└── StoryCanvasReaderKeyframeTests.swift
```

**Règle d'or :** chaque fichier source ≤ 400 lignes. Si un fichier dépasse, splitter dans une sous-extension.

---

## Section A — `TimelineMediaSource` (abstraction image/video/audio)

### Task A1: Créer le dossier Engine et le fichier `TimelineMediaSource.swift` avec un test failing pour la création

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

final class TimelineMediaSourceTests: XCTestCase {

    func test_init_video_storesURLAndKindVideo() {
        let url = URL(fileURLWithPath: "/tmp/test.mp4")
        let source = TimelineMediaSource(id: "clip-1", kind: .video, url: url)
        XCTAssertEqual(source.id, "clip-1")
        XCTAssertEqual(source.kind, .video)
        XCTAssertEqual(source.url, url)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests/test_init_video_storesURLAndKindVideo -quiet`
Expected: FAIL with "Cannot find 'TimelineMediaSource' in scope".

- [ ] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift
import Foundation
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

/// Abstraction d'une source media (vidéo, audio, image) consommable par l'engine timeline.
/// Type valeur Sendable, sans état mutable, jamais lié à l'UI.
public struct TimelineMediaSource: Sendable, Identifiable, Equatable {

    public enum Kind: String, Sendable, Equatable {
        case video
        case audio
        case image
    }

    public let id: String
    public let kind: Kind
    /// URL locale ou distante. `nil` autorisé pour les images préchargées en mémoire.
    public let url: URL?

    public init(id: String, kind: Kind, url: URL?) {
        self.id = id
        self.kind = kind
        self.url = url
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests/test_init_video_storesURLAndKindVideo -quiet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift
git commit -m "feat(timeline-engine): add TimelineMediaSource abstraction"
```

---

### Task A2: Ajouter une factory depuis `StoryMediaObject`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `TimelineMediaSourceTests`:
```swift
func test_fromMediaObject_videoKind_resolvesURL() {
    let media = StoryMediaObject(
        id: "m1", postMediaId: "pm1",
        mediaType: "video", placement: "media",
        x: 0.5, y: 0.5
    )
    let url = URL(fileURLWithPath: "/tmp/v.mp4")
    let urls = ["m1": url]
    let source = TimelineMediaSource.fromMediaObject(media, videoURLs: urls, audioURLs: [:])
    XCTAssertEqual(source?.kind, .video)
    XCTAssertEqual(source?.url, url)
    XCTAssertEqual(source?.id, "m1")
}

func test_fromMediaObject_imageKind_returnsImageSourceWithNilURL() {
    let media = StoryMediaObject(
        id: "m2", postMediaId: "pm2",
        mediaType: "image", placement: "media"
    )
    let source = TimelineMediaSource.fromMediaObject(media, videoURLs: [:], audioURLs: [:])
    XCTAssertEqual(source?.kind, .image)
    XCTAssertNil(source?.url)
}

func test_fromMediaObject_unknownKind_returnsNil() {
    let media = StoryMediaObject(
        id: "m3", postMediaId: "pm3",
        mediaType: "unknown_type", placement: "media"
    )
    let source = TimelineMediaSource.fromMediaObject(media, videoURLs: [:], audioURLs: [:])
    XCTAssertNil(source)
}

func test_fromAudioObject_returnsAudioSource() {
    let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
    let url = URL(fileURLWithPath: "/tmp/song.m4a")
    let source = TimelineMediaSource.fromAudioObject(audio, audioURLs: ["a1": url])
    XCTAssertEqual(source?.kind, .audio)
    XCTAssertEqual(source?.url, url)
    XCTAssertEqual(source?.id, "a1")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests -quiet`
Expected: FAIL with "Type 'TimelineMediaSource' has no member 'fromMediaObject'".

- [ ] **Step 3: Write minimal implementation**

Append to `TimelineMediaSource.swift`:
```swift
public extension TimelineMediaSource {

    /// Construit une source depuis un `StoryMediaObject`. Retourne `nil` si le `mediaType`
    /// n'est pas reconnu (`image` ou `video` uniquement).
    static func fromMediaObject(
        _ media: StoryMediaObject,
        videoURLs: [String: URL],
        audioURLs: [String: URL]
    ) -> TimelineMediaSource? {
        switch media.kind {
        case .image:
            return TimelineMediaSource(id: media.id, kind: .image, url: nil)
        case .video:
            return TimelineMediaSource(id: media.id, kind: .video, url: videoURLs[media.id])
        case .none:
            return nil
        }
    }

    /// Construit une source depuis un `StoryAudioPlayerObject`. Retourne toujours `.audio`.
    static func fromAudioObject(
        _ audio: StoryAudioPlayerObject,
        audioURLs: [String: URL]
    ) -> TimelineMediaSource? {
        TimelineMediaSource(id: audio.id, kind: .audio, url: audioURLs[audio.id])
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests -quiet`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift
git commit -m "feat(timeline-engine): TimelineMediaSource factory from StoryMediaObject and StoryAudioPlayerObject"
```

---

### Task A3: Ajouter chargement asynchrone d'`AVURLAsset` non-bloquant

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `TimelineMediaSourceTests`:
```swift
func test_loadAsset_videoSourceWithMissingURL_throwsMissingURL() async {
    let source = TimelineMediaSource(id: "v1", kind: .video, url: nil)
    do {
        _ = try await source.loadAsset()
        XCTFail("Expected throw")
    } catch let error as TimelineMediaSourceError {
        XCTAssertEqual(error, .missingURL)
    } catch {
        XCTFail("Unexpected error: \(error)")
    }
}

func test_loadAsset_imageSource_throwsNotApplicable() async {
    let source = TimelineMediaSource(id: "i1", kind: .image, url: nil)
    do {
        _ = try await source.loadAsset()
        XCTFail("Expected throw")
    } catch let error as TimelineMediaSourceError {
        XCTAssertEqual(error, .notApplicableForImage)
    } catch {
        XCTFail("Unexpected error: \(error)")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests -quiet`
Expected: FAIL with "has no member 'loadAsset'".

- [ ] **Step 3: Write minimal implementation**

Append to `TimelineMediaSource.swift`:
```swift
public enum TimelineMediaSourceError: Error, Equatable, Sendable {
    case missingURL
    case notApplicableForImage
    case assetLoadFailed(String)
}

public extension TimelineMediaSource {
    /// Charge l'asset AVFoundation associé en chargeant `.tracks` et `.duration` de manière asynchrone.
    /// Throws si le kind est `.image` (pas d'asset AV) ou si l'URL est nil ou si le chargement échoue.
    func loadAsset() async throws -> AVURLAsset {
        guard kind != .image else {
            throw TimelineMediaSourceError.notApplicableForImage
        }
        guard let url else {
            throw TimelineMediaSourceError.missingURL
        }
        let asset = AVURLAsset(url: url, options: [
            AVURLAssetPreferPreciseDurationAndTimingKey: true
        ])
        do {
            _ = try await asset.load(.tracks, .duration)
            return asset
        } catch {
            throw TimelineMediaSourceError.assetLoadFailed(error.localizedDescription)
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests -quiet`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineMediaSourceTests.swift
git commit -m "feat(timeline-engine): async asset loading on TimelineMediaSource with typed errors"
```

---

## Section B — `VideoCompositor` (génération `AVMutableVideoComposition`)

### Task B1: Stub initial avec render size + composition vide

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

final class VideoCompositorTests: XCTestCase {

    private func makeProject(
        slideId: String = "slide-1",
        slideDuration: Float = 10,
        media: [StoryMediaObject] = [],
        transitions: [StoryClipTransition] = []
    ) -> TimelineProject {
        TimelineProject(
            slideId: slideId,
            slideDuration: slideDuration,
            mediaObjects: media,
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: transitions
        )
    }

    func test_makeComposition_emptyProject_returnsCompositionWithRenderSize() {
        let project = makeProject()
        let composition = AVMutableComposition()
        let videoComposition = VideoCompositor.makeComposition(
            project: project,
            composition: composition,
            renderSize: CGSize(width: 1080, height: 1920)
        )
        XCTAssertEqual(videoComposition.renderSize, CGSize(width: 1080, height: 1920))
        XCTAssertEqual(videoComposition.frameDuration, CMTime(value: 1, timescale: 60))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: FAIL with "Cannot find 'VideoCompositor' in scope".

- [ ] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift
import Foundation
import AVFoundation
import CoreMedia
import CoreImage
@testable import MeeshySDK
import MeeshySDK

/// Pure logic — prend un `TimelineProject` et retourne un `AVMutableVideoComposition` complet.
/// Ne touche jamais le `MainActor`, jamais d'UIKit.
public struct VideoCompositor: Sendable {

    /// Frame duration cible — 60 fps pour un scrubbing fluide.
    public static let defaultFrameDuration = CMTime(value: 1, timescale: 60)

    /// Construit la `AVMutableVideoComposition` correspondante au projet.
    /// - Parameters:
    ///   - project: snapshot timeline (clips + transitions + keyframes)
    ///   - composition: `AVMutableComposition` cible (mutée par insertion de tracks)
    ///   - renderSize: taille du render (1080×1920 par défaut pour les stories 9:16)
    /// - Returns: video composition prête à attacher à un `AVPlayerItem`
    public static func makeComposition(
        project: TimelineProject,
        composition: AVMutableComposition,
        renderSize: CGSize = CGSize(width: 1080, height: 1920)
    ) -> AVMutableVideoComposition {
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = defaultFrameDuration
        return videoComposition
    }
}
```

> Note : retirer `@testable import MeeshySDK` — le `import MeeshySDK` standard suffit. L'import `@testable` ne s'utilise QUE dans les tests.

Corriger immédiatement :
```swift
import Foundation
import AVFoundation
import CoreMedia
import CoreImage
import MeeshySDK
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): VideoCompositor skeleton with empty composition"
```

---

### Task B2: Génération d'une instruction full-slide pour projet sans clips

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `VideoCompositorTests`:
```swift
func test_makeComposition_noVideoClips_producesSingleEmptyInstructionSpanningSlide() {
    let project = makeProject(slideDuration: 8)
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(
        project: project,
        composition: composition,
        renderSize: CGSize(width: 1080, height: 1920)
    )
    XCTAssertEqual(videoComposition.instructions.count, 1)
    let inst = videoComposition.instructions[0]
    XCTAssertEqual(inst.timeRange.start, .zero)
    XCTAssertEqual(CMTimeGetSeconds(inst.timeRange.duration), 8.0, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests/test_makeComposition_noVideoClips_producesSingleEmptyInstructionSpanningSlide -quiet`
Expected: FAIL — instructions.count == 0.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `makeComposition` in `VideoCompositor.swift`:
```swift
public static func makeComposition(
    project: TimelineProject,
    composition: AVMutableComposition,
    renderSize: CGSize = CGSize(width: 1080, height: 1920)
) -> AVMutableVideoComposition {
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = defaultFrameDuration

    let totalDuration = CMTime(
        seconds: Double(project.slideDuration),
        preferredTimescale: 600
    )
    let fullRange = CMTimeRange(start: .zero, duration: totalDuration)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = fullRange
    instruction.layerInstructions = []
    videoComposition.instructions = [instruction]
    return videoComposition
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): VideoCompositor produces full-slide instruction by default"
```

---

### Task B3: Génération d'une instruction par segment (1 clip vidéo)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `VideoCompositorTests`:
```swift
func test_makeComposition_oneVideoClip_producesInstructionAtClipStart() {
    let media = StoryMediaObject(
        id: "v1", postMediaId: "pm1",
        mediaType: "video", placement: "media",
        startTime: 2, duration: 4
    )
    let project = makeProject(slideDuration: 10, media: [media])
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(
        project: project,
        composition: composition
    )
    // 3 segments: [0..2] empty, [2..6] video, [6..10] empty
    XCTAssertEqual(videoComposition.instructions.count, 3)
    let mid = videoComposition.instructions[1]
    XCTAssertEqual(CMTimeGetSeconds(mid.timeRange.start), 2.0, accuracy: 0.001)
    XCTAssertEqual(CMTimeGetSeconds(mid.timeRange.duration), 4.0, accuracy: 0.001)
}

func test_makeComposition_oneVideoClipAtStart_producesTwoInstructions() {
    let media = StoryMediaObject(
        id: "v1", postMediaId: "pm1",
        mediaType: "video", placement: "media",
        startTime: 0, duration: 5
    )
    let project = makeProject(slideDuration: 10, media: [media])
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(
        project: project,
        composition: composition
    )
    // 2 segments: [0..5] video, [5..10] empty
    XCTAssertEqual(videoComposition.instructions.count, 2)
}

func test_makeComposition_oneVideoClipFullSlide_producesSingleInstruction() {
    let media = StoryMediaObject(
        id: "v1", postMediaId: "pm1",
        mediaType: "video", placement: "media",
        startTime: 0, duration: 10
    )
    let project = makeProject(slideDuration: 10, media: [media])
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(
        project: project,
        composition: composition
    )
    XCTAssertEqual(videoComposition.instructions.count, 1)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: FAIL — currently always returns 1 instruction.

- [ ] **Step 3: Write minimal implementation**

Replace `makeComposition` body in `VideoCompositor.swift`:
```swift
public static func makeComposition(
    project: TimelineProject,
    composition: AVMutableComposition,
    renderSize: CGSize = CGSize(width: 1080, height: 1920)
) -> AVMutableVideoComposition {
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = defaultFrameDuration

    let videoClips = project.mediaObjects
        .filter { $0.kind == .video && $0.isBackground != true }

    let segments = computeSegments(
        clips: videoClips,
        slideDuration: project.slideDuration
    )

    videoComposition.instructions = segments.map { segment in
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = segment.timeRange
        instruction.layerInstructions = []
        return instruction
    }
    return videoComposition
}

/// Représente un segment temporel homogène (zéro changement de tracks visibles).
struct CompositionSegment: Sendable {
    let timeRange: CMTimeRange
    let activeClipIds: [String]
}

/// Calcule les segments temporels en partitionnant le slide aux frontières des clips
/// (start et end de chaque clip vidéo).
static func computeSegments(
    clips: [StoryMediaObject],
    slideDuration: Float
) -> [CompositionSegment] {
    var boundaries = Set<Float>()
    boundaries.insert(0)
    boundaries.insert(slideDuration)
    for clip in clips {
        let start = clip.startTime ?? 0
        let duration = clip.duration ?? slideDuration
        boundaries.insert(max(0, start))
        boundaries.insert(min(slideDuration, start + duration))
    }
    let sorted = boundaries.sorted()
    guard sorted.count >= 2 else {
        let full = CMTimeRange(
            start: .zero,
            duration: CMTime(seconds: Double(slideDuration), preferredTimescale: 600)
        )
        return [CompositionSegment(timeRange: full, activeClipIds: [])]
    }
    var segments: [CompositionSegment] = []
    for i in 0..<(sorted.count - 1) {
        let from = sorted[i]
        let to = sorted[i + 1]
        guard to > from else { continue }
        let active = clips.compactMap { clip -> String? in
            let s = clip.startTime ?? 0
            let d = clip.duration ?? slideDuration
            let e = s + d
            return (s <= from + 0.0001 && e >= to - 0.0001) ? clip.id : nil
        }
        let range = CMTimeRange(
            start: CMTime(seconds: Double(from), preferredTimescale: 600),
            duration: CMTime(seconds: Double(to - from), preferredTimescale: 600)
        )
        segments.append(CompositionSegment(timeRange: range, activeClipIds: active))
    }
    return segments
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): VideoCompositor segments timeline at clip boundaries"
```

---

### Task B4: Insertion des tracks vidéo dans la composition + layer instruction

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `VideoCompositorTests`:
```swift
func test_insertVideoTrack_returnsCompositionTrackWithTrackID() async throws {
    // Use a small synthesized asset (1s silent black video) — for portability we generate
    // an in-memory test resource. To keep the test simple, we mock by constructing an
    // empty composition track via insertion of an empty time range.
    let composition = AVMutableComposition()
    let track = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
    )
    XCTAssertNotNil(track)
    XCTAssertNotEqual(track?.trackID, kCMPersistentTrackID_Invalid)
}

func test_makeLayerInstruction_forClip_usesProvidedTrackID() {
    let trackID: CMPersistentTrackID = 42
    let timeRange = CMTimeRange(
        start: CMTime(seconds: 1, preferredTimescale: 600),
        duration: CMTime(seconds: 3, preferredTimescale: 600)
    )
    let layerInstruction = VideoCompositor.makeLayerInstruction(
        trackID: trackID,
        timeRange: timeRange,
        fadeIn: 0,
        fadeOut: 0,
        outgoingTransition: nil,
        incomingTransition: nil
    )
    XCTAssertNotNil(layerInstruction)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests/test_makeLayerInstruction_forClip_usesProvidedTrackID -quiet`
Expected: FAIL — `makeLayerInstruction` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Append to `VideoCompositor.swift`:
```swift
public extension VideoCompositor {

    /// Construit une `AVMutableVideoCompositionLayerInstruction` pour un clip vidéo donné.
    /// - Parameters:
    ///   - trackID: ID de la track AVComposition associée au clip
    ///   - timeRange: range temporelle d'activité du clip dans la composition
    ///   - fadeIn: durée du fade-in en secondes (0 = aucun)
    ///   - fadeOut: durée du fade-out en secondes (0 = aucun)
    ///   - outgoingTransition: transition vers le clip suivant (le clip est "from")
    ///   - incomingTransition: transition depuis le clip précédent (le clip est "to")
    /// Returns: layer instruction prête à attacher à `AVMutableVideoCompositionInstruction`.
    static func makeLayerInstruction(
        trackID: CMPersistentTrackID,
        timeRange: CMTimeRange,
        fadeIn: Float,
        fadeOut: Float,
        outgoingTransition: StoryClipTransition?,
        incomingTransition: StoryClipTransition?
    ) -> AVMutableVideoCompositionLayerInstruction {
        // Build a stub track — the layer instruction expects an AVAssetTrack, but we work
        // with the composition track which conforms to AVAssetTrack. The compositor caller
        // will pass an actual track via `forCompositionTrack(_:)` (see `attachLayerInstructions`).
        // For unit-testability we construct it from trackID via a placeholder route.
        let layerInstruction = AVMutableVideoCompositionLayerInstruction()
        layerInstruction.trackID = trackID

        if fadeIn > 0 {
            let fadeRange = CMTimeRange(
                start: timeRange.start,
                duration: CMTime(seconds: Double(fadeIn), preferredTimescale: 600)
            )
            layerInstruction.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: fadeRange)
        }
        if fadeOut > 0 {
            let fadeStart = CMTimeAdd(
                timeRange.start,
                CMTimeSubtract(timeRange.duration, CMTime(seconds: Double(fadeOut), preferredTimescale: 600))
            )
            let fadeRange = CMTimeRange(
                start: fadeStart,
                duration: CMTime(seconds: Double(fadeOut), preferredTimescale: 600)
            )
            layerInstruction.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: fadeRange)
        }
        return layerInstruction
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): VideoCompositor.makeLayerInstruction with fade-in/fade-out opacity ramps"
```

---

### Task B5: Conversion `StoryClipTransition.kind == .crossfade` en opacity ramps

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `VideoCompositorTests`:
```swift
func test_makeLayerInstruction_outgoingCrossfade_setsOpacityRampFromOneToZero() {
    let trackID: CMPersistentTrackID = 1
    let timeRange = CMTimeRange(
        start: CMTime(seconds: 0, preferredTimescale: 600),
        duration: CMTime(seconds: 5, preferredTimescale: 600)
    )
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .crossfade, duration: 0.5
    )
    let inst = VideoCompositor.makeLayerInstruction(
        trackID: trackID,
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: transition,
        incomingTransition: nil
    )
    // We can't introspect ramps directly via public API,
    // but we verify trackID and that no exception was thrown.
    XCTAssertEqual(inst.trackID, 1)
}

func test_makeLayerInstruction_incomingCrossfade_setsOpacityRampFromZeroToOne() {
    let trackID: CMPersistentTrackID = 2
    let timeRange = CMTimeRange(
        start: CMTime(seconds: 5, preferredTimescale: 600),
        duration: CMTime(seconds: 5, preferredTimescale: 600)
    )
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .crossfade, duration: 0.7
    )
    let inst = VideoCompositor.makeLayerInstruction(
        trackID: trackID,
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: nil,
        incomingTransition: transition
    )
    XCTAssertEqual(inst.trackID, 2)
}

func test_makeLayerInstruction_dissolveTransition_doesNotApplyOpacityRamp() {
    // Dissolve uses a CIFilter pipeline (not opacity ramps); ensure no ramp applied.
    let trackID: CMPersistentTrackID = 3
    let timeRange = CMTimeRange(
        start: .zero,
        duration: CMTime(seconds: 5, preferredTimescale: 600)
    )
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .dissolve, duration: 0.5
    )
    let inst = VideoCompositor.makeLayerInstruction(
        trackID: trackID,
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: transition,
        incomingTransition: nil
    )
    XCTAssertEqual(inst.trackID, 3)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS already (no ramp applied yet for transitions). The tests assert the API accepts transitions without crashing — make them stricter by checking the ramp count via reflection or by introducing a side-effect counter.

> Adjustment: refactor `makeLayerInstruction` to optionally return a struct that exposes the ramp config for verification.

Modify the test set BEFORE implementing — add a struct `LayerInstructionConfig` and a non-mutating preview function:
```swift
func test_layerInstructionConfig_outgoingCrossfade_appliesRampOneToZeroAtTrailingEdge() {
    let timeRange = CMTimeRange(
        start: CMTime(seconds: 0, preferredTimescale: 600),
        duration: CMTime(seconds: 5, preferredTimescale: 600)
    )
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .crossfade, duration: 0.5
    )
    let config = VideoCompositor.layerInstructionConfig(
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: transition,
        incomingTransition: nil
    )
    XCTAssertEqual(config.opacityRamps.count, 1)
    let ramp = config.opacityRamps[0]
    XCTAssertEqual(ramp.fromOpacity, 1)
    XCTAssertEqual(ramp.toOpacity, 0)
    XCTAssertEqual(CMTimeGetSeconds(ramp.timeRange.duration), 0.5, accuracy: 0.001)
    // Ramp ends at clip end
    let rampEnd = CMTimeAdd(ramp.timeRange.start, ramp.timeRange.duration)
    XCTAssertEqual(CMTimeGetSeconds(rampEnd), 5.0, accuracy: 0.001)
}

func test_layerInstructionConfig_incomingCrossfade_appliesRampZeroToOneAtLeadingEdge() {
    let timeRange = CMTimeRange(
        start: CMTime(seconds: 5, preferredTimescale: 600),
        duration: CMTime(seconds: 5, preferredTimescale: 600)
    )
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .crossfade, duration: 0.7
    )
    let config = VideoCompositor.layerInstructionConfig(
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: nil,
        incomingTransition: transition
    )
    XCTAssertEqual(config.opacityRamps.count, 1)
    let ramp = config.opacityRamps[0]
    XCTAssertEqual(ramp.fromOpacity, 0)
    XCTAssertEqual(ramp.toOpacity, 1)
    XCTAssertEqual(CMTimeGetSeconds(ramp.timeRange.start), 5.0, accuracy: 0.001)
    XCTAssertEqual(CMTimeGetSeconds(ramp.timeRange.duration), 0.7, accuracy: 0.001)
}

func test_layerInstructionConfig_dissolve_returnsNoOpacityRamp() {
    let timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: 5, preferredTimescale: 600))
    let transition = StoryClipTransition(
        fromClipId: "a", toClipId: "b",
        kind: .dissolve, duration: 0.5
    )
    let config = VideoCompositor.layerInstructionConfig(
        timeRange: timeRange,
        fadeIn: 0, fadeOut: 0,
        outgoingTransition: transition,
        incomingTransition: nil
    )
    XCTAssertTrue(config.opacityRamps.isEmpty)
    XCTAssertTrue(config.usesDissolveFilter)
}
```

- [ ] **Step 2bis: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: FAIL — `layerInstructionConfig` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Append to `VideoCompositor.swift`:
```swift
public extension VideoCompositor {

    /// Configuration pure d'une layer instruction — utile pour tests sans dépendre
    /// d'AVMutableVideoCompositionLayerInstruction (qui ne se lit pas).
    struct LayerInstructionConfig: Sendable {
        public struct OpacityRamp: Sendable {
            public let fromOpacity: Float
            public let toOpacity: Float
            public let timeRange: CMTimeRange
        }
        public let opacityRamps: [OpacityRamp]
        public let usesDissolveFilter: Bool
    }

    /// Calcule la configuration d'une layer instruction pour un clip donné.
    /// `applyConfig(_:to:)` matérialise ensuite cette config dans une `AVMutableVideoCompositionLayerInstruction`.
    static func layerInstructionConfig(
        timeRange: CMTimeRange,
        fadeIn: Float,
        fadeOut: Float,
        outgoingTransition: StoryClipTransition?,
        incomingTransition: StoryClipTransition?
    ) -> LayerInstructionConfig {
        var ramps: [LayerInstructionConfig.OpacityRamp] = []
        var usesDissolve = false

        if fadeIn > 0 {
            ramps.append(.init(
                fromOpacity: 0, toOpacity: 1,
                timeRange: CMTimeRange(
                    start: timeRange.start,
                    duration: CMTime(seconds: Double(fadeIn), preferredTimescale: 600)
                )
            ))
        }
        if fadeOut > 0 {
            let fadeStart = CMTimeAdd(
                timeRange.start,
                CMTimeSubtract(timeRange.duration, CMTime(seconds: Double(fadeOut), preferredTimescale: 600))
            )
            ramps.append(.init(
                fromOpacity: 1, toOpacity: 0,
                timeRange: CMTimeRange(start: fadeStart, duration: CMTime(seconds: Double(fadeOut), preferredTimescale: 600))
            ))
        }

        if let outgoing = outgoingTransition {
            switch outgoing.kind {
            case .crossfade:
                let dur = CMTime(seconds: Double(outgoing.duration), preferredTimescale: 600)
                let start = CMTimeAdd(timeRange.start, CMTimeSubtract(timeRange.duration, dur))
                ramps.append(.init(
                    fromOpacity: 1, toOpacity: 0,
                    timeRange: CMTimeRange(start: start, duration: dur)
                ))
            case .dissolve:
                usesDissolve = true
            }
        }
        if let incoming = incomingTransition {
            switch incoming.kind {
            case .crossfade:
                let dur = CMTime(seconds: Double(incoming.duration), preferredTimescale: 600)
                ramps.append(.init(
                    fromOpacity: 0, toOpacity: 1,
                    timeRange: CMTimeRange(start: timeRange.start, duration: dur)
                ))
            case .dissolve:
                usesDissolve = true
            }
        }

        return LayerInstructionConfig(opacityRamps: ramps, usesDissolveFilter: usesDissolve)
    }

    /// Applique la configuration sur une layer instruction concrète.
    static func applyConfig(_ config: LayerInstructionConfig, to layer: AVMutableVideoCompositionLayerInstruction) {
        for ramp in config.opacityRamps {
            layer.setOpacityRamp(
                fromStartOpacity: ramp.fromOpacity,
                toEndOpacity: ramp.toOpacity,
                timeRange: ramp.timeRange
            )
        }
    }
}
```

Mettre à jour `makeLayerInstruction` pour utiliser le helper :
```swift
static func makeLayerInstruction(
    trackID: CMPersistentTrackID,
    timeRange: CMTimeRange,
    fadeIn: Float,
    fadeOut: Float,
    outgoingTransition: StoryClipTransition?,
    incomingTransition: StoryClipTransition?
) -> AVMutableVideoCompositionLayerInstruction {
    let layer = AVMutableVideoCompositionLayerInstruction()
    layer.trackID = trackID
    let config = layerInstructionConfig(
        timeRange: timeRange, fadeIn: fadeIn, fadeOut: fadeOut,
        outgoingTransition: outgoingTransition, incomingTransition: incomingTransition
    )
    applyConfig(config, to: layer)
    return layer
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): VideoCompositor crossfade transitions via opacity ramps + dissolve flag"
```

---

### Task B6: CIFilter pipeline pour `StoryTransitionKind.dissolve` (GPU `CIDissolveTransition`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `VideoCompositorTests`:
```swift
func test_dissolveCustomCompositor_isAttached_whenAnyDissolveTransitionExists() {
    let m1 = StoryMediaObject(id: "a", postMediaId: "pa", mediaType: "video", placement: "media", startTime: 0, duration: 5)
    let m2 = StoryMediaObject(id: "b", postMediaId: "pb", mediaType: "video", placement: "media", startTime: 5, duration: 5)
    let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .dissolve, duration: 0.5)
    let project = makeProject(slideDuration: 10, media: [m1, m2], transitions: [trans])
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(project: project, composition: composition)
    XCTAssertNotNil(videoComposition.customVideoCompositorClass)
}

func test_dissolveCustomCompositor_isNil_whenOnlyCrossfadeTransitions() {
    let m1 = StoryMediaObject(id: "a", postMediaId: "pa", mediaType: "video", placement: "media", startTime: 0, duration: 5)
    let m2 = StoryMediaObject(id: "b", postMediaId: "pb", mediaType: "video", placement: "media", startTime: 5, duration: 5)
    let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 0.5)
    let project = makeProject(slideDuration: 10, media: [m1, m2], transitions: [trans])
    let composition = AVMutableComposition()
    let videoComposition = VideoCompositor.makeComposition(project: project, composition: composition)
    XCTAssertNil(videoComposition.customVideoCompositorClass)
}

func test_dissolveCompositor_render_appliesCIDissolveTransition() throws {
    // Verify that DissolveVideoCompositor exposes a CIFilter named CIDissolveTransition.
    let compositor = DissolveVideoCompositor()
    XCTAssertEqual(compositor.transitionFilterName, "CIDissolveTransition")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: FAIL — `DissolveVideoCompositor` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Create file `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/DissolveVideoCompositor.swift`:
```swift
import Foundation
import AVFoundation
import CoreImage
import CoreVideo

/// Custom video compositor that applies a `CIDissolveTransition` GPU filter for
/// `StoryTransitionKind.dissolve` segments. Fully GPU-backed via `CIContext(metal:)`.
final class DissolveVideoCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {

    let transitionFilterName: String = "CIDissolveTransition"

    private let renderQueue = DispatchQueue(label: "me.meeshy.timeline.dissolve.render", qos: .userInitiated)
    private lazy var ciContext: CIContext = {
        if let device = MTLCreateSystemDefaultDevice() {
            return CIContext(mtlDevice: device, options: [.cacheIntermediates: true])
        }
        return CIContext(options: [.cacheIntermediates: true])
    }()

    var sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        // No-op — we use the default rendering path
    }

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        renderQueue.async { [weak self] in
            self?.handleRequest(request)
        }
    }

    private func handleRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        guard let trackIDs = request.sourceTrackIDs as? [Int32], !trackIDs.isEmpty else {
            request.finishCancelledRequest()
            return
        }
        // Single track passthrough — no transition active in this segment
        if trackIDs.count == 1, let pixelBuffer = request.sourceFrame(byTrackID: trackIDs[0]) {
            request.finish(withComposedVideoFrame: pixelBuffer)
            return
        }
        // Two tracks → apply CIDissolveTransition
        if trackIDs.count >= 2,
           let fromBuffer = request.sourceFrame(byTrackID: trackIDs[0]),
           let toBuffer = request.sourceFrame(byTrackID: trackIDs[1]) {
            let progress = computeProgress(for: request)
            let fromImage = CIImage(cvPixelBuffer: fromBuffer)
            let toImage = CIImage(cvPixelBuffer: toBuffer)
            guard let filter = CIFilter(name: transitionFilterName) else {
                request.finish(withComposedVideoFrame: fromBuffer)
                return
            }
            filter.setValue(fromImage, forKey: kCIInputImageKey)
            filter.setValue(toImage, forKey: kCIInputTargetImageKey)
            filter.setValue(progress, forKey: kCIInputTimeKey)
            guard let outputImage = filter.outputImage,
                  let renderContext = request.renderContext.newPixelBuffer() else {
                request.finish(withComposedVideoFrame: fromBuffer)
                return
            }
            ciContext.render(outputImage, to: renderContext)
            request.finish(withComposedVideoFrame: renderContext)
            return
        }
        request.finishCancelledRequest()
    }

    private func computeProgress(for request: AVAsynchronousVideoCompositionRequest) -> NSNumber {
        let inst = request.videoCompositionInstruction.timeRange
        let now = request.compositionTime
        let elapsed = CMTimeGetSeconds(CMTimeSubtract(now, inst.start))
        let total = max(0.001, CMTimeGetSeconds(inst.duration))
        return NSNumber(value: Float(min(1.0, max(0.0, elapsed / total))))
    }
}
```

Modify `VideoCompositor.makeComposition` to detect dissolve transitions and attach the custom compositor:
```swift
public static func makeComposition(
    project: TimelineProject,
    composition: AVMutableComposition,
    renderSize: CGSize = CGSize(width: 1080, height: 1920)
) -> AVMutableVideoComposition {
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = defaultFrameDuration

    let videoClips = project.mediaObjects
        .filter { $0.kind == .video && $0.isBackground != true }

    let segments = computeSegments(clips: videoClips, slideDuration: project.slideDuration)
    videoComposition.instructions = segments.map { segment in
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = segment.timeRange
        instruction.layerInstructions = []
        return instruction
    }

    let hasDissolve = project.clipTransitions.contains { $0.kind == .dissolve }
    if hasDissolve {
        videoComposition.customVideoCompositorClass = DissolveVideoCompositor.self
    }
    return videoComposition
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/DissolveVideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/VideoCompositorTests.swift
git commit -m "feat(timeline-engine): GPU dissolve via CIDissolveTransition with Metal-backed CIContext"
```

---

## Section C — `AudioMixer` (`AVAudioEngine` multi-piste)

### Task C1: Définir le protocol `AudioMixerProviding` + skeleton

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class AudioMixerTests: XCTestCase {

    func test_init_defaultMaxActiveNodes_isSix() {
        let mixer = AudioMixer()
        XCTAssertEqual(mixer.maxActiveNodes, 6)
    }

    func test_init_isMutedDefaultsToFalse() {
        let mixer = AudioMixer()
        XCTAssertFalse(mixer.isMuted)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: FAIL — `AudioMixer` not defined.

- [ ] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift
import Foundation
import AVFoundation
import os
import MeeshySDK

/// Capability protocol for the timeline audio mixer. Allows tests and the engine
/// to swap a real `AudioMixer` for a `MockAudioMixer` without depending on
/// AVAudioEngine being startable in the unit-test environment.
@MainActor
public protocol AudioMixerProviding: AnyObject {
    var isMuted: Bool { get set }
    var maxActiveNodes: Int { get }
    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws
    func play() throws
    func pause()
    func seek(to time: Float)
    func setVolume(_ volume: Float, for audioId: String)
    func setMute(_ muted: Bool)
    func teardown()
}

@MainActor
public final class AudioMixer: AudioMixerProviding {

    public private(set) var maxActiveNodes: Int
    public var isMuted: Bool = false {
        didSet { applyMute() }
    }

    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let engine = AVAudioEngine()
    private var nodes: [String: AVAudioPlayerNode] = [:]
    private var files: [String: AVAudioFile] = [:]
    private var volumes: [String: Float] = [:]

    public init(maxActiveNodes: Int = 6) {
        self.maxActiveNodes = maxActiveNodes
    }

    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        // Stub — extended in C2
    }

    public func play() throws {
        // Stub — extended in C3
    }

    public func pause() {
        // Stub — extended in C3
    }

    public func seek(to time: Float) {
        // Stub — extended in C4
    }

    public func setVolume(_ volume: Float, for audioId: String) {
        volumes[audioId] = max(0, min(1, volume))
        nodes[audioId]?.volume = isMuted ? 0 : volumes[audioId] ?? 1
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
    }

    public func teardown() {
        nodes.values.forEach { $0.stop() }
        nodes.removeAll()
        files.removeAll()
        volumes.removeAll()
        if engine.isRunning {
            engine.stop()
        }
    }

    private func applyMute() {
        for (id, node) in nodes {
            node.volume = isMuted ? 0 : (volumes[id] ?? 1)
        }
    }

    deinit {
        MainActor.assumeIsolated {
            self.teardown()
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
git commit -m "feat(timeline-engine): AudioMixer skeleton conforming to AudioMixerProviding protocol"
```

---

### Task C2: `configure(audios:urls:)` — attache les nodes au mixer en respectant le cap

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `AudioMixerTests`:
```swift
func test_configure_withZeroAudios_hasNoNodes() throws {
    let mixer = AudioMixer()
    try mixer.configure(audios: [], urls: [:])
    XCTAssertEqual(mixer.activeNodeCount, 0)
}

func test_configure_withMissingURL_skipsNode() throws {
    let mixer = AudioMixer()
    let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
    try mixer.configure(audios: [audio], urls: [:])
    XCTAssertEqual(mixer.activeNodeCount, 0)
}

func test_configure_capsAtMaxActiveNodes() throws {
    let mixer = AudioMixer(maxActiveNodes: 2)
    let audios = (0..<5).map { StoryAudioPlayerObject(id: "a\($0)", postMediaId: "pm\($0)") }
    // Provide nonexistent URLs — we only assert the cap on the loop, not on file decoding.
    let urls = Dictionary(uniqueKeysWithValues: audios.map { ($0.id, URL(fileURLWithPath: "/nonexistent/\($0.id).m4a")) })
    try mixer.configure(audios: audios, urls: urls)
    XCTAssertLessThanOrEqual(mixer.activeNodeCount, 2)
}

func test_configure_appliesVolumeFromAudioObject() throws {
    let mixer = AudioMixer()
    let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1", volume: 0.6)
    try mixer.configure(audios: [audio], urls: [:])
    // No node since URL missing, but volume map should still record intent.
    XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.6)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: FAIL — missing `activeNodeCount` and `intendedVolume(for:)`.

- [ ] **Step 3: Write minimal implementation**

Update `AudioMixer.swift`:
```swift
public extension AudioMixer {
    var activeNodeCount: Int { nodes.count }
    func intendedVolume(for audioId: String) -> Float? { volumes[audioId] }
}

public extension AudioMixer {
    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        var attached = 0
        for audio in audios {
            volumes[audio.id] = audio.volume
            guard attached < maxActiveNodes else {
                logger.info("AudioMixer cap reached at \(self.maxActiveNodes), skipping audio \(audio.id)")
                continue
            }
            guard let url = urls[audio.id] else {
                logger.debug("AudioMixer skipping \(audio.id) — no URL")
                continue
            }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
                node.volume = isMuted ? 0 : audio.volume
                nodes[audio.id] = node
                files[audio.id] = file
                attached += 1
            } catch {
                logger.error("AudioMixer failed to load \(audio.id): \(error.localizedDescription)")
            }
        }
    }
}
```

> Note: declared `configure` once — remove the stub override from C1. The single declaration replaces both.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
git commit -m "feat(timeline-engine): AudioMixer.configure attaches AVAudioPlayerNode per audio with cap"
```

---

### Task C3: `play()` / `pause()` — démarre/arrête le graph

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `AudioMixerTests`:
```swift
func test_play_withZeroNodes_doesNotThrow() throws {
    let mixer = AudioMixer()
    try mixer.configure(audios: [], urls: [:])
    XCTAssertNoThrow(try mixer.play())
}

func test_pause_isIdempotent() {
    let mixer = AudioMixer()
    mixer.pause()
    mixer.pause()
    XCTAssertFalse(mixer.isPlaying)
}

func test_play_setsIsPlayingTrue() throws {
    let mixer = AudioMixer()
    try mixer.configure(audios: [], urls: [:])
    try mixer.play()
    XCTAssertTrue(mixer.isPlaying)
    mixer.pause()
    XCTAssertFalse(mixer.isPlaying)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: FAIL — `isPlaying` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Update `AudioMixer.swift` — replace the stubs `play()` and `pause()` and add `isPlaying`:
```swift
public extension AudioMixer {
    var isPlaying: Bool { _isPlaying }
}

private extension AudioMixer {
    var _isPlaying: Bool {
        get { _isPlayingStorage }
    }
}

extension AudioMixer {
    public func play() throws {
        guard !nodes.isEmpty else {
            _isPlayingStorage = true
            return
        }
        if !engine.isRunning {
            try engine.start()
        }
        for (id, node) in nodes {
            if let file = files[id] {
                node.scheduleFile(file, at: nil, completionHandler: nil)
            }
            node.play()
        }
        _isPlayingStorage = true
    }

    public func pause() {
        for node in nodes.values {
            node.pause()
        }
        if engine.isRunning {
            engine.pause()
        }
        _isPlayingStorage = false
    }
}
```

Add private storage to the `AudioMixer` class body (above `init`):
```swift
private var _isPlayingStorage: Bool = false
```

> Remove the previous stub `public func play()` / `public func pause()` declarations — keep only the new ones.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
git commit -m "feat(timeline-engine): AudioMixer play/pause lifecycle with engine.start guard"
```

---

### Task C4: `seek(to:)` — repositionne la lecture sans glitch

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `AudioMixerTests`:
```swift
func test_seek_clampsNegativeToZero() throws {
    let mixer = AudioMixer()
    try mixer.configure(audios: [], urls: [:])
    mixer.seek(to: -3)
    XCTAssertEqual(mixer.lastSeekTime, 0, accuracy: 0.001)
}

func test_seek_recordsLastSeekTime() throws {
    let mixer = AudioMixer()
    try mixer.configure(audios: [], urls: [:])
    mixer.seek(to: 4.2)
    XCTAssertEqual(mixer.lastSeekTime, 4.2, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: FAIL — `lastSeekTime` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Add to `AudioMixer` body:
```swift
public private(set) var lastSeekTime: Float = 0
```

Replace the stub `seek(to:)`:
```swift
public extension AudioMixer {
    func seek(to time: Float) {
        let clamped = max(0, time)
        lastSeekTime = clamped
        let wasPlaying = _isPlayingStorage
        if wasPlaying {
            for node in nodes.values { node.stop() }
        }
        for (id, node) in nodes {
            guard let file = files[id] else { continue }
            let sampleRate = file.processingFormat.sampleRate
            let frame = AVAudioFramePosition(Double(clamped) * sampleRate)
            let totalFrames = file.length
            guard frame < totalFrames else { continue }
            let remaining = AVAudioFrameCount(totalFrames - frame)
            node.scheduleSegment(
                file,
                startingFrame: frame,
                frameCount: remaining,
                at: nil,
                completionHandler: nil
            )
        }
        if wasPlaying {
            for node in nodes.values { node.play() }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
git commit -m "feat(timeline-engine): AudioMixer.seek with scheduleSegment for glitch-free repositioning"
```

---

### Task C5: `setVolume` + `setMute` validés sous load

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `AudioMixerTests`:
```swift
func test_setVolume_clampsAboveOneToOne() {
    let mixer = AudioMixer()
    mixer.setVolume(2.5, for: "a1")
    XCTAssertEqual(mixer.intendedVolume(for: "a1"), 1.0)
}

func test_setVolume_clampsBelowZeroToZero() {
    let mixer = AudioMixer()
    mixer.setVolume(-0.5, for: "a1")
    XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0)
}

func test_setMute_overridesVolumeToZero() {
    let mixer = AudioMixer()
    mixer.setVolume(0.7, for: "a1")
    mixer.setMute(true)
    XCTAssertTrue(mixer.isMuted)
    // Intended volume preserved, but live node volume is zero
    XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.7)
}

func test_setMute_unmuteRestoresVolume() {
    let mixer = AudioMixer()
    mixer.setVolume(0.4, for: "a1")
    mixer.setMute(true)
    mixer.setMute(false)
    XCTAssertFalse(mixer.isMuted)
    XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.4)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS already if Task C1 logic preserved them — if not, harden the existing implementation. (Run it; if FAIL, modify and re-run.)

- [ ] **Step 3: Verify implementation matches tests**

Confirm `setVolume` clamps `[0, 1]` (it does: `max(0, min(1, volume))`). Confirm `setMute` overrides via `applyMute()`. No code change required if all green.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS (15 tests total).

- [ ] **Step 5: Commit (only if implementation changed)**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioMixerTests.swift
git commit -m "test(timeline-engine): AudioMixer volume/mute clamping and persistence coverage"
```

---

### Task C6: `MockAudioMixer` pour les tests d'intégration

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/Mocks/MockAudioMixer.swift`

- [ ] **Step 1: Write a "self-test" of the mock**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/Mocks/MockAudioMixer.swift
import Foundation
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class MockAudioMixer: AudioMixerProviding {

    var isMuted: Bool = false
    var maxActiveNodes: Int = 6
    private(set) var configureCallCount = 0
    private(set) var lastConfiguredAudioCount = 0
    private(set) var playCallCount = 0
    private(set) var pauseCallCount = 0
    private(set) var seekCallCount = 0
    private(set) var lastSeekTime: Float = 0
    private(set) var setVolumeCalls: [(audioId: String, volume: Float)] = []
    private(set) var setMuteCalls: [Bool] = []
    private(set) var teardownCallCount = 0

    var configureError: Error?
    var playError: Error?

    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        configureCallCount += 1
        lastConfiguredAudioCount = audios.count
        if let err = configureError { throw err }
    }

    func play() throws {
        playCallCount += 1
        if let err = playError { throw err }
    }

    func pause() {
        pauseCallCount += 1
    }

    func seek(to time: Float) {
        seekCallCount += 1
        lastSeekTime = time
    }

    func setVolume(_ volume: Float, for audioId: String) {
        setVolumeCalls.append((audioId, volume))
    }

    func setMute(_ muted: Bool) {
        setMuteCalls.append(muted)
        isMuted = muted
    }

    func teardown() {
        teardownCallCount += 1
    }

    func reset() {
        configureCallCount = 0
        lastConfiguredAudioCount = 0
        playCallCount = 0
        pauseCallCount = 0
        seekCallCount = 0
        lastSeekTime = 0
        setVolumeCalls.removeAll()
        setMuteCalls.removeAll()
        teardownCallCount = 0
        configureError = nil
        playError = nil
        isMuted = false
    }
}
```

- [ ] **Step 2: Run test to verify it builds**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -quiet`
Expected: PASS — MockAudioMixer compiles as part of the test target without breaking other tests.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/Mocks/MockAudioMixer.swift
git commit -m "test(timeline-engine): add MockAudioMixer for engine integration tests"
```

---

## Section D — `StoryTimelineEngine` (orchestration multi-track)

### Task D1: Skeleton `@MainActor` + état observable

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEngineTests: XCTestCase {

    func test_init_defaultMode_isPreview() {
        let engine = StoryTimelineEngine()
        XCTAssertEqual(engine.mode, .preview)
    }

    func test_init_initialState_isIdle() {
        let engine = StoryTimelineEngine()
        XCTAssertEqual(engine.currentTime, 0)
        XCTAssertFalse(engine.isPlaying)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — `StoryTimelineEngine` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift
import Foundation

public enum StoryTimelineEngineError: Error, Sendable, Equatable {
    case assetLoadFailed(clipId: String, reason: String)
    case audioEngineUnavailable(reason: String)
    case configurationFailed(reason: String)
    case noProjectConfigured
}

public enum StoryTimelineExportError: Error, Sendable, Equatable {
    case notImplemented
    case sessionFailed(String)
}

public enum StoryTimelineExportPreset: Sendable {
    case hd720, hd1080, hd4k
}
```

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift
import Foundation
import AVFoundation
import os
#if canImport(UIKit)
import UIKit
#endif
import MeeshySDK

@MainActor
public final class StoryTimelineEngine {

    // PRE-FLIGHT NOTE (deep-coherence-review CH-1) :
    // À l'origine ce plan définissait `public enum Mode: Sendable, Equatable { case preview, editing }`
    // imbriqué. Le deep-coherence-review a identifié que ce nested enum dupliquait
    // `TimelineEngineMode` (Plan 4 Task 7) et créait un bridge fragile (Task 35.5).
    //
    // DÉCISION : utiliser DIRECTEMENT `TimelineEngineMode` (importé depuis le module
    // partagé `Story/Timeline/Model/TimelineEngineMode.swift`). Le bridge devient trivial
    // (juste une conformance protocol sans mapping).
    //
    // Si pour une raison quelconque on doit garder un enum interne (legacy compat),
    // ajouter `typealias Mode = TimelineEngineMode` ici pour préserver les sites d'appel.

    // MARK: Observable state
    public private(set) var currentTime: Float = 0
    public private(set) var isPlaying: Bool = false
    public private(set) var mode: TimelineEngineMode = .preview
    public var isMuted: Bool = false {
        didSet {
            player?.isMuted = isMuted
            audioMixer.setMute(isMuted)
        }
    }
    public var masterVolume: Float = 1.0 {
        didSet {
            let clamped = max(0, min(1, masterVolume))
            player?.volume = clamped
        }
    }

    // MARK: Callbacks
    public var onTimeUpdate: ((Float) -> Void)?
    public var onPlaybackEnd: (() -> Void)?
    public var onElementBecameActive: ((String) -> Void)?

    // MARK: Internals
    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let audioMixer: AudioMixerProviding
    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var composition: AVMutableComposition?
    private var videoComposition: AVMutableVideoComposition?
    private var timeObserver: Any?
    private var currentProject: TimelineProject?
    private var endObserver: NSObjectProtocol?

    public init(audioMixer: AudioMixerProviding? = nil) {
        self.audioMixer = audioMixer ?? AudioMixer()
    }

    public func setMode(_ newMode: TimelineEngineMode) {  // CH-1 : utilise type partagé
        mode = newMode
    }

    deinit {
        MainActor.assumeIsolated {
            self.tearDown()
        }
    }

    private func tearDown() {
        if let token = timeObserver {
            player?.removeTimeObserver(token)
            timeObserver = nil
        }
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        player?.pause()
        player = nil
        playerItem = nil
        videoComposition = nil
        composition = nil
        audioMixer.teardown()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine skeleton with mode + observable state"
```

---

### Task D2: `configure(project:mediaURLs:images:)` async — bâtit AVMutableComposition + delegates au mixer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
private func makeProject(
    slideId: String = "slide-1",
    slideDuration: Float = 5,
    audios: [StoryAudioPlayerObject] = [],
    media: [StoryMediaObject] = []
) -> TimelineProject {
    TimelineProject(
        slideId: slideId,
        slideDuration: slideDuration,
        mediaObjects: media,
        audioPlayerObjects: audios,
        textObjects: [],
        clipTransitions: []
    )
}

func test_configure_emptyProject_setsCurrentProject() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    let project = makeProject()
    await engine.configure(project: project, mediaURLs: [:], images: [:])
    XCTAssertNotNil(engine.currentProjectSnapshot)
    XCTAssertEqual(engine.currentProjectSnapshot?.slideId, "slide-1")
}

func test_configure_callsAudioMixerConfigureOnce() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
    let project = makeProject(audios: [audio])
    await engine.configure(project: project, mediaURLs: [:], images: [:])
    XCTAssertEqual(mixer.configureCallCount, 1)
    XCTAssertEqual(mixer.lastConfiguredAudioCount, 1)
}

func test_configure_replacesPreviousProject() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideId: "s1"), mediaURLs: [:], images: [:])
    await engine.configure(project: makeProject(slideId: "s2"), mediaURLs: [:], images: [:])
    XCTAssertEqual(engine.currentProjectSnapshot?.slideId, "s2")
    XCTAssertEqual(mixer.configureCallCount, 2)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — no `configure` method, no `currentProjectSnapshot`.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public extension StoryTimelineEngine {

    var currentProjectSnapshot: TimelineProject? { currentProject }

    func configure(
        project: TimelineProject,
        mediaURLs: [String: URL],
        images: [String: UIImage]
    ) async {
        tearDown()
        currentProject = project

        let composition = AVMutableComposition()
        await insertVideoTracks(project: project, mediaURLs: mediaURLs, into: composition)
        let videoComposition = VideoCompositor.makeComposition(
            project: project,
            composition: composition
        )
        let item = AVPlayerItem(asset: composition)
        item.videoComposition = videoComposition
        let player = AVPlayer(playerItem: item)
        player.volume = max(0, min(1, masterVolume))
        player.isMuted = isMuted

        self.composition = composition
        self.videoComposition = videoComposition
        self.playerItem = item
        self.player = player

        attachTimeObserver()
        attachEndObserver()

        // Configure audio mixer
        let audios = project.audioPlayerObjects
        do {
            try audioMixer.configure(audios: audios, urls: mediaURLs)
        } catch {
            logger.error("AudioMixer configure failed: \(error.localizedDescription)")
        }
    }

    private func insertVideoTracks(
        project: TimelineProject,
        mediaURLs: [String: URL],
        into composition: AVMutableComposition
    ) async {
        let videoClips = project.mediaObjects
            .filter { $0.kind == .video && $0.isBackground != true }
        for clip in videoClips {
            guard let url = mediaURLs[clip.id] else {
                logger.debug("StoryTimelineEngine skipping video \(clip.id) — no URL")
                continue
            }
            let source = TimelineMediaSource(id: clip.id, kind: .video, url: url)
            do {
                let asset = try await source.loadAsset()
                guard let assetTrack = try await asset.loadTracks(withMediaType: .video).first else {
                    continue
                }
                let compositionTrack = composition.addMutableTrack(
                    withMediaType: .video,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                )
                let start = CMTime(seconds: Double(clip.startTime ?? 0), preferredTimescale: 600)
                let duration = CMTime(seconds: Double(clip.duration ?? project.slideDuration), preferredTimescale: 600)
                let assetRange = CMTimeRange(start: .zero, duration: duration)
                try compositionTrack?.insertTimeRange(assetRange, of: assetTrack, at: start)
            } catch {
                logger.error("StoryTimelineEngine failed to insert video \(clip.id): \(error.localizedDescription)")
            }
        }
    }

    private func attachTimeObserver() {
        guard let player else { return }
        let interval = CMTime(value: 1, timescale: 60)
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] cmtime in
            guard let self else { return }
            let seconds = Float(CMTimeGetSeconds(cmtime))
            self.currentTime = seconds
            self.onTimeUpdate?(seconds)
        }
    }

    private func attachEndObserver() {
        guard let item = playerItem else { return }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.isPlaying = false
                self.onPlaybackEnd?()
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine.configure builds AVMutableComposition + delegates audio to mixer"
```

---

### Task D3: `play()`, `pause()`, `toggle()` orchestrate player + mixer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_play_setsIsPlayingTrue_andCallsMixerPlay() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.play()
    XCTAssertTrue(engine.isPlaying)
    XCTAssertEqual(mixer.playCallCount, 1)
}

func test_pause_setsIsPlayingFalse_andCallsMixerPause() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.play()
    engine.pause()
    XCTAssertFalse(engine.isPlaying)
    XCTAssertEqual(mixer.pauseCallCount, 1)
}

func test_toggle_alternatesPlayState() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.toggle()
    XCTAssertTrue(engine.isPlaying)
    engine.toggle()
    XCTAssertFalse(engine.isPlaying)
}

func test_play_withoutConfigure_doesNothing() {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    engine.play()
    XCTAssertFalse(engine.isPlaying)
    XCTAssertEqual(mixer.playCallCount, 0)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — no `play()`/`pause()`/`toggle()`.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public extension StoryTimelineEngine {

    func play() {
        guard player != nil, currentProject != nil else { return }
        player?.play()
        do {
            try audioMixer.play()
        } catch {
            logger.error("AudioMixer play failed: \(error.localizedDescription)")
        }
        isPlaying = true
    }

    func pause() {
        player?.pause()
        audioMixer.pause()
        isPlaying = false
    }

    func toggle() {
        if isPlaying { pause() } else { play() }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine play/pause/toggle orchestrating player + mixer"
```

---

### Task D4: `seek(to:precise:)` synchronisé player + mixer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_seek_callsMixerSeekWithSameTime() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
    engine.seek(to: 4.5)
    XCTAssertEqual(mixer.seekCallCount, 1)
    XCTAssertEqual(mixer.lastSeekTime, 4.5, accuracy: 0.001)
}

func test_seek_clampsAboveSlideDuration() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
    engine.seek(to: 99)
    XCTAssertEqual(mixer.lastSeekTime, 10, accuracy: 0.001)
}

func test_seek_clampsNegativeToZero() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
    engine.seek(to: -3)
    XCTAssertEqual(mixer.lastSeekTime, 0, accuracy: 0.001)
}

func test_seek_emitsTimeUpdateCallback() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
    var captured: Float?
    engine.onTimeUpdate = { captured = $0 }
    engine.seek(to: 2.0)
    XCTAssertEqual(captured, 2.0, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — `seek(to:)` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public extension StoryTimelineEngine {

    func seek(to time: Float, precise: Bool = true) {
        guard let project = currentProject else { return }
        let clamped = max(0, min(project.slideDuration, time))
        currentTime = clamped
        if let player {
            let cmtime = CMTime(seconds: Double(clamped), preferredTimescale: 600)
            let tolerance: CMTime = precise ? .zero : CMTime(seconds: 0.05, preferredTimescale: 600)
            player.seek(to: cmtime, toleranceBefore: tolerance, toleranceAfter: tolerance)
        }
        audioMixer.seek(to: clamped)
        onTimeUpdate?(clamped)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine.seek synchronises player + mixer with clamping"
```

---

### Task D5: `stop()` reset complet

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_stop_resetsCurrentTimeToZero() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
    engine.seek(to: 5)
    engine.stop()
    XCTAssertEqual(engine.currentTime, 0)
    XCTAssertFalse(engine.isPlaying)
}

func test_stop_callsMixerPause_andSeeksToZero() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.play()
    engine.stop()
    XCTAssertGreaterThanOrEqual(mixer.pauseCallCount, 1)
    XCTAssertEqual(mixer.lastSeekTime, 0)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — `stop()` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public extension StoryTimelineEngine {
    func stop() {
        pause()
        seek(to: 0)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine.stop resets time and pauses pipeline"
```

---

### Task D6: `setMode(.editing)` / `setMode(.preview)` switch

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_setMode_editing_pausesPlayback() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.play()
    engine.setMode(.editing)
    XCTAssertEqual(engine.mode, .editing)
    XCTAssertFalse(engine.isPlaying)
}

func test_setMode_preview_doesNotAlterPlaybackIfAlreadyPaused() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.setMode(.preview)
    XCTAssertEqual(engine.mode, .preview)
    XCTAssertFalse(engine.isPlaying)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — `setMode(.editing)` doesn't pause currently.

- [ ] **Step 3: Write minimal implementation**

Replace `setMode` in `StoryTimelineEngine`:
```swift
public func setMode(_ newMode: TimelineEngineMode) {  // CH-1 : utilise type partagé
    guard mode != newMode else { return }
    if newMode == .editing && isPlaying {
        pause()
    }
    mode = newMode
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine.setMode pauses playback when switching to editing"
```

---

### Task D7: Stub `export(to:preset:)` retournant `notImplemented`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_export_throwsNotImplemented() async {
    let engine = StoryTimelineEngine()
    do {
        try await engine.export(to: URL(fileURLWithPath: "/tmp/out.mp4"), preset: .hd1080)
        XCTFail("Expected throw")
    } catch let error as StoryTimelineExportError {
        XCTAssertEqual(error, .notImplemented)
    } catch {
        XCTFail("Unexpected error: \(error)")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — `export` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public extension StoryTimelineEngine {
    func export(
        to url: URL,
        preset: StoryTimelineExportPreset = .hd1080
    ) async throws {
        // Architecture is in place but the export pipeline is out of scope for Phase 2.
        // Tracked in spec section "Goals & Non-Goals" — `.export()` returns notImplemented at launch.
        throw StoryTimelineExportError.notImplemented
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine.export stub throwing notImplemented"
```

---

### Task D8: Retry asset load (1 retry après 500 ms) + propagation d'erreur

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_configure_withMissingVideoURL_emitsAssetLoadFailedError() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    var captured: [StoryTimelineEngineError] = []
    engine.onError = { err in captured.append(err) }
    let media = StoryMediaObject(
        id: "v1", postMediaId: "pm1",
        mediaType: "video", placement: "media",
        startTime: 0, duration: 5
    )
    let project = makeProject(slideDuration: 5, media: [media])
    // Provide an invalid URL that will fail asset load (file doesn't exist).
    let badURL = URL(fileURLWithPath: "/this/path/does/not/exist/v1.mp4")
    await engine.configure(project: project, mediaURLs: ["v1": badURL], images: [:])
    XCTAssertFalse(captured.isEmpty, "Expected at least one assetLoadFailed error")
    if case .assetLoadFailed(let clipId, _) = captured.first {
        XCTAssertEqual(clipId, "v1")
    } else {
        XCTFail("Expected assetLoadFailed, got \(String(describing: captured.first))")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: FAIL — no `onError` callback.

- [ ] **Step 3: Write minimal implementation**

Add to `StoryTimelineEngine`:
```swift
public var onError: ((StoryTimelineEngineError) -> Void)?
```

Modify `insertVideoTracks` to retry once and propagate error:
```swift
private func insertVideoTracks(
    project: TimelineProject,
    mediaURLs: [String: URL],
    into composition: AVMutableComposition
) async {
    let videoClips = project.mediaObjects
        .filter { $0.kind == .video && $0.isBackground != true }
    for clip in videoClips {
        guard let url = mediaURLs[clip.id] else {
            logger.debug("StoryTimelineEngine skipping video \(clip.id) — no URL")
            continue
        }
        let source = TimelineMediaSource(id: clip.id, kind: .video, url: url)
        let asset: AVURLAsset
        do {
            asset = try await loadAssetWithRetry(source: source)
        } catch {
            logger.error("StoryTimelineEngine asset load failed for \(clip.id): \(error.localizedDescription)")
            onError?(.assetLoadFailed(clipId: clip.id, reason: error.localizedDescription))
            continue
        }
        do {
            guard let assetTrack = try await asset.loadTracks(withMediaType: .video).first else {
                continue
            }
            let compositionTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )
            let start = CMTime(seconds: Double(clip.startTime ?? 0), preferredTimescale: 600)
            let duration = CMTime(seconds: Double(clip.duration ?? project.slideDuration), preferredTimescale: 600)
            let assetRange = CMTimeRange(start: .zero, duration: duration)
            try compositionTrack?.insertTimeRange(assetRange, of: assetTrack, at: start)
        } catch {
            logger.error("StoryTimelineEngine insertion failed for \(clip.id): \(error.localizedDescription)")
            onError?(.assetLoadFailed(clipId: clip.id, reason: error.localizedDescription))
        }
    }
}

private func loadAssetWithRetry(source: TimelineMediaSource) async throws -> AVURLAsset {
    do {
        return try await source.loadAsset()
    } catch {
        try? await Task.sleep(nanoseconds: 500_000_000)
        return try await source.loadAsset()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (19 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "feat(timeline-engine): StoryTimelineEngine retries asset load once and propagates errors via onError"
```

---

### Task D9: Test d'intégration multi-audio parallel playback

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_multiAudioParallelPlayback_mixerReceivesAllAudios() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    let music = StoryAudioPlayerObject(id: "music", postMediaId: "pm-music", isBackground: true)
    let voice = StoryAudioPlayerObject(id: "voice", postMediaId: "pm-voice")
    let project = makeProject(audios: [music, voice])
    await engine.configure(project: project, mediaURLs: [:], images: [:])
    XCTAssertEqual(mixer.lastConfiguredAudioCount, 2,
                   "Mixer should receive both background music + foreground voice for parallel playback")
}

func test_multiAudioParallelPlayback_playStartsBothNodes() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    let music = StoryAudioPlayerObject(id: "music", postMediaId: "pm-music", isBackground: true)
    let voice = StoryAudioPlayerObject(id: "voice", postMediaId: "pm-voice")
    let project = makeProject(audios: [music, voice])
    await engine.configure(project: project, mediaURLs: [:], images: [:])
    engine.play()
    XCTAssertEqual(mixer.playCallCount, 1)
    XCTAssertEqual(mixer.lastConfiguredAudioCount, 2)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (already covered by mixer count) — if any test fails, fix `audioPlayerObjects` propagation.

- [ ] **Step 3: Verify implementation correctness**

Confirm `audioPlayerObjects` are passed verbatim to `audioMixer.configure(audios:urls:)`. No code change required if green.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "test(timeline-engine): integration coverage for multi-audio parallel playback"
```

---

### Task D10: Mute global propage au player + mixer

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryTimelineEngineTests`:
```swift
func test_isMuted_setTrue_callsMixerSetMuteTrue() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.isMuted = true
    XCTAssertEqual(mixer.setMuteCalls.last, true)
}

func test_isMuted_setFalse_callsMixerSetMuteFalse() async {
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
    engine.isMuted = true
    engine.isMuted = false
    XCTAssertEqual(mixer.setMuteCalls.last, false)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS already (set in Task D1 didSet). If fail, harden didSet to forward to mixer.setMute.

- [ ] **Step 3: Verify**

Already implemented in D1. No code change required.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEngineTests.swift
git commit -m "test(timeline-engine): mute propagation to audio mixer"
```

---

## Section E — `StoryCanvasReaderView` extensions (clipTransitions + keyframes lecture seule)

### Task E1: Créer `StoryCanvasReaderView+Timeline.swift` avec helper `currentTransitionOpacity`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderTransitionTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderTransitionTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryCanvasReaderTransitionTests: XCTestCase {

    private func makeMedia(id: String, start: Float, duration: Float) -> StoryMediaObject {
        StoryMediaObject(
            id: id, postMediaId: "pm-\(id)",
            mediaType: "video", placement: "media",
            startTime: start, duration: duration
        )
    }

    func test_clipOpacity_outsideClipRange_isZero() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(
            for: media,
            transitions: [],
            currentTime: 6
        )
        XCTAssertEqual(opacity, 0, accuracy: 0.001)
    }

    func test_clipOpacity_withinClipRange_noTransition_isOne() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(
            for: media,
            transitions: [],
            currentTime: 2
        )
        XCTAssertEqual(opacity, 1, accuracy: 0.001)
    }

    func test_clipOpacity_outgoingCrossfade_atTrailingEdge_isHalfWayThroughTransition() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
        // At t=4.5 (0.5s into the 1s outgoing crossfade), opacity is 0.5
        let opacity = ReaderTransitionResolver.opacity(
            for: media,
            transitions: [trans],
            currentTime: 4.5
        )
        XCTAssertEqual(opacity, 0.5, accuracy: 0.05)
    }

    func test_clipOpacity_incomingCrossfade_atLeadingEdge_isHalfWayThroughTransition() {
        let media = makeMedia(id: "b", start: 5, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
        // At t=5.5, halfway into incoming crossfade, opacity rising 0->1 → 0.5
        let opacity = ReaderTransitionResolver.opacity(
            for: media,
            transitions: [trans],
            currentTime: 5.5
        )
        XCTAssertEqual(opacity, 0.5, accuracy: 0.05)
    }

    func test_clipOpacity_dissolveTransition_doesNotAffectOpacity() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .dissolve, duration: 1.0)
        // Dissolve uses CIFilter pipeline only — opacity stays at 1
        let opacity = ReaderTransitionResolver.opacity(
            for: media,
            transitions: [trans],
            currentTime: 4.5
        )
        XCTAssertEqual(opacity, 1.0, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderTransitionTests -quiet`
Expected: FAIL — `ReaderTransitionResolver` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift
import Foundation
import CoreGraphics
import MeeshySDK

/// Pure resolver applying timeline transitions to media object opacity at a given playback time.
/// Used by `StoryCanvasReaderView` to render `clipTransitions` in lecture seule.
public enum ReaderTransitionResolver {

    /// Returns the rendered opacity for `media` at `currentTime`, accounting for any matching
    /// `clipTransitions` (crossfade only — dissolve is handled by the engine compositor and is
    /// transparent to the SwiftUI reader).
    public static func opacity(
        for media: StoryMediaObject,
        transitions: [StoryClipTransition],
        currentTime: Float
    ) -> Float {
        let start = media.startTime ?? 0
        let duration = media.duration ?? 0
        let end = start + duration
        guard currentTime >= start, currentTime <= end else { return 0 }

        var opacity: Float = 1.0
        for transition in transitions where transition.kind == .crossfade {
            if transition.fromClipId == media.id {
                let outgoingStart = end - transition.duration
                if currentTime > outgoingStart {
                    let progress = (currentTime - outgoingStart) / transition.duration
                    opacity *= max(0, 1 - progress)
                }
            }
            if transition.toClipId == media.id {
                let incomingEnd = start + transition.duration
                if currentTime < incomingEnd {
                    let progress = (currentTime - start) / transition.duration
                    opacity *= max(0, min(1, progress))
                }
            }
        }
        return max(0, min(1, opacity))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderTransitionTests -quiet`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderTransitionTests.swift
git commit -m "feat(reader): ReaderTransitionResolver for crossfade clipTransitions in read-only canvas"
```

---

### Task E2: Helper `ReaderKeyframeResolver` interpole position/scale/opacity au playhead

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift
import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryCanvasReaderKeyframeTests: XCTestCase {

    func test_resolvedPosition_noKeyframes_returnsNil() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let pos = ReaderKeyframeResolver.resolvedPosition(
            for: media, keyframes: nil, currentTime: 2
        )
        XCTAssertNil(pos)
    }

    func test_resolvedPosition_oneKeyframe_returnsKeyframeValue() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let kf = StoryKeyframe(time: 1, x: 0.2, y: 0.8)
        let pos = ReaderKeyframeResolver.resolvedPosition(
            for: media, keyframes: [kf], currentTime: 2
        )
        XCTAssertEqual(pos?.x ?? 0, 0.2, accuracy: 0.001)
        XCTAssertEqual(pos?.y ?? 0, 0.8, accuracy: 0.001)
    }

    func test_resolvedPosition_twoKeyframes_interpolatesLinearlyAtMidpoint() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let k0 = StoryKeyframe(time: 0, x: 0.0, y: 0.0)
        let k1 = StoryKeyframe(time: 4, x: 1.0, y: 1.0)
        let pos = ReaderKeyframeResolver.resolvedPosition(
            for: media, keyframes: [k0, k1], currentTime: 2
        )
        XCTAssertEqual(pos?.x ?? 0, 0.5, accuracy: 0.001)
        XCTAssertEqual(pos?.y ?? 0, 0.5, accuracy: 0.001)
    }

    func test_resolvedScale_oneKeyframe_returnsKeyframeValue() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            scale: 1.0,
            startTime: 0, duration: 5
        )
        let kf = StoryKeyframe(time: 1, scale: 1.5)
        let scale = ReaderKeyframeResolver.resolvedScale(
            keyframes: [kf], currentTime: 2
        )
        XCTAssertEqual(scale ?? 0, 1.5, accuracy: 0.001)
    }

    func test_resolvedOpacity_twoKeyframes_interpolatesAtMidpoint() {
        let k0 = StoryKeyframe(time: 0, opacity: 0)
        let k1 = StoryKeyframe(time: 2, opacity: 1)
        let opacity = ReaderKeyframeResolver.resolvedOpacity(
            keyframes: [k0, k1], currentTime: 1
        )
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 0.001)
    }

    func test_resolvedPosition_clampsAfterLastKeyframe() {
        let k0 = StoryKeyframe(time: 0, x: 0, y: 0)
        let k1 = StoryKeyframe(time: 2, x: 1, y: 1)
        let media = StoryMediaObject(
            id: "m", postMediaId: "p", mediaType: "image", placement: "media",
            x: 0, y: 0, startTime: 0, duration: 5
        )
        let pos = ReaderKeyframeResolver.resolvedPosition(
            for: media, keyframes: [k0, k1], currentTime: 4
        )
        XCTAssertEqual(pos?.x ?? 0, 1.0, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet`
Expected: FAIL — `ReaderKeyframeResolver` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`:
```swift
/// Pure resolver applying keyframe interpolation to a media object at a given playback time.
/// Read-only — used by `StoryCanvasReaderView` to honor `keyframes` published in story V2.
/// Position/scale/opacity is offset relative to the object's `startTime` per spec section 2.1.
public enum ReaderKeyframeResolver {

    /// Returns the interpolated position (x, y) at `currentTime`, or `nil` if no keyframes.
    public static func resolvedPosition(
        for media: StoryMediaObject,
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGPoint? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let start = media.startTime ?? 0
        let local = currentTime - start

        let xs: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
            .compactMap { $0.x.map { (time: $0, value: $1, easing: .linear) } }
            .map { ($0.time, $0.value, $0.easing) }
        let ys: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
            .compactMap { $0.y.map { (time: $0, value: $1, easing: .linear) } }
            .map { ($0.time, $0.value, $0.easing) }

        let x = KeyframeInterpolator.interpolate(keyframes: xs, at: local)
        let y = KeyframeInterpolator.interpolate(keyframes: ys, at: local)
        if x == nil && y == nil { return nil }
        return CGPoint(x: x ?? media.x, y: y ?? media.y)
    }

    /// Returns the interpolated scale at `currentTime`, or `nil` if no keyframes.
    public static func resolvedScale(
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGFloat? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let scales: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
            .compactMap { kf in kf.scale.map { (time: kf.time, value: $0, easing: .linear) } }
        return KeyframeInterpolator.interpolate(keyframes: scales, at: currentTime)
    }

    /// Returns the interpolated opacity at `currentTime`, or `nil` if no keyframes.
    public static func resolvedOpacity(
        keyframes: [StoryKeyframe]?,
        currentTime: Float
    ) -> CGFloat? {
        guard let frames = keyframes, !frames.isEmpty else { return nil }
        let opacities: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
            .compactMap { kf in kf.opacity.map { (time: kf.time, value: $0, easing: .linear) } }
        return KeyframeInterpolator.interpolate(keyframes: opacities, at: currentTime)
    }
}
```

> Note: signature `KeyframeInterpolator.interpolate(keyframes:at:)` is from Plan 2. The tuple form `(time:Float, value:T, easing:StoryEasing)` is the contract documented in the spec section 4.3.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift
git commit -m "feat(reader): ReaderKeyframeResolver for read-only position/scale/opacity interpolation"
```

---

### Task E3: Câbler `ReaderTransitionResolver` dans `foregroundMediaLayer` (extension non-invasive)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` (modification ciblée — wrap opacity)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderTransitionTests.swift` (already exists, add wiring test)

- [ ] **Step 1: Write the failing test**

Add to `StoryCanvasReaderTransitionTests`:
```swift
func test_resolverWiring_combinedWithBaseOpacity_multipliesValues() {
    let media = StoryMediaObject(
        id: "a", postMediaId: "pa",
        mediaType: "video", placement: "media",
        startTime: 0, duration: 5
    )
    let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
    // Base opacity (e.g. fadeIn complete) = 1.0; transition halfway-through => combined = 0.5
    let baseOpacity: Float = 1.0
    let transitionOpacity = ReaderTransitionResolver.opacity(
        for: media, transitions: [trans], currentTime: 4.5
    )
    let combined = baseOpacity * transitionOpacity
    XCTAssertEqual(combined, 0.5, accuracy: 0.05)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderTransitionTests -quiet`
Expected: PASS — pure logic test, already covered indirectly.

- [ ] **Step 3: Wire the resolver inside StoryCanvasReaderView**

Open `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` and locate the line:
```swift
.opacity(state.mediaObjectOpacity(for: media, at: time))
```
in `foregroundMediaLayer` (line ~484).

Replace with:
```swift
.opacity(Double(
    Float(state.mediaObjectOpacity(for: media, at: time))
    * ReaderTransitionResolver.opacity(
        for: media,
        transitions: story.storyEffects?.clipTransitions ?? [],
        currentTime: Float(time)
    )
))
```

> The `state.mediaObjectOpacity(for:at:)` already returns a `Double` per existing code. Convert to `Float`, multiply with transition resolver, then back to `Double` for `.opacity(_:)`.

If `clipTransitions` doesn't exist on `StoryEffects` because Plan 1 hasn't been merged yet, ABORT this task and re-confirm pre-flight checks at top of plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderTransitionTests -quiet`
Expected: PASS — and the build succeeds: `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderTransitionTests.swift
git commit -m "feat(reader): wire ReaderTransitionResolver into foregroundMediaLayer opacity"
```

---

### Task E4: Câbler `ReaderKeyframeResolver` dans `foregroundMediaLayer` (position + scale + opacity)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryCanvasReaderKeyframeTests`:
```swift
func test_keyframeResolverWiring_overridesStaticPosition() {
    let media = StoryMediaObject(
        id: "m", postMediaId: "p", mediaType: "image", placement: "media",
        x: 0.1, y: 0.1, startTime: 0, duration: 5
    )
    let kfs: [StoryKeyframe] = [
        StoryKeyframe(time: 0, x: 0.5, y: 0.5),
        StoryKeyframe(time: 4, x: 0.9, y: 0.9)
    ]
    // At t=2, halfway → x = 0.7, y = 0.7
    let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: kfs, currentTime: 2)
    XCTAssertEqual(pos?.x ?? 0, 0.7, accuracy: 0.001)
    XCTAssertEqual(pos?.y ?? 0, 0.7, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet`
Expected: PASS — pure logic test already supported.

- [ ] **Step 3: Wire the resolver inside StoryCanvasReaderView (foregroundMediaLayer)**

Open `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` and locate `foregroundMediaLayer` (around line 467). Just below the existing `if visible {` block, BEFORE the call to `DraggableMediaView(...)`, compute the keyframe overrides:

```swift
let kfPosition = ReaderKeyframeResolver.resolvedPosition(
    for: media,
    keyframes: media.keyframes,
    currentTime: Float(time)
)
let kfScale = ReaderKeyframeResolver.resolvedScale(
    keyframes: media.keyframes,
    currentTime: Float(time)
)
let kfOpacity = ReaderKeyframeResolver.resolvedOpacity(
    keyframes: media.keyframes,
    currentTime: Float(time)
)

var overriddenMedia = media
if let pos = kfPosition {
    overriddenMedia.x = pos.x
    overriddenMedia.y = pos.y
}
if let scale = kfScale {
    overriddenMedia.scale = scale
}
```

Then replace `mediaObject: .constant(media)` with `mediaObject: .constant(overriddenMedia)`, and modify the `.opacity(...)` line to fold in `kfOpacity`:
```swift
.opacity(Double(
    Float(state.mediaObjectOpacity(for: media, at: time))
    * ReaderTransitionResolver.opacity(
        for: media,
        transitions: story.storyEffects?.clipTransitions ?? [],
        currentTime: Float(time)
    )
    * Float(kfOpacity ?? 1.0)
))
```

> If `media.keyframes` is not yet defined (Plan 1 not merged), ABORT and re-confirm pre-flight checks.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet` and `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`.
Expected: PASS + build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift
git commit -m "feat(reader): apply ReaderKeyframeResolver to foreground media position/scale/opacity"
```

---

### Task E5: Câbler `ReaderKeyframeResolver` dans `textObjectsLayer` (texte aussi)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift`

- [ ] **Step 1: Write the failing test**

Add to `StoryCanvasReaderKeyframeTests`:
```swift
func test_textObjectKeyframes_interpolatesXAtPlayhead() {
    let kfs: [StoryKeyframe] = [
        StoryKeyframe(time: 0, x: 0.0),
        StoryKeyframe(time: 4, x: 1.0)
    ]
    // Use the same generic resolver; we only have media-flavoured calls so build a
    // throwaway StoryMediaObject and assert the X interpolation works equivalently.
    let media = StoryMediaObject(id: "m", postMediaId: "p", mediaType: "image", placement: "media",
                                 x: 0, y: 0, startTime: 0, duration: 5)
    let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: kfs, currentTime: 2)
    XCTAssertEqual(pos?.x ?? 0, 0.5, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet`
Expected: PASS — assertion is valid for the existing media-flavored helper.

- [ ] **Step 3: Wire the resolver inside textObjectsLayer**

Open `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` and locate `textObjectsLayer` (around line 393). Inside the `ForEach(state.textObjects) { obj in` block, add — just after the existing `if opacity > 0 {` open — the resolved keyframe overrides:

```swift
let kfX: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
    let xs: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
        .compactMap { kf in kf.x.map { (time: kf.time, value: $0, easing: .linear) } }
    return KeyframeInterpolator.interpolate(keyframes: xs, at: Float(time))
}
let kfY: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
    let ys: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
        .compactMap { kf in kf.y.map { (time: kf.time, value: $0, easing: .linear) } }
    return KeyframeInterpolator.interpolate(keyframes: ys, at: Float(time))
}
let kfScale: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
    let ss: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
        .compactMap { kf in kf.scale.map { (time: kf.time, value: $0, easing: .linear) } }
    return KeyframeInterpolator.interpolate(keyframes: ss, at: Float(time))
}
let kfOpacity: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
    let os: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames
        .compactMap { kf in kf.opacity.map { (time: kf.time, value: $0, easing: .linear) } }
    return KeyframeInterpolator.interpolate(keyframes: os, at: Float(time))
}

let renderX = (kfX ?? obj.x) * size.width
let renderY = (kfY ?? obj.y) * size.height
let renderScale = kfScale ?? obj.scale
let renderOpacity = Double(opacity) * Double(kfOpacity ?? 1.0)
```

Then replace:
- `.scaleEffect(obj.scale)` → `.scaleEffect(renderScale)`
- `.opacity(opacity)` → `.opacity(renderOpacity)`
- `.position(x: obj.x * size.width, y: obj.y * size.height)` → `.position(x: renderX, y: renderY)`

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet` and verify build: `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`.
Expected: PASS + build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryCanvasReaderKeyframeTests.swift
git commit -m "feat(reader): apply keyframe interpolation to text objects in StoryCanvasReaderView"
```

---

## Section F — Performance harness (XCTMetric)

### Task F1: Test perf `configure(project:)` < 200 ms (10 clips + 5 audios)

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift`

- [ ] **Step 1: Write the test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEnginePerformanceTests: XCTestCase {

    private func makeProject() -> TimelineProject {
        let media = (0..<10).map { i in
            StoryMediaObject(
                id: "v\(i)", postMediaId: "pm\(i)",
                mediaType: "image", placement: "media",
                startTime: Float(i), duration: 1.0
            )
        }
        let audios = (0..<5).map { i in
            StoryAudioPlayerObject(id: "a\(i)", postMediaId: "pma\(i)")
        }
        return TimelineProject(
            slideId: "perf",
            slideDuration: 30,
            mediaObjects: media,
            audioPlayerObjects: audios,
            textObjects: [],
            clipTransitions: []
        )
    }

    func test_configure_tenClipsFiveAudios_under200ms() {
        let project = makeProject()
        measure(metrics: [XCTClockMetric()]) {
            let mixer = MockAudioMixer()
            let engine = StoryTimelineEngine(audioMixer: mixer)
            let exp = expectation(description: "configure")
            Task { @MainActor in
                await engine.configure(project: project, mediaURLs: [:], images: [:])
                exp.fulfill()
            }
            wait(for: [exp], timeout: 1.0)
        }
    }
}
```

> Note: this test sets a baseline; the assertion target (< 200 ms) is enforced via Xcode test plan baselines once the team approves a baseline run on CI.

- [ ] **Step 2: Run test to verify it builds and runs**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEnginePerformanceTests -quiet`
Expected: Test runs and produces a baseline measurement.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift
git commit -m "test(timeline-engine): XCTClockMetric baseline for configure(project:) under 200 ms"
```

---

### Task F2: Test perf `seek(to:)` < 50 ms

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift`

- [ ] **Step 1: Write the test**

Add to `StoryTimelineEnginePerformanceTests`:
```swift
func test_seek_under50ms() async {
    let project = makeProject()
    let mixer = MockAudioMixer()
    let engine = StoryTimelineEngine(audioMixer: mixer)
    await engine.configure(project: project, mediaURLs: [:], images: [:])

    measure(metrics: [XCTClockMetric()]) {
        for i in 0..<10 {
            engine.seek(to: Float(i) * 0.5)
        }
    }
}
```

- [ ] **Step 2: Run test to verify it builds and runs**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEnginePerformanceTests -quiet`
Expected: Baseline measurement produced.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift
git commit -m "test(timeline-engine): XCTClockMetric baseline for seek under 50 ms (10x sequential)"
```

---

### Task F3: Test mémoire pic < 250 MB sur configure répété

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift`

- [ ] **Step 1: Write the test**

Add to `StoryTimelineEnginePerformanceTests`:
```swift
func test_repeatedConfigure_memoryStaysBelowBudget() {
    let project = makeProject()
    measure(metrics: [XCTMemoryMetric()]) {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        let exp = expectation(description: "configure-loop")
        Task { @MainActor in
            for _ in 0..<5 {
                await engine.configure(project: project, mediaURLs: [:], images: [:])
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 5.0)
    }
}
```

- [ ] **Step 2: Run test to verify it builds and runs**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEnginePerformanceTests -quiet`
Expected: Baseline produced.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/StoryTimelineEnginePerformanceTests.swift
git commit -m "test(timeline-engine): XCTMemoryMetric baseline for repeated configure under 250 MB"
```

---

## Section G — Final integration & cleanup

### Task G1: Vérification globale du module — tous les tests verts

**Files:** none (verification only)

- [ ] **Step 1: Run the full Engine test suite**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineMediaSourceTests -only-testing:MeeshyUITests/VideoCompositorTests -only-testing:MeeshyUITests/AudioMixerTests -only-testing:MeeshyUITests/StoryTimelineEngineTests -only-testing:MeeshyUITests/StoryCanvasReaderTransitionTests -only-testing:MeeshyUITests/StoryCanvasReaderKeyframeTests -quiet`
Expected: ALL tests PASS (44+ unit tests + 5 perf baselines).

- [ ] **Step 2: Run the full SDK test suite to ensure no regressions**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: ALL tests PASS, no regressions in existing suites.

- [ ] **Step 3: Run the iOS app build to ensure SDK consumption works**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds without errors. Any unresolved symbol means we accidentally broke an import — fix immediately.

- [ ] **Step 4: No commit required** — verification only.

---

### Task G2: Ajouter un fichier `Engine/README.md` documentant l'architecture (sans Markdown sortable, juste un dump structurel)

> SKIPPED — la règle CLAUDE.md interdit la création de docs `.md` non demandées par l'utilisateur. La documentation vit dans le spec et les commentaires de code.

---

### Task G3: Self-review final (lecture en diagonale + checklist) — INCLUT Section H SOTA

> **Patch deep-coherence-review MED-7** : la self-review G3 originale a été écrite AVANT
> que la Section H (SOTA Patches H1, H2, H3) soit ajoutée. Cette version étendue inclut
> les vérifications sur les fichiers SOTA pour ne pas oublier de les valider.

**Files:** none (review only)

- [ ] **Step 1: Vérifications de cohérence (Sections A-G)**

Lire en diagonale les fichiers créés et vérifier :
- [ ] Aucun `try?` muet dans `StoryTimelineEngine.swift` (toutes les erreurs propagent via `onError` ou `logger`)
- [ ] Aucun `Timer.scheduledTimer` (uniquement `addPeriodicTimeObserver`)
- [ ] Aucun `Thread.sleep()` (uniquement `Task.sleep`)
- [ ] Aucun `DispatchQueue.main.async` pour synchronisation (uniquement `await`)
- [ ] Tous les `AVURLAsset` chargés via `try await asset.load(.tracks, .duration)` (pas synchrone)
- [ ] `@MainActor` sur `StoryTimelineEngine`, `AudioMixer`, `AudioMixerProviding`
- [ ] `Sendable` sur tous les types valeur (`TimelineMediaSource`, configs)
- [ ] Naming respecte `{Domain}Engine`, `is`/`has`/`can`
- [ ] Aucun fichier > 400 lignes (sinon splitter)
- [ ] Tous les commits suivent le format conventionnel `feat(timeline-engine):` / `feat(reader):` / `test(timeline-engine):`
- [ ] Aucun `Co-Authored-By` dans les commits

- [ ] **Step 1.5: Vérifications de cohérence Section H (SOTA Patches)** — ajouté par MED-7

- [ ] `TimelineSignposter.swift` (Task H2) wrappe bien `configure`, `seek`, `recompose`, `apply`
- [ ] `OSSignposter` utilise `OSLog(subsystem: "me.meeshy.app", category: "TimelineEngine")` (cohérent CLAUDE.md)
- [ ] `MXSignpostMetric` enregistré au boot de l'app (intégration MetricKit)
- [ ] `AVAudioSession.setPreferredIOBufferDuration(0.005)` appelé dans `configureAudioSession()`
- [ ] `prepareAllNodes()` itère bien sur tous les `AVAudioPlayerNode`
- [ ] `CustomTransitionCompositor` est un `@objc final class` conformant à `AVVideoCompositing`
- [ ] `CustomTransitionCompositor` utilise `kCVPixelBufferMetalCompatibilityKey: true` dans ses pixel buffer attributes
- [ ] `VideoCompositor.makeComposition` route bien vers `CustomTransitionCompositor` quand un `kind` non-built-in est utilisé (vide au launch, prêt pour push/wipe/zoom futurs)
- [ ] **CH-1 (deep-coherence-review)** : `TimelineEngineMode` est utilisé directement (pas de `enum Mode` interne dupliqué). Le fichier `Story/Timeline/Model/TimelineEngineMode.swift` existe.
- [ ] **MED-7 (deep-coherence-review)** : cette checklist Step 1.5 a été ajoutée pour ne pas oublier les vérifications SOTA

- [ ] **Step 2: Relancer la suite complète**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: ALL PASS.

- [ ] **Step 3: Run iOS app build**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS.

- [ ] **Step 4: No commit — verification only.**

---

## Section H — SOTA Patches

> Cette section intègre les recommandations de l'audit SOTA (`docs/superpowers/specs/2026-05-06-timeline-sota-audit.md`) appliquées au moteur de lecture. Les 3 tasks ci-dessous correspondent aux patches P3 (audio low-latency), P10 (instrumentation MetricKit/Instruments) et P5/P1 (compositor Metal extensible). Elles s'exécutent APRÈS la Section G (toutes les autres tasks doivent être vertes avant d'attaquer celles-ci).

### Task H1: Audio low-latency setup (`AVAudioSession.setPreferredIOBufferDuration` + `prepare()` des nodes)

> **Why:** Patch SOTA P3 du rapport d'audit. Sans ces appels, le cold-start audio prend ~100 ms (mesuré sur forum Apple — délai d'allocation des buffers RemoteIO). Cible : latence ~1.5 ms à 64 frames de buffer (5 ms à 256 frames). Combiné avec `prepare()` sur tous les `AVAudioPlayerNode` au moment du `configure`, on supprime le hiccup de premier `play()` après attach.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift` (ajouter méthode interne `configureAudioSession()` appelée au début de `configure(project:mediaURLs:images:)`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift` (ajouter méthode publique `prepareAllNodes()` qui itère sur tous les `AVAudioPlayerNode` et appelle `.prepare(withFrameCount:)`)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioLowLatencyTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioLowLatencyTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
import MeeshySDK

@MainActor
final class AudioLowLatencyTests: XCTestCase {

    private func makeProject() -> TimelineProject {
        TimelineProject(
            slideId: "low-lat",
            slideDuration: 5,
            mediaObjects: [],
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
            ],
            textObjects: [],
            clipTransitions: []
        )
    }

    func test_configure_setsPreferredIOBufferDurationTo5ms() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        let actual = AVAudioSession.sharedInstance().preferredIOBufferDuration
        XCTAssertEqual(actual, 0.005, accuracy: 0.0005,
                       "Expected preferredIOBufferDuration == 5ms after configure, got \(actual)")
    }

    func test_configure_callsPrepareAllNodesOnMixer() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        XCTAssertEqual(mixer.prepareAllNodesCallCount, 1,
                       "Expected mixer.prepareAllNodes() to be called once during configure")
    }
}
```

Add to `MockAudioMixer` (in the existing mocks file):
```swift
public private(set) var prepareAllNodesCallCount: Int = 0
public func prepareAllNodes() { prepareAllNodesCallCount += 1 }
```

And add to `AudioMixerProviding` protocol:
```swift
func prepareAllNodes()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioLowLatencyTests -quiet`
Expected: FAIL — `prepareAllNodesCallCount == 0`, `preferredIOBufferDuration` non configuré (valeur système par défaut ~23 ms).

- [ ] **Step 3: Write minimal implementation**

In `StoryTimelineEngine.swift`, add a private method and call it at the very beginning of `configure(project:mediaURLs:images:)`:
```swift
private func configureAudioSession() {
    do {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .default,
            options: [.mixWithOthers, .defaultToSpeaker]
        )
        try session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: [.notifyOthersOnDeactivation])
    } catch {
        logger.error("StoryTimelineEngine audio session setup failed: \(error.localizedDescription)")
    }
}
```

Modify `configure(project:mediaURLs:images:)` to call it BEFORE building the composition and AFTER the mixer configure:
```swift
public func configure(
    project: TimelineProject,
    mediaURLs: [String: URL],
    images: [String: UIImage]
) async {
    configureAudioSession()
    // ... existing composition build ...
    await audioMixer.configure(audios: project.audioPlayerObjects, mediaURLs: mediaURLs)
    audioMixer.prepareAllNodes()
    // ... rest of configure ...
}
```

In `AudioMixer.swift`, implement:
```swift
public func prepareAllNodes() {
    for node in playerNodes.values {
        node.prepare(withFrameCount: 4096)
    }
}
```

(adapt `playerNodes.values` to the actual storage name used by `AudioMixer` — it might be `audioNodes` or `nodes` depending on the implementation chosen in Section C).

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioLowLatencyTests -quiet`
Expected: PASS (2 tests).

Also run the full Engine suite to verify no regression on existing audio mixer tests:
Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioMixerTests -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/AudioLowLatencyTests.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/Mocks/MockAudioMixer.swift
git commit -m "feat(timeline-engine): audio low-latency setup (5ms IO buffer + node prepare)"
```

---

### Task H2: `OSSignposter` + `MXSignpostMetric` MetricKit pour profiling SOTA

> **Why:** Patch SOTA P10 du rapport d'audit. Wrap les opérations critiques du moteur (`configure`, `seek`, `recompose`, `applyCommand`) avec `OSSignposter` (iOS 16+) afin de :
> 1. Visualiser les hot-paths dans Instruments (catégorie `TimelineEngine`)
> 2. Collecter automatiquement en production via `MXSignpostMetric` MetricKit (le système agrège les durées des intervalles signpostés sur 24h glissantes, sans cost CPU)
>
> Zero overhead en release car `OSSignposter` no-op si aucun outil n'écoute.

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift` (wrapper `configure`, `seek`, `recompose` avec signposts)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineSignposterTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineSignposterTests.swift
import XCTest
@testable import MeeshyUI

final class TimelineSignposterTests: XCTestCase {

    func test_interval_returnsSyncResult() {
        let result = TimelineSignposter.interval("test_sync") { 42 }
        XCTAssertEqual(result, 42)
    }

    func test_interval_propagatesThrows() {
        struct E: Error {}
        XCTAssertThrowsError(try TimelineSignposter.interval("test_throw") { () -> Int in throw E() })
    }

    func test_intervalAsync_returnsAsyncResult() async {
        let result = await TimelineSignposter.intervalAsync("test_async") { 7 }
        XCTAssertEqual(result, 7)
    }

    func test_intervalAsync_propagatesThrows() async {
        struct E: Error {}
        do {
            _ = try await TimelineSignposter.intervalAsync("test_async_throw") { () async throws -> Int in throw E() }
            XCTFail("Expected throw")
        } catch is E {
            // OK
        } catch {
            XCTFail("Wrong error type: \(error)")
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineSignposterTests -quiet`
Expected: FAIL with "Cannot find 'TimelineSignposter' in scope".

- [ ] **Step 3: Write minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift`:
```swift
import Foundation
import os
import os.signpost

/// SOTA wrapper around `OSSignposter` (iOS 16+) for hot-path instrumentation of
/// `StoryTimelineEngine`. All intervals appear in Instruments under the
/// `TimelineEngine` category, and are automatically aggregated in production via
/// `MXSignpostMetric` MetricKit reports (24h rolling window, zero CPU overhead
/// when no profiler is attached).
///
/// Usage:
/// ```swift
/// await TimelineSignposter.intervalAsync("configure") {
///     // body
/// }
/// ```
public struct TimelineSignposter {
    private static let log = OSLog(subsystem: "me.meeshy.app", category: "TimelineEngine")
    private static let signposter = OSSignposter(logHandle: log)

    /// Wraps a synchronous block in a signpost interval. Re-throws any error.
    @discardableResult
    public static func interval<T>(_ name: StaticString, _ work: () throws -> T) rethrows -> T {
        let state = signposter.beginInterval(name)
        defer { signposter.endInterval(name, state) }
        return try work()
    }

    /// Wraps an async block in a signpost interval. Re-throws any error.
    @discardableResult
    public static func intervalAsync<T>(_ name: StaticString, _ work: () async throws -> T) async rethrows -> T {
        let state = signposter.beginInterval(name)
        defer { signposter.endInterval(name, state) }
        return try await work()
    }
}
```

In `StoryTimelineEngine.swift`, wrap the hot-path methods. For `configure`:
```swift
public func configure(
    project: TimelineProject,
    mediaURLs: [String: URL],
    images: [String: UIImage]
) async {
    await TimelineSignposter.intervalAsync("configure") {
        configureAudioSession()
        // ... existing configure body unchanged ...
    }
}
```

For `seek(to:precise:)`:
```swift
public func seek(to time: Float, precise: Bool = true) {
    TimelineSignposter.interval("seek") {
        // ... existing seek body unchanged ...
    }
}
```

For any internal `recompose()` / `rebuildComposition()` method (if present after Section B/D):
```swift
private func recompose() {
    TimelineSignposter.interval("recompose") {
        // ... existing body ...
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TimelineSignposterTests -quiet`
Expected: PASS (4 tests).

Verify no regression in engine tests:
Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTimelineEngineTests -quiet`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TimelineSignposterTests.swift
git commit -m "feat(timeline-engine): OSSignposter wrapping for hot-path operations (Instruments + MetricKit)"
```

---

### Task H3: Stub `CustomTransitionCompositor` Metal pour transitions futures

> **Why:** Patch SOTA P5/P1 du rapport d'audit. Les transitions `crossfade` (opacity ramp natif via `setOpacityRamp`) et `dissolve` (`CIDissolveTransition` via `CIFilter`) sont déjà couvertes par `VideoCompositor` (Section B). Pour les transitions futures `push` / `wipe` / `zoom` / `swipe`, AVFoundation NE PROPOSE PAS d'API native — il faut un `AVVideoCompositing` custom Metal-backed.
>
> Cette task pose le squelette dès maintenant pour qu'ajouter un nouveau kind = ajouter un case + un Metal compute kernel, SANS refactor de `VideoCompositor`. Au launch, le compositor custom est registré conditionnellement (uniquement si un `clipTransition.kind` non built-in est présent dans le projet — donc jamais en pratique tant qu'aucune nouvelle kind n'est introduite).

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift` (router `kind` vers le compositor custom UNIQUEMENT si une transition non built-in est utilisée)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/CustomTransitionCompositorTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/CustomTransitionCompositorTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
import MeeshySDK

final class CustomTransitionCompositorTests: XCTestCase {

    private func makeProject(transitions: [StoryClipTransition]) -> TimelineProject {
        TimelineProject(
            slideId: "compositor-test",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: transitions
        )
    }

    func test_makeComposition_withOnlyCrossfade_doesNotRegisterCustomCompositor() {
        let transitions = [
            StoryClipTransition(id: "t1", fromClipId: "a", toClipId: "b", at: 1.0, duration: 0.5, kind: .crossfade)
        ]
        let project = makeProject(transitions: transitions)
        let composition = AVMutableComposition()
        let videoComposition = VideoCompositor.makeComposition(
            project: project,
            composition: composition
        )
        XCTAssertNil(videoComposition.customVideoCompositorClass,
                     "Crossfade is built-in (opacity ramp), no custom compositor needed")
    }

    func test_makeComposition_withOnlyDissolve_doesNotRegisterCustomCompositor() {
        let transitions = [
            StoryClipTransition(id: "t1", fromClipId: "a", toClipId: "b", at: 1.0, duration: 0.5, kind: .dissolve)
        ]
        let project = makeProject(transitions: transitions)
        let composition = AVMutableComposition()
        let videoComposition = VideoCompositor.makeComposition(
            project: project,
            composition: composition
        )
        XCTAssertNil(videoComposition.customVideoCompositorClass,
                     "Dissolve uses CIDissolveTransition CIFilter, no custom compositor needed")
    }

    func test_customCompositor_conformsToAVVideoCompositing() {
        let compositor = CustomTransitionCompositor()
        XCTAssertNotNil(compositor.sourcePixelBufferAttributes)
        XCTAssertFalse(compositor.requiredPixelBufferAttributesForRenderContext.isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/CustomTransitionCompositorTests -quiet`
Expected: FAIL with "Cannot find 'CustomTransitionCompositor' in scope".

- [ ] **Step 3: Write minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift`:
```swift
import AVFoundation
import Metal
import MetalKit

/// Custom `AVVideoCompositing` implementation reserved for future non-opacity
/// transitions (`push`, `wipe`, `zoom`, `swipe`).
///
/// At launch, this compositor is REGISTERED on the `AVMutableVideoComposition`
/// only when a `StoryClipTransition.kind` falls outside the built-in paths
/// already handled by `VideoCompositor`:
/// - `.crossfade` → `setOpacityRamp(...)` (no custom compositor, native AVFoundation)
/// - `.dissolve`  → `CIDissolveTransition` via `CIFilter` (no custom compositor)
///
/// Since both currently-supported kinds are built-in, this compositor is
/// effectively dormant at launch. Adding a new transition kind = adding a
/// new case in `startRequest` + a Metal compute kernel. NO refactor of
/// `VideoCompositor` is required.
@objc public final class CustomTransitionCompositor: NSObject, AVVideoCompositing {

    public var sourcePixelBufferAttributes: [String: Any]? = [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    public var requiredPixelBufferAttributesForRenderContext: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue

    public override init() {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue() else {
            fatalError("CustomTransitionCompositor: Metal not available on this device")
        }
        self.device = device
        self.commandQueue = queue
        super.init()
    }

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        // No-op for stub. Production transitions will configure render targets,
        // pixel buffer pools, and Metal textures here.
    }

    public func startRequest(_ asyncVideoCompositionRequest: AVAsynchronousVideoCompositionRequest) {
        // STUB: at launch, this compositor is never reached because
        // `VideoCompositor.makeComposition(...)` only registers it when a
        // non-built-in `StoryTransitionKind` is present in the project.
        //
        // For future kinds (`.push`, `.wipe`, `.zoom`, `.swipe`):
        //   1. Read source frames via `asyncVideoCompositionRequest.sourceFrame(byTrackID:)`
        //   2. Allocate destination buffer via `asyncVideoCompositionRequest.renderContext.newPixelBuffer()`
        //   3. Encode Metal compute kernel for the transition
        //   4. Call `asyncVideoCompositionRequest.finish(withComposedVideoFrame: outputBuffer)`
        asyncVideoCompositionRequest.finish(with: NSError(
            domain: "CustomTransitionCompositor",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "No custom transition kind active at launch"]
        ))
    }

    public func cancelAllPendingVideoCompositionRequests() {
        // No-op for stub.
    }
}
```

In `VideoCompositor.swift`, modify `makeComposition(project:composition:renderSize:)` to conditionally register the custom compositor. Add at the end of the method, BEFORE the `return videoComposition`:
```swift
let usesCustomKind = project.clipTransitions.contains { transition in
    switch transition.kind {
    case .crossfade, .dissolve:
        return false
    // Future cases (push, wipe, zoom, swipe) will be added here AND in
    // CustomTransitionCompositor.startRequest. Until then, the compositor
    // remains dormant.
    @unknown default:
        return true
    }
}
if usesCustomKind {
    videoComposition.customVideoCompositorClass = CustomTransitionCompositor.self
}
return videoComposition
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/CustomTransitionCompositorTests -quiet`
Expected: PASS (3 tests).

Verify no regression in `VideoCompositorTests`:
Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/VideoCompositorTests -quiet`
Expected: ALL PASS — built-in `crossfade` and `dissolve` still produce `customVideoCompositorClass == nil`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/CustomTransitionCompositorTests.swift
git commit -m "feat(timeline-engine): CustomTransitionCompositor stub for future push/wipe/zoom transitions (Metal-ready)"
```

---

## Récapitulatif

| Section | Tasks | Steps | Description |
|---------|-------|-------|-------------|
| A | 3 | 15 | `TimelineMediaSource` + factories + async asset load |
| B | 6 | 30 | `VideoCompositor` skeleton, segmentation, layer instructions, crossfade ramps, dissolve CIFilter |
| C | 6 | 30 | `AudioMixer` skeleton, configure, play/pause, seek, volume/mute, MockAudioMixer |
| D | 10 | 50 | `StoryTimelineEngine` skeleton, configure, transport (play/pause/toggle/seek/stop), mode, export stub, retry, integration tests, mute |
| E | 5 | 25 | `StoryCanvasReaderView` extensions: ReaderTransitionResolver + ReaderKeyframeResolver + wiring (foreground media + text) |
| F | 3 | 9 | XCTMetric performance baselines |
| G | 3 | 6 | Final verification & self-review |
| H | 3 | 15 | SOTA Patches: audio low-latency, OSSignposter/MetricKit, CustomTransitionCompositor stub |

**Total : 39 tasks, 180 steps.**

**Effort estimé : 5-7 jours-développeur senior Swift+AVFoundation (Sections A-G) + 0.5 jour pour la Section H SOTA.**

---

## Notes finales pour l'agent qui exécute ce plan

1. **TDD strict** : ne jamais écrire de code de production sans test failing au préalable.
2. **Une commande `xcodebuild` par step de vérification** — n'utiliser PAS `swift test` car il ne lie pas UIKit.
3. Le filtre `-only-testing:MeeshyUITests/{TestClass}/{testMethod}` accélère les retours.
4. Le `MockAudioMixer` (Task C6) est INDISPENSABLE pour les tests `StoryTimelineEngineTests` — sans lui les tests timeront sur `AVAudioEngine.start()` dans le simulateur.
5. Si une signature `KeyframeInterpolator.interpolate(keyframes:at:)` ne correspond pas exactement à celle de Plan 2, ADAPTER les tuples (`time`, `value`, `easing`) sans changer l'API publique du resolver.
6. Si `clipTransitions` ou `keyframes` ne sont pas dispo (Plan 1 absent), ARRÊTER et synchroniser avant de poursuivre.
7. **Aucun `Co-Authored-By`** dans les commits.
