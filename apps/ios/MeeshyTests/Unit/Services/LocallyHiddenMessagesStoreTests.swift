import XCTest
@testable import Meeshy

@MainActor
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

    // MARK: - migrate (S11) — temp id reconciles to server id

    func test_migrate_hiddenTempId_movesToServerId() {
        let sut = makeSUT()
        sut.hide("temp_1")

        sut.migrate(from: "temp_1", to: "srv_1")

        XCTAssertFalse(sut.isHidden("temp_1"),
            "the pre-reconciliation temp id must no longer be tracked")
        XCTAssertTrue(sut.isHidden("srv_1"),
            "the hidden state must follow the temp->server reconciliation")
        // Survives reinstantiation (persisted under the server id).
        let reloaded = LocallyHiddenMessagesStore(userDefaults: UserDefaults(suiteName: "LocallyHiddenStoreTests")!)
        XCTAssertTrue(reloaded.isHidden("srv_1"))
        reloaded.clearAll()
    }

    func test_migrate_unhiddenId_isNoOp() {
        let sut = makeSUT()
        sut.hide("other")

        sut.migrate(from: "temp_1", to: "srv_1")

        XCTAssertFalse(sut.isHidden("srv_1"),
            "migrating an id that was never hidden must not hide the new id")
        XCTAssertTrue(sut.isHidden("other"), "unrelated hidden ids are untouched")
    }
}
