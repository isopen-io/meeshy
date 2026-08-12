import XCTest
@testable import Meeshy

@MainActor
final class StarredMessagesStoreTests: XCTestCase {

    @MainActor
    private func makeSUT() -> StarredMessagesStore {
        let store = StarredMessagesStore(userDefaults: UserDefaults(suiteName: "StarredMessagesStoreTests")!)
        store.clearAll()
        return store
    }

    private func makeSnapshot(
        id: String = "msg1",
        conversationId: String = "conv1",
        content: String = "Hello",
        starredAt: Date = Date()
    ) -> StarredMessageSnapshot {
        StarredMessageSnapshot(
            id: id,
            conversationId: conversationId,
            conversationName: "Test Conv",
            conversationAccentColor: "#6366F1",
            senderUserId: "user1",
            senderName: "Alice",
            contentPreview: content,
            attachmentKind: nil,
            starredAt: starredAt,
            sentAt: Date()
        )
    }

    // MARK: - isStarred

    @MainActor
    func test_isStarred_unknownMessage_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isStarred(messageId: "msg1"))
    }

    @MainActor
    func test_toggle_star_makesItStarred() {
        let sut = makeSUT()
        let result = sut.toggle(makeSnapshot(id: "msg1"))
        XCTAssertTrue(result)
        XCTAssertTrue(sut.isStarred(messageId: "msg1"))
    }

    @MainActor
    func test_toggle_unstar_makesItUnstarred() {
        let sut = makeSUT()
        sut.toggle(makeSnapshot(id: "msg1"))
        let result = sut.toggle(makeSnapshot(id: "msg1"))
        XCTAssertFalse(result)
        XCTAssertFalse(sut.isStarred(messageId: "msg1"))
    }

    // MARK: - remove

    @MainActor
    func test_remove_removesStarredMessage() {
        let sut = makeSUT()
        sut.toggle(makeSnapshot(id: "msg1"))
        sut.remove(messageId: "msg1")
        XCTAssertFalse(sut.isStarred(messageId: "msg1"))
    }

    @MainActor
    func test_remove_nonExistent_doesNotCrash() {
        let sut = makeSUT()
        sut.remove(messageId: "nonexistent")
        XCTAssertTrue(sut.snapshots.isEmpty)
    }

    // MARK: - updatePreview

    @MainActor
    func test_updatePreview_starredMessage_updatesContentPreview() {
        let sut = makeSUT()
        sut.toggle(makeSnapshot(id: "msg1", content: "Original"))
        sut.updatePreview(messageId: "msg1", contentPreview: "Edited")
        XCTAssertEqual(sut.snapshot(for: "msg1")?.contentPreview, "Edited")
    }

    @MainActor
    func test_updatePreview_persistsAcrossReload() {
        let defaults = UserDefaults(suiteName: "StarredMessagesStoreTests")!
        let sut = StarredMessagesStore(userDefaults: defaults)
        sut.clearAll()
        sut.toggle(makeSnapshot(id: "msg1", content: "Original"))
        sut.updatePreview(messageId: "msg1", contentPreview: "Edited")

        let reloaded = StarredMessagesStore(userDefaults: defaults)
        XCTAssertEqual(reloaded.snapshot(for: "msg1")?.contentPreview, "Edited")
    }

    @MainActor
    func test_updatePreview_unknownMessage_doesNothing() {
        let sut = makeSUT()
        sut.updatePreview(messageId: "nonexistent", contentPreview: "Edited")
        XCTAssertTrue(sut.snapshots.isEmpty)
    }

    // MARK: - snapshot

    @MainActor
    func test_snapshot_returnsCorrectSnapshot() {
        let sut = makeSUT()
        let snap = makeSnapshot(id: "msg1", content: "Test content")
        sut.toggle(snap)
        let retrieved = sut.snapshot(for: "msg1")
        XCTAssertEqual(retrieved?.contentPreview, "Test content")
    }

    @MainActor
    func test_snapshot_unknownMessage_returnsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.snapshot(for: "unknown"))
    }

    // MARK: - removeAll by conversation

    @MainActor
    func test_removeAll_byConversation_removesOnlyThatConversation() {
        let sut = makeSUT()
        sut.toggle(makeSnapshot(id: "msg1", conversationId: "conv1"))
        sut.toggle(makeSnapshot(id: "msg2", conversationId: "conv1"))
        sut.toggle(makeSnapshot(id: "msg3", conversationId: "conv2"))
        sut.removeAll(conversationId: "conv1")
        XCTAssertFalse(sut.isStarred(messageId: "msg1"))
        XCTAssertFalse(sut.isStarred(messageId: "msg2"))
        XCTAssertTrue(sut.isStarred(messageId: "msg3"))
    }

    // MARK: - clearAll

    @MainActor
    func test_clearAll_removesEverything() {
        let sut = makeSUT()
        sut.toggle(makeSnapshot(id: "msg1"))
        sut.toggle(makeSnapshot(id: "msg2"))
        sut.clearAll()
        XCTAssertTrue(sut.snapshots.isEmpty)
    }

    // MARK: - Ordering

    @MainActor
    func test_toggle_insertsInStarredAtDescOrder() {
        let sut = makeSUT()
        let older = makeSnapshot(id: "msg1", starredAt: Date().addingTimeInterval(-100))
        let newer = makeSnapshot(id: "msg2", starredAt: Date())
        sut.toggle(older)
        sut.toggle(newer)
        XCTAssertEqual(sut.snapshots[0].id, "msg2")
        XCTAssertEqual(sut.snapshots[1].id, "msg1")
    }

    // MARK: - Persistence

    @MainActor
    func test_persistence_survivesReinstantiation() {
        let defaults = UserDefaults(suiteName: "StarredMessagesStoreTests")!
        let store1 = StarredMessagesStore(userDefaults: defaults)
        store1.clearAll()
        store1.toggle(makeSnapshot(id: "msg1", content: "Persisted"))

        let store2 = StarredMessagesStore(userDefaults: defaults)
        XCTAssertEqual(store2.snapshots.count, 1)
        XCTAssertEqual(store2.snapshots[0].contentPreview, "Persisted")
        store2.clearAll()
    }
}
