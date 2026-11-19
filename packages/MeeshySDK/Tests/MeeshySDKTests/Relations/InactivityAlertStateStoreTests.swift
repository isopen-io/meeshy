import XCTest
@testable import MeeshySDK

private final class MemoryInactivityAlertPersistence: InactivityAlertStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [InactivityAlertState]

    init(_ states: [InactivityAlertState] = []) { stored = states }

    var saved: [InactivityAlertState] { lock.withLock { stored } }
    func load() -> [InactivityAlertState] { lock.withLock { stored } }
    func save(_ states: [InactivityAlertState]) { lock.withLock { stored = states } }
}

/// L'alerte d'inactivité des autres, cache d'abord (#18738) : servie tout de suite, effacée par `inactivity:cleared`,
/// jamais au-delà du TTL du contrat.
@MainActor
final class InactivityAlertStateStoreTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_000_000)

    private func state(_ userId: String, alertedAt offset: TimeInterval = 0, battery: Int? = nil) -> InactivityAlertState {
        InactivityAlertState(
            userId: userId, inactiveSince: clock.addingTimeInterval(offset - 43_200),
            alertedAt: clock.addingTimeInterval(offset),
            lastBattery: battery.map { InactivityLastBattery(level: $0, measuredAt: clock) }
        )
    }

    private func makeSUT(cached: [InactivityAlertState] = []) -> (InactivityAlertStateStore, MemoryInactivityAlertPersistence) {
        let persistence = MemoryInactivityAlertPersistence(cached)
        let clock = self.clock
        return (InactivityAlertStateStore(persistence: persistence, now: { clock }), persistence)
    }

    func test_init_servesTheCacheImmediately_withoutWhatExpired() {
        let (sut, _) = makeSUT(cached: [state("u1"), state("u2", alertedAt: -InactivityCheckContract.stateTtl - 10)])
        XCTAssertNotNil(sut.state(for: "u1"))
        XCTAssertNil(sut.state(for: "u2"))
    }

    func test_applyAlert_storesAndPersists() {
        let (sut, persistence) = makeSUT()
        sut.apply(InactivityAlertRaised(userId: "u1", state: state("u1", battery: 9)))
        XCTAssertEqual(sut.state(for: "u1")?.lastBattery?.level, 9)
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
    }

    func test_applyAlert_neverPersistsThePosition_butServesItInMemory() {
        let (sut, persistence) = makeSUT()
        let position = InactivityLastPosition(latitude: 48.85, longitude: 2.35, recordedAt: clock)
        let alert = InactivityAlertState(userId: "u1", inactiveSince: clock.addingTimeInterval(-43_200), alertedAt: clock, lastPosition: position)
        sut.apply(InactivityAlertRaised(userId: "u1", state: alert))
        XCTAssertNotNil(sut.state(for: "u1")?.lastPosition)
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
        XCTAssertNil(persistence.saved.first?.lastPosition)
    }

    func test_applyAlert_olderThanTheHeldAlert_isIgnored() {
        let (sut, _) = makeSUT(cached: [state("u1", battery: 40)])
        sut.apply(InactivityAlertRaised(userId: "u1", state: state("u1", alertedAt: -600, battery: 9)))
        XCTAssertEqual(sut.state(for: "u1")?.lastBattery?.level, 40)
    }

    func test_applyCleared_erasesTheAlert() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.apply(InactivityAlertCleared(userId: "u1"))
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_reconcile_theSnapshotIsTheTruth() {
        let (sut, _) = makeSUT(cached: [state("u1")])
        sut.reconcile(with: [state("u2")])
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertNotNil(sut.state(for: "u2"))
    }

    func test_reset_forgetsEverything() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.reset()
        XCTAssertTrue(sut.states.isEmpty)
        XCTAssertTrue(persistence.saved.isEmpty)
    }
}
