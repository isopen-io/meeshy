import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

/// **`message:countdown-started` donne son horloge à l'EXPÉDITEUR** (#8905).
///
/// L'envoi d'un éphémère n'est pas une réception : la ligne de l'expéditeur
/// n'a aucune échéance tant que personne n'a reçu. L'événement lui porte
/// `max D(u)` — la plus tardive des échéances de ses destinataires, qui RECULE
/// quand un second destinataire reçoit plus tard. La valeur posée en mémoire
/// seule s'effaçait à la première écriture GRDB du fil : elle doit être gravée.
@MainActor
final class ConversationSocketHandlerEphemeralClockTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let messageId = "000000000000000000008905"
    private let sentAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeDB() throws -> (DatabaseQueue, MessagePersistenceActor) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return (db, MessagePersistenceActor(dbWriter: db))
    }

    private func makeSUT() -> (ConversationSocketHandler, MockConversationSocketDelegate, MockMessageSocket) {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId, currentUserId: currentUserId, messageSocket: socket)
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        return (sut, delegate, socket)
    }

    private func sentEphemeralRow() -> MessageRecord {
        MessageRecord(
            localId: messageId, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: "disparaît", originalLanguage: "fr",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: MessageEffectFlags.ephemeral.rawValue,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: sentAt, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: sentAt,
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0,
            ephemeralDuration: 60
        )
    }

    private func persistedExpiresAt(_ db: DatabaseQueue) async throws -> Date? {
        try await db.read { [messageId] db in try MessageRecord.fetchOne(db, key: messageId)?.expiresAt }
    }

    func test_countdownStarted_engravesTheServedDeadline_andFollowsItLater() async throws {
        let (db, actor) = try makeDB()
        let (sut, _, socket) = makeSUT()
        sut.persistence = actor
        try await actor.insertOptimistic(sentEphemeralRow())

        let first = sentAt.addingTimeInterval(300)
        socket.messageCountdownStarted.send(
            MessageCountdownStartedEvent(messageId: messageId, conversationId: conversationId, expiresAt: first))
        try await Task.sleep(nanoseconds: 300_000_000)
        let afterFirst = try await persistedExpiresAt(db)
        XCTAssertEqual(afterFirst, first, "l'échéance servie doit être GRAVÉE — le fil relit GRDB")

        let later = sentAt.addingTimeInterval(900)
        socket.messageCountdownStarted.send(
            MessageCountdownStartedEvent(messageId: messageId, conversationId: conversationId, expiresAt: later))
        try await Task.sleep(nanoseconds: 300_000_000)
        let afterLater = try await persistedExpiresAt(db)
        XCTAssertEqual(afterLater, later, "`max D(u)` recule : un destinataire plus tardif repousse l'échéance de l'expéditeur")
    }

    func test_countdownStarted_ofAnotherConversation_touchesNothing() async throws {
        let (db, actor) = try makeDB()
        let (sut, _, socket) = makeSUT()
        sut.persistence = actor
        try await actor.insertOptimistic(sentEphemeralRow())

        socket.messageCountdownStarted.send(
            MessageCountdownStartedEvent(messageId: messageId, conversationId: "000000000000000000000077",
                                         expiresAt: sentAt.addingTimeInterval(300)))
        try await Task.sleep(nanoseconds: 300_000_000)
        let stored = try await persistedExpiresAt(db)
        XCTAssertNil(stored)
    }
}
