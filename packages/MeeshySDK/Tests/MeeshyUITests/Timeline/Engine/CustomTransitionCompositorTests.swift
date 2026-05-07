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

    // MARK: - B4: Metal soft-fail gate

    /// Modern iOS simulators expose Metal — this confirms the gate is reachable
    /// and will not suppress compositor registration on supported hardware.
    func test_isMetalAvailable_isTrueOnSimulator() {
        XCTAssertTrue(
            CustomTransitionCompositor.isMetalAvailable,
            "Modern simulators have Metal; isMetalAvailable must return true here"
        )
    }

    /// When only built-in transition kinds (crossfade / dissolve) are present,
    /// VideoCompositor must never assign CustomTransitionCompositor.self as the
    /// custom compositor class — whether or not Metal is available.
    func test_makeComposition_onlyBuiltInKinds_neverSetsCustomTransitionCompositor() {
        let builtIn: [StoryTransitionKind] = [.crossfade, .dissolve]
        for kind in builtIn {
            let transition = StoryClipTransition(
                fromClipId: "a", toClipId: "b",
                kind: kind, duration: 0.5
            )
            let project = makeProject(transitions: [transition])
            let composition = AVMutableComposition()
            let videoComposition = VideoCompositor.makeComposition(
                project: project,
                composition: composition
            )
            let isCustom = videoComposition.customVideoCompositorClass == CustomTransitionCompositor.self
            XCTAssertFalse(
                isCustom,
                "kind=\(kind.rawValue) must not register CustomTransitionCompositor"
            )
        }
    }
}
