import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Une réponse écrite hors du fil vers une conversation chiffrée de bout en
/// bout ne laisse aucun clair sur le disque** (#13067, loi #12999, règle
/// fail-closed #9229).
///
/// La réponse depuis une notification et le refus d'appel par message ne
/// savent pas sceller. Ils refusaient déjà l'envoi (#12641), mais posaient
/// d'abord une ligne `isEncrypted: false` portant le clair : un appareil volé
/// le rendait lisible dans `meeshy.sqlite`, et la migration du coffre ne la
/// voyait pas. Chaque témoin écrit dans une VRAIE base GRDB sur disque et lit
/// ses octets (base, journal WAL, mémoire partagée) : le clair n'y est jamais,
/// ni dans la file.
@MainActor
final class EndToEndOffThreadReplyDiskTests: XCTestCase {

    private let sealed = "00000000000000000000e2e1"
    private let readable = "00000000000000000000c1e2"
    private let notified = "00000000000000000000bb01"
    private let me = "00000000000000000000ee01"
    private let secret = "Le code du coffre est 4512"

    // MARK: - Fixtures

    private struct Disk {
        let directory: URL
        let pool: DatabasePool
        let persistence: MessagePersistenceActor

        func holds(_ text: String) throws -> Bool {
            let needle = Data(text.utf8)
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            return try files.contains { try Data(contentsOf: $0).range(of: needle) != nil }
        }

        func rows() async throws -> [MessageRecord] {
            try await pool.read { try MessageRecord.fetchAll($0) }
        }
    }

    private func makeDisk() throws -> Disk {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("e2ee-off-thread-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let pool = try DatabasePool(path: directory.appendingPathComponent("meeshy.sqlite").path)
        try MessageDatabaseMigrations.runAll(on: pool)
        return Disk(directory: directory, pool: pool, persistence: MessagePersistenceActor(dbWriter: pool, currentUserId: me))
    }

    private final class RecordingReplyQueue: NotificationReplyQueueing {
        private(set) var enqueued: [OfflineQueueItem] = []
        private(set) var enqueuedKinds: [OutboxKind] = []

        func enqueue(_ item: OfflineQueueItem) async throws { enqueued.append(item) }

        @discardableResult
        func enqueue<P: Codable & Sendable>(_ kind: OutboxKind, payload: P, conversationId: String?) async throws -> String {
            enqueuedKinds.append(kind)
            return "ofqm_test"
        }

        @discardableResult
        func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String {
            try await enqueue(.createComment, payload: comment, conversationId: comment.postId)
        }
    }

    private final class InertBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private final class Refusals {
        var said: [EndToEndSendRefusal] = []
        var conversations: [String] = []
    }

    private struct ReplySUT {
        let handler: NotificationActionHandler
        let messages: MockMessageService
        let queue: RecordingReplyQueue
        let refusals: Refusals
    }

    private func makeReplySUT(disk: Disk, vault: MockEndToEndMessaging, remembering ids: [String]) -> ReplySUT {
        let messages = MockMessageService()
        let queue = RecordingReplyQueue()
        let refusals = Refusals()
        let token = TestSessionToken.make(userId: me)
        let handler = NotificationActionHandler(
            messageService: messages,
            conversationService: MockConversationService(),
            postService: MockPostService(),
            commentPublisher: CommentPublisherSpy(token: token).publisher,
            notifyUnsentComment: {},
            friendService: MockFriendService(),
            replyQueue: queue,
            messagePersistence: disk.persistence,
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { token },
            applyAuthToken: { _ in },
            currentUserId: { [me] in me },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in },
            localMarkRead: { _ in },
            consume: { _ in },
            removeDeliveredForConversation: { _ in },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { _ in },
            prepareReplyQueue: {},
            conversationLocks: DeclaredConversationLocks(),
            notifyRefusedReply: { _ in },
            destinationGuard: .isolated(remembering: ids),
            notifyRefusedEndToEndReply: { conversationId, refusal in
                refusals.conversations.append(conversationId)
                refusals.said.append(refusal)
            },
            endToEnd: vault
        )
        return ReplySUT(handler: handler, messages: messages, queue: queue, refusals: refusals)
    }

