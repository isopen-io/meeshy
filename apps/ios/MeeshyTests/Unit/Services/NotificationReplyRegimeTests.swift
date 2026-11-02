import XCTest
import UIKit
import MeeshySDK
import MeeshyE2EE
@testable import Meeshy

/// #13165 — une réponse depuis la bannière d'une conversation passée chiffrée
/// de bout en bout sur un AUTRE appareil ne part jamais en clair : ni ligne en
/// clair dans la base, ni entrée d'outbox, ni requête. Le régime se confirme
/// par le push, puis par la passerelle relue ; faute de confirmation, la
/// réponse suit le chemin chiffré (coffre, ou rien).
@MainActor
final class NotificationReplyRegimeTests: XCTestCase {

    private static let secret = "Le code du coffre est 4512"

    // MARK: - Mocks

    private final class ReplyQueueSpy: NotificationReplyQueueing {
        private(set) var enqueuedItems: [OfflineQueueItem] = []
        private(set) var enqueuedKinds: [OutboxKind] = []

        func enqueue(_ item: OfflineQueueItem) async throws { enqueuedItems.append(item) }

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

    private final class PersistenceSpy: OptimisticMessagePersisting {
        private(set) var insertedRecords: [MessageRecord] = []
        private(set) var failedReasons: [String] = []

        func insertOptimistic(_ record: MessageRecord) async throws { insertedRecords.append(record) }
        func markOptimisticFailed(localId: String, reason: String) async throws { failedReasons.append(reason) }
    }

    private final class NoBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }
        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private struct Unreachable: Error {}

    private struct SUT {
        let handler: NotificationActionHandler
        let messages: MockMessageService
        let conversations: MockConversationService
        let queue: ReplyQueueSpy
        let persistence: PersistenceSpy
        let vault: MockEndToEndMessaging
        let refusals: () -> [EndToEndSendRefusal]
    }

    private func makeSUT(served: Result<APIConversation, Error> = .success(conversation(mode: nil))) -> SUT {
        let messages = MockMessageService()
        let conversations = MockConversationService()
        conversations.getByIdResult = served
        let queue = ReplyQueueSpy()
        let persistence = PersistenceSpy()
        let vault = MockEndToEndMessaging()
        var refusals: [EndToEndSendRefusal] = []
        let handler = NotificationActionHandler(
            messageService: messages,
            conversationService: conversations,
            replyQueue: queue,
            messagePersistence: persistence,
            backgroundTasks: NoBackgroundTasks(),
            authTokenProvider: { nil },
            applyAuthToken: { _ in },
            currentUserId: { "user1" },
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
            destinationGuard: .isolated(),
            notifyRefusedEndToEndReply: { _, refusal in refusals.append(refusal) },
            endToEnd: vault
        )
        return SUT(
            handler: handler, messages: messages, conversations: conversations,
            queue: queue, persistence: persistence, vault: vault, refusals: { refusals }
        )
    }

    private static func conversation(mode: String?) -> APIConversation {
        let modeField = mode.map { #","encryptionMode":"\#($0)""# } ?? ""
        return JSONStub.decode("""
        {"id":"conv1","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"\(modeField)}
        """)
    }

    private func replyUserInfo(_ extra: [AnyHashable: Any] = [:]) -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": "conv1", "messageId": "msg1", "senderId": "sender1"]
            .merging(extra) { _, new in new }
    }

    private func vaultTexts(_ sut: SUT) -> [String?] {
        sut.vault.remembered.values.map { entry in
            guard case .readable(let content, _) = entry else { return nil }
            return content.text
        }
    }

