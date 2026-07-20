import XCTest
@testable import Meeshy

@MainActor
final class EditHistoryStoreTests: XCTestCase {

    private func makeSUT() -> EditHistoryStore {
        let store = EditHistoryStore(userDefaults: UserDefaults(suiteName: "EditHistoryStoreTests")!)
        store.clearAll()
        return store
    }

    // MARK: - revisions

    func test_revisions_emptyStore_returnsEmptyArray() {
        let sut = makeSUT()
        XCTAssertTrue(sut.revisions(for: "msg1").isEmpty)
    }

    func test_recordRevision_addsRevision() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "Hello")
        let revisions = sut.revisions(for: "msg1")
        XCTAssertEqual(revisions.count, 1)
        XCTAssertEqual(revisions[0].content, "Hello")
    }

    func test_recordRevision_multipleRevisions_preservesOrder() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "First")
        sut.recordRevision(messageId: "msg1", previousContent: "Second")
        sut.recordRevision(messageId: "msg1", previousContent: "Third")
        let revisions = sut.revisions(for: "msg1")
        XCTAssertEqual(revisions.count, 3)
        XCTAssertEqual(revisions[0].content, "First")
        XCTAssertEqual(revisions[1].content, "Second")
        XCTAssertEqual(revisions[2].content, "Third")
    }

    func test_recordRevision_emptyContent_isIgnored() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "")
        XCTAssertTrue(sut.revisions(for: "msg1").isEmpty)
    }

    func test_recordRevision_whitespaceOnlyContent_isIgnored() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "   \n  ")
        XCTAssertTrue(sut.revisions(for: "msg1").isEmpty)
    }

    func test_recordRevision_differentMessages_areIsolated() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "A")
        sut.recordRevision(messageId: "msg2", previousContent: "B")
        XCTAssertEqual(sut.revisions(for: "msg1").count, 1)
        XCTAssertEqual(sut.revisions(for: "msg2").count, 1)
        XCTAssertEqual(sut.revisions(for: "msg1")[0].content, "A")
        XCTAssertEqual(sut.revisions(for: "msg2")[0].content, "B")
    }

    // MARK: - maxRevisionsPerMessage

    func test_recordRevision_exceedsMax_keepsLatest() {
        let sut = makeSUT()
        for i in 1...35 {
            sut.recordRevision(messageId: "msg1", previousContent: "Rev \(i)")
        }
        let revisions = sut.revisions(for: "msg1")
        XCTAssertEqual(revisions.count, 30)
        XCTAssertEqual(revisions.first?.content, "Rev 6")
        XCTAssertEqual(revisions.last?.content, "Rev 35")
    }

    // MARK: - hasHistory

    func test_hasHistory_noRevisions_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.hasHistory(for: "msg1"))
    }

    func test_hasHistory_withRevisions_returnsTrue() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "Old")
        XCTAssertTrue(sut.hasHistory(for: "msg1"))
    }

    // MARK: - removeHistory

    func test_removeHistory_removesRevisionsForMessage() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "A")
        sut.recordRevision(messageId: "msg2", previousContent: "B")
        sut.removeHistory(for: "msg1")
        XCTAssertTrue(sut.revisions(for: "msg1").isEmpty)
        XCTAssertEqual(sut.revisions(for: "msg2").count, 1)
    }

    // MARK: - clearAll

    func test_clearAll_removesEverything() {
        let sut = makeSUT()
        sut.recordRevision(messageId: "msg1", previousContent: "A")
        sut.recordRevision(messageId: "msg2", previousContent: "B")
        sut.clearAll()
        XCTAssertTrue(sut.revisions(for: "msg1").isEmpty)
        XCTAssertTrue(sut.revisions(for: "msg2").isEmpty)
    }

    // MARK: - Persistence

    func test_persistence_survivesReinstantiation() {
        let defaults = UserDefaults(suiteName: "EditHistoryStoreTests")!
        let store1 = EditHistoryStore(userDefaults: defaults)
        store1.clearAll()
        store1.recordRevision(messageId: "msg1", previousContent: "Persisted")

        let store2 = EditHistoryStore(userDefaults: defaults)
        let revisions = store2.revisions(for: "msg1")
        XCTAssertEqual(revisions.count, 1)
        XCTAssertEqual(revisions[0].content, "Persisted")
        store2.clearAll()
    }
}
