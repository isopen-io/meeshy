import XCTest
@testable import MeeshySDK

/// R5 (story offline replay) — pin that `DiskCacheStore` supports pinning:
/// a pinned key is exempt from BOTH budget-LRU eviction and TTL eviction
/// until its pin expiry passes. The pin registry survives process relaunch
/// (sidecar `.pins.json`, hidden so the eviction enumerators skip it).
///
/// The store stays a pure building block: it receives opaque keys and
/// expiry dates. WHAT to pin (viewed stories until `expiresAt`) is an
/// app-side policy decision, not encoded here.
final class DiskCacheStorePinningTests: XCTestCase {

    private func makeStore(maxBytes: Int = 1_000, ttl: TimeInterval = 60,
                           subdir: String = "test-pin-\(UUID().uuidString)") -> DiskCacheStore {
        let policy = CachePolicy(
            ttl: ttl,
            staleTTL: ttl / 2,
            maxItemCount: 1000,
            storageLocation: .disk(subdir: subdir, maxBytes: maxBytes)
        )
        let baseDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/\(subdir)", isDirectory: true)
        return DiskCacheStore(policy: policy, baseDirectory: baseDir)
    }

    /// Oldest file is the first LRU candidate — without a pin it is evicted,
    /// with an active pin it must survive the budget sweep.
    func test_pin_protectsFileFromBudgetEviction() async {
        let store = makeStore(maxBytes: 1_000)
        await store.save(Data(repeating: 0xAA, count: 400), for: "pinned-media.mp4")
        await store.pin("pinned-media.mp4", until: Date().addingTimeInterval(3600))

        for i in 0..<10 {
            await store.save(Data(repeating: 0xBB, count: 200), for: "filler-\(i).mp4")
        }
        await store.evictOverBudget()

        let result = await store.load(for: "pinned-media.mp4")
        XCTAssertNotNil(result.snapshot()?.first,
                        "A pinned file must survive budget eviction even as the oldest LRU entry")
    }

    func test_expiredPin_isEvictableAgain() async {
        let store = makeStore(maxBytes: 1_000)
        await store.save(Data(repeating: 0xAA, count: 400), for: "stale-pin.mp4")
        await store.pin("stale-pin.mp4", until: Date().addingTimeInterval(-1))

        for i in 0..<10 {
            await store.save(Data(repeating: 0xBB, count: 200), for: "filler-\(i).mp4")
        }
        await store.evictOverBudget()

        let result = await store.load(for: "stale-pin.mp4")
        XCTAssertNil(result.snapshot()?.first,
                     "An expired pin must not exempt the file from LRU eviction")
    }

    func test_unpin_restoresEvictability() async {
        let store = makeStore(maxBytes: 1_000)
        await store.save(Data(repeating: 0xAA, count: 400), for: "unpinned.mp4")
        await store.pin("unpinned.mp4", until: Date().addingTimeInterval(3600))
        await store.unpin("unpinned.mp4")

        for i in 0..<10 {
            await store.save(Data(repeating: 0xBB, count: 200), for: "filler-\(i).mp4")
        }
        await store.evictOverBudget()

        let result = await store.load(for: "unpinned.mp4")
        XCTAssertNil(result.snapshot()?.first,
                     "After unpin the file must be a normal LRU candidate again")
    }

    /// The pin registry must survive a store re-instantiation (process
    /// relaunch) — otherwise a boot-time budget sweep could evict a story
    /// the user watched minutes before being offline.
    func test_pin_persistsAcrossStoreInstances() async {
        let subdir = "test-pin-persist-\(UUID().uuidString)"
        let first = makeStore(maxBytes: 1_000, subdir: subdir)
        await first.save(Data(repeating: 0xAA, count: 400), for: "persisted.mp4")
        await first.pin("persisted.mp4", until: Date().addingTimeInterval(3600))

        let relaunched = makeStore(maxBytes: 1_000, subdir: subdir)
        for i in 0..<10 {
            await relaunched.save(Data(repeating: 0xBB, count: 200), for: "filler-\(i).mp4")
        }
        await relaunched.evictOverBudget()

        let result = await relaunched.load(for: "persisted.mp4")
        XCTAssertNotNil(result.snapshot()?.first,
                        "Pins must survive a relaunch (sidecar registry) to guarantee offline replay")
    }

    /// Pinning may happen BEFORE the media finishes downloading (viewer pins
    /// on display while the populate Task still runs) — the pin must protect
    /// the file once it lands.
    func test_pin_beforeSave_protectsOnceSaved() async {
        let store = makeStore(maxBytes: 1_000)
        await store.pin("early-pin.mp4", until: Date().addingTimeInterval(3600))
        await store.save(Data(repeating: 0xAA, count: 400), for: "early-pin.mp4")

        for i in 0..<10 {
            await store.save(Data(repeating: 0xBB, count: 200), for: "filler-\(i).mp4")
        }
        await store.evictOverBudget()

        let result = await store.load(for: "early-pin.mp4")
        XCTAssertNotNil(result.snapshot()?.first,
                        "A key pinned before its download completes must be protected once saved")
    }

    /// TTL eviction must honour active pins too (same guarantee, other sweep).
    func test_pinnedFile_survivesEvictExpired() async {
        let store = makeStore(ttl: 0)
        await store.save(Data(repeating: 0xAA, count: 100), for: "ttl-pinned.mp4")
        await store.pin("ttl-pinned.mp4", until: Date().addingTimeInterval(3600))
        await store.save(Data(repeating: 0xBB, count: 100), for: "ttl-loose.mp4")

        await store.evictExpired()

        XCTAssertNotNil(store.cachedFileURL(for: "ttl-pinned.mp4"),
                        "An active pin must exempt the file from TTL eviction")
        XCTAssertNil(store.cachedFileURL(for: "ttl-loose.mp4"),
                     "Unpinned expired files keep being TTL-evicted")
    }

    func test_isPinned_reflectsActivePinsOnly() async {
        let store = makeStore()
        await store.pin("active.mp4", until: Date().addingTimeInterval(3600))
        await store.pin("expired.mp4", until: Date().addingTimeInterval(-1))

        let active = await store.isPinned("active.mp4")
        let expired = await store.isPinned("expired.mp4")
        let unknown = await store.isPinned("never-pinned.mp4")
        XCTAssertTrue(active)
        XCTAssertFalse(expired, "A pin past its expiry is not active")
        XCTAssertFalse(unknown)
    }
}
