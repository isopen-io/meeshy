import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// #18721 — une conversation ouverte EN REGARD (bannière tirée) ne marque rien
/// lu : ni à l'ouverture, ni au défilement, ni à la sortie du Résumé. Le
/// premier acte qui compte la passe en lecture et la marque lue à l'instant.
@MainActor
final class ConversationViewModelPeekTests: XCTestCase {

    @MainActor
    private final class ReadReceiptSpy: ConversationReadReceiptSenderProviding {
        private(set) var sentBatches: [[String]?] = []

        func send(conversationId: String, messageIds: [String]?, caughtUpId: String?, languages: ConsumedLanguages?) {
            sentBatches.append(messageIds)
        }
    }

    private static let messageId = "aaaaaaaaaaaaaaaaaaaaaaa9"

    private func makeSUT(conversationId: String, peeking: Bool) throws -> (sut: ConversationViewModel, receipts: ReadReceiptSpy) {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: "00000000000000000000e0a0", username: "me", displayName: "Me"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let engine = MockConversationSyncEngine()
        let messageService = MockMessageService()
        let receipts = ReadReceiptSpy()
        let collaborators = ConversationCollaborators(
            persistence: persistence, syncEngine: engine, messageService: messageService, readReceipts: receipts
        )
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 3,
            authManager: authManager,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            syncEngine: engine,
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: persistence, collaborators: collaborators)
        )
        if peeking { PeekOpeningRequests.request(conversationId) }
        sut.start()
        return (sut, receipts)
    }

    // MARK: - En regard, rien n'est lu

    func test_markAsRead_openedInPeek_sendsNoReceipt() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e001", peeking: true)

        sut.markAsRead(messageIds: [Self.messageId], visibleIds: [Self.messageId])

        XCTAssertTrue(receipts.sentBatches.isEmpty)
    }

    func test_markCaughtUpFromSummaryOrRiver_openedInPeek_sendsNoReceipt() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e002", peeking: true)

        sut.markCaughtUpFromSummaryOrRiver()

        XCTAssertTrue(receipts.sentBatches.isEmpty)
    }

    func test_start_openedInPeek_keepsTheExplicitUnreadMark() throws {
        let conversationId = "00000000000000000000e003"
        ExplicitUnreadMarks.note(conversationId)

        _ = try makeSUT(conversationId: conversationId, peeking: true)

        XCTAssertTrue(ExplicitUnreadMarks.consume(conversationId), "regarder n'est pas relire : la marque « non lu » reste")
    }

    func test_noteUserActed_lookingActInPeek_marksNothing() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e004", peeking: true)

        sut.noteUserActed(.scroll)
        sut.noteUserActed(.playAudio)
        sut.noteUserActed(.openMedia)

        XCTAssertTrue(receipts.sentBatches.isEmpty)
    }

    // MARK: - Le premier acte lit

    func test_noteUserActed_sendingInPeek_marksTheConversationReadAtOnce() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e005", peeking: true)

        sut.noteUserActed(.sendMessage)

        XCTAssertEqual(receipts.sentBatches.count, 1)
        XCTAssertEqual(receipts.sentBatches.first, .some(nil), "le serveur reçoit « tout ce qui précède », sans lot")
    }

    func test_noteUserActed_reactingInPeek_marksRead() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e006", peeking: true)

        sut.noteUserActed(.toggleReaction)

        XCTAssertEqual(receipts.sentBatches.count, 1)
    }

    func test_noteUserActed_attachingInPeek_marksRead() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e007", peeking: true)

        sut.noteUserActed(.sendAttachment)

        XCTAssertEqual(receipts.sentBatches.count, 1)
    }

    func test_markAsRead_afterTheFirstAct_readsNormally() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e008", peeking: true)
        sut.noteUserActed(.sendMessage)

        sut.markAsRead(messageIds: [Self.messageId])

        XCTAssertEqual(receipts.sentBatches.last, .some([Self.messageId]))
    }

    // MARK: - La lecture ordinaire ne change pas

    func test_markAsRead_openedNormally_sendsTheReceipt() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e009", peeking: false)

        sut.markAsRead(messageIds: [Self.messageId])

        XCTAssertEqual(receipts.sentBatches, [[Self.messageId]])
    }

    func test_noteUserActed_openedNormally_sendsNothingMore() throws {
        let (sut, receipts) = try makeSUT(conversationId: "00000000000000000000e010", peeking: false)

        sut.noteUserActed(.sendMessage)

        XCTAssertTrue(receipts.sentBatches.isEmpty, "hors regard, l'acte ne double aucun accusé")
    }

    func test_start_openedNormally_clearsTheExplicitUnreadMark() throws {
        let conversationId = "00000000000000000000e011"
        ExplicitUnreadMarks.note(conversationId)

        _ = try makeSUT(conversationId: conversationId, peeking: false)

        XCTAssertFalse(ExplicitUnreadMarks.consume(conversationId))
    }

    // MARK: - Les notifications attendent le premier acte (#18902)

    private func notificationReads(of conversationId: String, into bag: inout Set<AnyCancellable>) -> () -> Int {
        var count = 0
        NotificationToastManager.shared.conversationNotificationsRead
            .filter { $0 == conversationId }
            .sink { _ in count += 1 }
            .store(in: &bag)
        return { count }
    }

    func test_start_openedInPeek_consumesNoNotification() throws {
        let conversationId = "00000000000000000000e012"
        var bag = Set<AnyCancellable>()
        let reads = notificationReads(of: conversationId, into: &bag)

        let (sut, _) = try makeSUT(conversationId: conversationId, peeking: true)
        defer { sut.noteScreenLeft() }

        XCTAssertEqual(reads(), 0, "regarder ne marque pas la cloche lue, ni ne retire les bannières système")
    }

    func test_noteUserActed_sendingInPeek_consumesTheNotificationsOnce() throws {
        let conversationId = "00000000000000000000e013"
        var bag = Set<AnyCancellable>()
        let reads = notificationReads(of: conversationId, into: &bag)
        let (sut, _) = try makeSUT(conversationId: conversationId, peeking: true)
        defer { sut.noteScreenLeft() }

        sut.noteUserActed(.sendMessage)
        sut.noteUserActed(.toggleReaction)

        XCTAssertEqual(reads(), 1)
    }

    func test_start_openedNormally_consumesTheNotifications() throws {
        let conversationId = "00000000000000000000e014"
        var bag = Set<AnyCancellable>()
        let reads = notificationReads(of: conversationId, into: &bag)

        let (sut, _) = try makeSUT(conversationId: conversationId, peeking: false)
        defer { sut.noteScreenLeft() }

        XCTAssertEqual(reads(), 1)
    }

    func test_start_openedInPeek_keepsTheConversationUnreadCount() throws {
        let conversationId = "00000000000000000000e015"
        NotificationCoordinator.shared.applyConversationUnread(conversationId: conversationId, unreadCount: 3)
        defer { NotificationCoordinator.shared.removeConversation(conversationId) }

        let (sut, _) = try makeSUT(conversationId: conversationId, peeking: true)
        defer { sut.noteScreenLeft() }

        XCTAssertEqual(ConversationReadLedger.shared.state(for: conversationId)?.unreadCount, 3)
    }

    func test_start_openedNormally_readsTheConversationUnreadCount() throws {
        let conversationId = "00000000000000000000e016"
        NotificationCoordinator.shared.applyConversationUnread(conversationId: conversationId, unreadCount: 3)
        defer { NotificationCoordinator.shared.removeConversation(conversationId) }

        let (sut, _) = try makeSUT(conversationId: conversationId, peeking: false)
        defer { sut.noteScreenLeft() }

        XCTAssertEqual(ConversationReadLedger.shared.state(for: conversationId)?.unreadCount, 0)
    }

    // MARK: - Chaque chemin d'acte le signale

    func test_actSites_eachAnsweringPath_notesTheAct() throws {
        let send = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift"))
        XCTAssertTrue(try body(of: "func send(_ outgoing: OutgoingMessage)", in: send).contains("noteUserActed("))
        XCTAssertTrue(try body(of: "func insertOptimisticMediaMessage(", in: send).contains("noteUserActed(.sendAttachment)"))
        let actions = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel+MessageActions.swift"))
        XCTAssertTrue(try body(of: "func toggleReaction(messageId: String, emoji: String)", in: actions).contains("noteUserActed(.toggleReaction)"))
        XCTAssertTrue(try body(of: "private func emitAttachmentReaction(", in: actions).contains("noteUserActed(.toggleReaction)"))
    }

    private func body(of signature: String, in source: String) throws -> Substring {
        let start = try XCTUnwrap(source.range(of: signature), "signature introuvable : \(signature)")
        return source[start.upperBound...].prefix(1_200)
    }
}
