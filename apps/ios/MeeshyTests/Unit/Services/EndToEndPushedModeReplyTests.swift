import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Une réponse depuis la notification d'une conversation passée chiffrée sur
/// un autre appareil ne part jamais en clair** (#13165, modèle : serveur
/// honnête, appareil en retard sur le régime).
///
/// La mémoire du compte et les caches de cet appareil ne savent rien : le push
/// porte `encryptionMode`, le mode de la conversation. Chaque témoin écrit dans
/// une VRAIE base GRDB sur disque et lit ses octets ; la file et la requête
/// sont relues.
@MainActor
final class EndToEndPushedModeReplyTests: XCTestCase {

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

    @MainActor private final class Refusals {
        var said: [EndToEndSendRefusal] = []
        var conversations: [String] = []
        var openedSessions: [String] = []
        var openedBeforeKeeping: Bool?
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
            endToEnd: vault,
            openEndToEndSession: { refusals.openedSessions.append($0) }
        )
        vault.onRemember = { refusals.openedBeforeKeeping = !refusals.openedSessions.isEmpty }
        return ReplySUT(handler: handler, messages: messages, queue: queue, refusals: refusals)
    }

    private func reply(_ text: String, in conversationId: String, pushedMode: String?, with sut: ReplySUT) async {
        var userInfo: [AnyHashable: Any] = ["type": "new_message", "conversationId": conversationId, "messageId": notified, "senderId": "peer"]
        if let pushedMode { userInfo["encryptionMode"] = pushedMode }
        await sut.handler.handle(actionIdentifier: MeeshyNotificationAction.reply.rawValue, userInfo: userInfo, replyText: text)
    }

    func test_mode_seLitDuPush_unModeInconnuFerme() {
        XCTAssertEqual(PushedEncryptionMode(userInfo: [:]), .absent)
        XCTAssertEqual(PushedEncryptionMode(userInfo: ["encryptionMode": ""]), .absent)
        XCTAssertEqual(PushedEncryptionMode(userInfo: ["encryptionMode": " E2EE "]), .endToEnd)
        XCTAssertEqual(PushedEncryptionMode(userInfo: ["encryptionMode": "server"]), .serverReadable)
        XCTAssertEqual(PushedEncryptionMode(userInfo: ["encryptionMode": "hybrid"]), .serverReadable)
        XCTAssertEqual(PushedEncryptionMode(userInfo: ["encryptionMode": "mls-v2"]), .unknown)
        XCTAssertTrue(PushedEncryptionMode.unknown.seals)
        XCTAssertTrue(PushedEncryptionMode.unknown.servedModes.isEmpty, "un mode inconnu scelle sans s'apprendre")
    }

    func test_reply_pushE2EE_memoireVide_aucunOctetDuClair_niEnBase_niEnFile_niDansLaRequete() async throws {
        let disk = try makeDisk()
        let vault = MockEndToEndMessaging()
        let sut = makeReplySUT(disk: disk, vault: vault, remembering: [])

        await reply(secret, in: readable, pushedMode: "e2ee", with: sut)

        XCTAssertFalse(try disk.holds(secret), "aucun octet du clair dans meeshy.sqlite, son WAL ni sa mémoire partagée")
        XCTAssertTrue(sut.queue.enqueued.isEmpty, "rien en file")
        XCTAssertEqual(sut.messages.sendCallCount, 0, "aucune requête en clair")
        XCTAssertEqual(sut.refusals.said, [.sealedOnlyInConversation])
        XCTAssertEqual(vault.storedIds.count, 1, "le clair est gardé au coffre, sous la bulle scellée")
    }

    /// #13166 — au réveil à froid, l'interface n'a pas encore ouvert la
    /// session libsignal : le geste l'ouvre lui-même, AVANT de ranger le clair.
    func test_reply_ouvreLaSessionDuCompteActif_avantDeRangerLeClair() async throws {
        let disk = try makeDisk()
        let sut = makeReplySUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [readable])

        await reply(secret, in: readable, pushedMode: nil, with: sut)

        XCTAssertEqual(sut.refusals.openedSessions, [me])
        XCTAssertEqual(sut.refusals.openedBeforeKeeping, true)
        XCTAssertFalse(try disk.holds(secret))
    }

    func test_reply_pushModeInconnu_ferme() async throws {
        let disk = try makeDisk()
        let sut = makeReplySUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [])

        await reply(secret, in: readable, pushedMode: "mls-v2", with: sut)

        XCTAssertFalse(try disk.holds(secret))
        XCTAssertEqual(sut.messages.sendCallCount, 0)
    }

    func test_reply_pushChiffreAuRepos_partCommeAvant() async throws {
        let disk = try makeDisk()
        let sut = makeReplySUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [])

        await reply("lisible", in: readable, pushedMode: "server", with: sut)

        XCTAssertEqual(sut.messages.sendCallCount, 1, "server est lisible par le serveur : la réponse part")
    }

    func test_reply_passerelleAncienneSansMode_partCommeAvant() async throws {
        let disk = try makeDisk()
        let sut = makeReplySUT(disk: disk, vault: MockEndToEndMessaging(), remembering: [])

        await reply("lisible", in: readable, pushedMode: nil, with: sut)

        XCTAssertEqual(sut.messages.sendCallCount, 1)
    }
}
