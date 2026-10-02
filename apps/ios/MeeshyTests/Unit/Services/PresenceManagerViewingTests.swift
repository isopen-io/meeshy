import XCTest
import MeeshySDK
@testable import Meeshy

/// #8892 — « est dans la conversation » : `PresenceManager` tient, par
/// conversation, qui en a l'écran ouvert, alimenté par `viewing:start` /
/// `viewing:stop` / `viewing:snapshot`, et le vide à la déconnexion.
@MainActor
final class PresenceManagerViewingTests: XCTestCase {

    private var sut: PresenceManager!

    override func setUp() async throws {
        sut = PresenceManager.shared
        sut.clearConversationViewers()
        sut.presenceMap.removeAll()
    }

    override func tearDown() async throws {
        sut.activityHold = PresenceManager.defaultActivityHold
        sut.clearConversationViewers()
        sut.presenceMap.removeAll()
        sut = nil
    }

    private func change(_ userId: String, _ conversationId: String) -> ConversationViewingChange {
        ConversationViewingChange(userId: userId, conversationId: conversationId)
    }

    func test_applyViewing_arrived_marksPeerHereInThatConversationOnly() {
        sut.applyViewing(.arrived(change("peer", "conv-a")))

        XCTAssertTrue(sut.isHere(userId: "peer", conversationId: "conv-a"))
        XCTAssertFalse(sut.isHere(userId: "peer", conversationId: "conv-b"))
    }

    func test_applyViewing_arrived_countsAsActivity() {
        sut.applyViewing(.arrived(change("peer", "conv-a")))

        XCTAssertEqual(sut.presenceState(for: "peer"), PresenceState.online)
    }

    // MARK: - Regarder, écouter, agir (#9061)

    func test_applyViewing_active_makesTheHerePeerActive() {
        sut.applyViewing(.arrived(change("peer", "conv-a")))
        sut.applyViewing(.active(change("peer", "conv-a")))

        XCTAssertTrue(sut.isHereActive(userId: "peer", conversationId: "conv-a"))
        XCTAssertFalse(sut.isHereActive(userId: "peer", conversationId: "conv-b"))
    }

    func test_applyViewing_active_restsAfterTheHold() async throws {
        sut.activityHold = 0.05
        sut.applyViewing(.arrived(change("peer", "conv-a")))
        sut.applyViewing(.active(change("peer", "conv-a")))

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertFalse(sut.isHereActive(userId: "peer", conversationId: "conv-a"))
        XCTAssertTrue(sut.isHere(userId: "peer", conversationId: "conv-a"), "l'activité s'apaise, « ici » demeure")
    }

    func test_applyViewing_repeatedActivity_extendsThePulse() async throws {
        sut.activityHold = 0.3
        sut.applyViewing(.active(change("peer", "conv-a")))
        try await Task.sleep(nanoseconds: 200_000_000)
        sut.applyViewing(.active(change("peer", "conv-a")))
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertTrue(sut.isHereActive(userId: "peer", conversationId: "conv-a"))
    }

    func test_applyViewing_left_endsActivityAtOnce() {
        sut.applyViewing(.arrived(change("peer", "conv-a")))
        sut.applyViewing(.active(change("peer", "conv-a")))
        sut.applyViewing(.left(change("peer", "conv-a")))

        XCTAssertFalse(sut.isHereActive(userId: "peer", conversationId: "conv-a"))
    }

    func test_applyViewing_left_removesThePeer() {
        sut.applyViewing(.arrived(change("peer", "conv-a")))
        sut.applyViewing(.left(change("peer", "conv-a")))

        XCTAssertFalse(sut.isHere(userId: "peer", conversationId: "conv-a"))
    }

    func test_applyViewing_snapshot_replacesThePeersOfThatConversation() {
        sut.applyViewing(.arrived(change("gone", "conv-a")))
        sut.applyViewing(.arrived(change("other", "conv-b")))

        sut.applyViewing(.snapshot(ConversationViewingSnapshot(conversationId: "conv-a", userIds: ["p1", "p2"])))

        XCTAssertFalse(sut.isHere(userId: "gone", conversationId: "conv-a"))
        XCTAssertTrue(sut.isHere(userId: "p1", conversationId: "conv-a"))
        XCTAssertTrue(sut.isHere(userId: "p2", conversationId: "conv-a"))
        XCTAssertTrue(sut.isHere(userId: "other", conversationId: "conv-b"))
    }

    func test_clearConversationViewers_onDisconnect_forgetsEveryConversation() {
        sut.applyViewing(.arrived(change("p1", "conv-a")))
        sut.applyViewing(.arrived(change("p2", "conv-b")))

        sut.clearConversationViewers()

        XCTAssertFalse(sut.isHere(userId: "p1", conversationId: "conv-a"))
        XCTAssertFalse(sut.isHere(userId: "p2", conversationId: "conv-b"))
    }

    func test_applyViewing_arrived_bumpsTheRefreshSignal() async {
        let bumped = expectation(description: "refreshSignal bumped")
        let start = sut.refreshSignal.presenceVersion
        let cancellable = sut.refreshSignal.$presenceVersion
            .dropFirst()
            .sink { version in
                if version != start { bumped.fulfill() }
            }

        sut.applyViewing(.arrived(change("peer", "conv-a")))

        await fulfillment(of: [bumped], timeout: 2)
        cancellable.cancel()
    }

    func test_applyViewing_sessionStarted_forgetsWhatThePreviousSessionAnnounced() {
        sut.applyViewing(.arrived(change("p1", "conv-a")))
        sut.applyViewing(.arrived(change("p2", "conv-b")))

        sut.applyViewing(.sessionStarted)

        XCTAssertFalse(sut.isHere(userId: "p1", conversationId: "conv-a"))
        XCTAssertFalse(sut.isHere(userId: "p2", conversationId: "conv-b"))
    }

    func test_applyViewing_reconnectSnapshots_rebuildOnlyTheReannouncedConversations() {
        sut.applyViewing(.arrived(change("left-meanwhile", "conv-a")))
        sut.applyViewing(.arrived(change("still-here", "conv-b")))

        sut.applyViewing(.sessionStarted)
        sut.applyViewing(.snapshot(ConversationViewingSnapshot(conversationId: "conv-b", userIds: ["still-here"])))

        XCTAssertFalse(sut.isHere(userId: "left-meanwhile", conversationId: "conv-a"))
        XCTAssertTrue(sut.isHere(userId: "still-here", conversationId: "conv-b"))
    }

    func test_applyViewing_reconnectSnapshotOfAConversationNeverOpened_marksThePeerHere() {
        sut.applyViewing(.sessionStarted)

        sut.applyViewing(.snapshot(ConversationViewingSnapshot(conversationId: "conv-direct", userIds: ["peer"])))

        XCTAssertTrue(sut.isHere(userId: "peer", conversationId: "conv-direct"))
        XCTAssertEqual(sut.presenceState(for: "peer"), PresenceState.online)
    }
}
