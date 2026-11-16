import XCTest
@testable import MeeshySDK

private final class MemoryPhoneReachabilityPersistence: PhoneReachabilityStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [PhoneReachabilityState]

    init(_ states: [PhoneReachabilityState] = []) { stored = states }

    var saved: [PhoneReachabilityState] { lock.withLock { stored } }
    func load() -> [PhoneReachabilityState] { lock.withLock { stored } }
    func save(_ states: [PhoneReachabilityState]) { lock.withLock { stored = states } }
}

/// Le téléphone injoignable des autres, cache d'abord (#18737) : servi tout de suite, effacé par `phone:reachable`,
/// jamais au-delà du TTL du contrat.
@MainActor
final class PhoneReachabilityStateStoreTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_000_000)

    private func state(_ userId: String, cause: PhoneUnreachableCause = .network, at offset: TimeInterval = 0) -> PhoneReachabilityState {
        PhoneReachabilityState(userId: userId, unreachableSince: clock.addingTimeInterval(offset), cause: cause)
    }

    private func makeSUT(cached: [PhoneReachabilityState] = []) -> (PhoneReachabilityStateStore, MemoryPhoneReachabilityPersistence) {
        let persistence = MemoryPhoneReachabilityPersistence(cached)
        let clock = self.clock
        return (PhoneReachabilityStateStore(persistence: persistence, now: { clock }), persistence)
    }

    func test_init_servesTheCacheImmediately_withoutWhatExpired() {
        let (sut, _) = makeSUT(cached: [state("u1"), state("u2", at: -PhoneReachabilityContract.stateTtl - 10)])
        XCTAssertEqual(sut.state(for: "u1")?.cause, .network)
        XCTAssertNil(sut.state(for: "u2"))
    }

    func test_applyChanged_storesAndPersists() {
        let (sut, persistence) = makeSUT()
        sut.apply(PhoneReachabilityChanged(userId: "u1", state: state("u1", cause: .battery)))
        XCTAssertEqual(sut.state(for: "u1")?.cause, .battery)
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
    }

    func test_applyChanged_olderThanTheHeldEpisode_isIgnored() {
        let (sut, _) = makeSUT(cached: [state("u1", cause: .battery, at: 0)])
        sut.apply(PhoneReachabilityChanged(userId: "u1", state: state("u1", cause: .network, at: -600)))
        XCTAssertEqual(sut.state(for: "u1")?.cause, .battery)
    }

    func test_applyCleared_erasesTheState() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.apply(PhoneReachabilityCleared(userId: "u1"))
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_reconcile_theSnapshotIsTheTruth() {
        let (sut, _) = makeSUT(cached: [state("u1"), state("u2")])
        sut.reconcile(with: [state("u2", cause: .battery), state("u3")])
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertEqual(sut.state(for: "u2")?.cause, .battery)
        XCTAssertNotNil(sut.state(for: "u3"))
    }

    func test_reset_forgetsEverything() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.reset()
        XCTAssertTrue(sut.states.isEmpty)
        XCTAssertTrue(persistence.saved.isEmpty)
    }
}
