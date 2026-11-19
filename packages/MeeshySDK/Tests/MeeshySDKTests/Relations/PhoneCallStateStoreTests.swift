import XCTest
@testable import MeeshySDK

private final class MemoryPhoneCallPersistence: PhoneCallStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [PhoneCallState]

    init(_ states: [PhoneCallState] = []) { stored = states }

    var saved: [PhoneCallState] { lock.withLock { stored } }
    func load() -> [PhoneCallState] { lock.withLock { stored } }
    func save(_ states: [PhoneCallState]) { lock.withLock { stored = states } }
}

/// « En appel » des autres, cache d'abord (#18753) : un état reçu REMPLACE celui tenu, `phone-call:ended` l'efface,
/// l'instantané fait foi, et rien ne s'affiche passé `expiresAt` — ni au rechargement du cache, ni après.
@MainActor
final class PhoneCallStateStoreTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_800_000_000)

    private func state(_ userId: String, since offset: TimeInterval = -600, expiresIn: TimeInterval = 3_600) -> PhoneCallState {
        PhoneCallState(userId: userId, since: clock.addingTimeInterval(offset), expiresAt: clock.addingTimeInterval(expiresIn))
    }

    private func makeSUT(cached: [PhoneCallState] = [], now: @escaping () -> Date) -> (PhoneCallStateStore, MemoryPhoneCallPersistence) {
        let persistence = MemoryPhoneCallPersistence(cached)
        return (PhoneCallStateStore(persistence: persistence, now: now), persistence)
    }

    private func makeSUT(cached: [PhoneCallState] = []) -> (PhoneCallStateStore, MemoryPhoneCallPersistence) {
        let clock = self.clock
        return makeSUT(cached: cached, now: { clock })
    }

    func test_init_servesTheCacheImmediately_andDropsWhatExpired_atRestToo() {
        let (sut, persistence) = makeSUT(cached: [state("u1"), state("u2", expiresIn: -1)])
        XCTAssertNotNil(sut.state(for: "u1"))
        XCTAssertNil(sut.state(for: "u2"))
        XCTAssertEqual(sut.states.keys.sorted(), ["u1"])
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
    }

    func test_applyStarted_storesAndPersists() {
        let (sut, persistence) = makeSUT()
        sut.apply(PhoneCallStarted(userId: "u1", state: state("u1")))
        XCTAssertEqual(sut.state(for: "u1"), state("u1"))
        XCTAssertEqual(persistence.saved, [state("u1")])
    }

    func test_applyStarted_replacesTheHeldState_neverMerges() {
        let (sut, _) = makeSUT(cached: [state("u1", since: -600)])
        let newer = state("u1", since: -1_200, expiresIn: 7_200)
        sut.apply(PhoneCallStarted(userId: "u1", state: newer))
        XCTAssertEqual(sut.state(for: "u1"), newer)
    }

    func test_applyStarted_alreadyExpired_isNotShown() {
        let (sut, _) = makeSUT()
        sut.apply(PhoneCallStarted(userId: "u1", state: state("u1", expiresIn: -1)))
        XCTAssertNil(sut.state(for: "u1"))
    }

    func test_applyEnded_erasesTheState() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.apply(PhoneCallEnded(userId: "u1"))
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_stateFor_hidesAStateOnceItsExpiryHasPassed() {
        var now = clock
        let (sut, _) = makeSUT(cached: [state("u1", expiresIn: 60)], now: { now })
        XCTAssertNotNil(sut.state(for: "u1"))
        now = clock.addingTimeInterval(61)
        XCTAssertNil(sut.state(for: "u1"))
    }

    func test_reconcile_theSnapshotIsTheTruth_withoutWhatExpired() {
        let (sut, _) = makeSUT(cached: [state("u1")])
        sut.reconcile(with: [state("u2"), state("u3", expiresIn: -1)])
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertNotNil(sut.state(for: "u2"))
        XCTAssertNil(sut.states["u3"])
    }

    func test_reset_forgetsEverything_atRestToo() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.reset()
        XCTAssertTrue(sut.states.isEmpty)
        XCTAssertTrue(persistence.saved.isEmpty)
    }
}
