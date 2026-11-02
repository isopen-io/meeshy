import XCTest
import UIKit
import Combine
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
        let awaiting: NotificationRepliesAwaitingRegime
        let refusals: () -> [EndToEndSendRefusal]
        let notices: NoticeLog
    }

    /// Ce que l'utilisateur a lu de l'attente (#14673), et l'horloge et le
    /// trousseau que la règle consulte.
    private final class NoticeLog {
        var waiting: [String] = []
        var settled: [String] = []
        var dropped: [String] = []
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        var activeUser = "user1"
        var preservedSessions: Set<String> = ["user1", "user2"]
    }

    private func makeSUT(served: Result<APIConversation, Error> = .success(conversation(mode: nil))) -> SUT {
        let messages = MockMessageService()
        let conversations = MockConversationService()
        conversations.getByIdResult = served
        let queue = ReplyQueueSpy()
        let persistence = PersistenceSpy()
        let vault = MockEndToEndMessaging()
        let awaiting = NotificationRepliesAwaitingRegime(fileURL: nil)
        var refusals: [EndToEndSendRefusal] = []
        let log = NoticeLog()
        let rules = NotificationReplyRegimeWait.Rules(
            notices: NotificationReplyWaitNotices(
                waiting: { _, id in log.waiting.append(id) },
                settled: { log.settled.append($0) },
                dropped: { conversationId, _ in log.dropped.append(conversationId) }
            ),
            sessionIsPreserved: { log.preservedSessions.contains($0) },
            now: { log.now }
        )
        let handler = NotificationActionHandler(
            messageService: messages,
            conversationService: conversations,
            replyQueue: queue,
            messagePersistence: persistence,
            backgroundTasks: NoBackgroundTasks(),
            authTokenProvider: { nil },
            applyAuthToken: { _ in },
            currentUserId: { log.activeUser },
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
            endToEnd: vault,
            repliesAwaitingRegime: awaiting,
            awaitingReplyRules: rules
        )
        return SUT(
            handler: handler, messages: messages, conversations: conversations,
            queue: queue, persistence: persistence, vault: vault, awaiting: awaiting, refusals: { refusals },
            notices: log
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

    // MARK: - Le régime non confirmé (#14667)

    /// Une réponse hors ligne vers une conversation EN CLAIR ne pose aucune
    /// ligne qui ferait sceller le fil : la loi du fil ne lit rien de chiffré.
    func test_handleReply_unconfirmedRegimeTowardPlainConversation_leavesNoRowThatSealsTheThread() async {
        let sut = makeSUT(served: .failure(Unreachable()))

        await reply(sut, userInfo: replyUserInfo())

        let trail = sut.persistence.insertedRecords.map { $0.toMessage(currentUserId: "user1") }
        let memory = EndToEndRegimeMemory(defaults: nil)
        memory.bind(account: "gate.staging.meeshy.me/me-1")
        let seals = EndToEndRegimeLedger(memory: memory)
            .seals(for: "conv1", opening: nil, cached: nil, trail: trail, isDirect: false)
        XCTAssertFalse(seals, "un régime NON CONFIRMÉ ne scelle pas une conversation en clair")
        assertNoPlaintextLeft(sut)
        XCTAssertEqual(sut.awaiting.awaiting.map(\.conversationId), ["conv1"], "la réponse attend son régime")
        XCTAssertTrue(sut.refusals().isEmpty, "aucune phrase de conversation chiffrée pour un régime inconnu")
    }

    func test_confirmAwaiting_networkBackOnPlainConversation_sendsTheReplyAndEmptiesTheVault() async {
        let sut = makeSUT(served: .failure(Unreachable()))
        await reply(sut, userInfo: replyUserInfo())
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))

        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertEqual(sut.messages.lastSendRequest?.content, Self.secret)
        XCTAssertEqual(sut.messages.lastSendRequest?.replyToId, "msg1")
        XCTAssertEqual(sut.queue.enqueuedItems.map(\.content), [Self.secret])
        XCTAssertTrue(sut.vault.storedIds.isEmpty, "le clair quitte le coffre une fois dans l'outbox")
        XCTAssertTrue(sut.awaiting.awaiting.isEmpty)
    }

    func test_confirmAwaiting_networkBackOnEndToEndConversation_writesTheSealedBubbleOnly() async {
        let sut = makeSUT(served: .failure(Unreachable()))
        await reply(sut, userInfo: replyUserInfo())
        sut.conversations.getByIdResult = .success(Self.conversation(mode: "e2ee"))

        await sut.handler.confirmRepliesAwaitingRegime()

        assertNoPlaintextLeft(sut)
        XCTAssertEqual(sut.persistence.insertedRecords.map(\.encryptionMode), [E2EEWire.mode])
        XCTAssertEqual(vaultTexts(sut), [Self.secret], "le fil le renverra chiffré")
        XCTAssertEqual(sut.refusals(), [.sealedOnlyInConversation])
        XCTAssertTrue(sut.awaiting.awaiting.isEmpty)
    }

    func test_confirmAwaiting_stillOffline_keepsWaitingWithoutTrace() async {
        let sut = makeSUT(served: .failure(Unreachable()))
        await reply(sut, userInfo: replyUserInfo())

        await sut.handler.confirmRepliesAwaitingRegime()

        assertNoPlaintextLeft(sut)
        XCTAssertTrue(sut.persistence.insertedRecords.isEmpty)
        XCTAssertEqual(sut.awaiting.awaiting.count, 1)
        XCTAssertEqual(vaultTexts(sut), [Self.secret])
    }

    func test_handleReply_unconfirmedRegimeAndVaultRefuses_writesNothingAndSaysIt() async {
        let sut = makeSUT(served: .failure(Unreachable()))
        sut.vault.rememberAccepted = false

        await reply(sut, userInfo: replyUserInfo())

        assertNoPlaintextLeft(sut)
        XCTAssertTrue(sut.persistence.insertedRecords.isEmpty)
        XCTAssertTrue(sut.awaiting.awaiting.isEmpty)
        XCTAssertEqual(sut.refusals(), [.unkeptOutsideConversation])
    }

    func test_awaitingStore_survivesARelaunch_withoutTheText_outsideTheBackup() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("awaiting-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("awaiting-regime.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let item = OfflineQueueItem(conversationId: "conv1", content: Self.secret, replyToId: "msg1")
        NotificationRepliesAwaitingRegime(fileURL: url).add(NotificationReplyAwaitingRegime(item, senderId: "user1"))

        let relaunched = NotificationRepliesAwaitingRegime(fileURL: url)

        XCTAssertEqual(relaunched.awaiting.map(\.clientMessageId), [item.clientMessageId])
        let persisted = try Data(contentsOf: url)
        XCTAssertFalse(String(decoding: persisted, as: UTF8.self).contains("4512"), "aucun clair sur le disque")
        XCTAssertEqual(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true,
                       "la fiche ne part pas dans la sauvegarde iCloud ou Finder")
    }

    /// Les fiches écrites dans les préférences sauvegardées avant #14673
    /// rejoignent le fichier, sans date, et quittent les préférences.
    func test_awaitingStore_adoptsLegacyPreferenceFiches_andLeavesThePreferences() throws {
        let suite = "awaiting-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let legacy = #"[{"clientMessageId":"cm1","conversationId":"conv1","senderId":"user1","replyToId":"msg1"}]"#
        defaults.set(Data(legacy.utf8), forKey: NotificationRepliesAwaitingRegime.legacyKey)

        let store = NotificationRepliesAwaitingRegime(fileURL: nil, legacyDefaults: defaults)

        XCTAssertEqual(store.awaiting.map(\.clientMessageId), ["cm1"])
        XCTAssertNil(defaults.data(forKey: NotificationRepliesAwaitingRegime.legacyKey))
    }

    func test_handleReply_gatewayServesReadableMode_sendsTheReply() async {
        let sut = makeSUT(served: .success(Self.conversation(mode: "server")))

        await reply(sut, userInfo: replyUserInfo(["conversationEncryptionMode": "server"]))

        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertEqual(sut.messages.lastSendRequest?.content, Self.secret)
        XCTAssertEqual(sut.queue.enqueuedItems.count, 1)
        XCTAssertTrue(sut.refusals().isEmpty)
    }

    // MARK: - L'attente se voit, et finit (#14673)

    private func waitingReply(_ sut: SUT) async -> String {
        sut.conversations.getByIdResult = .failure(Unreachable())
        await reply(sut, userInfo: replyUserInfo())
        return sut.awaiting.awaiting.first?.clientMessageId ?? ""
    }

    private func assertWithdrawn(_ sut: SUT, file: StaticString = #filePath, line: UInt = #line) {
        assertNoPlaintextLeft(sut, file: file, line: line)
        XCTAssertTrue(sut.persistence.insertedRecords.isEmpty, "aucune bulle", file: file, line: line)
        XCTAssertTrue(sut.awaiting.awaiting.isEmpty, "la fiche part", file: file, line: line)
        XCTAssertTrue(sut.vault.storedIds.isEmpty, "le clair quitte le coffre", file: file, line: line)
        XCTAssertEqual(sut.notices.dropped, ["conv1"], "l'utilisateur lit que la réponse ne partira pas", file: file, line: line)
    }

    func test_handleReply_unconfirmedRegime_announcesTheWait() async {
        let sut = makeSUT()

        let id = await waitingReply(sut)

        XCTAssertEqual(sut.notices.waiting, [id], "la réponse en attente se voit")
        XCTAssertTrue(sut.notices.dropped.isEmpty)
    }

    func test_confirmAwaiting_sent_withdrawsTheWaitNotice() async {
        let sut = makeSUT()
        let id = await waitingReply(sut)
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))

        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertEqual(sut.notices.settled, [id])
    }

    func test_confirmAwaiting_gatewayNoLongerServesTheConversation_withdrawsAndSaysIt() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.conversations.getByIdResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))

        await sut.handler.confirmRepliesAwaitingRegime()

        assertWithdrawn(sut)
    }

    func test_confirmAwaiting_conversationGone_withdrawsAndSaysIt() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.conversations.getByIdResult = .failure(MeeshyError.server(statusCode: 404, message: "Not found"))

        await sut.handler.confirmRepliesAwaitingRegime()

        assertWithdrawn(sut)
    }

    func test_confirmAwaiting_serverErrorOrExpiredSession_keepsWaiting() async {
        for error: Error in [MeeshyError.server(statusCode: 503, message: "busy"), MeeshyError.auth(.sessionExpired)] {
            let sut = makeSUT()
            _ = await waitingReply(sut)
            sut.conversations.getByIdResult = .failure(error)

            await sut.handler.confirmRepliesAwaitingRegime()

            XCTAssertEqual(sut.awaiting.awaiting.count, 1, "\(error) est transitoire")
            XCTAssertEqual(vaultTexts(sut), [Self.secret])
            XCTAssertTrue(sut.notices.dropped.isEmpty)
        }
    }

    func test_handleReply_gatewayNoLongerServesTheConversation_writesNothingAndSaysIt() async {
        let sut = makeSUT(served: .failure(MeeshyError.server(statusCode: 404, message: "Not found")))

        await reply(sut, userInfo: replyUserInfo())

        assertWithdrawn(sut)
        XCTAssertTrue(sut.notices.waiting.isEmpty, "rien n'attend une conversation qui n'est plus servie")
    }

    func test_confirmAwaiting_pastItsAge_isWithdrawnWithoutReadingTheGateway() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        let reads = sut.conversations.getByIdCallCount
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))
        sut.notices.now = sut.notices.now.addingTimeInterval(NotificationReplyRegimeWait.maxAge + 1)

        await sut.handler.confirmRepliesAwaitingRegime()

        assertWithdrawn(sut)
        XCTAssertEqual(sut.conversations.getByIdCallCount, reads, "une réponse échue ne se relit plus")
    }

    func test_confirmAwaiting_withinItsAge_stillSends() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))
        sut.notices.now = sut.notices.now.addingTimeInterval(NotificationReplyRegimeWait.maxAge - 60)

        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.messages.sendCallCount, 1)
    }

    // MARK: - La déconnexion (#14673)

    func test_signOut_withdrawsTheAccountRepliesAndErasesTheirPlaintext() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.notices.preservedSessions = []
        let authenticated = CurrentValueSubject<Bool, Never>(true)
        sut.handler.observeSignOutsForAwaitingReplies(authenticated.eraseToAnyPublisher())

        authenticated.send(false)
        await waitUntil { sut.awaiting.awaiting.isEmpty }

        assertWithdrawn(sut)
    }

    func test_signOut_vaultAlreadyClosed_keepsAWithdrawnFicheThatNeverSends() async {
        let sut = makeSUT()
        let id = await waitingReply(sut)
        sut.notices.preservedSessions = []
        sut.vault.erasureAccepted = false
        let authenticated = CurrentValueSubject<Bool, Never>(true)
        sut.handler.observeSignOutsForAwaitingReplies(authenticated.eraseToAnyPublisher())
        authenticated.send(false)
        await waitUntil { sut.awaiting.awaiting.first?.withdrawnAt != nil }

        sut.notices.preservedSessions = ["user1"]
        sut.vault.erasureAccepted = true
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))
        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.messages.sendCallCount, 0, "une réponse retirée à la déconnexion ne part jamais")
        XCTAssertTrue(sut.queue.enqueuedItems.isEmpty)
        XCTAssertTrue(sut.awaiting.awaiting.isEmpty, "le coffre rouvert, la fiche part")
        XCTAssertFalse(sut.vault.storedIds.contains(id), "et le clair avec elle")
        XCTAssertEqual(sut.notices.dropped, ["conv1"], "dit une seule fois")
    }

    func test_accountSwitch_keepsTheRepliesOfTheSuspendedAccount() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        let authenticated = CurrentValueSubject<Bool, Never>(true)
        sut.handler.observeSignOutsForAwaitingReplies(authenticated.eraseToAnyPublisher())

        authenticated.send(false)
        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.awaiting.awaiting.count, 1, "la session gardée garde sa réponse")
        XCTAssertEqual(vaultTexts(sut), [Self.secret])
        XCTAssertTrue(sut.notices.dropped.isEmpty)
    }

    // MARK: - Le compte et la réentrance (#14674)

    func test_confirmAwaiting_ficheOfAnotherAccount_isNeverReplayedUnderTheActiveOne() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.notices.activeUser = "user2"
        sut.conversations.getByIdResult = .success(Self.conversation(mode: "e2ee"))

        await sut.handler.confirmRepliesAwaitingRegime()
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))
        await sut.handler.confirmRepliesAwaitingRegime()

        XCTAssertEqual(sut.messages.sendCallCount, 0, "la réponse de user1 ne part pas sous user2")
        XCTAssertTrue(sut.queue.enqueuedItems.isEmpty)
        XCTAssertTrue(sut.persistence.insertedRecords.isEmpty, "aucune bulle de user1 dans la base de user2")
        XCTAssertEqual(sut.awaiting.awaiting.map(\.senderId), ["user1"], "la fiche attend son compte")
        XCTAssertEqual(vaultTexts(sut), [Self.secret])
    }

    func test_confirmAwaiting_twoConcurrentWakes_sendTheReplyOnce() async {
        let sut = makeSUT()
        _ = await waitingReply(sut)
        sut.conversations.getByIdResult = .success(Self.conversation(mode: nil))
        sut.vault.onPlaintexts = { try? await Task.sleep(for: .milliseconds(200)) }

        let handler = sut.handler
        let first = Task { @MainActor in await handler.confirmRepliesAwaitingRegime() }
        let second = Task { @MainActor in await handler.confirmRepliesAwaitingRegime() }
        await first.value
        await second.value

        XCTAssertEqual(sut.messages.sendCallCount, 1, "deux réveils, une seule réponse")
        XCTAssertEqual(sut.queue.enqueuedItems.count, 1, "une seule entrée d'outbox")
        XCTAssertEqual(sut.persistence.insertedRecords.count, 1, "une seule ligne")
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(for: .milliseconds(10))
        }
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