    private func reply(_ sut: SUT, userInfo: [AnyHashable: Any]) async {
        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: userInfo,
            replyText: Self.secret
        )
    }

    /// Le critère de fin de #13165 : aucun octet du clair dans la base,
    /// l'outbox ni la requête. Le clair n'est qu'au coffre.
    private func assertNoPlaintextLeft(_ sut: SUT, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(sut.messages.sendCallCount, 0, "aucune requête", file: file, line: line)
        XCTAssertTrue(sut.queue.enqueuedItems.isEmpty, "aucune entrée d'outbox", file: file, line: line)
        XCTAssertTrue(sut.queue.enqueuedKinds.isEmpty, "aucune entrée d'outbox", file: file, line: line)
        XCTAssertFalse(
            sut.persistence.insertedRecords.contains { ($0.content ?? "").contains("4512") },
            "aucune ligne en clair dans la base", file: file, line: line
        )
        XCTAssertFalse(sut.persistence.failedReasons.contains { $0.contains("4512") }, file: file, line: line)
    }

    // MARK: - Le mode porté par le push

    func test_handleReply_pushCarriesEndToEndModeAndMemoryIsEmpty_writesNoPlaintextAnywhere() async {
        let sut = makeSUT()

        await reply(sut, userInfo: replyUserInfo(["conversationEncryptionMode": "e2ee"]))

        assertNoPlaintextLeft(sut)
        XCTAssertEqual(sut.persistence.insertedRecords.map(\.content), [E2EEWire.contentPlaceholder])
        XCTAssertEqual(vaultTexts(sut), [Self.secret], "le clair est au coffre, d'où le fil le renverra chiffré")
        XCTAssertEqual(sut.refusals(), [.sealedOnlyInConversation])
        XCTAssertEqual(sut.conversations.getByIdCallCount, 0, "le push suffit à fermer : aucune relecture")
    }

    func test_handleReply_pushCarriesUnknownMode_writesNoPlaintextAnywhere() async {
        let sut = makeSUT()

        await reply(sut, userInfo: replyUserInfo(["conversationEncryptionMode": "mls-2027"]))

        assertNoPlaintextLeft(sut)
        XCTAssertEqual(sut.refusals(), [.sealedOnlyInConversation])
    }

    func test_handleReply_pushMessageModeIsEndToEnd_writesNoPlaintextAnywhere() async {
        let sut = makeSUT()

        await reply(sut, userInfo: replyUserInfo(["encryptionMode": "e2ee"]))

        assertNoPlaintextLeft(sut)
    }

    // MARK: - Le mode relu de la passerelle

    func test_handleReply_gatewayServesEndToEndWithoutPushMode_writesNoPlaintextAnywhere() async {
        let sut = makeSUT(served: .success(Self.conversation(mode: "e2ee")))

        await reply(sut, userInfo: replyUserInfo())

        assertNoPlaintextLeft(sut)
        XCTAssertEqual(sut.conversations.getByIdCallCount, 1)
        XCTAssertEqual(sut.refusals(), [.sealedOnlyInConversation])
    }

    func test_handleReply_pushSaysServerModeButGatewayNowServesEndToEnd_writesNoPlaintextAnywhere() async {
        let sut = makeSUT(served: .success(Self.conversation(mode: "e2ee")))

        await reply(sut, userInfo: replyUserInfo(["conversationEncryptionMode": "server"]))

        assertNoPlaintextLeft(sut)
    }

    func test_handleReply_gatewayUnreachable_writesNoPlaintextAnywhere() async {
        let sut = makeSUT(served: .failure(Unreachable()))

        await reply(sut, userInfo: replyUserInfo())

        assertNoPlaintextLeft(sut)
        XCTAssertEqual(vaultTexts(sut), [Self.secret], "le régime non confirmé garde le clair au coffre")
    }

    func test_handleReply_gatewayServesReadableMode_sendsTheReply() async {
        let sut = makeSUT(served: .success(Self.conversation(mode: "server")))

        await reply(sut, userInfo: replyUserInfo(["conversationEncryptionMode": "server"]))

        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertEqual(sut.messages.lastSendRequest?.content, Self.secret)
        XCTAssertEqual(sut.queue.enqueuedItems.count, 1)
        XCTAssertTrue(sut.refusals().isEmpty)
    }

    // MARK: - La règle seule

    func test_pushedModes_nonStringValue_readsAsUnknownMode() {
        let modes = NotificationReplyRegime.pushedModes(["conversationEncryptionMode": 1, "encryptionMode": NSNull()])

        XCTAssertEqual(modes.count, 1)
        XCTAssertTrue(EndToEndSendGate.requiresSeal(conversationEncryptionModes: modes))
    }

    func test_pushedModes_noModeKey_addsNothing() {
        XCTAssertTrue(NotificationReplyRegime.pushedModes(["conversationId": "conv1"]).isEmpty)
    }

    func test_destination_gatewaySlowerThanLimit_isUnconfirmed() async {
        let regime = NotificationReplyRegime(
            destinationGuard: .isolated(),
            servedMode: { _ in
                try await Task.sleep(for: .seconds(30))
                return nil
            },
            limit: .milliseconds(50)
        )

        let destination = await regime.destination(of: "conv1", userInfo: [:])

        XCTAssertEqual(destination, .unconfirmed)
    }

    func test_destination_rememberedEndToEnd_closesWithoutReadingTheGateway() async {
        var reads = 0
        let regime = NotificationReplyRegime(
            destinationGuard: .isolated(remembering: ["conv1"]),
            servedMode: { _ in reads += 1; return nil }
        )

        let destination = await regime.destination(of: "conv1", userInfo: [:])

        XCTAssertEqual(destination, .endToEnd)
        XCTAssertEqual(reads, 0)
    }

    func test_destination_gatewayServesNoMode_isReadableByServer() async {
        let regime = NotificationReplyRegime(destinationGuard: .isolated(), servedMode: { _ in nil })

        let destination = await regime.destination(of: "conv1", userInfo: ["conversationEncryptionMode": ""])

        XCTAssertEqual(destination, .readableByServer)
    }
}
