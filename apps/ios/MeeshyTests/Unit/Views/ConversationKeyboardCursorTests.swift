import XCTest
@testable import Meeshy

final class ConversationKeyboardCursorTests: XCTestCase {
    private let ids = ["a", "b", "c"]

    func test_moved_fromNil_downOrUp_landsOnFirst() {
        XCTAssertEqual(ConversationKeyboardCursor.moved(nil, .down, in: ids), "a")
        XCTAssertEqual(ConversationKeyboardCursor.moved(nil, .up, in: ids), "a")
    }

    func test_moved_down_stepsToNext() {
        XCTAssertEqual(ConversationKeyboardCursor.moved("a", .down, in: ids), "b")
    }

    func test_moved_up_stepsToPrevious() {
        XCTAssertEqual(ConversationKeyboardCursor.moved("c", .up, in: ids), "b")
    }

    func test_moved_downOnLast_staysOnLast() {
        XCTAssertEqual(ConversationKeyboardCursor.moved("c", .down, in: ids), "c")
    }

    func test_moved_upOnFirst_staysOnFirst() {
        XCTAssertEqual(ConversationKeyboardCursor.moved("a", .up, in: ids), "a")
    }

    func test_moved_emptyIds_isNil() {
        XCTAssertNil(ConversationKeyboardCursor.moved("a", .down, in: []))
    }

    func test_moved_cursorNotInIds_restartsAtFirst() {
        XCTAssertEqual(ConversationKeyboardCursor.moved("zzz", .down, in: ids), "a")
    }

    func test_reconciled_vanishedId_isNil() {
        XCTAssertNil(ConversationKeyboardCursor.reconciled("b", in: ["a", "c"]))
    }

    func test_reconciled_presentId_isKept() {
        XCTAssertEqual(ConversationKeyboardCursor.reconciled("b", in: ids), "b")
    }
}
