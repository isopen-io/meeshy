import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 Prisme Linguistique regression suite.
///
/// Before this fix, `TimelineViewModel+OfflinePublish.buildOfflineQueueItem`
/// hardcoded `originalLanguage: nil` when persisting an offline-queued story.
/// Stories created offline would flush to the gateway without a source language
/// tag — the NLLB-200 router cannot pick a translation pair without it, so the
/// Prisme Linguistique pipeline silently breaks for every offline-authored story.
///
/// These tests pin the contract: every queued item carries a non-nil, non-empty
/// `originalLanguage`. The caller's chosen value is forwarded verbatim; an empty
/// or whitespace-only override falls back to the Prisme default (`"fr"`) so an
/// upstream bug cannot reintroduce the silent-drop failure mode.
@MainActor
final class OfflineQueueOriginalLanguageTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(isOnline: Bool = false) -> (
        vm: TimelineViewModel,
        network: MockNetworkMonitor,
        queue: MockOfflineQueue
    ) {
        let engine = MockStoryTimelineEngine()
        let network = MockNetworkMonitor()
        network.isOnline = isOnline
        let queue = MockOfflineQueue()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: TimelineProjectFactory.emptyProject(),
                     mediaURLs: [:], images: [:])
        return (vm, network, queue)
    }

    // MARK: - Tests

    /// The caller-supplied `originalLanguage` MUST be persisted on the queued
    /// item verbatim — this is what the Prisme Linguistique pipeline relies on
    /// to route NLLB-200 translations on flush.
    func test_buildOfflineQueueItem_includesOriginalLanguage_fromCallerParam() async {
        let (vm, network, queue) = makeSUT(isOnline: false)
        await vm.awaitConfigured()

        await vm.handlePublishTap(
            visibility: .public,
            originalLanguage: "es",
            networkMonitor: network,
            offlineQueue: queue
        )

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1,
                       "Offline publish must enqueue exactly one item")
        guard let item = items.first else { return }
        XCTAssertEqual(item.originalLanguage, "es",
                       "Caller-provided originalLanguage MUST round-trip onto the queued item (Prisme Linguistique)")
    }

    /// Invariant: even when an upstream caller hands in a degenerate empty
    /// string, the persisted item MUST carry the Prisme default (`"fr"`) so
    /// the gateway always has a routable language tag.
    func test_buildOfflineQueueItem_fallsBackToFr_whenEmpty_invariant() async {
        let (vm, network, queue) = makeSUT(isOnline: false)
        await vm.awaitConfigured()

        await vm.handlePublishTap(
            visibility: .public,
            originalLanguage: "",
            networkMonitor: network,
            offlineQueue: queue
        )

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        guard let item = items.first else { return }
        XCTAssertEqual(item.originalLanguage, "fr",
                       "Empty originalLanguage MUST fall back to the Prisme default 'fr', never nil/empty")
    }

    /// Hard invariant: NO matter the caller's input or the project shape, the
    /// persisted item never carries a nil language. This is the regression
    /// guard for the original P0 bug (`originalLanguage: nil` hardcoded).
    func test_buildOfflineQueueItem_neverSetsNilLanguage() async {
        let (vm, network, queue) = makeSUT(isOnline: false)
        await vm.awaitConfigured()

        // Inputs designed to be hostile to a naive impl: whitespace-only tag.
        await vm.handlePublishTap(
            visibility: .friends,
            originalLanguage: "   \n\t  ",
            networkMonitor: network,
            offlineQueue: queue
        )

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        guard let item = items.first else { return }
        XCTAssertNotNil(item.originalLanguage,
                        "originalLanguage MUST never be nil on a queued story — gateway NLLB-200 routing breaks otherwise")
        XCTAssertFalse(item.originalLanguage?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                       "originalLanguage MUST never be whitespace-only either — invariant equivalent to nil for the gateway")
    }
}
