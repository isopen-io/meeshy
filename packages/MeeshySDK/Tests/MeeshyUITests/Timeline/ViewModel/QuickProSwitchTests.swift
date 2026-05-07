import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 47 — QuickPro switch tests.
/// Uses the `dragClip(id:deltaTimeSeconds:isCommitted:)` convenience alias
/// and `commandHistoryDepth` getter added to TimelineViewModel.
@MainActor
final class QuickProSwitchTests: XCTestCase {

    private func makeSUT(
        project: TimelineProject = TimelineProjectFactory.projectWithVideoClip(startTime: 0)
    ) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    // MARK: - Test 1: mode switch preserves command stack

    func test_switchToProAndBack_commandHistoryDepthUnchanged() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        // Perform a drag to create a command
        sut.dragClip(id: "clip-1", deltaTimeSeconds: 2.0, isCommitted: true)
        let depthBefore = sut.commandHistoryDepth

        // Switch to pro and back
        sut.setMode(.pro)
        sut.setMode(.quick)

        XCTAssertEqual(sut.commandHistoryDepth, depthBefore,
                       "Mode switch must not alter command history depth")
        XCTAssertTrue(sut.canUndo, "Undo must still be available after mode switch")
    }

    // MARK: - Test 2: undo after mode switch reverts correctly

    func test_undoAfterProSwitch_revertsClipPosition() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        sut.dragClip(id: "clip-1", deltaTimeSeconds: 3.0, isCommitted: true)
        let movedTime = sut.project.mediaObjects.first?.startTime ?? -1
        XCTAssertEqual(movedTime, 3.0, accuracy: 0.05)

        sut.setMode(.pro)
        sut.undo()

        let revertedTime = sut.project.mediaObjects.first?.startTime ?? -1
        XCTAssertEqual(revertedTime, 0.0, accuracy: 0.001,
                       "Undo in pro mode must revert clip to original position")
    }

    // MARK: - Test 3: snap toggle persists across mode switch

    func test_snapToggle_persistsAcrossModeSwitch() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        XCTAssertTrue(sut.isSnapEnabled)
        sut.toggleSnap()
        XCTAssertFalse(sut.isSnapEnabled)

        sut.setMode(.pro)
        XCTAssertFalse(sut.isSnapEnabled, "Snap state must persist when switching to pro mode")

        sut.setMode(.quick)
        XCTAssertFalse(sut.isSnapEnabled, "Snap state must persist when switching back to quick mode")
    }
}
