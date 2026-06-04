import XCTest
import Combine
@testable import MeeshySDK

/// R1/R2 — SocialSocketManager reconnect/backfill correctness (sibling of the
/// T1 fix on MessageSocketManager).
///
/// A background suspend must NOT erase `hadPreviousConnection`. If it does, the
/// foreground-resume `.connect` reports `wasReconnect == false` and `didReconnect`
/// never fires — so the social feed is never re-synced after a background round
/// trip. These tests pin the reconnect-vs-cold decision
/// (`handleConnectionEstablished`) across the real lifecycle entry points,
/// without driving a live socket.
final class SocialSocketReconnectLifecycleTests: XCTestCase {

    private var cancellables = Set<AnyCancellable>()

    override func tearDown() {
        cancellables.removeAll()
        SocialSocketManager.shared.disconnect()
        super.tearDown()
    }

    func test_connectAfterBackgroundResume_isReconnect_andFiresDidReconnect() {
        let sut = SocialSocketManager.shared
        sut.disconnect() // clean slate: hadPreviousConnection == false

        XCTAssertFalse(sut.handleConnectionEstablished(),
                       "First connect after a clean slate must be cold, not a reconnect")

        sut.prepareForBackground()

        let fired = expectation(description: "didReconnect fires on resume connect")
        sut.didReconnect.sink { fired.fulfill() }.store(in: &cancellables)

        let wasReconnect = sut.handleConnectionEstablished()

        XCTAssertTrue(wasReconnect,
                      "Resume connect after a background suspend must be treated as a reconnect")
        wait(for: [fired], timeout: 1.0)
    }

    func test_coldFirstConnect_doesNotFireDidReconnect() {
        let sut = SocialSocketManager.shared
        sut.disconnect()

        let notFired = expectation(description: "didReconnect must NOT fire on cold connect")
        notFired.isInverted = true
        sut.didReconnect.sink { notFired.fulfill() }.store(in: &cancellables)

        XCTAssertFalse(sut.handleConnectionEstablished())
        wait(for: [notFired], timeout: 0.3)
    }

    func test_disconnectResetsReconnectState_soNextConnectIsCold() {
        let sut = SocialSocketManager.shared
        sut.disconnect()
        _ = sut.handleConnectionEstablished() // prior connection established

        sut.disconnect() // logout / full reset must forget the prior connection

        let notFired = expectation(description: "didReconnect must NOT fire after a full disconnect")
        notFired.isInverted = true
        sut.didReconnect.sink { notFired.fulfill() }.store(in: &cancellables)

        XCTAssertFalse(sut.handleConnectionEstablished(),
                       "After a full disconnect (logout), the next connect must be cold")
        wait(for: [notFired], timeout: 0.3)
    }

    func test_forceReconnectPreservesReconnectState() {
        let sut = SocialSocketManager.shared
        sut.disconnect()
        _ = sut.handleConnectionEstablished() // prior connection established

        sut.forceReconnect() // suspend (token-less connect no-ops in tests)

        XCTAssertTrue(sut.handleConnectionEstablished(),
                      "forceReconnect must preserve the reconnect flag across the transport rebuild")
    }
}
