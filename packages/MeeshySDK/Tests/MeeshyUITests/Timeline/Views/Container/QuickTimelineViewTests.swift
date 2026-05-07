import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class QuickTimelineViewTests: XCTestCase {

    private func makeViewModel(project: TimelineProject = TimelineProjectFactory.projectWithVideoClip()) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = QuickTimelineView(viewModel: makeViewModel())
        _ = view.body
    }

    func test_compactVisibleTracks_neverExceedsThree() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: nil,
            maxCount: QuickTimelineView.compactMaxTracks
        )
        XCTAssertLessThanOrEqual(resolved.count, QuickTimelineView.compactMaxTracks)
    }

    func test_compactVisibleTracks_alwaysIncludesSelectedClipTrack() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: "clip-1",
            maxCount: 1
        )
        XCTAssertTrue(resolved.contains(where: { $0.containsClipId("clip-1") }),
                      "Selected clip's track must be in the compact set even when room is tight")
    }

    func test_emptyMediaTrack_isNotCounted() {
        let resolved = QuickTimelineView.resolveCompactTracks(
            project: TimelineProjectFactory.emptyProject(),
            selectedClipId: nil,
            maxCount: 3
        )
        XCTAssertTrue(resolved.allSatisfy { !$0.isEmpty })
    }

    // MARK: - Task 33 tests

    func test_deployedState_listsAllNonEmptyTracks() {
        var project = TimelineProjectFactory.projectWithVideoClip()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a-1", postMediaId: "a-1",
                                   volume: 1.0, startTime: 0, duration: 5)
        ]
        let resolved = QuickTimelineView.resolveAllTracks(project: project)
        XCTAssertGreaterThanOrEqual(resolved.count, 2)
    }

    func test_deployedFooterCopy_isCollapseLabel() {
        XCTAssertEqual(QuickTimelineView.footerLabelKey(isExpanded: true),
                       "story.timeline.toolbar.collapseTracks")
        XCTAssertEqual(QuickTimelineView.footerLabelKey(isExpanded: false),
                       "story.timeline.toolbar.deployTracks")
    }

    func test_previewHeightFraction_compressesWhenExpanded() {
        XCTAssertGreaterThan(QuickTimelineView.previewHeightFraction(isExpanded: false),
                             QuickTimelineView.previewHeightFraction(isExpanded: true))
        XCTAssertEqual(QuickTimelineView.previewHeightFraction(isExpanded: true), 0.30, accuracy: 0.001)
    }
}
