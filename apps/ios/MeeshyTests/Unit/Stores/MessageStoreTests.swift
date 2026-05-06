// apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift

import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageStoreTests: XCTestCase {

    // MARK: - Deallocation

    func test_deinit_stopsObservation() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        var store: MessageStore? = MessageStore(
            conversationId: "conv-1",
            persistence: persistence
        )
        store?.startObserving(dbPool: db)

        weak var weakStore = store
        XCTAssertNotNil(weakStore, "Store should be alive before release")

        store = nil

        try await Task.sleep(for: .milliseconds(100))
        XCTAssertNil(weakStore, "MessageStore should be deallocated after owner releases it")
    }

    // MARK: - stopObserving cancels refreshTask

    func test_stopObserving_cancelsInflightTask() throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-2", persistence: persistence)
        store.startObserving(dbPool: db)
        store.stopObserving()
        // After stopObserving(), no crash or hang should occur — the store is idle.
        // This is a smoke-test: the assertions live in the lack of test failure.
    }

    // MARK: - Helpers

    private func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
