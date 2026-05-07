import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 48 — Tests for `didExtendClip(id:overlapWithNextSeconds:)` — the semantic
/// entry-point used during transition drag-creation: the user drags the right edge
/// of clip A into clip B to create an overlap that will become a crossfade.
@MainActor
final class TransitionDragCreateTests: XCTestCase {

    private func makeSUT(
        project: TimelineProject = TimelineProjectFactory.projectWithTwoContiguousClips()
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

    // MARK: - Test 1: extending clip creates overlap

    func test_didExtendClip_positiveOverlap_increasesDuration() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        let originalDuration = sut.project.mediaObjects.first { $0.id == "clip-a" }?.duration ?? 0
        XCTAssertEqual(originalDuration, 4.0, accuracy: 0.001)

        sut.didExtendClip(id: "clip-a", overlapWithNextSeconds: 0.5)

        let newDuration = sut.project.mediaObjects.first { $0.id == "clip-a" }?.duration ?? 0
        XCTAssertEqual(newDuration, 4.5, accuracy: 0.001,
                       "didExtendClip with positive overlap must increase clip duration")
        XCTAssertTrue(sut.canUndo, "Extension must push a TrimClipCommand onto the stack")
    }

    // MARK: - Test 2: undo extension reverts duration

    func test_didExtendClip_undo_revertsDuration() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        sut.didExtendClip(id: "clip-a", overlapWithNextSeconds: 0.5)
        sut.undo()

        let revertedDuration = sut.project.mediaObjects.first { $0.id == "clip-a" }?.duration ?? 0
        XCTAssertEqual(revertedDuration, 4.0, accuracy: 0.001,
                       "Undo must revert the extension to the original duration")
    }
}
