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
}
