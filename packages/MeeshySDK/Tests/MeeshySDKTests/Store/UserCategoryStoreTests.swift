import XCTest
import Combine
@testable import MeeshySDK

// MARK: - Mock service

final class MockCategoryWriter: UserCategoryWriting, @unchecked Sendable {
    var listResult: [ConversationCategory] = []
    var createResult: ConversationCategory?
    var updateResult: ConversationCategory?
    var errorToThrow: Error?

    private(set) var listCallCount = 0
    private(set) var createCalls: [(name: String, color: String?, icon: String?)] = []
    private(set) var updateCalls: [(id: String, name: String?, color: String?, icon: String?, isExpanded: Bool?)] = []
    private(set) var deleteCalls: [String] = []
    private(set) var reorderCalls: [[(id: String, order: Int)]] = []

    func listCategories() async throws -> [ConversationCategory] {
        listCallCount += 1
        if let e = errorToThrow { throw e }
        return listResult
    }

    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        createCalls.append((name, color, icon))
        if let e = errorToThrow { throw e }
        if let r = createResult { return r }
        return ConversationCategory(id: UUID().uuidString, name: name, color: color, icon: icon, order: 0, isExpanded: true)
    }

    func updateCategory(
        id: String, name: String?, color: String?, icon: String?, isExpanded: Bool?
    ) async throws -> ConversationCategory {
        updateCalls.append((id, name, color, icon, isExpanded))
        if let e = errorToThrow { throw e }
        if let r = updateResult { return r }
        // Default: synthesize an updated row.
        return ConversationCategory(
            id: id, name: name ?? "name", color: color, icon: icon,
            order: 0, isExpanded: isExpanded ?? true
        )
    }

    func deleteCategory(id: String) async throws {
        deleteCalls.append(id)
        if let e = errorToThrow { throw e }
    }

    func reorderCategories(_ updates: [(id: String, order: Int)]) async throws {
        reorderCalls.append(updates)
        if let e = errorToThrow { throw e }
    }
}

// MARK: - Tests

