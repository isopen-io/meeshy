import XCTest
@testable import MeeshySDK

final class LockedCacheTests: XCTestCase {

    private func makeCache() -> LockedCache<NSString, NSNumber> {
        LockedCache(NSCache<NSString, NSNumber>())
    }

    private func requireSendable<T: Sendable>(_ value: T) -> T { value }

    func test_setObject_thenObject_returnsTheStoredValue() {
        let cache = makeCache()
        cache.setObject(7, forKey: "a")
        XCTAssertEqual(cache.object(forKey: "a"), 7)
    }

    func test_removeObject_dropsOnlyThatKey() {
        let cache = makeCache()
        cache.setObject(1, forKey: "a")
        cache.setObject(2, forKey: "b")
        cache.removeObject(forKey: "a")
        XCTAssertNil(cache.object(forKey: "a"))
        XCTAssertEqual(cache.object(forKey: "b"), 2)
    }

    func test_removeAllObjects_emptiesTheCache() {
        let cache = makeCache()
        cache.setObject(1, forKey: "a")
        cache.setObject(2, forKey: "b", cost: 3)
        cache.removeAllObjects()
        XCTAssertNil(cache.object(forKey: "a"))
        XCTAssertNil(cache.object(forKey: "b"))
    }

    func test_totalCostLimit_isReadBackAfterBeingSet() {
        let cache = makeCache()
        cache.totalCostLimit = 4_096
        XCTAssertEqual(cache.totalCostLimit, 4_096)
    }

    func test_isSendable_andSharesItsStorageAcrossCopies() {
        let cache = requireSendable(makeCache())
        let copy = cache
        cache.setObject(9, forKey: "k")
        XCTAssertEqual(copy.object(forKey: "k"), 9)
    }

    func test_concurrentAccess_neverCrashes_andKeepsTheLastWrittenValue() async {
        let cache = makeCache()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<1_000 {
                group.addTask { @Sendable @concurrent in
                    let key = NSString(string: "k\(index % 50)")
                    cache.setObject(NSNumber(value: index), forKey: key)
                    _ = cache.object(forKey: key)
                    if index % 7 == 0 { cache.removeObject(forKey: key) }
                }
            }
        }
        cache.setObject(42, forKey: "unique")
        XCTAssertEqual(cache.object(forKey: "unique"), 42)
    }
}
