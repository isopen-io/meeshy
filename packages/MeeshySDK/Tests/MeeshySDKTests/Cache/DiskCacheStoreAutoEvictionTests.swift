import XCTest
@testable import MeeshySDK

/// E1 — pin that `DiskCacheStore.save()` triggers eviction so the disk
/// budget cap is actually enforced.
///
/// Before this fix, `evictOverBudget()` was only fired by external
/// memory-warning / BGProcessingTask callers. A heavy user could push
/// the disk cache to multiples of `maxBytes` between sweeps. The auto-
/// trigger keeps cache usage close to the budget without requiring
/// callers to remember to invoke eviction.
final class DiskCacheStoreAutoEvictionTests: XCTestCase {

    private func makeStore(maxBytes: Int) -> DiskCacheStore {
        let subdir = "test-disk-\(UUID().uuidString)"
        let policy = CachePolicy(
            ttl: 60,
            staleTTL: 30,
            maxItemCount: 1000,
            storageLocation: .disk(subdir: subdir, maxBytes: maxBytes)
        )
        let baseDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/\(subdir)", isDirectory: true)
        return DiskCacheStore(policy: policy, baseDirectory: baseDir)
    }

    /// A single write whose size exceeds 1/10th of the budget must trigger
    /// the LRU scan. Pin the eviction-on-big-write fast path.
    func test_save_bigWrite_triggersImmediateEviction() async {
        let store = makeStore(maxBytes: 1_000)
        // First fill the cache with small entries adding up to budget
        for i in 0..<10 {
            await store.save(Data(repeating: 0xAB, count: 100), for: "small-\(i)")
        }
        // Big write: > 1/10th of 1000 = 100 bytes → 500 bytes.
        await store.save(Data(repeating: 0xCD, count: 500), for: "big")
        let totalBytes = await store.estimatedDiskBytes()
        XCTAssertLessThanOrEqual(
            totalBytes, 1_100,
            "Cache should have evicted to stay near the 1000-byte budget after the big write"
        )
    }

    /// Even with only small writes, periodic eviction must reconcile the
    /// budget within `Self.autoEvictionEveryNWrites` writes.
    func test_save_manySmallWrites_eventuallyEvictsToBudget() async {
        let store = makeStore(maxBytes: 1_000)
        for i in 0..<128 {
            await store.save(Data(repeating: UInt8(i & 0xFF), count: 50), for: "k\(i)")
        }
        let totalBytes = await store.estimatedDiskBytes()
        XCTAssertLessThanOrEqual(
            totalBytes, 1_500,
            "Cache should have reconciled toward the 1000-byte budget after 128 writes"
        )
    }
}
