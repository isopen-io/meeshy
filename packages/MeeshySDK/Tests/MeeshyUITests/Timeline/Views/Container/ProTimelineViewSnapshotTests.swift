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
        var video1 = StoryMediaObject(id: "v1", postMediaId: "v1", kind: .video, aspectRatio: 1.0)
        video1.startTime = 0; video1.duration = 4
        var video2 = StoryMediaObject(id: "v2", postMediaId: "v2", kind: .video, aspectRatio: 1.0)
        video2.startTime = 4; video2.duration = 4
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "a1")
        audio.startTime = 0; audio.duration = 8; audio.volume = 0.7
        var text = StoryTextObject(id: "t1", text: "Story")
        text.startTime = 1; text.duration = 3
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

    func test_snapshot_pro_iPadLandscape_inspectorClosed() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorClosed"
        )
    }

    // MARK: - Variant 2 : iPad landscape, inspector open (selected clip)

    func test_snapshot_pro_iPadLandscape_inspectorOpen() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: projectWithEditorialContent())
        vm.selectClip(id: "v1")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorOpen"
        )
    }

    // MARK: - Variant 3 : Portrait fallback on iPhone

    func test_snapshot_pro_portraitFallback_iPhone() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
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

    func test_snapshot_pro_iPadLandscape_withTransition() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-withTransition"
        )
    }
}
