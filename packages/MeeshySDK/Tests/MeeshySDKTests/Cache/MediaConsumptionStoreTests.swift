import XCTest
@testable import MeeshySDK

// MARK: - Pure model

final class MediaConsumptionsTests: XCTestCase {

    func test_recording_storesFractionForAttachment() {
        let c = MediaConsumptions()
            .recording(fraction: 0.4, complete: false, for: "a1")
        XCTAssertEqual(c.fraction(for: "a1"), 0.4)
        XCTAssertEqual(c.entry(for: "a1")?.complete, false)
    }

    func test_recording_isMonotonic_keepsMaxFraction() {
        let c = MediaConsumptions()
            .recording(fraction: 0.6, complete: false, for: "a1")
            .recording(fraction: 0.2, complete: false, for: "a1")
        XCTAssertEqual(c.fraction(for: "a1"), 0.6)
    }

    func test_recording_complete_floorsFractionAtOne_andSticks() {
        let c = MediaConsumptions()
            .recording(fraction: 0.3, complete: true, for: "a1")
        XCTAssertEqual(c.fraction(for: "a1"), 1)
        XCTAssertEqual(c.entry(for: "a1")?.complete, true)
    }

    func test_recording_partialAfterComplete_staysComplete() {
        let c = MediaConsumptions()
            .recording(fraction: 1, complete: true, for: "a1")
            .recording(fraction: 0.1, complete: false, for: "a1")
        XCTAssertEqual(c.fraction(for: "a1"), 1)
        XCTAssertEqual(c.entry(for: "a1")?.complete, true)
    }

    func test_recording_clampsFractionToUnitRange() {
        let c = MediaConsumptions()
            .recording(fraction: 1.8, complete: false, for: "a1")
            .recording(fraction: -0.5, complete: false, for: "a2")
        XCTAssertEqual(c.fraction(for: "a1"), 1)
        XCTAssertEqual(c.fraction(for: "a2"), 0)
    }

    func test_fraction_unknownAttachment_returnsNil() {
        XCTAssertNil(MediaConsumptions().fraction(for: "missing"))
    }

    func test_removing_dropsTheEntry() {
        let c = MediaConsumptions()
            .recording(fraction: 0.5, complete: false, for: "a1")
            .removing("a1")
        XCTAssertNil(c.fraction(for: "a1"))
    }

    func test_pruned_keepsMostRecentlyUpdated() {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let c = MediaConsumptions()
            .recording(fraction: 0.1, complete: false, for: "old", now: base)
            .recording(fraction: 0.2, complete: false, for: "mid", now: base.addingTimeInterval(10))
            .recording(fraction: 0.3, complete: false, for: "new", now: base.addingTimeInterval(20))
            .pruned(max: 2)
        XCTAssertNil(c.fraction(for: "old"))
        XCTAssertEqual(c.fraction(for: "mid"), 0.2)
        XCTAssertEqual(c.fraction(for: "new"), 0.3)
    }

    func test_pruned_withinBudget_returnsUnchanged() {
        let c = MediaConsumptions()
            .recording(fraction: 0.5, complete: false, for: "a1")
            .pruned(max: 5)
        XCTAssertEqual(c.fraction(for: "a1"), 0.5)
    }
}

// MARK: - Persistent store

@MainActor
final class MediaConsumptionStoreTests: XCTestCase {

    private func makeStore() -> MediaConsumptionStore {
        let suite = "test.mediaConsumption.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        return MediaConsumptionStore(userDefaults: defaults, key: "k")
    }

    func test_record_thenFraction_roundTrips() {
        let store = makeStore()
        store.record(fraction: 0.33, complete: false, for: "a1")
        XCTAssertEqual(store.fraction(for: "a1"), 0.33)
    }

    func test_record_complete_marksConsumed() {
        let store = makeStore()
        store.record(fraction: 0.5, complete: true, for: "a1")
        XCTAssertEqual(store.fraction(for: "a1"), 1)
        XCTAssertEqual(store.consumption(for: "a1")?.complete, true)
    }

    func test_clear_removesEntry() {
        let store = makeStore()
        store.record(fraction: 0.4, complete: false, for: "a1")
        store.clear(for: "a1")
        XCTAssertNil(store.fraction(for: "a1"))
    }

    func test_record_persistsAcrossStoreInstances() {
        let suite = "test.mediaConsumption.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let first = MediaConsumptionStore(userDefaults: defaults, key: "k")
        first.record(fraction: 0.7, complete: false, for: "a1")

        let second = MediaConsumptionStore(userDefaults: defaults, key: "k")
        XCTAssertEqual(second.fraction(for: "a1"), 0.7)
    }

    func test_record_evictsOldestBeyondCap() {
        let store = makeStore()
        let cap = MediaConsumptionStore.maxEntries
        for index in 0...cap {
            store.record(fraction: 0.5, complete: false, for: "a\(index)")
        }
        XCTAssertNil(store.fraction(for: "a0"))
        XCTAssertEqual(store.fraction(for: "a\(cap)"), 0.5)
    }
}
