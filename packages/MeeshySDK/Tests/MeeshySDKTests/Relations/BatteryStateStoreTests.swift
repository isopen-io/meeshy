import XCTest
@testable import MeeshySDK

private final class MemoryBatteryPersistence: BatteryStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [BatteryReaderState]

    init(_ states: [BatteryReaderState] = []) { stored = states }

    var saved: [BatteryReaderState] { lock.withLock { stored } }
    func load() -> [BatteryReaderState] { lock.withLock { stored } }
    func save(_ states: [BatteryReaderState]) { lock.withLock { stored = states } }
}

/// L'état de la batterie des autres, cache d'abord (#14147) : servi tout de suite, effacé par `battery:cleared`,
/// jamais au-delà du TTL du contrat.
@MainActor
final class BatteryStateStoreTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_000_000)

    private func state(_ userId: String, level: Int = 20, at offset: TimeInterval = 0) -> BatteryReaderState {
        BatteryReaderState(userId: userId, phase: .low, level: level, charging: false, lowPower: false,
                           measuredAt: clock.addingTimeInterval(offset))
    }

    private func makeSUT(cached: [BatteryReaderState] = []) -> (BatteryStateStore, MemoryBatteryPersistence) {
        let persistence = MemoryBatteryPersistence(cached)
        let clock = self.clock
        return (BatteryStateStore(persistence: persistence, now: { clock }), persistence)
    }

    func test_init_servesTheCacheImmediately_withoutWhatExpired() {
        let (sut, _) = makeSUT(cached: [state("u1"), state("u2", at: -BatteryContract.stateTtl - 10)])
        XCTAssertEqual(sut.state(for: "u1")?.level, 20)
        XCTAssertNil(sut.state(for: "u2"))
    }

    func test_changed_storesAndPersists() {
        let (sut, persistence) = makeSUT()
        sut.apply(BatteryChanged(userId: "u1", state: state("u1", level: 10)))
        XCTAssertEqual(sut.state(for: "u1")?.level, 10)
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
    }

    func test_changed_olderThanTheHeldReading_isIgnored() {
        let (sut, _) = makeSUT(cached: [state("u1", level: 10, at: 0)])
        sut.apply(BatteryChanged(userId: "u1", state: state("u1", level: 25, at: -60)))
        XCTAssertEqual(sut.state(for: "u1")?.level, 10)
    }

    func test_cleared_erasesTheState() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.apply(BatteryCleared(userId: "u1"))
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_reconcile_theSnapshotIsTheTruth() {
        let (sut, _) = makeSUT(cached: [state("u1"), state("u2")])
        sut.reconcile(with: [state("u2", level: 5), state("u3")])
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertEqual(sut.state(for: "u2")?.level, 5)
        XCTAssertNotNil(sut.state(for: "u3"))
    }

    func test_reset_forgetsEverything() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.reset()
        XCTAssertTrue(sut.states.isEmpty)
        XCTAssertTrue(persistence.saved.isEmpty)
    }
}
