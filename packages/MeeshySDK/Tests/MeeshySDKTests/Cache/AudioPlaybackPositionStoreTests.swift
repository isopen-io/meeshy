import XCTest
@testable import MeeshySDK

// MARK: - Pure model

final class AudioPlaybackPositionsTests: XCTestCase {

    func test_setting_storesPositionForAttachment() {
        let positions = AudioPlaybackPositions()
            .setting(position: 12.5, for: "a1")
        XCTAssertEqual(positions.position(for: "a1"), 12.5)
    }

    func test_setting_overwritesExistingPosition() {
        let positions = AudioPlaybackPositions()
            .setting(position: 5, for: "a1")
            .setting(position: 9, for: "a1")
        XCTAssertEqual(positions.position(for: "a1"), 9)
    }

    func test_position_unknownAttachment_returnsNil() {
        XCTAssertNil(AudioPlaybackPositions().position(for: "missing"))
    }

    func test_removing_dropsTheEntry() {
        let positions = AudioPlaybackPositions()
            .setting(position: 5, for: "a1")
            .removing("a1")
        XCTAssertNil(positions.position(for: "a1"))
    }

    func test_pruned_keepsMostRecentlyUpdated() {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let positions = AudioPlaybackPositions()
            .setting(position: 1, for: "old", now: base)
            .setting(position: 2, for: "mid", now: base.addingTimeInterval(10))
            .setting(position: 3, for: "new", now: base.addingTimeInterval(20))
            .pruned(max: 2)
        XCTAssertNil(positions.position(for: "old"))
        XCTAssertEqual(positions.position(for: "mid"), 2)
        XCTAssertEqual(positions.position(for: "new"), 3)
    }

    func test_pruned_withinBudget_returnsUnchanged() {
        let positions = AudioPlaybackPositions()
            .setting(position: 1, for: "a1")
            .pruned(max: 5)
        XCTAssertEqual(positions.position(for: "a1"), 1)
    }
}

// MARK: - Persistent store

@MainActor
final class AudioPlaybackPositionStoreTests: XCTestCase {

    private func makeStore() -> (AudioPlaybackPositionStore, UserDefaults) {
        let suite = "test.audioPositions.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let store = AudioPlaybackPositionStore(userDefaults: defaults, key: "k")
        return (store, defaults)
    }

    func test_save_thenPosition_roundTrips() {
        let (store, _) = makeStore()
        store.save(33.0, for: "a1")
        XCTAssertEqual(store.position(for: "a1"), 33.0)
    }

    func test_clear_removesSavedPosition() {
        let (store, _) = makeStore()
        store.save(33.0, for: "a1")
        store.clear(for: "a1")
        XCTAssertNil(store.position(for: "a1"))
    }

    func test_save_persistsAcrossStoreInstances() {
        let suite = "test.audioPositions.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let first = AudioPlaybackPositionStore(userDefaults: defaults, key: "k")
        first.save(42.0, for: "a1")

        let second = AudioPlaybackPositionStore(userDefaults: defaults, key: "k")
        XCTAssertEqual(second.position(for: "a1"), 42.0)
    }

    func test_save_evictsOldestBeyondCap() {
        let (store, _) = makeStore()
        let cap = AudioPlaybackPositionStore.maxEntries
        for index in 0...cap {
            store.save(Double(index), for: "a\(index)")
        }
        // The very first entry must have been evicted once we crossed the cap.
        XCTAssertNil(store.position(for: "a0"))
        XCTAssertEqual(store.position(for: "a\(cap)"), Double(cap))
    }
}