    private func reply(_ text: String, in conversationId: String, with sut: ReplySUT) async {
        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: ["type": "new_message", "conversationId": conversationId, "messageId": notified, "senderId": "peer"],
            replyText: text
        )
    }

    private struct DeclineSUT {
        let messenger: CallDeclineMessenger
        let messages: MockMessageService
        let queue: RecordingReplyQueue
        let refusals: Refusals
    }

    private func makeDeclineSUT(disk: Disk, vault: MockEndToEndMessaging, remembering ids: [String]) -> DeclineSUT {
        let messages = MockMessageService()
        let queue = RecordingReplyQueue()
        let refusals = Refusals()
        let messenger = CallDeclineMessenger(
            messageService: messages, replyQueue: queue, messagePersistence: disk.persistence,
            currentUserId: { [me] in me }, prepareReplyQueue: {},
            destinationGuard: .isolated(remembering: ids),
            endToEnd: vault,
            notifyRefusal: { refusals.said.append($0) }
        )
        return DeclineSUT(messenger: messenger, messages: messages, queue: queue, refusals: refusals)
    }

    // MARK: - Le détecteur rougit sur un clair

    /// Le témoin d'octets n'est pas aveugle : la même réponse vers une
    /// conversation lisible écrit bien son clair dans la base.
    func test_reply_toAReadableConversation_writesItsPlaintext_theDetectorSeesIt() async throws {
        let disk = try makeDisk()
        let sut = makeReplySUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [sealed])

        await reply(secret, in: readable, with: sut)

        XCTAssertTrue(try disk.holds(secret))
        XCTAssertEqual(sut.messages.sendCallCount, 1)
    }

    // MARK: - Réponse depuis une notification

    func test_reply_toAnEndToEndConversation_leavesNoPlaintextOnDisk_norInTheOutbox() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        let sut = makeReplySUT(disk: disk, vault: vault, remembering: [sealed])

        await reply(secret, in: sealed, with: sut)

        XCTAssertFalse(try disk.holds(secret), "aucun octet du clair dans meeshy.sqlite, son WAL ni sa mémoire partagée")
        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertTrue(sut.queue.enqueuedKinds.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
    }

    /// Le clair va au coffre, la ligne est scellée et en échec : le fil la
    /// relit et la renvoie chiffrée d'un toucher.
    func test_reply_toAnEndToEndConversation_keepsTheClearInTheVault_underASealedFailedBubble() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        let sut = makeReplySUT(disk: disk, vault: vault, remembering: [sealed])

        await reply(secret, in: sealed, with: sut)

        let rows = try await disk.rows()
        XCTAssertEqual(rows.count, 1)
        let row = try XCTUnwrap(rows.first)
        XCTAssertEqual(row.content, E2EEWire.contentPlaceholder)
        XCTAssertTrue(row.isEncrypted)
        XCTAssertEqual(row.encryptionMode, E2EEWire.mode)
        XCTAssertEqual(row.state, .failed)
        XCTAssertEqual(row.lastError, EndToEndSendRefusal.sealedOnlyInConversation.userMessage)
        XCTAssertEqual(row.replyToId, notified)
        XCTAssertEqual(sut.refusals.said, [.sealedOnlyInConversation])
        XCTAssertEqual(sut.refusals.conversations, [sealed])

        let bubble = row.toMessage(currentUserId: me)
        let entry = try XCTUnwrap(EndToEndThreadPlaintexts.entry(for: bubble, in: vault.remembered))
        let adopted = EndToEndThreadPlaintexts.adoption(of: entry, by: bubble, conversationId: sealed)
        XCTAssertEqual(adopted?.content, secret, "le fil adopte le clair du coffre à SA place : la bulle se renvoie scellée")
    }

    /// Le coffre ne le prend pas (session fermée au réveil en arrière-plan,
    /// trousseau verrouillé) : rien n'est écrit, et le refus se dit.
    func test_reply_whenTheVaultRefuses_writesNothing_andSaysTheReplyWasNotKept() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        vault.rememberAccepted = false
        let sut = makeReplySUT(disk: disk, vault: vault, remembering: [sealed])

        await reply(secret, in: sealed, with: sut)

        XCTAssertFalse(try disk.holds(secret))
        let rows = try await disk.rows()
        XCTAssertTrue(rows.isEmpty)
        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
        XCTAssertEqual(sut.refusals.said, [.unkeptOutsideConversation])
    }

    // MARK: - Refus d'appel par message

    func test_callDecline_toAnEndToEndConversation_leavesNoPlaintextOnDisk_norInTheOutbox() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        let sut = makeDeclineSUT(disk: disk, vault: vault, remembering: [sealed])

        await sut.messenger.send(CallDeclineReplyPlan(conversationId: sealed, content: secret, originalLanguage: "fr"))

        XCTAssertFalse(try disk.holds(secret))
        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
        let rows = try await disk.rows()
        let row = try XCTUnwrap(rows.first)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(row.content, E2EEWire.contentPlaceholder)
        XCTAssertEqual(row.state, .failed)
        XCTAssertEqual(row.lastError, EndToEndSendRefusal.sealedOnlyInConversation.userMessage)
        XCTAssertEqual(sut.refusals.said, [.sealedOnlyInConversation])

        let bubble = row.toMessage(currentUserId: me)
        let entry = try XCTUnwrap(EndToEndThreadPlaintexts.entry(for: bubble, in: vault.remembered))
        XCTAssertEqual(EndToEndThreadPlaintexts.adoption(of: entry, by: bubble, conversationId: sealed)?.content, secret)
    }

    func test_callDecline_whenTheVaultRefuses_writesNothing_andSaysTheMessageWasNotKept() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        vault.rememberAccepted = false
        let sut = makeDeclineSUT(disk: disk, vault: vault, remembering: [sealed])

        await sut.messenger.send(CallDeclineReplyPlan(conversationId: sealed, content: secret, originalLanguage: "fr"))

        XCTAssertFalse(try disk.holds(secret))
        let rows = try await disk.rows()
        XCTAssertTrue(rows.isEmpty)
        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
        XCTAssertEqual(sut.refusals.said, [.unkeptOutsideConversation])
    }

    func test_callDecline_toAReadableConversation_stillLeavesInClear() async throws {
        let disk = try makeDisk()
        let sut = makeDeclineSUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [sealed])

        await sut.messenger.send(CallDeclineReplyPlan(conversationId: readable, content: secret, originalLanguage: "fr"))

        XCTAssertTrue(try disk.holds(secret))
        XCTAssertEqual(sut.queue.enqueued.count, 1)
        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertTrue(sut.refusals.said.isEmpty)
    }

    // MARK: - Le rangement lui-même

    private final class FailingPersistence: OptimisticMessagePersisting {
        struct WriteFailed: Error {}
        func insertOptimistic(_ record: MessageRecord) async throws { throw WriteFailed() }
        func markOptimisticFailed(localId: String, reason: String) async throws {}
    }

    private func item(_ text: String) -> OfflineQueueItem {
        OfflineQueueItem(conversationId: sealed, content: text, originalLanguage: "fr", replyToId: notified)
    }

    /// Au réveil en arrière-plan, la session libsignal s'ouvre dans la file du
    /// pont, peut-être APRÈS le geste : le rangement l'attend, puis réessaie.
    func test_keep_whenTheSessionOpensAfterTheGesture_waitsForIt_andKeeps() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        vault.rememberAccepted = false
        var openings = 0
        let keeper = EndToEndOffThreadReply(endToEnd: vault, persistence: disk.persistence, sessionOpening: {
            openings += 1
            vault.rememberAccepted = true
        })
        let reply = item(secret)

        let said = await keeper.keep(reply, senderId: me)

        XCTAssertEqual(said, .sealedOnlyInConversation)
        XCTAssertEqual(openings, 1)
        XCTAssertNotNil(vault.remembered[reply.clientMessageId])
        XCTAssertFalse(try disk.holds(secret))
    }

    func test_keep_whenTheSessionIsAlreadyOpen_doesNotWait() async throws {
        let disk = try makeDisk()
        var openings = 0
        let keeper = EndToEndOffThreadReply(endToEnd: MockEndToEndMessaging(), persistence: disk.persistence, sessionOpening: {
            openings += 1
        })

        _ = await keeper.keep(item(secret), senderId: me)

        XCTAssertEqual(openings, 0)
    }

    /// La bulle ne s'écrit pas : le coffre ne garde pas un clair que rien ne montre.
    func test_keep_whenTheBubbleCannotBeWritten_withdrawsTheVaultEntry() async {
        let vault = MockEndToEndMessaging()
        let keeper = EndToEndOffThreadReply(endToEnd: vault, persistence: FailingPersistence(), sessionOpening: {})
        let reply = item(secret)

        let said = await keeper.keep(reply, senderId: me)

        XCTAssertEqual(said, .unkeptOutsideConversation)
        XCTAssertTrue(vault.storedIds.isEmpty)
        XCTAssertEqual(vault.erasedIds, [[reply.clientMessageId]])
    }

    /// La bannière du refus : un libellé du catalogue, jamais le texte saisi, et
    /// la toucher ouvre la conversation.
    func test_refusedReplyBanner_saysTheReason_neverTheText_andOpensTheConversation() {
        for refusal in [EndToEndSendRefusal.sealedOnlyInConversation, .unkeptOutsideConversation] {
            let content = NotificationReplyFailure.endToEndReplyRefusedContent(conversationId: sealed, refusal: refusal)

            XCTAssertEqual(content.body, refusal.userMessage)
            XCTAssertFalse(content.body.contains(secret))
            XCTAssertEqual(content.userInfo["conversationId"] as? String, sealed)
            XCTAssertEqual(content.threadIdentifier, "conversation:\(sealed)")
        }
    }
}