final class UserCategoryStoreTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    override func tearDown() {
        cancellables.removeAll()
        super.tearDown()
    }

    // MARK: Helpers

    private func makeStore() -> (UserCategoryStore, MockCategoryWriter) {
        let mock = MockCategoryWriter()
        let store = UserCategoryStore(service: mock)
        return (store, mock)
    }

    private func cat(_ id: String, name: String = "n", order: Int? = 0, expanded: Bool? = true) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: nil, icon: nil, order: order, isExpanded: expanded)
    }

    // MARK: - Hydration

    func test_hydrate_pullsFromServiceAndPublishes() async throws {
        let (store, mock) = makeStore()
        mock.listResult = [cat("a", order: 1), cat("b", order: 0)]

        try await store.hydrate()
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["b", "a"], "Snapshot must be order-sorted")
        XCTAssertEqual(mock.listCallCount, 1)
    }

    func test_hydrateFromSnapshot_seedsWithoutNetwork() async {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([cat("a"), cat("b", order: 5)])
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.count, 2)
        XCTAssertEqual(mock.listCallCount, 0, "Cache-seed path must not hit the network")
    }

    // MARK: - Create

    func test_create_appendsAndPublishes() async throws {
        let (store, mock) = makeStore()
        mock.createResult = cat("new-id", name: "Family", order: 0)

        let created = try await store.create(name: "Family", color: nil, icon: nil)
        XCTAssertEqual(created.id, "new-id")
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["new-id"])
        XCTAssertEqual(mock.createCalls.count, 1)
        XCTAssertEqual(mock.createCalls.first?.name, "Family")
    }

    // MARK: - Update (rename / setColor / setIcon / setExpanded)

    func test_rename_callsUpdateAndReplacesLocal() async throws {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([cat("a", name: "Old")])
        mock.updateResult = cat("a", name: "New")

        let updated = try await store.rename("a", to: "New")
        XCTAssertEqual(updated.name, "New")
        XCTAssertEqual(mock.updateCalls.first?.name, "New")
        XCTAssertNil(mock.updateCalls.first?.color)
    }

    func test_rename_unknownId_throws() async {
        let (store, _) = makeStore()
        do {
            _ = try await store.rename("ghost", to: "X")
            XCTFail("Expected unknownCategory throw")
        } catch UserCategoryStoreError.unknownCategory(let id) {
            XCTAssertEqual(id, "ghost")
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    func test_setColor_nilLeavesUnchangedFlag() async throws {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([cat("a")])
        _ = try await store.setColor("a", color: nil)
        XCTAssertEqual(mock.updateCalls.count, 1)
        XCTAssertNil(mock.updateCalls.first?.color, "nil color must propagate as nil so the encoder skips the field")
        XCTAssertNil(mock.updateCalls.first?.name)
        XCTAssertNil(mock.updateCalls.first?.icon)
        XCTAssertNil(mock.updateCalls.first?.isExpanded)
    }

    func test_setExpanded_passesBool() async throws {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([cat("a")])
        _ = try await store.setExpanded("a", expanded: false)
        XCTAssertEqual(mock.updateCalls.first?.isExpanded, false)
    }

    // MARK: - Delete

    func test_delete_removesAndPublishes() async throws {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([cat("a"), cat("b")])

        try await store.delete("a")
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["b"])
        XCTAssertEqual(mock.deleteCalls, ["a"])
    }

    func test_delete_unknownId_throws() async {
        let (store, _) = makeStore()
        do {
            try await store.delete("ghost")
            XCTFail("Expected throw")
        } catch UserCategoryStoreError.unknownCategory {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    // MARK: - Reorder

    func test_reorder_appliesLocallyOptimisticallyThenServer() async throws {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([
            cat("a", order: 0),
            cat("b", order: 1),
            cat("c", order: 2),
        ])

        try await store.reorder([("c", 0), ("a", 1), ("b", 2)])

        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["c", "a", "b"])
        XCTAssertEqual(mock.reorderCalls.count, 1)
        XCTAssertEqual(mock.reorderCalls.first?.map(\.id), ["c", "a", "b"])
    }

    func test_reorder_serverFailureRevertsLocalOrder() async {
        let (store, mock) = makeStore()
        await store.hydrateFromSnapshot([
            cat("a", order: 0),
            cat("b", order: 1),
        ])
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "down")

        do {
            try await store.reorder([("b", 0), ("a", 1)])
            XCTFail("Expected throw")
        } catch {
            // expected
        }

        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["a", "b"], "Order must revert to pre-call snapshot on server failure")
    }

    // MARK: - applyRemote

    func test_applyRemote_createdAddsCategory() async {
        let (store, _) = makeStore()
        await store.applyRemote(.created(cat("z", name: "New")))
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["z"])
    }

    func test_applyRemote_updatedReplacesExisting() async {
        let (store, _) = makeStore()
        await store.hydrateFromSnapshot([cat("a", name: "Old")])
        await store.applyRemote(.updated(cat("a", name: "Updated")))
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.first?.name, "Updated")
    }

    func test_applyRemote_deletedRemoves() async {
        let (store, _) = makeStore()
        await store.hydrateFromSnapshot([cat("a"), cat("b")])
        await store.applyRemote(.deleted(id: "a"))
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["b"])
    }

    func test_applyRemote_reorderedReorders() async {
        let (store, _) = makeStore()
        await store.hydrateFromSnapshot([
            cat("a", order: 0),
            cat("b", order: 1),
            cat("c", order: 2),
        ])
        await store.applyRemote(.reordered(updates: [
            ("c", 0), ("a", 1), ("b", 2)
        ]))
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["c", "a", "b"])
    }

    func test_applyRemote_deletedUnknown_isNoOp() async {
        let (store, _) = makeStore()
        await store.hydrateFromSnapshot([cat("a")])
        await store.applyRemote(.deleted(id: "ghost"))
        let snapshot = await store.categories()
        XCTAssertEqual(snapshot.map(\.id), ["a"])
    }

    // MARK: - Publisher

    func test_publisher_emitsOnEveryMutation() async throws {
        let (store, mock) = makeStore()
        mock.createResult = cat("c", name: "C", order: 0)

        let exp = expectation(description: "publisher emits sequence")
        exp.expectedFulfillmentCount = 1
        var snapshots: [[String]] = []
        store.publisher()
            .dropFirst()
            .sink { cats in
                snapshots.append(cats.map(\.id))
                if cats.count == 1 { exp.fulfill() }
            }
            .store(in: &cancellables)

        _ = try await store.create(name: "C", color: nil, icon: nil)
        await fulfillment(of: [exp], timeout: 2)
        XCTAssertFalse(snapshots.isEmpty, "publisher must surface the post-create snapshot")
    }
}
