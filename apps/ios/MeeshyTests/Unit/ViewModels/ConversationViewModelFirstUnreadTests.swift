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
        let (sut, pool) = try makeSUTWithSeams(serverUnreadCount: 2)
        try await seed(pool, [
            (localId: "m-old", senderId: otherUserId, offset: 0),
            (localId: "m-mine", senderId: myUserId, offset: 5),
            (localId: "m-new", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        // La POSITION porte, seule, la règle « jamais l'auteur » : `m-mine`
        // est le plus ancien message postérieur à `m-old`, et il n'est
        // JAMAIS élu. Le COMPTE, lui, ne la mesure plus depuis #7525 — il
        // rend `serverUnreadCount` tel quel, et l'assertion ci-dessous reste
        // verte si l'on annule le correctif : ne lui faire dire QUE ce
        // qu'elle prouve.
        XCTAssertEqual(sut.firstUnreadMessageId, "m-old", "m-mine (l'auteur) n'est jamais élu")
        XCTAssertEqual(sut.unreadSeparatorCount, 2, "le compte annoncé est celui du serveur")
    }

    /// **G1 est la source PRIMAIRE (rang 1)** : `lastReadMessageCreatedAt`
    /// exclut tout ce qui n'est pas STRICTEMENT postérieur, même si
    /// `lastReadAt` (rang 2, à défaut) dirait autre chose de plus permissif.
    func test_loadMessages_lastReadMessageCreatedAtFromG1_excludesEverythingUpToIt() async throws {
        let (sut, pool) = try makeSUTWithSeams(
            serverUnreadCount: 1,
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
        let (sut, pool) = try makeSUTWithSeams(serverUnreadCount: 1, lastReadAt: t0.addingTimeInterval(3))
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
        let (sut, pool) = try makeSUTWithSeams(serverUnreadCount: 1, memberJoinedAt: t0.addingTimeInterval(3))
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

    // MARK: - #7525 — le compte annoncé suit le SERVEUR, jamais la fenêtre locale

    /// Le cas exact du relevé (V1-séparateur-fantôme) : une conversation
    /// chargée de messages supprimés laisse, DANS LA FENÊTRE PAGINÉE, des
    /// candidats postérieurs à la frontière connue localement — alors que le
    /// serveur (curseur `lastReadMessageId`/`unreadCount`, la MÊME valeur que
    /// la ligne de liste) a DÉJÀ tout compté comme lu. `unreadCount serveur
    /// == 0` doit fermer le séparateur, quoi que la loi locale calcule.
    func test_loadMessages_serverUnreadCountZero_neverShowsSeparatorEvenWhenWindowHasCandidates() async throws {
        let (sut, pool) = try makeSUTWithSeams(
            serverUnreadCount: 0,
            lastReadMessageCreatedAt: t0.addingTimeInterval(-1)
        )
        try await seed(pool, [
            (localId: "m-after-1", senderId: otherUserId, offset: 5),
            (localId: "m-after-2", senderId: otherUserId, offset: 10)
        ])

        await sut.loadMessages()

        XCTAssertNil(sut.firstUnreadMessageId, "unreadCount serveur = 0 ⇒ aucun séparateur")
        XCTAssertEqual(sut.unreadSeparatorCount, 0)
    }

    /// La divergence exacte du relevé (8/9/10/12 affiché vs 5/1/2/0 côté
    /// serveur) : la fenêtre locale voit 3 candidats après la frontière,
    /// mais le curseur serveur (arrêté par un message sauté/supprimé,
    /// `MessageReadStatusService` mode exact) n'en compte qu'1. Le compte
    /// ANNONCÉ est celui du serveur — jamais celui de la fenêtre — pour que
    /// le séparateur et la ligne de liste ne puissent plus diverger.
    func test_loadMessages_separatorCountFollowsServerCount_neverTheWindowedCandidateCount() async throws {
        let (sut, pool) = try makeSUTWithSeams(
            serverUnreadCount: 1,
            lastReadMessageCreatedAt: t0.addingTimeInterval(-1)
        )
        try await seed(pool, [
            (localId: "m-after-1", senderId: otherUserId, offset: 5),
            (localId: "m-after-2", senderId: otherUserId, offset: 10),
            (localId: "m-after-3", senderId: otherUserId, offset: 15)
        ])

        await sut.loadMessages()

        XCTAssertEqual(sut.firstUnreadMessageId, "m-after-1", "la POSITION reste celle de la loi fenêtrée")
        XCTAssertEqual(sut.unreadSeparatorCount, 1, "le COMPTE annoncé est celui du serveur, jamais les 3 candidats de la fenêtre")
    }

    /// **Le fil SANS compte serveur connu — la conversation STUB d'un invité
    /// (`GuestConversationContainer`, qui construit un `Conversation` sans
    /// `userState`).** `initialUnreadCount` y vaut 0 par DÉFAUT, jamais parce
    /// qu'un serveur l'a dit, et aucun curseur de lecture n'existe : sans le
    /// verrou de #7525, la loi fenêtrée élit le PREMIER message de tout
    /// l'historique et annonce la fenêtre entière (« 312 messages non lus »
    /// à un invité qui ouvre le lien pour la première fois). Le silence est
    /// ici la bonne réponse — et il se GARDE, pour qu'un lot ultérieur ne
    /// « répare » pas l'invité en rebranchant `boundary.unreadCount`.
    func test_loadMessages_guestStubConversationWithoutServerCount_showsNoSeparator() async throws {
        let (sut, pool) = try makeSUTWithSeams()
        try await seed(pool, [
            (localId: "m-1", senderId: otherUserId, offset: 0),
            (localId: "m-2", senderId: otherUserId, offset: 10),
            (localId: "m-3", senderId: otherUserId, offset: 20)
        ])

        await sut.loadMessages()

        XCTAssertNil(sut.firstUnreadMessageId, "aucun compte serveur ⇒ aucun séparateur")
        XCTAssertEqual(sut.unreadSeparatorCount, 0)
    }

    // MARK: - Helpers

    private func makeSUTWithSeams(
        serverUnreadCount: Int = 0,
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
            unreadCount: serverUnreadCount,
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
