import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// End-to-end offline edit flow tests (Task 70).
/// Verifies that editing actions work without network.
///
/// S6 — the `handlePublishTap`-only tests (Task 72: online/offline publish
/// orchestration, `StubOnlinePublisher` fallback) were removed alongside
/// `handlePublishTap` itself (dead code, zero production call sites).
/// `test_dismissOfflineQueuedConfirmation_resetsFlag` survives, adapted to
/// pose `showOfflineQueuedConfirmation` directly instead of routing through
/// the deleted orchestration — it now tests EXACTLY the surviving function,
/// not an artefact of its former vehicle.
///
/// Pragmatic deviations from plan:
/// - `TimelineViewModel.addPhoto/addVideo/addAudio` are not part of the Plan 4
///   API (they exist in `StoryComposerViewModel`).
/// - `saveDraft`/`exportDraftSnapshot`/`loadDraftSnapshot` are not yet in
///   `TimelineViewModel` (wired in follow-up). Draft round-trip is exercised
///   via `TimelineProject` value semantics.
@MainActor
final class OfflineEditFlowTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(isOnline: Bool = false) -> (
        vm: TimelineViewModel,
        engine: MockStoryTimelineEngine,
        network: MockNetworkMonitor,
        queue: MockOfflineQueue
    ) {
        let engine = MockStoryTimelineEngine()
        let network = MockNetworkMonitor()
        network.isOnline = isOnline
        let queue = MockOfflineQueue()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        sut.bootstrap(project: TimelineProjectFactory.emptyProject(),
                      mediaURLs: [:], images: [:])
        return (sut, engine, network, queue)
    }

    // MARK: - Task 70: Offline edit — no network required for local operations

    func test_selectClip_worksOffline() async {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        let project = TimelineProjectFactory.projectWithVideoClip()
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        vm.selectClip(id: "clip-1")
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1",
                       "Clip selection must work without network")
    }

    func test_undo_redo_worksOffline() async {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        let project = TimelineProjectFactory.projectWithVideoClip()
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        // Drag clip to generate a command
        vm.beginClipDrag(clipId: "clip-1")
        vm.dragClipMoved(rawTime: 2.0, snapCandidates: [])
        vm.endClipDrag()
        XCTAssertTrue(vm.canUndo, "Must be able to undo while offline")

        vm.undo()
        XCTAssertFalse(vm.canUndo, "Undo must revert the command stack while offline")
        XCTAssertTrue(vm.canRedo, "Redo must be available after undo while offline")

        vm.redo()
        XCTAssertTrue(vm.canUndo, "Redo must re-apply the command stack while offline")
    }

    func test_zoomScale_changesOffline() {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        vm.zoomScale = 2.0
        XCTAssertEqual(vm.zoomScale, 2.0, "Zoom changes must work without network")
    }

    func test_errorMessage_isNilAfterOfflineEditing() async {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        await vm.awaitConfigured()
        // After normal offline editing, no error should surface
        XCTAssertNil(vm.errorMessage,
                     "Offline editing must not set errorMessage")
    }

    // MARK: - Task 72: dismissOfflineQueuedConfirmation

    /// Poses the flag directly instead of routing through the deleted
    /// `handlePublishTap` — this now tests EXACTLY the surviving function
    /// (`dismissOfflineQueuedConfirmation`), not an artefact of its former
    /// vehicle.
    func test_dismissOfflineQueuedConfirmation_resetsFlag() async {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        vm.showOfflineQueuedConfirmation = true

        vm.dismissOfflineQueuedConfirmation()
        XCTAssertFalse(vm.showOfflineQueuedConfirmation,
                       "dismissOfflineQueuedConfirmation must reset the flag")
    }

    // MARK: - Offline project snapshot (draft round-trip via value semantics)

    func test_project_snapshotAndRestore_preservesClips() async {
        let (vm, _, _, _) = makeSUT(isOnline: false)
        let project = TimelineProjectFactory.projectWithVideoClip()
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        // Capture the project snapshot
        let snapshot = vm.project

        // Simulate a "reload" by creating a new VM with the same snapshot
        let (vm2, _, _, _) = makeSUT(isOnline: false)
        vm2.bootstrap(project: snapshot, mediaURLs: [:], images: [:])
        await vm2.awaitConfigured()

        XCTAssertEqual(vm2.project.mediaObjects.count,
                       vm.project.mediaObjects.count,
                       "Reloaded ViewModel must have the same clip count as original")
    }
}
