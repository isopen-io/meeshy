import XCTest
@testable import MeeshySDK

private final class MemoryFallPersistence: FallStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [FallState]

    init(_ states: [FallState] = []) { stored = states }

    var saved: [FallState] { lock.withLock { stored } }
    func load() -> [FallState] { lock.withLock { stored } }
    func save(_ states: [FallState]) { lock.withLock { stored = states } }
}

/// La chute détectée des autres, cache d'abord (#18748) : une chute plus ancienne n'écrase rien, `fall:cleared` (ou la
/// levée poussée) l'efface, l'instantané fait foi, rien ne s'affiche passé `expiresAt`, et la position n'est JAMAIS rangée.
@MainActor
final class FallStateStoreTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_800_000_000)
    private let position = InactivityLastPosition(latitude: 48.85, longitude: 2.35, accuracy: 20, recordedAt: Date(timeIntervalSince1970: 1_799_999_000))

    private func state(_ userId: String, detected offset: TimeInterval = -300, expiresIn: TimeInterval = 3_600,
                       position: InactivityLastPosition? = nil) -> FallState {
        FallState(userId: userId, detectedAt: clock.addingTimeInterval(offset), expiresAt: clock.addingTimeInterval(expiresIn),
                  lastPosition: position, lastBattery: InactivityLastBattery(level: 41, measuredAt: clock))
    }

    private func makeSUT(cached: [FallState] = []) -> (FallStateStore, MemoryFallPersistence) {
        let persistence = MemoryFallPersistence(cached)
        let clock = self.clock
        return (FallStateStore(persistence: persistence, now: { clock }), persistence)
    }

    func test_init_servesTheCacheImmediately_andDropsWhatExpired() {
        let (sut, persistence) = makeSUT(cached: [state("u1"), state("u2", expiresIn: -1)])
        XCTAssertNotNil(sut.state(for: "u1"))
        XCTAssertNil(sut.state(for: "u2"))
        XCTAssertEqual(persistence.saved.map(\.userId), ["u1"])
    }

    func test_applyDetected_keepsThePositionInMemory_butNeverWritesItAtRest() {
        let (sut, persistence) = makeSUT()
        sut.apply(FallDetected(userId: "u1", state: state("u1", position: position)))
        XCTAssertEqual(sut.state(for: "u1")?.lastPosition, position)
        XCTAssertEqual(persistence.saved.map(\.lastPosition), [nil])
        XCTAssertEqual(persistence.saved.first?.lastBattery?.level, 41)
    }

    func test_applyDetected_anOlderFallDoesNotReplaceTheHeldOne() {
        let (sut, _) = makeSUT()
        sut.apply(FallDetected(userId: "u1", state: state("u1", detected: -60)))
        sut.apply(FallDetected(userId: "u1", state: state("u1", detected: -3_000)))
        XCTAssertEqual(sut.state(for: "u1")?.detectedAt, clock.addingTimeInterval(-60))
    }

    func test_applyDetected_anAlreadyExpiredStateIsNotShown() {
        let (sut, _) = makeSUT()
        sut.apply(FallDetected(userId: "u1", state: state("u1", expiresIn: -1)))
        XCTAssertNil(sut.state(for: "u1"))
    }

    func test_clear_removesTheState() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.clear(userId: "u1")
        XCTAssertNil(sut.state(for: "u1"))
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_reconcile_theSnapshotIsAuthoritative() {
        let (sut, _) = makeSUT(cached: [state("stale")])
        sut.reconcile(with: [state("u2"), state("gone", expiresIn: -1)])
        XCTAssertEqual(sut.states.keys.sorted(), ["u2"])
    }

    func test_reset_forgetsEverything() {
        let (sut, persistence) = makeSUT(cached: [state("u1")])
        sut.reset()
        XCTAssertTrue(sut.states.isEmpty)
        XCTAssertTrue(persistence.saved.isEmpty)
    }

    func test_userDefaultsPersistence_neverWritesAPosition() throws {
        let suite = "fall.store.tests.\(UUID().uuidString)"
        let persistence = UserDefaultsFallStatePersistence(key: "states", suiteName: suite)
        persistence.save([state("u1", position: position)])
        let raw = try XCTUnwrap(UserDefaults(suiteName: suite)?.data(forKey: "states"))
        let text = try XCTUnwrap(String(data: raw, encoding: .utf8))
        XCTAssertFalse(text.contains("latitude"))
        XCTAssertFalse(text.contains("48.85"))
        XCTAssertEqual(persistence.load().first?.lastBattery?.level, 41)
        UserDefaults().removePersistentDomain(forName: suite)
    }
}
