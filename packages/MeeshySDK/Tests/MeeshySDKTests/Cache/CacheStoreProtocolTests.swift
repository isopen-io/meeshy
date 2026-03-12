import XCTest
@testable import MeeshySDK

private struct TestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

private actor MockMutableStore: MutableCacheStore {
    typealias Key = String
    typealias Value = TestItem
    let policy = CachePolicy.conversations
    var storage: [String: [TestItem]] = [:]

    func load(for key: String) async -> CacheResult<[TestItem]> {
        guard let items = storage[key] else { return .empty }
        return .fresh(items, age: 0)
    }
    func save(_ items: [TestItem], for key: String) async { storage[key] = items }
    func update(for key: String, mutate: @Sendable ([TestItem]) -> [TestItem]) async {
        storage[key] = mutate(storage[key] ?? [])
    }
    func invalidate(for key: String) async { storage.removeValue(forKey: key) }
    func invalidateAll() async { storage.removeAll() }
}

final class CacheStoreProtocolTests: XCTestCase {

    func test_saveAndLoad() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value, [TestItem(id: "1", name: "Alice")])
    }

    func test_update_mutatesInPlace() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { $0.map { var i = $0; i.name = "Bob"; return i } }
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value?.first?.name, "Bob")
    }

    func test_invalidate_removesKey() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        await store.invalidate(for: "k")
        let result = await store.load(for: "k")
        XCTAssertNil(result.value)
    }

    func test_invalidateAll() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.invalidateAll()
        let result1 = await store.load(for: "k1")
        let result2 = await store.load(for: "k2")
        XCTAssertNil(result1.value)
        XCTAssertNil(result2.value)
    }
}
