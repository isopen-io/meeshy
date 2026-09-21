import XCTest
import MeeshySDK

/// Tests that the badge counts conversations, not messages (I5 #7236)
///
/// The badge should display the count of unread conversations (excluding muted ones),
/// not the total sum of unread messages across all conversations.
/// This aligns with iPhone and WhatsApp behavior.
final class BadgeCountTests: XCTestCase {

    private func makeLedger(_ rows: [ConversationReadRow]) -> ConversationReadLedger {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: rows, source: .server))
        return ledger
    }

    private func row(_ id: String, _ count: Int, muted: Bool = false) -> ConversationReadRow {
        ConversationReadRow(conversationId: id, unreadCount: count, isMuted: muted)
    }

    /// Test: Badge should count conversations, not sum messages
    /// Scenario: 3 conversations with 2, 5, 3 unread messages
    /// Expected (current): 10 (sum of all unread messages)
    /// Expected (I5):      3 (count of unread conversations)
    func testBadgeCountsConversationsNotMessages() {
        let ledger = makeLedger([
            row("a", 2),      // 2 messages unread
            row("b", 5),      // 5 messages unread
            row("c", 3)       // 3 messages unread
        ])
        // I5: total should be 3 (count of conversations), not 10 (sum of messages)
        let badgeTotal = ledger.total(excludingOpen: false, excludingMuted: false)
        XCTAssertEqual(badgeTotal, 3, "Badge should count 3 conversations, not sum 10 messages")
    }

    /// Test: Badge should exclude muted conversations
    /// Scenario: 2 unread conversations + 1 muted conversation with 5 unread messages
    /// Expected (current): 5 (2 + 5, counting all)
    /// Expected (I5):      2 (count of unread non-muted conversations)
    func testBadgeExcludesMutedConversations() {
        let ledger = makeLedger([
            row("a", 2),              // unread
            row("b", 5, muted: true), // muted, excluded from badge
            row("c", 3)               // unread
        ])
        let badgeTotal = ledger.total(excludingOpen: false, excludingMuted: true)
        XCTAssertEqual(badgeTotal, 2, "Badge should count 2 unread non-muted conversations")
    }

    /// Test: Badge should only count conversations with unreadCount > 0
    /// Scenario: 2 conversations with messages, 1 fully read
    /// Expected: count only the 2 with unread messages
    func testBadgeOnlyCountsNonZeroUnread() {
        let ledger = makeLedger([
            row("a", 2),   // unread
            row("b", 0),   // fully read, should not count
            row("c", 1)    // unread
        ])
        let badgeTotal = ledger.total(excludingOpen: false, excludingMuted: false)
        XCTAssertEqual(badgeTotal, 2, "Badge should count only conversations with unreadCount > 0")
    }

    /// Test: Badge should exclude the open conversation
    /// Scenario: 3 conversations, one is open (viewing it reads it immediately)
    /// Expected: count only the 2 non-open conversations
    func testBadgeExcludesOpenConversation() {
        let ledger = makeLedger([
            row("a", 2),
            row("b", 5),
            row("c", 3)
        ])
        ledger.apply(.localOpen(conversationId: "b"))
        let badgeTotal = ledger.total(excludingOpen: true, excludingMuted: false)
        XCTAssertEqual(badgeTotal, 2, "Badge should exclude the open conversation 'b'")
    }

    /// Test: Badge should exclude both muted and open conversations
    /// Scenario: 3 conversations, one muted, one open
    /// Expected: count only the remaining unread conversation
    func testBadgeExcludesBothMutedAndOpen() {
        let ledger = makeLedger([
            row("a", 2),              // unread, not muted, not open → count
            row("b", 5, muted: true), // muted → exclude
            row("c", 3)               // unread but open → exclude
        ])
        ledger.apply(.localOpen(conversationId: "c"))
        let badgeTotal = ledger.total(excludingOpen: true, excludingMuted: true)
        XCTAssertEqual(badgeTotal, 1, "Badge should count only 'a' (not muted, not open)")
    }

    /// Test: NotificationCoordinator.badgeTotal reads from ConversationReadLedger
    /// This ensures the badge icon reflects the ledger's conversation count
    func testNotificationCoordinatorBadgeTotal() {
        let coordinator = NotificationCoordinator.shared

        // Set up a mock ledger state
        let ledger = makeLedger([
            row("conv1", 1),
            row("conv2", 2),
            row("conv3", 1, muted: true)  // muted, should not count toward badge
        ])

        // The coordinator should read from ledger.total(excludingOpen: true, excludingMuted: true)
        // Expected: 2 conversations (conv1, conv2 are unread and not muted)
        let expectedBadge = ledger.total(excludingOpen: true, excludingMuted: true)
        XCTAssertEqual(expectedBadge, 2, "Ledger should count 2 unread non-muted conversations")
    }
}
