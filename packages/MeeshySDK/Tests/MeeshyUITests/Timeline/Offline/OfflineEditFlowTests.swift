import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// End-to-end offline edit flow tests (Task 70).
/// Verifies that editing actions work without network, and that publish
/// enqueues to `StoryOfflineQueue` instead of failing (Task 72).
///
/// Pragmatic deviations from plan:
/// - `TimelineViewModel.addPhoto/addVideo/addAudio` are not part of the Plan 4
///   API (they exist in `StoryComposerViewModel`). These tests focus on the
///   ACTUAL offline-publish contract that was implemented: `handlePublishTap`
///   with injected `MockNetworkMonitor` and `MockOfflineQueue`.
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

    // MARK: - Task 72: Offline publish — enqueues without error

    func test_publish_offline_queuesWithoutError() async {
        let (vm, _, network, queue) = makeSUT(isOnline: false)
        XCTAssertFalse(network.isOnline)

        await vm.handlePublishTap(visibility: .friends,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        let enqueued = await queue.enqueueCallCount
        XCTAssertEqual(enqueued, 1, "Offline publish must enqueue exactly one job")
        XCTAssertNil(vm.errorMessage,
                     "Offline publish must NOT set errorMessage — it is success, not failure")
        XCTAssertTrue(vm.showOfflineQueuedConfirmation,
                      "ViewModel must signal the confirmation snackbar after offline enqueue")
    }

    func test_publish_offline_doesNotSetErrorMessage() async {
        let (vm, _, network, queue) = makeSUT(isOnline: false)
        // Simulate a pre-existing error message (e.g. from a previous operation)
        vm.errorMessage = "Previous error"

        await vm.handlePublishTap(visibility: .public,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        XCTAssertNil(vm.errorMessage,
                     "Offline enqueue must clear errorMessage — publish is a success, not failure")
    }

    func test_publish_online_stubThrows_fallsBackToOfflineQueue() async {
        // The default StubOnlinePublisher always throws — online publish falls
        // back to the offline queue until the real pipeline is wired.
        let (vm, _, network, queue) = makeSUT(isOnline: true)
        network.isOnline = true

        await vm.handlePublishTap(visibility: .friends,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        let enqueued = await queue.enqueueCallCount
        XCTAssertEqual(enqueued, 1,
                       "Online publish with stub must fall back to offline queue (got \(enqueued))")
        XCTAssertTrue(vm.showOfflineQueuedConfirmation,
                      "Fallback to offline queue must set showOfflineQueuedConfirmation")
    }

    // MARK: - Task 72: dismissOfflineQueuedConfirmation

    func test_dismissOfflineQueuedConfirmation_resetsFlag() async {
        let (vm, _, network, queue) = makeSUT(isOnline: false)
        await vm.handlePublishTap(visibility: .friends,
                                  networkMonitor: network,
                                  offlineQueue: queue)
        XCTAssertTrue(vm.showOfflineQueuedConfirmation)

        vm.dismissOfflineQueuedConfirmation()
        XCTAssertFalse(vm.showOfflineQueuedConfirmation,
                       "dismissOfflineQueuedConfirmation must reset the flag")
    }

    // MARK: - Task 72: mediaURLPaths correctness (HIGH 2 fix)

    func test_handlePublishTap_offline_includesMediaURLPathsFromPendingURLs() async {
        let testURL = URL(fileURLWithPath: "/tmp/test-clip.mp4")
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "media-1", startTime: 0, duration: 5)
        let engine = MockStoryTimelineEngine()
        let network = MockNetworkMonitor()
        network.isOnline = false
        let queue = MockOfflineQueue()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: project, mediaURLs: ["media-1": testURL], images: [:])
        await vm.awaitConfigured()

        await vm.handlePublishTap(visibility: .public, networkMonitor: network, offlineQueue: queue)

        let enqueued = await queue.enqueuedItems
        XCTAssertEqual(enqueued.count, 1,
                       "Offline publish must enqueue exactly one item")
        XCTAssertEqual(enqueued.first?.mediaURLPaths.count, 1,
                       "Enqueued item must carry the pending media URL path")
        XCTAssertEqual(enqueued.first?.mediaURLPaths["media-1"], testURL.path,
                       "mediaURLPaths[clipId] must match the URL passed to bootstrap")
    }

    // MARK: - Phase 1 items 1+2: real serialization + online publish fallback

    func test_handlePublishTap_offline_payloadIsRealJSON_notEmpty() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let engine = MockStoryTimelineEngine()
        let network = MockNetworkMonitor()
        network.isOnline = false
        let queue = MockOfflineQueue()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        await vm.handlePublishTap(visibility: .public, networkMonitor: network, offlineQueue: queue)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        let payload = items.first?.slidePayloadJSON ?? ""
        XCTAssertNotEqual(payload, "{}", "slidePayloadJSON must contain real serialised project, not empty object")
        XCTAssertTrue(payload.contains("\"slideId\""),
                      "JSON must include TimelineProject fields — got: \(payload.prefix(200))")
        XCTAssertTrue(payload.contains("\"mediaObjects\""),
                      "JSON must include mediaObjects array — got: \(payload.prefix(200))")
    }

    func test_handlePublishTap_online_attemptsOnlinePublish_fallsBackOnFailure() async {
        let project = TimelineProjectFactory.projectWithVideoClip(clipId: "v1", startTime: 0, duration: 5)
        let engine = MockStoryTimelineEngine()
        let network = MockNetworkMonitor()
        network.isOnline = true
        let queue = MockOfflineQueue()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        // Default StubOnlinePublisher always throws → fallback path must run
        await vm.handlePublishTap(visibility: .public, networkMonitor: network, offlineQueue: queue)

        let enqueued = await queue.enqueueCallCount
        XCTAssertEqual(enqueued, 1, "Online failure must fall back to offline queue (got \(enqueued))")
        XCTAssertTrue(vm.showOfflineQueuedConfirmation,
                      "Fallback must set showOfflineQueuedConfirmation so the UI confirms to the user")
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
