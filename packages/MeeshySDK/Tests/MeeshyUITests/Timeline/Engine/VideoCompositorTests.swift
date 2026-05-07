import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

final class VideoCompositorTests: XCTestCase {

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

    // MARK: - B2: Full-slide instruction default

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

    // MARK: - B3: Segments at clip boundaries

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

    // MARK: - B4: makeLayerInstruction

    func test_insertVideoTrack_returnsCompositionTrackWithTrackID() {
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
        XCTAssertEqual(layerInstruction.trackID, 42)
    }

    // MARK: - B5: Crossfade transitions

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

    // MARK: - B6: GPU dissolve

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

    func test_dissolveCompositor_render_appliesCIDissolveTransition() {
        let compositor = DissolveVideoCompositor()
        XCTAssertEqual(compositor.transitionFilterName, "CIDissolveTransition")
    }
}
