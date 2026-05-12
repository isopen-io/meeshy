import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression tests for the `VideoCompositor` → `AVMutableVideoCompositionInstruction.layerInstructions`
/// wiring. Prior to the fix, `makeComposition` always emitted `layerInstructions = []`, so
/// native crossfade opacity ramps never ran AND the custom dissolve compositor received zero
/// source track IDs.
final class VideoCompositor_LayerInstructionsTests: XCTestCase {

    // MARK: - Test fixture helpers

    fileprivate func makeProject(
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

    fileprivate func makeVideoClip(
        id: String,
        startTime: Double,
        duration: Double,
        fadeIn: Double? = nil,
        fadeOut: Double? = nil
    ) -> StoryMediaObject {
        StoryMediaObject(
            id: id, postMediaId: "pm-\(id)",
            mediaType: "video", placement: "media",
            aspectRatio: 1.0,
            startTime: startTime, duration: duration,
            fadeIn: fadeIn, fadeOut: fadeOut
        )
    }

    /// Insert a stub video track for each clip so the composition has a 1:1
    /// trackID mapping that `makeComposition` can resolve. We do NOT load real
    /// media — we only need a non-invalid `trackID` on each track. AVFoundation
    /// is happy with empty tracks for layer-instruction wiring assertions.
    fileprivate func insertStubTracks(
        for clips: [StoryMediaObject],
        into composition: AVMutableComposition
    ) -> [String: CMPersistentTrackID] {
        var map: [String: CMPersistentTrackID] = [:]
        for clip in clips {
            let track = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )
            if let trackID = track?.trackID {
                map[clip.id] = trackID
            }
        }
        return map
    }

    fileprivate func layerInstructions(
        in instruction: AVVideoCompositionInstructionProtocol
    ) -> [AVVideoCompositionLayerInstruction] {
        instruction.layerInstructions
    }

    // MARK: - 1. Single clip, no transition, no fade — emits instruction with trackID, no ramps

