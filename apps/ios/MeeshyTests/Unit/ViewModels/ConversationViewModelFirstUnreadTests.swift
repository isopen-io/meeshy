// apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelFirstUnreadTests.swift

import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **La frontière RÉELLE du premier non-lu (#7198/#7222)**, remplaçant la
/// position ARITHMÉTIQUE `messages.count - unreadCount` — voir le doc-comment
/// de `FirstUnreadBoundary.resolve` (`packages/MeeshySDK/.../
/// FirstUnreadBoundary.swift`, miroir de
/// `packages/shared/utils/first-unread.ts`) pour la loi complète.
///
/// `ConversationViewModel.loadMessages()` gèle `firstUnreadMessageId` et
/// `unreadSeparatorCount` ENSEMBLE depuis cette loi, en lisant
/// `messageStore.domainMessages(currentUserId:)` — la source SYNCHRONE, pas
/// le `@Published var messages` (peuplé un tour de boucle plus tard par
/// `subscribeToMessageStore()`).
@MainActor
final class ConversationViewModelFirstUnreadTests: XCTestCase {

    private let conversationId = "00000000000000000000f001"
    private let myUserId = "00000000000000000000f0a0"
    private let otherUserId = "00000000000000000000f0b0"

    /// T0 fixe, non-Date() : les trois rangs de `FirstUnreadBoundary`
    /// comparent des horloges — un test qui les sème depuis `Date()` est
    /// vulnérable au bruit d'horloge entre deux appels.
    private let t0 = Date(timeIntervalSince1970: 1_726_000_000)

    // MARK: - Rang 1 : lastReadMessageCreatedAt (G1, servi INCONDITIONNELLEMENT)

    /// Sans AUCUNE frontière connue (pas de curseur, pas de `lastReadAt`, pas
    /// de `joinedAt`) : tout message de l'AUTRE est non lu — jamais un
    /// message de MOI (rang « jamais l'auteur » de la loi).
    func test_loadMessages_noBoundaryKnown_firstUnreadIsEarliestOtherMessage() async throws {
        let (sut, pool) = try makeSUTWithSeams()
        try await seed(pool, [
            (localId: "m-old", senderId: otherUserId, offset: 0),
            (localId: "m-mine", senderId: myUserId, offset: 5),
            (localId: "m-new", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertEqual(sut.firstUnreadMessageId, "m-old")
        XCTAssertEqual(sut.unreadSeparatorCount, 2, "m-mine (l'auteur) ne compte jamais")
    }

    /// **G1 est la source PRIMAIRE (rang 1)** : `lastReadMessageCreatedAt`
    /// exclut tout ce qui n'est pas STRICTEMENT postérieur, même si
    /// `lastReadAt` (rang 2, à défaut) dirait autre chose de plus permissif.
    func test_loadMessages_lastReadMessageCreatedAtFromG1_excludesEverythingUpToIt() async throws {
        let (sut, pool) = try makeSUTWithSeams(
            // Rang 2, PLUS PERMISSIF (plus ancien) : ne doit JAMAIS gagner
            // quand le rang 1 est servi.
            lastReadAt: t0.addingTimeInterval(-100),
            lastReadMessageCreatedAt: t0.addingTimeInterval(3)
        )
        try await seed(pool, [
            (localId: "m-before", senderId: otherUserId, offset: 0),
            (localId: "m-after", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertEqual(sut.firstUnreadMessageId, "m-after")
        XCTAssertEqual(sut.unreadSeparatorCount, 1)
    }

    // MARK: - Rang 2 : lastReadAt (« à défaut », sans G1)

    /// **Sans G1** (`lastReadMessageCreatedAt` nil, conversation jamais
    /// servie par la route qui le porte) — la frontière retombe sur
    /// `lastReadAt`, jamais sur « tout est non lu ».
    func test_loadMessages_noG1_fallsBackToLastReadAt() async throws {
        let (sut, pool) = try makeSUTWithSeams(lastReadAt: t0.addingTimeInterval(3))
        try await seed(pool, [
            (localId: "m-before", senderId: otherUserId, offset: 0),
            (localId: "m-after", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertEqual(sut.firstUnreadMessageId, "m-after")
        XCTAssertEqual(sut.unreadSeparatorCount, 1)
    }

    // MARK: - Rang 3 : joinedAt (aucun curseur connu du tout)

    func test_loadMessages_noCursorAtAll_fallsBackToJoinedAt() async throws {
        let (sut, pool) = try makeSUTWithSeams(memberJoinedAt: t0.addingTimeInterval(3))
        try await seed(pool, [
            (localId: "m-before", senderId: otherUserId, offset: 0),
            (localId: "m-after", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertEqual(sut.firstUnreadMessageId, "m-after")
        XCTAssertEqual(sut.unreadSeparatorCount, 1)
    }

    // MARK: - Tout lu

    /// **Règle 3 de la loi : `nil` si tout est lu — jamais un `Result` à
    /// `unreadCount == 0`.** Le séparateur ne doit alors JAMAIS apparaître
    /// (`itemsWithUnreadSeparator` ne trouve pas de frontière gelée).
    func test_loadMessages_everythingRead_firstUnreadIsNil() async throws {
        let (sut, pool) = try makeSUTWithSeams(lastReadMessageCreatedAt: t0.addingTimeInterval(100))
        try await seed(pool, [
            (localId: "m-old", senderId: otherUserId, offset: 0),
            (localId: "m-new", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertNil(sut.firstUnreadMessageId)
        XCTAssertEqual(sut.unreadSeparatorCount, 0)
    }

    // MARK: - Helpers

    private func makeSUTWithSeams(
        lastReadMessageId: String? = nil,
        lastReadAt: Date? = nil,
        lastReadMessageCreatedAt: Date? = nil,
        memberJoinedAt: Date? = nil
    ) throws -> (ConversationViewModel, DatabaseQueue) {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: myUserId, username: "me", displayName: "Me"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let messageService = MockMessageService()
        // Force le chemin GRDB-seul : sans réseau, la frontière ne dépend
        // QUE de ce que ce test sème — jamais d'une réponse mock à tenir à
        // jour en plus.
        messageService.listResult = .failure(MeeshyError.network(.noConnection))

        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            memberJoinedAt: memberJoinedAt,
            lastReadMessageId: lastReadMessageId,
            lastReadAt: lastReadAt,
            lastReadMessageCreatedAt: lastReadMessageCreatedAt,
            anonymousSession: nil,
            authManager: authManager,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
        sut.start()
        return (sut, pool)
    }

    /// Sème des lignes GRDB minimales, horodatées par décalage (en secondes)
    /// depuis `t0` — jamais `Date()`, pour des comparaisons de rang
    /// déterministes.
    private func seed(
        _ pool: DatabaseQueue,
        _ rows: [(localId: String, senderId: String, offset: TimeInterval)]
    ) async throws {
        try await pool.write { [t0, conversationId] db in
            for row in rows {
                try MessageRecord(
                    localId: row.localId, serverId: row.localId,
                    conversationId: conversationId, senderId: row.senderId,
                    content: "hello", originalLanguage: "fr",
                    messageType: "text", messageSource: "user", contentType: "text",
                    state: .sent, retryCount: 0, lastError: nil,
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
                    deliveredCount: 1, readCount: 0,
                    deliveredToAllAt: nil, readByAllAt: nil,
                    createdAt: t0.addingTimeInterval(row.offset), sentAt: nil,
                    deliveredAt: nil, readAt: nil, updatedAt: t0.addingTimeInterval(row.offset),
                    attachmentsJson: nil, reactionsJson: nil,
                    reactionCount: 0, currentUserReactionsJson: nil,
                    mentionedUsersJson: nil,
                    cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                    cachedLastLineWidth: nil, cachedLineCount: nil,
                    cachedTimestampInline: nil,
                    layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
                ).insert(db)
            }
        }
    }
}
