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
            StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 0.5)
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

    func test_makeComposition_withOnlyDissolve_attachesDissolveCompositor() {
        let transitions = [
            StoryClipTransition(fromClipId: "a", toClipId: "b", kind: .dissolve, duration: 0.5)
        ]
        let project = makeProject(transitions: transitions)
        let composition = AVMutableComposition()
        let videoComposition = VideoCompositor.makeComposition(
            project: project,
            composition: composition
        )
        // Dissolve uses CIDissolveTransition CIFilter — DissolveVideoCompositor IS the custom compositor for it.
        XCTAssertNotNil(videoComposition.customVideoCompositorClass)
    }

    func test_customCompositor_conformsToAVVideoCompositing() {
        let compositor = CustomTransitionCompositor()
        XCTAssertNotNil(compositor.sourcePixelBufferAttributes)
        XCTAssertFalse(compositor.requiredPixelBufferAttributesForRenderContext.isEmpty)
    }
}