    func test_makeComposition_singleClip_noTransition_emitsLayerInstructionWithoutRamps() {
        let clip = makeVideoClip(id: "v1", startTime: 0, duration: 10)
        let project = makeProject(slideDuration: 10, media: [clip])
        let composition = AVMutableComposition()
        let tracks = insertStubTracks(for: [clip], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        XCTAssertEqual(videoComposition.instructions.count, 1)
        let layers = layerInstructions(in: videoComposition.instructions[0])
        XCTAssertEqual(layers.count, 1, "Active clip with known trackID must produce a layer instruction")
        XCTAssertEqual(layers[0].trackID, tracks["v1"])

        var startOpacity: Float = -1
        var endOpacity: Float = -1
        var rampRange = CMTimeRange.zero
        let hasRamp = layers[0].getOpacityRamp(
            for: CMTime(seconds: 0, preferredTimescale: 600),
            startOpacity: &startOpacity,
            endOpacity: &endOpacity,
            timeRange: &rampRange
        )
        XCTAssertFalse(hasRamp, "No fade/transition → no opacity ramp configured")
    }

    // MARK: - 2. Clip with fadeIn → opacityRamp 0→1 at leading edge

    func test_makeComposition_clipWithFadeIn_attachesOpacityRampAtLeadingEdge() {
        let clip = makeVideoClip(id: "v1", startTime: 0, duration: 5, fadeIn: 1.0)
        let project = makeProject(slideDuration: 5, media: [clip])
        let composition = AVMutableComposition()
        _ = insertStubTracks(for: [clip], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        XCTAssertEqual(videoComposition.instructions.count, 1)
        let layers = layerInstructions(in: videoComposition.instructions[0])
        XCTAssertEqual(layers.count, 1)

        var startOpacity: Float = -1
        var endOpacity: Float = -1
        var rampRange = CMTimeRange.zero
        let found = layers[0].getOpacityRamp(
            for: CMTime(seconds: 0.0, preferredTimescale: 600),
            startOpacity: &startOpacity,
            endOpacity: &endOpacity,
            timeRange: &rampRange
        )
        XCTAssertTrue(found, "FadeIn=1s must register an opacity ramp at the clip leading edge")
        XCTAssertEqual(startOpacity, 0, accuracy: 0.001)
        XCTAssertEqual(endOpacity, 1, accuracy: 0.001)
        XCTAssertEqual(CMTimeGetSeconds(rampRange.duration), 1.0, accuracy: 0.001)
        XCTAssertEqual(CMTimeGetSeconds(rampRange.start), 0.0, accuracy: 0.001)
    }

    // MARK: - 3. Clip with fadeOut → opacityRamp 1→0 at trailing edge

    func test_makeComposition_clipWithFadeOut_attachesOpacityRampAtTrailingEdge() {
        let clip = makeVideoClip(id: "v1", startTime: 0, duration: 5, fadeOut: 0.5)
        let project = makeProject(slideDuration: 5, media: [clip])
        let composition = AVMutableComposition()
        _ = insertStubTracks(for: [clip], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        let layers = layerInstructions(in: videoComposition.instructions[0])
        XCTAssertEqual(layers.count, 1)

        // Query inside the fade-out window (4.5 → 5.0)
        var startOpacity: Float = -1
        var endOpacity: Float = -1
        var rampRange = CMTimeRange.zero
        let found = layers[0].getOpacityRamp(
            for: CMTime(seconds: 4.75, preferredTimescale: 600),
            startOpacity: &startOpacity,
            endOpacity: &endOpacity,
            timeRange: &rampRange
        )
        XCTAssertTrue(found, "FadeOut=0.5s must register an opacity ramp at the clip trailing edge")
        XCTAssertEqual(startOpacity, 1, accuracy: 0.001)
        XCTAssertEqual(endOpacity, 0, accuracy: 0.001)
        XCTAssertEqual(CMTimeGetSeconds(rampRange.duration), 0.5, accuracy: 0.001)
        XCTAssertEqual(CMTimeGetSeconds(CMTimeRangeGetEnd(rampRange)), 5.0, accuracy: 0.001)
    }

    // MARK: - 4. Two clips with native crossfade → both layer instructions emit ramps

    func test_makeComposition_overlappingClipsWithCrossfade_attachesOpacityRampsOnBothLayers() {
        // Two adjacent clips, overlapping by 1s with a crossfade transition.
        let clipA = makeVideoClip(id: "a", startTime: 0, duration: 5)
        let clipB = makeVideoClip(id: "b", startTime: 4, duration: 5)
        let transition = StoryClipTransition(
            fromClipId: "a", toClipId: "b",
            kind: .crossfade, duration: 1.0
        )
        let project = makeProject(
            slideDuration: 9, media: [clipA, clipB], transitions: [transition]
        )
        let composition = AVMutableComposition()
        let trackMap = insertStubTracks(for: [clipA, clipB], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        // Crossfade-only project → NO custom compositor (native blending).
        XCTAssertNil(videoComposition.customVideoCompositorClass)

        // Locate the overlap segment (4.0 → 5.0), which has both clips active.
        let overlapInstruction = videoComposition.instructions.first { inst in
            let start = CMTimeGetSeconds(inst.timeRange.start)
            let dur = CMTimeGetSeconds(inst.timeRange.duration)
            return abs(start - 4.0) < 0.01 && abs(dur - 1.0) < 0.01
        }
        XCTAssertNotNil(overlapInstruction, "Expected a segment spanning the 4.0→5.0 overlap window")
        let layers = layerInstructions(in: overlapInstruction!)
        XCTAssertEqual(layers.count, 2, "Both overlapping clips must contribute a layer instruction")

        // Layer-A (outgoing): 1→0 ramp ending at clipA's trailing edge (t=5)
        let layerA = layers.first { $0.trackID == trackMap["a"] }
        XCTAssertNotNil(layerA)
        var startOpacityA: Float = -1
        var endOpacityA: Float = -1
        var rampRangeA = CMTimeRange.zero
        let foundA = layerA!.getOpacityRamp(
            for: CMTime(seconds: 4.5, preferredTimescale: 600),
            startOpacity: &startOpacityA,
            endOpacity: &endOpacityA,
            timeRange: &rampRangeA
        )
        XCTAssertTrue(foundA, "Outgoing clip must have a fade-out ramp during the crossfade")
        XCTAssertEqual(startOpacityA, 1, accuracy: 0.001)
        XCTAssertEqual(endOpacityA, 0, accuracy: 0.001)

        // Layer-B (incoming): 0→1 ramp starting at clipB's leading edge (t=4)
        let layerB = layers.first { $0.trackID == trackMap["b"] }
        XCTAssertNotNil(layerB)
        var startOpacityB: Float = -1
        var endOpacityB: Float = -1
        var rampRangeB = CMTimeRange.zero
        let foundB = layerB!.getOpacityRamp(
            for: CMTime(seconds: 4.5, preferredTimescale: 600),
            startOpacity: &startOpacityB,
            endOpacity: &endOpacityB,
            timeRange: &rampRangeB
        )
        XCTAssertTrue(foundB, "Incoming clip must have a fade-in ramp during the crossfade")
        XCTAssertEqual(startOpacityB, 0, accuracy: 0.001)
        XCTAssertEqual(endOpacityB, 1, accuracy: 0.001)
    }

    // MARK: - 5. Dissolve transition → layers emit trackIDs (compositor needs them), no opacity ramps

    /// The custom `DissolveVideoCompositor` reads `sourceTrackIDs` from each layer
    /// instruction to fetch source frames. Without layer instructions, the dissolve
    /// path is dead. We also assert that NO opacity ramp is set on the dissolve
    /// segments — the compositor handles the per-pixel blend itself, and a native
    /// ramp would double-up the fade.
    func test_makeComposition_dissolveTransition_emitsLayersWithoutOpacityRamps() {
        let clipA = makeVideoClip(id: "a", startTime: 0, duration: 5)
        let clipB = makeVideoClip(id: "b", startTime: 4, duration: 5)
        let transition = StoryClipTransition(
            fromClipId: "a", toClipId: "b",
            kind: .dissolve, duration: 1.0
        )
        let project = makeProject(
            slideDuration: 9, media: [clipA, clipB], transitions: [transition]
        )
        let composition = AVMutableComposition()
        let trackMap = insertStubTracks(for: [clipA, clipB], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        XCTAssertNotNil(
            videoComposition.customVideoCompositorClass,
            "Dissolve project must register DissolveVideoCompositor"
        )

        // Overlap segment 4.0 → 5.0 must contain both clips' layer instructions
        // so the dissolve compositor receives 2 sourceTrackIDs.
        let overlapInstruction = videoComposition.instructions.first { inst in
            let start = CMTimeGetSeconds(inst.timeRange.start)
            let dur = CMTimeGetSeconds(inst.timeRange.duration)
            return abs(start - 4.0) < 0.01 && abs(dur - 1.0) < 0.01
        }
        XCTAssertNotNil(overlapInstruction)
        let layers = layerInstructions(in: overlapInstruction!)
        XCTAssertEqual(
            layers.count, 2,
            "Dissolve compositor needs both source tracks; layer instructions cannot be empty"
        )
        let trackIDs = Set(layers.map { $0.trackID })
        XCTAssertEqual(trackIDs, Set([trackMap["a"]!, trackMap["b"]!]))

        // No opacity ramp should be set — the custom compositor owns blending.
        for layer in layers {
            var startOpacity: Float = -1
            var endOpacity: Float = -1
            var rampRange = CMTimeRange.zero
            let found = layer.getOpacityRamp(
                for: CMTime(seconds: 4.5, preferredTimescale: 600),
                startOpacity: &startOpacity,
                endOpacity: &endOpacity,
                timeRange: &rampRange
            )
            XCTAssertFalse(
                found,
                "Dissolve path must NOT attach a native opacity ramp — the CIFilter handles the blend"
            )
        }
    }

    // MARK: - 6. Empty composition (no tracks) → preserves legacy empty-layers contract

    /// Backward-compat: existing tests in `VideoCompositorTests` call `makeComposition`
    /// WITHOUT inserting any video tracks. The fix must preserve their expectations —
    /// when no tracks exist, no layer instructions are emitted (nothing to attach to).
    func test_makeComposition_compositionHasNoTracks_emitsEmptyLayerInstructions() {
        let clip = makeVideoClip(id: "v1", startTime: 2, duration: 4)
        let project = makeProject(slideDuration: 10, media: [clip])
        let composition = AVMutableComposition()  // no tracks inserted

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        XCTAssertEqual(videoComposition.instructions.count, 3)
        for instruction in videoComposition.instructions {
            XCTAssertEqual(
                layerInstructions(in: instruction).count, 0,
                "When the composition has no video tracks, layer instructions stay empty (legacy contract)"
            )
        }
    }

    // MARK: - 7. trackID mapping pairs clips with tracks in insertion order

    func test_makeComposition_layerInstructions_useCompositionTrackIDsInOrder() {
        let clipA = makeVideoClip(id: "a", startTime: 0, duration: 10)
        let clipB = makeVideoClip(id: "b", startTime: 0, duration: 10)
        let project = makeProject(slideDuration: 10, media: [clipA, clipB])
        let composition = AVMutableComposition()
        let trackMap = insertStubTracks(for: [clipA, clipB], into: composition)

        let videoComposition = VideoCompositor.makeComposition(
            project: project, composition: composition
        )

        XCTAssertEqual(videoComposition.instructions.count, 1)
        let layers = layerInstructions(in: videoComposition.instructions[0])
        XCTAssertEqual(layers.count, 2)
        let layerTrackIDs = Set(layers.map { $0.trackID })
        XCTAssertEqual(layerTrackIDs, Set([trackMap["a"]!, trackMap["b"]!]))
    }
}
