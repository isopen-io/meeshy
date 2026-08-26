// apps/ios/MeeshyTests/Unit/Focal/MessageGroupLanguageFanOutTests.swift

import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK

/// #3919 — en Script/Focal, le drapeau de langue n'est monté que sur le
/// DERNIER message d'un groupe (`FocalRow.flagAndReactionsRow`, gardé par
/// `input.isLastInGroup`) et le choix qui y est posé s'applique à TOUT le
/// groupe. `messageIdsInGroup(endingAt:)` est le résolveur qui rend ça
/// possible : depuis le dernier message, il remonte tant que le message
/// précédent CONTINUE le groupe (même règle que `isFirstInGroup`/
/// `isLastInGroup`, `MessageDayGrouping`).
@MainActor
final class MessageGroupLanguageFanOutTests: XCTestCase {

    private func makeStore(with records: [MessageRecord]) throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        try pool.write { db in
            for record in records { try record.insert(db) }
        }
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        return store
    }

    private func makeVC(store: MessageStore) -> MessageListViewController {
        MessageListViewController(
            store: store,
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
    }

    /// m1, m2 (même expéditeur A, suite) — m3, m4 (même expéditeur B, suite,
    /// nouveau groupe). Géométrie déterministe, un jour, mêmes horodatages
    /// croissants d'une seconde.
    private func makeTwoGroupsStore() throws -> MessageStore {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let records = [
            Self.record(localId: "m1", senderId: "A", createdAt: base),
            Self.record(localId: "m2", senderId: "A", createdAt: base.addingTimeInterval(1)),
            Self.record(localId: "m3", senderId: "B", createdAt: base.addingTimeInterval(2)),
            Self.record(localId: "m4", senderId: "B", createdAt: base.addingTimeInterval(3)),
        ]
        return try makeStore(with: records)
    }

    func test_messageIdsInGroup_endingAtSecondOfGroup_includesBothMembers() async throws {
        let store = try makeTwoGroupsStore()
        await store.loadInitial()
        let vc = makeVC(store: store)

        XCTAssertEqual(vc.messageIdsInGroup(endingAt: "m2"), ["m2", "m1"])
    }

    func test_messageIdsInGroup_endingAtSecondGroupTail_stopsAtSenderChange() async throws {
        let store = try makeTwoGroupsStore()
        await store.loadInitial()
        let vc = makeVC(store: store)

        XCTAssertEqual(vc.messageIdsInGroup(endingAt: "m4"), ["m4", "m3"])
    }

    func test_messageIdsInGroup_soloMessage_returnsItselfOnly() async throws {
        let store = try makeTwoGroupsStore()
        await store.loadInitial()
        let vc = makeVC(store: store)

        // m1 est en tête de son groupe : rien à remonter au-delà de lui-même.
        XCTAssertEqual(vc.messageIdsInGroup(endingAt: "m1"), ["m1"])
    }

    func test_messageIdsInGroup_unknownId_returnsItselfOnly() async throws {
        let store = try makeTwoGroupsStore()
        await store.loadInitial()
        let vc = makeVC(store: store)

        XCTAssertEqual(vc.messageIdsInGroup(endingAt: "does-not-exist"), ["does-not-exist"])
    }

    // MARK: - Factory

    private static func record(
        localId: String,
        senderId: String,
        createdAt: Date
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: "c1",
            senderId: senderId,
            content: "message \(localId)",
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: .sent,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 0,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: 0
        )
    }
}
