import XCTest
import MeeshySDK
@testable import Meeshy

/// `MessageReactionsDetailView.seedReactionGroups` is the pure helper
/// backing the offline-instant lane fix (backlog P2 item 6): the reactions
/// detail screen used to fetch network-only with no seed from
/// `message.reactions` — already displayed as pills under the bubble the
/// user opened this screen from — so offline (or on any network hiccup) it
/// rendered "Aucune reaction" under a bubble visibly showing some.
@MainActor
final class MessageReactionsDetailViewTests: XCTestCase {

    private func makeReaction(
        messageId: String = "m1",
        participantId: String?,
        emoji: String
    ) -> MeeshyReaction {
        MeeshyReaction(messageId: messageId, participantId: participantId, emoji: emoji)
    }

    func test_seedReactionGroups_emptyReactions_returnsEmptyGroups() {
        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: [],
            currentUserId: "me",
            currentUserDisplayName: "Moi"
        )

        XCTAssertTrue(groups.isEmpty)
    }

    func test_seedReactionGroups_groupsByEmojiWithAccurateCounts() {
        let reactions = [
            makeReaction(participantId: "alice", emoji: "😂"),
            makeReaction(participantId: "bob", emoji: "😂"),
            makeReaction(participantId: "carol", emoji: "❤️"),
        ]

        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: reactions,
            currentUserId: "me",
            currentUserDisplayName: "Moi"
        )

        XCTAssertEqual(groups.map(\.emoji), ["😂", "❤️"])
        XCTAssertEqual(groups.first(where: { $0.emoji == "😂" })?.count, 2)
        XCTAssertEqual(groups.first(where: { $0.emoji == "❤️" })?.count, 1)
    }

    /// Core contract: every seeded group carries a non-empty `users` array —
    /// this is what makes the screen's `reactionGroups.isEmpty` gate (not
    /// `filteredReactionUsers.isEmpty`) safe: selecting any filter capsule
    /// built from a seeded group always yields at least one row.
    func test_seedReactionGroups_everyGroupHasNonEmptyUsers() {
        let reactions = [
            makeReaction(participantId: "alice", emoji: "🔥"),
            makeReaction(participantId: nil, emoji: "🔥"),
        ]

        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: reactions,
            currentUserId: "me",
            currentUserDisplayName: "Moi"
        )

        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups.first?.users.count, 2)
        XCTAssertFalse(groups.first?.users.isEmpty ?? true)
    }

    /// The current user's own reaction resolves to their real display name —
    /// the one identity the client can always attribute correctly without a
    /// network round-trip.
    func test_seedReactionGroups_currentUserReaction_usesRealDisplayName() {
        let reactions = [makeReaction(participantId: "me", emoji: "👍")]

        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: reactions,
            currentUserId: "me",
            currentUserDisplayName: "Alice Dupont"
        )

        XCTAssertEqual(groups.first?.users.first?.username, "Alice Dupont")
    }

    /// Other reactors resolve to the existing `common.unknown` placeholder
    /// (same key already used by `RequestsTab`/`ThreadView`) rather than a
    /// fabricated identity — honest about what the client actually knows.
    func test_seedReactionGroups_otherUsersReaction_usesUnknownPlaceholder() {
        let reactions = [makeReaction(participantId: "bob", emoji: "👍")]

        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: reactions,
            currentUserId: "me",
            currentUserDisplayName: "Alice Dupont"
        )

        XCTAssertNotEqual(groups.first?.users.first?.username, "Alice Dupont")
        XCTAssertNotEqual(groups.first?.users.first?.username, "bob")
    }

    /// `participantId == nil` (a reconstructed row the server couldn't
    /// attribute — see `MeeshyReaction.reconstructFromSummary`) must not be
    /// misread as "me" just because both are absent/empty.
    func test_seedReactionGroups_nilParticipantId_neverMatchesEmptyCurrentUserId() {
        let reactions = [makeReaction(participantId: nil, emoji: "😮")]

        let groups = MessageReactionsDetailView.seedReactionGroups(
            from: reactions,
            currentUserId: "",
            currentUserDisplayName: "Moi"
        )

        XCTAssertNotEqual(groups.first?.users.first?.username, "Moi")
    }
}
