import XCTest
@testable import Meeshy

final class DraftStoreTests: XCTestCase {

    private func makeSUT() -> DraftStore {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "DraftStoreTests")!)
        store.clearAll()
        return store
    }

    func test_load_emptyStore_returnsEmptyString() {
        let sut = makeSUT()
        let result = sut.load(for: "conv123")
        XCTAssertEqual(result, "")
    }

    func test_save_thenLoad_returnsSavedDraft() {
        let sut = makeSUT()
        sut.save("Hello draft", for: "conv123")
        XCTAssertEqual(sut.load(for: "conv123"), "Hello draft")
    }

    func test_save_emptyString_removesDraft() {
        let sut = makeSUT()
        sut.save("Hello", for: "conv123")
        sut.save("", for: "conv123")
        XCTAssertEqual(sut.load(for: "conv123"), "")
    }

    func test_save_whitespaceOnly_removesDraft() {
        let sut = makeSUT()
        sut.save("Hello", for: "conv123")
        sut.save("   ", for: "conv123")
        XCTAssertEqual(sut.load(for: "conv123"), "")
    }

    func test_multipleConversations_isolatedDrafts() {
        let sut = makeSUT()
        sut.save("Draft A", for: "conv1")
        sut.save("Draft B", for: "conv2")
        XCTAssertEqual(sut.load(for: "conv1"), "Draft A")
        XCTAssertEqual(sut.load(for: "conv2"), "Draft B")
    }

    func test_remove_clearsDraftForConversation() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.remove(for: "conv1")
        XCTAssertEqual(sut.load(for: "conv1"), "")
    }

    func test_clearAll_removesAllDrafts() {
        let sut = makeSUT()
        sut.save("A", for: "conv1")
        sut.save("B", for: "conv2")
        sut.clearAll()
        XCTAssertEqual(sut.load(for: "conv1"), "")
        XCTAssertEqual(sut.load(for: "conv2"), "")
    }

    func test_hasDraft_returnsTrueWhenDraftExists() {
        let sut = makeSUT()
        XCTAssertFalse(sut.hasDraft(for: "conv1"))
        sut.save("Draft", for: "conv1")
        XCTAssertTrue(sut.hasDraft(for: "conv1"))
    }

    // MARK: - Overwrite

    func test_save_overwritesExistingDraft() {
        let sut = makeSUT()
        sut.save("First", for: "conv1")
        sut.save("Second", for: "conv1")
        XCTAssertEqual(sut.load(for: "conv1"), "Second")
    }

    // MARK: - Remove Non-Existent

    func test_remove_nonExistentConversation_doesNotCrash() {
        let sut = makeSUT()
        sut.remove(for: "doesNotExist")
        XCTAssertEqual(sut.load(for: "doesNotExist"), "")
    }

    // MARK: - Clear All Isolation

    func test_clearAll_doesNotAffectOtherUserDefaultsKeys() {
        let defaults = UserDefaults(suiteName: "DraftStoreTests")!
        defaults.set("preserved", forKey: "other_key")
        let sut = DraftStore(userDefaults: defaults)
        sut.save("Draft", for: "conv1")
        sut.clearAll()
        XCTAssertEqual(defaults.string(forKey: "other_key"), "preserved")
        defaults.removeObject(forKey: "other_key")
    }

    // MARK: - Has Draft After Remove

    func test_hasDraft_afterRemove_returnsFalse() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.remove(for: "conv1")
        XCTAssertFalse(sut.hasDraft(for: "conv1"))
    }

    // MARK: - Preserves Whitespace In Content

    func test_save_preservesInternalWhitespace() {
        let sut = makeSUT()
        sut.save("Hello   world", for: "conv1")
        XCTAssertEqual(sut.load(for: "conv1"), "Hello   world")
    }

    // MARK: - Newlines

    func test_save_newlinesOnly_removesDraft() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.save("\n\n\n", for: "conv1")
        XCTAssertEqual(sut.load(for: "conv1"), "")
    }
}
