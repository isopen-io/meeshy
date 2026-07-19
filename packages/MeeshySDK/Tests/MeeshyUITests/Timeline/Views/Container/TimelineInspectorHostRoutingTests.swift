import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards the unified-timeline inspector routing: the floating inspector host
/// (extracted from the former Pro container) must surface the right inspector
/// for the current selection, and the SINGLE timeline view (Quick design)
/// must host it — selection in the unified view can no longer be a dead end.
///
/// `selection.selectedClipId` is a shared bus — `KeyframeMarkerView` and
/// `TransitionBadge` push their own ids through `selectClip(id:)`, so the
/// host can't assume the selected id is a clip. These tests exercise the
/// pure resolution helpers + the `SelectionKind` dispatcher so we don't have
/// to drive SwiftUI gestures.
@MainActor
final class TimelineInspectorHostRoutingTests: XCTestCase {

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

    func test_resolveSelectionKind_clipSelection_returnsClip() {
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        guard case .clip(let snapshot) = TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .clip selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "clip-1")
        XCTAssertEqual(snapshot.kind, .video)
    }

    func test_resolveSelectionKind_keyframeSelection_returnsKeyframe() {
        let vm = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        vm.selectClip(id: "kf-1")
        guard case .keyframe(let snapshot, let clipId) =
                TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .keyframe selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "kf-1")
        XCTAssertEqual(clipId, "media-1")
    }

    func test_resolveSelectionKind_transitionSelection_returnsTransition() {
        let vm = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        vm.selectClip(id: "trans-1")
        guard case .transition(let snapshot) =
                TimelineInspectorHost.resolveSelectionKind(viewModel: vm) else {
            XCTFail("Expected .transition selection kind")
            return
        }
        XCTAssertEqual(snapshot.id, "trans-1")
        XCTAssertEqual(snapshot.kind, .crossfade)
    }

    func test_resolveSelectionKind_noSelection_returnsNil() {
        let vm = makeViewModel(project: projectWithClip())
        XCTAssertNil(TimelineInspectorHost.resolveSelectionKind(viewModel: vm))
    }

    func test_resolveSelectionKind_unknownId_returnsNil() {
        let vm = makeViewModel(project: projectWithClip(clipId: "real-clip"))
        vm.selectClip(id: "ghost-id")
        XCTAssertNil(TimelineInspectorHost.resolveSelectionKind(viewModel: vm))
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
        guard let resolved = TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm) else {
            XCTFail("Expected a keyframe snapshot")
            return
        }
        XCTAssertEqual(resolved.snapshot.id, "kf-1")
        XCTAssertEqual(resolved.clipId, "media-1")
        XCTAssertEqual(resolved.snapshot.absoluteTime, 1.5, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.x, 0.4, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.y, 0.6, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.scale, 1.2, accuracy: 0.001)
        XCTAssertEqual(resolved.snapshot.opacity, 0.9, accuracy: 0.001)
    }

    func test_resolveKeyframeSnapshot_clipSelection_returnsNil() {
        let vm = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        vm.selectClip(id: "clip-1")
        XCTAssertNil(TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm))
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
        guard let snapshot = TimelineInspectorHost.resolveTransitionSnapshot(viewModel: vm) else {
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
        XCTAssertNil(TimelineInspectorHost.resolveTransitionSnapshot(viewModel: vm))
    }

    // MARK: - Unified view hosts the inspector (no more dead-end selection)

    /// The SINGLE timeline view (Quick design) must evaluate its body without
    /// crashing for every selection kind — clip, keyframe AND transition —
    /// because the inspector host now overlays it. Before the merge, selecting
    /// a transition in the quick view surfaced nothing at all.
    func test_quickView_bodyDoesNotCrash_forEachSelectionKind() {
        let clipVM = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        clipVM.selectClip(id: "clip-1")
        _ = StoryTimelineView(viewModel: clipVM).body

        let kfVM = makeViewModel(project: projectWithKeyframe(keyframeId: "kf-1"))
        kfVM.selectClip(id: "kf-1")
        _ = StoryTimelineView(viewModel: kfVM).body

        let transVM = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        transVM.selectClip(id: "trans-1")
        _ = StoryTimelineView(viewModel: transVM).body
    }

    /// Host view itself renders standalone for each branch.
    func test_hostBody_doesNotCrash_forEachSelectionKind() {
        let clipVM = makeViewModel(project: projectWithClip(clipId: "clip-1"))
        clipVM.selectClip(id: "clip-1")
        _ = TimelineInspectorHost(viewModel: clipVM).body

        let transVM = makeViewModel(project: projectWithTransition(transitionId: "trans-1"))
        transVM.selectClip(id: "trans-1")
        _ = TimelineInspectorHost(viewModel: transVM).body
    }
}
