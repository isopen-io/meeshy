import XCTest
@testable import Meeshy

final class LocallyHiddenMessagesStoreTests: XCTestCase {

    private func makeSUT() -> LocallyHiddenMessagesStore {
        let store = LocallyHiddenMessagesStore(userDefaults: UserDefaults(suiteName: "LocallyHiddenStoreTests")!)
        store.clearAll()
        return store
    }

    // MARK: - isHidden

    func test_isHidden_unknownMessage_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isHidden("msg1"))
    }

    func test_hide_thenIsHidden_returnsTrue() {
        let sut = makeSUT()
        sut.hide("msg1")
        XCTAssertTrue(sut.isHidden("msg1"))
    }

    func test_hide_idempotent_noError() {
        let sut = makeSUT()
        sut.hide("msg1")
        sut.hide("msg1")
        XCTAssertTrue(sut.isHidden("msg1"))
    }

    // MARK: - unhide

    func test_unhide_removesMessage() {
        let sut = makeSUT()
        sut.hide("msg1")
        sut.unhide("msg1")
        XCTAssertFalse(sut.isHidden("msg1"))
    }

    func test_unhide_nonExistent_doesNotCrash() {
        let sut = makeSUT()
        sut.unhide("nonexistent")
        XCTAssertFalse(sut.isHidden("nonexistent"))
    }

    // MARK: - visibleIds

    func test_visibleIds_filtersHiddenMessages() {
        let sut = makeSUT()
        sut.hide("msg2")
        sut.hide("msg4")
        let visible = sut.visibleIds(from: ["msg1", "msg2", "msg3", "msg4", "msg5"])
        XCTAssertEqual(visible, ["msg1", "msg3", "msg5"])
    }

    func test_visibleIds_noHidden_returnsAll() {
        let sut = makeSUT()
        let ids = ["msg1", "msg2"]
        XCTAssertEqual(sut.visibleIds(from: ids), ids)
    }

    // MARK: - allHiddenIds

    func test_allHiddenIds_returnsCorrectSet() {
        let sut = makeSUT()
        sut.hide("msg1")
        sut.hide("msg2")
        XCTAssertEqual(sut.allHiddenIds, Set(["msg1", "msg2"]))
    }

    // MARK: - clearAll

    func test_clearAll_removesEverything() {
        let sut = makeSUT()
        sut.hide("msg1")
        sut.hide("msg2")
        sut.clearAll()
        XCTAssertFalse(sut.isHidden("msg1"))
        XCTAssertFalse(sut.isHidden("msg2"))
        XCTAssertTrue(sut.allHiddenIds.isEmpty)
    }

    // MARK: - Persistence

    func test_persistence_survivesReinstantiation() {
        let defaults = UserDefaults(suiteName: "LocallyHiddenStoreTests")!
        let store1 = LocallyHiddenMessagesStore(userDefaults: defaults)
        store1.clearAll()
        store1.hide("msg1")
        store1.hide("msg2")

        let store2 = LocallyHiddenMessagesStore(userDefaults: defaults)
        XCTAssertTrue(store2.isHidden("msg1"))
        XCTAssertTrue(store2.isHidden("msg2"))
        XCTAssertFalse(store2.isHidden("msg3"))
        store2.clearAll()
    }
}
