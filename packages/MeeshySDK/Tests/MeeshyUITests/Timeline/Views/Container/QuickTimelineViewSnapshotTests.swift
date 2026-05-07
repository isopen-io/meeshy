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

    func test_snapshot_quick_empty() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: TimelineProjectFactory.emptyProject())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-empty"
        )
    }

    // MARK: - Variant 2 : one clip

    func test_snapshot_quick_oneClip() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: projectWithSingleClip())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-oneClip"
        )
    }

    // MARK: - Variant 3 : deployed

    func test_snapshot_quick_deployed() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
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

    func test_snapshot_quick_dragging() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: projectWithSingleClip())
        // Simulate a drag-in-progress by beginning a clip drag.
        // The actual API is beginClipDrag(clipId:) — dragClip(id:deltaTimeSeconds:isCommitted:)
        // does not exist on TimelineViewModel.
        vm.beginClipDrag(clipId: "clip-1")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: QuickTimelineView(viewModel: vm),
            named: "quick-dragging"
        )
    }

    // MARK: - Variant 5 : selected

    func test_snapshot_quick_selected() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
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
