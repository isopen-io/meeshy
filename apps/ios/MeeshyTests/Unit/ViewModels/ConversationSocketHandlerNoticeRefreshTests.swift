import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// #8633 — la conversation OUVERTE reçoit la ligne d'arrivées de Meeshy
/// Global complétée par le serveur en `message:edited` avec `isEdited: false`.
/// Le contenu suit ; le drapeau « modifié » n'est posé que si la charge le dit.
@MainActor
final class ConversationSocketHandlerNoticeRefreshTests: XCTestCase {

    private let conversationId = "000000000000000000000099"

    private func makeSUT() throws -> (ConversationSocketHandler, MockMessageSocket, DatabaseQueue, MockConversationSocketDelegate) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: "000000000000000000000001",
            messageSocket: socket
        )
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.persistence = MessagePersistenceActor(dbWriter: db)
        sut.armSocketSubscriptions()
        return (sut, socket, db, delegate)
    }

    private func seedNotice(in db: DatabaseQueue) throws {
        let record = MessageRecord(
            localId: "m-arrivals", serverId: "m-arrivals",
            conversationId: conversationId, senderId: "000000000000000000000002",
            content: "Aïcha vient d’arriver", originalLanguage: "fr",
            messageType: "system", messageSource: "system", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try db.write { try record.insert($0) }
    }

    private func served(isEdited: Bool) -> APIMessage {
        JSONStub.decode("""
        {
            "id":"m-arrivals",
            "conversationId":"\(conversationId)",
            "senderId":"000000000000000000000002",
            "content":"Tom et Aïcha viennent d’arriver",
            "messageType":"system","messageSource":"system",
            "isEdited":\(isEdited),
            "editedAt":"2026-09-28T09:04:00.000Z",
            "createdAt":"2026-09-28T09:00:00.000Z",
            "metadata":{"kind":"members-arrived","count":2}
        }
        """)
    }

    private func storedRow(in db: DatabaseQueue) async throws -> MessageRecord? {
        try await Task.sleep(nanoseconds: 300_000_000)
        return try await db.read { try MessageRecord.fetchOne($0, key: "m-arrivals") }
    }

    func test_messageEdited_servedNotEdited_updatesContentWithoutMarkingEdited() async throws {
        let (sut, socket, db, delegate) = try makeSUT()
        _ = (sut, delegate)
        try seedNotice(in: db)

        socket.simulateMessageEdited(served(isEdited: false))

        let row = try await storedRow(in: db)
        XCTAssertEqual(row?.content, "Tom et Aïcha viennent d’arriver")
        XCTAssertEqual(row?.isEdited, false, "une ligne complétée par le serveur n'est pas une édition")
    }

    func test_messageEdited_servedEdited_marksEdited() async throws {
        let (sut, socket, db, delegate) = try makeSUT()
        _ = (sut, delegate)
        try seedNotice(in: db)

        socket.simulateMessageEdited(served(isEdited: true))

        let row = try await storedRow(in: db)
        XCTAssertEqual(row?.content, "Tom et Aïcha viennent d’arriver")
        XCTAssertEqual(row?.isEdited, true)
    }
}
