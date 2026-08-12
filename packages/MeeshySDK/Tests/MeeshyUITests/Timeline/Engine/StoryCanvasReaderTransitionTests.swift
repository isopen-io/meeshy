import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryCanvasReaderTransitionTests: XCTestCase {

    private func makeMedia(id: String, start: Float, duration: Float) -> StoryMediaObject {
        StoryMediaObject(
            id: id, postMediaId: "pm-\(id)",
            mediaType: "video", placement: "media",
            aspectRatio: 1.0,
            startTime: Double(start), duration: Double(duration)
        )
    }

    func test_clipOpacity_outsideClipRange_isZero() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(for: media, transitions: [], currentTime: 6)
        XCTAssertEqual(opacity, 0, accuracy: 0.001)
    }

    func test_clipOpacity_withinClipRange_noTransition_isOne() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(for: media, transitions: [], currentTime: 2)
        XCTAssertEqual(opacity, 1, accuracy: 0.001)
    }

    func test_clipOpacity_outgoingCrossfade_atTrailingEdge_isHalfWayThroughTransition() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
        let opacity = ReaderTransitionResolver.opacity(for: media, transitions: [trans], currentTime: 4.5)
        XCTAssertEqual(opacity, 0.5, accuracy: 0.05)
    }

    func test_clipOpacity_incomingCrossfade_atLeadingEdge_isHalfWayThroughTransition() {
        let media = makeMedia(id: "b", start: 5, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
        let opacity = ReaderTransitionResolver.opacity(for: media, transitions: [trans], currentTime: 5.5)
        XCTAssertEqual(opacity, 0.5, accuracy: 0.05)
    }

    func test_clipOpacity_dissolveTransition_appliesCrossfadeFallbackRamp() {
        // C4 — le reader live n'a pas de compositor per-pixel : dissolve est
        // dégradé en rampe d'opacité crossfade (l'export MP4 garde le vrai
        // CIDissolve via DissolveVideoCompositor).
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .dissolve, duration: 1.0)
        let opacity = ReaderTransitionResolver.opacity(for: media, transitions: [trans], currentTime: 4.5)
        XCTAssertEqual(opacity, 0.5, accuracy: 0.05)
    }

    func test_resolverWiring_combinedWithBaseOpacity_multipliesValues() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let trans = StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.0)
        let baseOpacity: Float = 1.0
        let transitionOpacity = ReaderTransitionResolver.opacity(for: media, transitions: [trans], currentTime: 4.5)
        let combined = baseOpacity * transitionOpacity
        XCTAssertEqual(combined, 0.5, accuracy: 0.05)
    }
}
