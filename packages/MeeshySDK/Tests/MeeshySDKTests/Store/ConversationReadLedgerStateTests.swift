import XCTest
@testable import MeeshySDK

final class ConversationReadLedgerStateTests: XCTestCase {

    private func row(_ id: String, unread: Int, muted: Bool = false) -> ConversationReadRow {
        ConversationReadRow(conversationId: id, unreadCount: unread, isMuted: muted)
    }

    func test_localOpen_replacesTheOpenSet() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.localOpenSet(conversationIds: ["a", "b"]))
        XCTAssertNil(state.openConversationId)
        _ = state.apply(.localOpen(conversationId: "c"))
        XCTAssertEqual(state.openConversationIds, ["c"])
        XCTAssertEqual(state.openConversationId, "c")
        _ = state.apply(.localOpen(conversationId: nil))
        XCTAssertTrue(state.openConversationIds.isEmpty)
    }

    func test_serverSnapshot_removesEntriesItDoesNotList() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(rows: [row("a", unread: 1), row("b", unread: 2)], source: .server))
        _ = state.apply(.snapshot(rows: [row("a", unread: 1)], source: .server))
        XCTAssertNil(state.state(for: "b"))
        XCTAssertNotNil(state.state(for: "a"))
    }

    func test_cacheSnapshot_keepsEntriesItDoesNotList_andNeverOverwritesATrackedCount() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(rows: [row("a", unread: 1), row("b", unread: 2)], source: .server))
        _ = state.apply(.snapshot(rows: [row("a", unread: 9)], source: .cache))
        XCTAssertNotNil(state.state(for: "b"))
        XCTAssertEqual(state.state(for: "a")?.unreadCount, 1)
    }

    func test_forget_returnsThePreviousEntryAndDropsItFromTheOpenSet() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(rows: [row("a", unread: 3)], source: .server))
        _ = state.apply(.localOpen(conversationId: "a"))
        let previous = state.apply(.forget(conversationId: "a"))
        XCTAssertEqual(previous?.unreadCount, 3)
        XCTAssertTrue(state.openConversationIds.isEmpty)
        XCTAssertNil(state.apply(.forget(conversationId: "a")))
    }

    func test_counts_readTheOpenConversationAsZero_butKeepTheEntry() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(rows: [row("a", unread: 4), row("b", unread: 2)], source: .server))
        _ = state.apply(.localOpen(conversationId: "a"))
        XCTAssertEqual(state.counts(), ["a": 0, "b": 2])
        XCTAssertEqual(state.state(for: "a")?.unreadCount, 4)
    }

    func test_totals_honorTheirBounds() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(
            rows: [row("a", unread: 4), row("b", unread: 2, muted: true), row("c", unread: 1)],
            source: .server
        ))
        _ = state.apply(.localOpen(conversationId: "a"))
        XCTAssertEqual(state.total(excludingOpen: false, excludingMuted: false), 7)
        XCTAssertEqual(state.total(excludingOpen: true, excludingMuted: false), 3)
        XCTAssertEqual(state.total(excludingOpen: true, excludingMuted: true), 1)
        XCTAssertEqual(state.conversationUnreadTotal(excludingOpen: false), 2)
        XCTAssertEqual(state.conversationUnreadTotal(excludingOpen: true), 1)
    }

    func test_serverUnread_returnsTheEntryAsItWasBefore() {
        var state = ConversationReadLedgerState()
        let before = state.apply(.serverUnread(conversationId: "a", unreadCount: 5))
        XCTAssertEqual(before?.unreadCount, 0)
        let second = state.apply(.serverUnread(conversationId: "a", unreadCount: 1))
        XCTAssertEqual(second?.unreadCount, 5)
    }

    func test_reset_clearsEverything() {
        var state = ConversationReadLedgerState()
        _ = state.apply(.snapshot(rows: [row("a", unread: 4)], source: .server))
        _ = state.apply(.localOpen(conversationId: "a"))
        state.reset()
        XCTAssertTrue(state.counts().isEmpty)
        XCTAssertTrue(state.openConversationIds.isEmpty)
    }
}
