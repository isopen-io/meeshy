import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards P3 Wave 3 routing: the bottom-leading inspector overlay must
/// surface the right inspector for the current selection.
///
/// `selection.selectedClipId` is a shared bus — `KeyframeMarkerView` and
/// `TransitionBadge` push their own ids through `selectClip(id:)`, so the
/// overlay can't assume the selected id is a clip. These tests exercise the
/// pure resolution helpers + the `SelectionKind` dispatcher so we don't have
/// to drive SwiftUI gestures.
@MainActor
final class ProTimelineViewInspectorOverlayRoutingTests: XCTestCase {

    // MARK: - Fixtures

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func projectWithKeyframe(
        clipId: String = "media-1",
        clipStart: Double = 1.0,
        keyframeId: String = "kf-1",
        keyframeRelativeTime: Float = 0.5
    ) -> TimelineProject {
        let keyframe = StoryKeyframe(
            id: keyframeId,
            time: keyframeRelativeTime,
            x: 0.4, y: 0.6, scale: 1.2, opacity: 0.9,
            easing: .linear
        )
        var media = StoryMediaObject(
            id: clipId, postMediaId: "post-\(clipId)",
            kind: .image, aspectRatio: 1.0
        )
        media.startTime = clipStart
        media.duration = 3
        media.keyframes = [keyframe]
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    private func projectWithTransition(
        transitionId: String = "trans-1",
        fromClipId: String = "media-a",
        toClipId: String = "media-b",
        kind: StoryTransitionKind = .crossfade,
        duration: Float = 0.5
    ) -> TimelineProject {
        var fromMedia = StoryMediaObject(id: fromClipId, postMediaId: "post-a",
                                         kind: .video, aspectRatio: 1.0)
        fromMedia.startTime = 0
        fromMedia.duration = 4
        var toMedia = StoryMediaObject(id: toClipId, postMediaId: "post-b",
                                       kind: .video, aspectRatio: 1.0)
        toMedia.startTime = 4
        toMedia.duration = 4
        let transition = StoryClipTransition(
            id: transitionId,
            fromClipId: fromClipId,
            toClipId: toClipId,
            kind: kind,
            duration: duration,
            easing: .linear
        )
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [fromMedia, toMedia],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: [transition]
        )
    }

    private func projectWithClip(clipId: String = "media-1") -> TimelineProject {
        var media = StoryMediaObject(id: clipId, postMediaId: "post-\(clipId)",
                                     kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 4
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    // MARK: - Dispatcher routing (SelectionKind)

    func test_inspectorOverlay_clipSelection_showsClipInspector() {
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        guard case .clip(let snapshot) = ProTimelineView.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .clip selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "clip-1")
        XCTAssertEqual(snapshot.kind, .video)
    }

    func test_inspectorOverlay_keyframeSelection_showsKeyframeInspector() {
        let vm = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        vm.selectClip(id: "kf-1")
        guard case .keyframe(let snapshot, let clipId) =
                ProTimelineView.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .keyframe selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "kf-1")
        XCTAssertEqual(clipId, "media-1")
    }

    func test_inspectorOverlay_transitionSelection_showsTransitionInspector() {
        let vm = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        vm.selectClip(id: "trans-1")
        guard case .transition(let snapshot) =
                ProTimelineView.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .transition selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "trans-1")
        XCTAssertEqual(snapshot.kind, .crossfade)
    }

    func test_inspectorOverlay_noSelection_returnsNil() {
        let vm = makeViewModel(project: projectWithClip())
        XCTAssertNil(ProTimelineView.resolveSelectionKind(viewModel: vm))
    }

    func test_inspectorOverlay_unknownId_returnsNil() {
        let vm = makeViewModel(project: projectWithClip(clipId: "real-clip"))
        vm.selectClip(id: "ghost-id")
        XCTAssertNil(ProTimelineView.resolveSelectionKind(viewModel: vm))
    }

    // MARK: - resolveKeyframeSnapshot

    func test_resolveKeyframeSnapshot_validId_returnsSnapshot() {
        let vm = makeViewModel(project: projectWithKeyframe(
            clipId: "media-1",
            clipStart: 1.0,
            keyframeId: "kf-1",
            keyframeRelativeTime: 0.5
        ))
        vm.selectClip(id: "kf-1")
        guard let resolved = ProTimelineView.resolveKeyframeSnapshot(viewModel: vm) else {
            XCTFail("Expected a keyframe snapshot")
            return
        }
        XCTAssertEqual(resolved.snapshot.id, "kf-1")
        XCTAssertEqual(resolved.clipId, "media-1")
        // absoluteTime = clipStart (1.0) + relative (0.5) = 1.5
        XCTAssertEqual(resolved.snapshot.absoluteTime, 1.5, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.x, 0.4, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.y, 0.6, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.scale, 1.2, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.opacity, 0.9, accuracy: 0.001)
    }

    func test_resolveKeyframeSnapshot_clipSelection_returnsNil() {
        // A clip-id selection must NOT bleed into the keyframe resolver — they
        // are disjoint id spaces and the overlay needs them routed separately.
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        XCTAssertNil(ProTimelineView.resolveKeyframeSnapshot(viewModel: vm))
    }

    // MARK: - resolveTransitionSnapshot

    func test_resolveTransitionSnapshot_validId_returnsSnapshot() {
        let vm = makeViewModel(project: projectWithTransition(
            transitionId: "trans-1",
            fromClipId: "a",
            toClipId: "b",
            kind: .dissolve,
            duration: 0.75
        ))
        vm.selectClip(id: "trans-1")
        guard let snapshot = ProTimelineView.resolveTransitionSnapshot(viewModel: vm) else {
            XCTFail("Expected a transition snapshot")
            return
        }
        XCTAssertEqual(snapshot.id, "trans-1")
        XCTAssertEqual(snapshot.fromClipId, "a")
        XCTAssertEqual(snapshot.toClipId, "b")
        XCTAssertEqual(snapshot.kind, .dissolve)
        XCTAssertEqual(snapshot.duration, 0.75, accuracy: 0.001)
    }

    func test_resolveTransitionSnapshot_unknownId_returnsNil() {
        let vm = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        vm.selectClip(id: "trans-ghost")
        XCTAssertNil(ProTimelineView.resolveTransitionSnapshot(viewModel: vm))
    }

    // MARK: - Body smoke (overlay does not crash for any branch)

    /// End-to-end body smoke: the SelectionKind switch in `inspectorOverlay`
    /// must compile through every branch. Mirrors the `_ = view.body` pattern
    /// used in `ProTimelineView_ClipKindTests`.
    func test_inspectorOverlay_bodyDoesNotCrash_forEachSelectionKind() {
        // Clip path
        let clipVM = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        clipVM.selectClip(id: "clip-1")
        _ = ProTimelineView(viewModel: clipVM).body

        // Keyframe path
        let kfVM = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        kfVM.selectClip(id: "kf-1")
        _ = ProTimelineView(viewModel: kfVM).body

        // Transition path
        let transVM = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        transVM.selectClip(id: "trans-1")
        _ = ProTimelineView(viewModel: transVM).body
    }
}
