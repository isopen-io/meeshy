import XCTest
import Combine
@testable import MeeshySDK

/// T1 — Local-first reconnect/backfill correctness.
///
/// A background suspend must NOT erase the "we were already connected" flag.
/// If it does, the foreground-resume `.connect` reports `wasReconnect == false`
/// and `didReconnect` never fires — which starves the open conversation's
/// missed-message backfill and the queued read/received-receipt flush wired in
/// `ConversationSocketHandler.subscribeToReconnect`. These tests pin the
/// reconnect-vs-cold decision (`handleConnectionEstablished`) across the real
/// lifecycle entry points, without driving a live socket.
final class MessageSocketReconnectLifecycleTests: XCTestCase {

    private var cancellables = Set<AnyCancellable>()

    override func tearDown() {
        cancellables.removeAll()
        // Leave the shared singleton in a clean, disconnected state so any
        // later test that touches it starts from a known slate.
        MessageSocketManager.shared.disconnect()
        super.tearDown()
    }

    func test_connectAfterBackgroundResume_isReconnect_andFiresDidReconnect() {
        let sut = MessageSocketManager.shared
        sut.disconnect() // clean slate: hadPreviousConnection == false

        // First (cold) connect establishes a prior connection — not a reconnect.
        XCTAssertFalse(sut.handleConnectionEstablished(),
                       "First connect after a clean slate must be cold, not a reconnect")

        // App goes to background (BackgroundTransitionCoordinator.prepareForBackground).
        sut.prepareForBackground()

        // Foreground resume re-establishes the socket: this MUST be a reconnect.
        let fired = expectation(description: "didReconnect fires on resume connect")
        sut.didReconnect
            .sink { fired.fulfill() }
            .store(in: &cancellables)

        let wasReconnect = sut.handleConnectionEstablished()

        XCTAssertTrue(wasReconnect,
                      "Resume connect after a background suspend must be treated as a reconnect")
        wait(for: [fired], timeout: 1.0)
    }

    func test_coldFirstConnect_doesNotFireDidReconnect() {
        let sut = MessageSocketManager.shared
        sut.disconnect()

        let notFired = expectation(description: "didReconnect must NOT fire on cold connect")
        notFired.isInverted = true
        sut.didReconnect
            .sink { notFired.fulfill() }
            .store(in: &cancellables)

        XCTAssertFalse(sut.handleConnectionEstablished())
        wait(for: [notFired], timeout: 0.3)
    }

    func test_disconnectResetsReconnectState_soNextConnectIsCold() {
        let sut = MessageSocketManager.shared
        sut.disconnect()
        _ = sut.handleConnectionEstablished() // prior connection established

        sut.disconnect() // logout / full reset must forget the prior connection

        let notFired = expectation(description: "didReconnect must NOT fire after a full disconnect")
        notFired.isInverted = true
        sut.didReconnect
            .sink { notFired.fulfill() }
            .store(in: &cancellables)

        XCTAssertFalse(sut.handleConnectionEstablished(),
                       "After a full disconnect (logout), the next connect must be cold")
        wait(for: [notFired], timeout: 0.3)
    }

    func test_forceReconnectPreservesReconnectState() {
        let sut = MessageSocketManager.shared
        sut.disconnect()
        _ = sut.handleConnectionEstablished() // prior connection established

        // forceReconnect is the resume / network-back / re-auth rebuild path.
        // It suspends the transport (no auth token in tests -> connect() no-ops)
        // and MUST keep the reconnect flag so the next connect fires didReconnect.
        sut.forceReconnect()

        XCTAssertTrue(sut.handleConnectionEstablished(),
                      "forceReconnect must preserve the reconnect flag across the transport rebuild")
    }

    // MARK: - T2: joined rooms preserved across suspend/resume

    func test_roomsToRejoin_preservedAcrossBackgroundResume() {
        let sut = MessageSocketManager.shared
        sut.disconnect() // clean slate

        sut.joinConversation("A")
        sut.joinConversation("B")
        sut.activeConversationId = "A"

        // App backgrounds (transport-only suspend) then would resume + reconnect.
        sut.prepareForBackground()

        let rooms = sut.roomsToRejoinOnConnect()
        XCTAssertEqual(rooms.first, "A", "active conversation must be re-joined first")
        XCTAssertEqual(Set(rooms), ["A", "B"], "all joined rooms must survive a background suspend")
    }

    func test_roomsToRejoin_activeConversationFirst() {
        let sut = MessageSocketManager.shared
        sut.disconnect()

        sut.joinConversation("X")
        sut.joinConversation("Y")
        sut.activeConversationId = "Y"

        let rooms = sut.roomsToRejoinOnConnect()
        XCTAssertEqual(rooms.first, "Y", "the active conversation is re-joined first for fastest UX")
        XCTAssertEqual(Set(rooms), ["X", "Y"])
    }

    func test_disconnect_clearsRoomsForColdLogin() {
        let sut = MessageSocketManager.shared
        sut.disconnect()
        sut.joinConversation("A")
        sut.activeConversationId = "A"

        sut.disconnect() // logout / cold reset

        XCTAssertTrue(sut.roomsToRejoinOnConnect().isEmpty,
                      "a full disconnect (logout) must clear joined rooms so the next login is clean")
    }
}
