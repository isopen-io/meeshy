import XCTest
@testable import MeeshySDK

final class ConversationSyncEngineOpenLedgerTests: XCTestCase {

    private func ledger(mirror: [String: Int] = [:]) -> OpenConversationLedger {
        var ledger = OpenConversationLedger()
        ledger.unreadByConversation = mirror
        return ledger
    }

    func test_open_firstCallSeedsRestoreFromMirrorAndZeroesIt() {
        var ledger = ledger(mirror: ["a": 5])
        XCTAssertTrue(ledger.open("a"))
        XCTAssertEqual(ledger.unreadToRestoreOnClose["a"], 5)
        XCTAssertEqual(ledger.unreadByConversation["a"], 0)
        XCTAssertEqual(ledger.currentlyOpenId, "a")
    }

    func test_open_secondCallOnlyCountsAndReordersWithoutReseeding() {
        var ledger = ledger(mirror: ["a": 5])
        _ = ledger.open("a")
        _ = ledger.open("b")
        XCTAssertFalse(ledger.open("a"))
        XCTAssertEqual(ledger.openCounts["a"], 2)
        XCTAssertEqual(ledger.openOrder, ["b", "a"])
        XCTAssertEqual(ledger.unreadToRestoreOnClose["a"], 5)
    }

    func test_close_decrementsThenReleasesWithRestoreOnLastCall() {
        var ledger = ledger(mirror: ["a": 4])
        _ = ledger.open("a")
        _ = ledger.open("a")
        let first = ledger.close("a")
        XCTAssertFalse(first.closed)
        XCTAssertNil(first.restore)
        let last = ledger.close("a")
        XCTAssertTrue(last.closed)
        XCTAssertEqual(last.restore, 4)
        XCTAssertTrue(ledger.openOrder.isEmpty)
        XCTAssertNil(ledger.openCounts["a"])
    }

    func test_close_unknownConversationIsANoop() {
        var ledger = ledger()
        let outcome = ledger.close("ghost")
        XCTAssertFalse(outcome.closed)
        XCTAssertNil(outcome.restore)
    }

    func test_replaceAll_resetsOthersToOneAndReturnsThemInOpeningOrder() {
        var ledger = ledger()
        _ = ledger.open("a"); _ = ledger.open("a"); _ = ledger.open("b"); _ = ledger.open("c")
        let others = ledger.replaceAll(except: "b")
        XCTAssertEqual(others, ["a", "c"])
        XCTAssertEqual(ledger.openCounts["a"], 1)
        XCTAssertEqual(ledger.openCounts["c"], 1)
        XCTAssertEqual(ledger.openCounts["b"], 1)
    }

    func test_replaceAll_withNilReturnsEveryOpenConversation() {
        var ledger = ledger()
        _ = ledger.open("a"); _ = ledger.open("b")
        XCTAssertEqual(ledger.replaceAll(except: nil), ["a", "b"])
    }

    func test_noteUnreadRemaining_ignoredWhenNotOpenAndClampedAtZero() {
        var ledger = ledger()
        ledger.noteUnreadRemaining("a", 3)
        XCTAssertNil(ledger.unreadToRestoreOnClose["a"])
        _ = ledger.open("a")
        ledger.noteUnreadRemaining("a", -2)
        XCTAssertEqual(ledger.unreadToRestoreOnClose["a"], 0)
        ledger.noteUnreadRemaining("a", 6)
        XCTAssertEqual(ledger.unreadToRestoreOnClose["a"], 6)
    }

    func test_aggregateUnread_excludesOpenAndClampsEachEntry() {
        var ledger = ledger(mirror: ["a": 5, "b": -3, "c": 2, "d": 9])
        _ = ledger.open("d")
        ledger.unreadByConversation["d"] = 9
        XCTAssertEqual(ledger.aggregateUnread(), 7)
    }

    func test_armReceiptWindow_succeedsOnceWhileWindowIsOpen() {
        var ledger = ledger()
        XCTAssertTrue(ledger.armReceiptWindow("a") { Task {} })
        XCTAssertFalse(ledger.armReceiptWindow("a") { Task {} })
        ledger.closeReceiptWindow("a")
        XCTAssertTrue(ledger.armReceiptWindow("a") { Task {} })
    }

    func test_takeAllReceiptTasks_emptiesTheTableAndReturnsEverything() {
        var ledger = ledger()
        _ = ledger.armReceiptWindow("a") { Task {} }
        _ = ledger.armReceiptWindow("b") { Task {} }
        XCTAssertEqual(ledger.takeAllReceiptTasks().count, 2)
        XCTAssertTrue(ledger.markAsReceivedTasks.isEmpty)
        XCTAssertTrue(ledger.takeAllReceiptTasks().isEmpty)
    }
}
