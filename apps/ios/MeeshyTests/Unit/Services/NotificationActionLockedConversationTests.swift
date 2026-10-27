import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// **Une conversation verrouillée par PIN n'accepte aucune action depuis
/// l'écran verrouillé** (#12655, décision porteur : le PIN est exigé).
///
/// L'extension pose une catégorie sans action sur la bannière d'une
/// conversation verrouillée. Mais une bannière livrée AVANT le verrou, ou
/// catégorisée par la passerelle quand l'extension n'a pas tourné, porte
/// encore « Répondre » et « Marquer comme lu » : le gestionnaire les refuse
/// lui-même, et ouvre l'app sur la conversation, que le routeur garde par le PIN.
@MainActor
final class NotificationActionLockedConversationTests: XCTestCase {

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

    private final class RecordingPersistence: OptimisticMessagePersisting {
        private(set) var inserted: [MessageRecord] = []

        func insertOptimistic(_ record: MessageRecord) async throws { inserted.append(record) }
        func markOptimisticFailed(localId: String, reason: String) async throws {}
    }

    private final class InertBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private final class Ledger {
        var opened = 0
        var markedRead: [String] = []
        var removedBanners: [String] = []
        var externalURLs: [URL] = []
        var deepLinks: [URL] = []
        var contacts: [NotificationContactCard] = []
        var refusedReplies: [String?] = []
    }

    private struct SUT {
        let handler: NotificationActionHandler
        let messages: MockMessageService
        let conversations: MockConversationService
        let queue: RecordingReplyQueue
        let persistence: RecordingPersistence
        let ledger: Ledger
    }

    private func makeSUT(
        lockedConversationIds: Set<String>,
        locks: (any ConversationLockProbing)? = nil
    ) -> SUT {
        let messages = MockMessageService()
        let conversations = MockConversationService()
        let queue = RecordingReplyQueue()
        let persistence = RecordingPersistence()
        let ledger = Ledger()
        let token = TestSessionToken.make(userId: "user1")
        let handler = NotificationActionHandler(
            messageService: messages,
            conversationService: conversations,
            postService: MockPostService(),
            commentPublisher: CommentPublisherSpy(token: token).publisher,
            notifyUnsentComment: {},
            friendService: MockFriendService(),
            replyQueue: queue,
            messagePersistence: persistence,
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { token },
            applyAuthToken: { _ in },
            currentUserId: { "user1" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in ledger.opened += 1 },
            localMarkRead: { ledger.markedRead.append($0) },
            consume: { _ in },
            removeDeliveredForConversation: { ledger.removedBanners.append($0) },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { _ in },
            prepareReplyQueue: {},
            openExternalURL: { ledger.externalURLs.append($0) },
            openDeepLink: { ledger.deepLinks.append($0) },
            presentNewContact: { ledger.contacts.append($0) },
            conversationLocks: locks ?? DeclaredConversationLocks(lockedConversationIds),
            notifyRefusedReply: { ledger.refusedReplies.append($0) },
            destinationGuard: .isolated(),
            endToEnd: MockEndToEndMessaging()
        )
        return SUT(
            handler: handler, messages: messages, conversations: conversations,
            queue: queue, persistence: persistence, ledger: ledger
        )
    }

    private func payload(conversationId: String = "coffre") -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": conversationId, "messageId": "m1", "senderId": "sender1"]
    }

    func test_reply_onALockedConversation_queuesNothing_andOpensTheApp() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(),
            replyText: "écrit sans PIN"
        )

        XCTAssertTrue(sut.queue.enqueued.isEmpty, "rien ne rejoint la file")
        XCTAssertTrue(sut.persistence.inserted.isEmpty, "aucune bulle optimiste")
        XCTAssertEqual(sut.messages.sendCallCount, 0, "rien ne part")
        XCTAssertEqual(sut.conversations.markReadCallCount, 0)
        XCTAssertTrue(sut.ledger.markedRead.isEmpty)
        XCTAssertEqual(sut.ledger.opened, 1, "l'app s'ouvre sur la conversation, que le PIN garde")
    }

    /// « Répondre » s'exécute en arrière-plan : une réponse refusée le DIT,
    /// par une notification locale, au lieu de disparaître en silence.
    func test_reply_onALockedConversation_tellsTheUserItWasNotSent() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(),
            replyText: "écrit sans PIN"
        )

        XCTAssertEqual(sut.ledger.refusedReplies, ["coffre"])
    }

    func test_reply_onASealedPayload_tellsTheUserItWasNotSent() async {
        let sut = makeSUT(lockedConversationIds: [])
        let sealed = NSEAttachmentPolicy.sealingLockedConversation(payload(), isLocked: true)

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue, userInfo: sealed, replyText: "écrit sans PIN"
        )

        XCTAssertEqual(sut.ledger.refusedReplies, ["coffre"])
    }

    /// Seule une réponse, saisie puis perdue, appelle le message : les autres
    /// gestes refusés ouvrent l'app sans rien annoncer, et une réponse
    /// acceptée n'annonce aucun refus.
    func test_onlyARefusedReply_isAnnounced() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.markRead.rawValue, userInfo: payload(), replyText: nil
        )
        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(conversationId: "ouverte"),
            replyText: "Salut"
        )

        XCTAssertTrue(sut.ledger.refusedReplies.isEmpty)
    }

    /// Le message ne recopie jamais le texte saisi : un libellé du catalogue,
    /// la route vers la conversation (gardée par le PIN), et aucune action.
    func test_theRefusedReplyNotification_carriesNoTypedText_andNoAction() throws {
        let english = try XCTUnwrap(Bundle.main.path(forResource: "en", ofType: "lproj").flatMap(Bundle.init(path:)))

        let content = NotificationReplyFailure.refusedUnderConversationPinContent(conversationId: "coffre", bundle: english)

        XCTAssertEqual(content.body, "Reply not sent: open the conversation")
        XCTAssertEqual(content.categoryIdentifier, NSEAttachmentPolicy.lockedConversationCategory)
        XCTAssertEqual(content.threadIdentifier, "conversation:coffre")
        XCTAssertEqual(Set(content.userInfo.keys.compactMap { $0 as? String }), ["type", "conversationId"])
        XCTAssertEqual(content.userInfo["conversationId"] as? String, "coffre")
        XCTAssertTrue(content.title.isEmpty && content.subtitle.isEmpty)
    }

    func test_markRead_onALockedConversation_marksNothing_andOpensTheApp() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.markRead.rawValue,
            userInfo: payload(),
            replyText: nil
        )

        XCTAssertEqual(sut.conversations.markReadCallCount, 0)
        XCTAssertTrue(sut.ledger.markedRead.isEmpty)
        XCTAssertTrue(sut.ledger.removedBanners.isEmpty)
        XCTAssertEqual(sut.ledger.opened, 1)
    }

    /// Une charge que l'extension a SCELLÉE se refuse même si le verrou n'est
    /// plus lisible ici.
    func test_reply_onASealedPayload_queuesNothing() async {
        let sut = makeSUT(lockedConversationIds: [])
        let sealed = NSEAttachmentPolicy.sealingLockedConversation(payload(), isLocked: true)

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: sealed,
            replyText: "écrit sans PIN"
        )

        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
    }

    func test_reply_onAnOpenConversation_stillQueues() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(conversationId: "ouverte"),
            replyText: "Salut"
        )

        XCTAssertEqual(sut.queue.enqueued.map(\.conversationId), ["ouverte"])
        XCTAssertEqual(sut.ledger.opened, 0)
    }

    /// Le gestionnaire n'a pas encore lu sa liste (lancement avant le premier
    /// déverrouillage, miroir absent) : une bannière NON scellée portant
    /// « Répondre » ne fait rien partir, et le refus se dit. Le VRAI
    /// gestionnaire de verrous est injecté : la question que pose le geste est
    /// celle du code de production, pas une closure du test.
    func test_reply_beforeTheLockListIsRead_queuesNothing_andIsAnnounced() async throws {
        let suite = "pin-unread-\(UUID().uuidString)"
        let standard = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { standard.removePersistentDomain(forName: suite) }
        let locks = ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: standard,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000,
            isProtectedDataAvailable: { false },
            notificationCenter: NotificationCenter()
        )
        let sut = makeSUT(lockedConversationIds: [], locks: locks)

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(conversationId: "inconnue"),
            replyText: "écrit sans PIN"
        )

        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.messages.sendCallCount, 0)
        XCTAssertEqual(sut.ledger.refusedReplies, ["inconnue"])
    }

    /// Mise à jour depuis une version sans fichier miroir, liste lue ABSENTE
    /// (F1) : le gestionnaire reconstruit ses verrous depuis le trousseau. Le
    /// geste se refuse, et l'ouverture qu'il déclenche (`openNotification`,
    /// puis la porte du routeur) demande le PIN.
    func test_reply_afterAnUpgradeWhoseListReadsAbsent_isRefused_andItsOpeningAsksForThePin() async throws {
        let suite = "pin-upgrade-\(UUID().uuidString)"
        let standard = try XCTUnwrap(UserDefaults(suiteName: suite))
        let container = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        defer {
            standard.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: container)
        }
        let vault = InMemoryConversationLockVault()
        vault.write("code", for: "meeshy_lock_coffre")
        let locks = ConversationLockManager(
            vault: vault,
            defaults: standard,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000,
            contentLockMirrorFile: NSELockedConversationMirror.fileURL(inContainer: container),
            isProtectedDataAvailable: { true },
            notificationCenter: NotificationCenter()
        )
        let sut = makeSUT(lockedConversationIds: [], locks: locks)

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: payload(),
            replyText: "écrit sans PIN"
        )

        XCTAssertTrue(sut.queue.enqueued.isEmpty)
        XCTAssertEqual(sut.ledger.refusedReplies, ["coffre"])
        XCTAssertEqual(sut.ledger.opened, 1)
        XCTAssertFalse(locks.admitsOpening("coffre"), "l'ouverture déclenchée par le refus exige le PIN")
    }

    /// Le défaut de PRODUCTION est le singleton, qu'un test ne reconstruit
    /// pas : garde de SOURCE. Le type du paramètre ne connaît que
    /// `mayBeLocked`, donc le geste ne peut pas lire une liste vide comme
    /// « aucun verrou ».
    func test_theDefaultLockGate_isTheSharedManager() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Services/NotificationActionHandler.swift")
        )

        XCTAssertTrue(code.contains("conversationLocks: any ConversationLockProbing = ConversationLockManager.shared"),
                      "le geste par défaut doit interroger le gestionnaire de verrous de l'app")
        XCTAssertTrue(code.contains("conversationLocks.mayBeLocked("))
    }

    // MARK: - Les gestes du détail (#8858) sous PIN

    /// Une bannière NON scellée (extension tuée avant sa catégorie, bannière
    /// livrée avant le verrou) porte encore « Rejoindre », « Ajouter le
    /// contact » ou « Ouvrir dans Plans ». Sur une conversation verrouillée,
    /// aucun ne suit son lien : l'app s'ouvre, que le PIN garde.
    func test_joinInvite_onALockedConversation_followsNoLink_andOpensTheApp() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])
        let invite = payload().merging([
            "inviteUrl": "https://meeshy.me/join/abc123", "inviteConversationTitle": "Les voisins",
        ]) { _, new in new }

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.joinInvite.rawValue, userInfo: invite, replyText: nil
        )

        XCTAssertTrue(sut.ledger.deepLinks.isEmpty, "aucun lien d'invitation suivi sans PIN")
        XCTAssertEqual(sut.ledger.opened, 1)
    }

    func test_addContact_onALockedConversation_presentsNoCard_andOpensTheApp() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])
        let contact = payload().merging([
            "contactName": "Jean Dupont", "contactPhone": "+33612345678", "contactEmail": "jean@exemple.fr",
        ]) { _, new in new }

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.addContact.rawValue, userInfo: contact, replyText: nil
        )

        XCTAssertTrue(sut.ledger.contacts.isEmpty)
        XCTAssertEqual(sut.ledger.opened, 1)
    }

    func test_openInMaps_onALockedConversation_opensNoMap_andOpensTheApp() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])
        let place = payload().merging([
            "locationLat": "48.8584", "locationLon": "2.2945", "locationName": "Tour Eiffel",
        ]) { _, new in new }

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.openInMaps.rawValue, userInfo: place, replyText: nil
        )

        XCTAssertTrue(sut.ledger.externalURLs.isEmpty)
        XCTAssertEqual(sut.ledger.opened, 1)
    }

    func test_joinInvite_onAnOpenConversation_stillFollowsTheInvitation() async {
        let sut = makeSUT(lockedConversationIds: ["coffre"])
        let invite = payload(conversationId: "ouverte").merging([
            "inviteUrl": "https://meeshy.me/join/abc123",
        ]) { _, new in new }

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.joinInvite.rawValue, userInfo: invite, replyText: nil
        )

        XCTAssertEqual(sut.ledger.deepLinks.map(\.absoluteString), ["https://meeshy.me/join/abc123"])
        XCTAssertEqual(sut.ledger.opened, 0)
    }

    // MARK: - La catégorie sans action

    func test_theLockedConversationCategory_hasNoAction_andIsTheOneTheExtensionPicks() {
        let category = LockedConversationNotificationCategory.category

        XCTAssertTrue(category.actions.isEmpty)
        XCTAssertEqual(category.identifier, NSEAttachmentPolicy.lockedConversationCategory)
    }

    /// Le jeu que l'app remet au système porte la catégorie sans action :
    /// sans elle, iOS retombe sur une bannière SANS catégorie connue, et la
    /// loi de l'extension ne se verrait jamais.
    func test_theRegisteredCategories_includeTheLockedConversationOne_withoutAnyAction() throws {
        var registered: Set<UNNotificationCategory> = []

        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }

        let locked = try XCTUnwrap(registered.first { $0.identifier == NSEAttachmentPolicy.lockedConversationCategory })
        XCTAssertTrue(locked.actions.isEmpty)
    }

    /// Les catégories de conversation que la loi de l'extension remplace
    /// restent enregistrées, avec leurs gestes, pour une conversation ouverte.
    func test_theRegisteredCategories_keepTheConversationCategoriesTheExtensionMayReplace() {
        var registered: Set<UNNotificationCategory> = []

        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }

        let identifiers = Set(registered.map(\.identifier))
        for category in [MeeshyNotificationCategory.message, .mention, .location, .contact, .invite, .audio, .ephemeral] {
            XCTAssertTrue(identifiers.contains(category.rawValue), category.rawValue)
        }
        let message = registered.first { $0.identifier == MeeshyNotificationCategory.message.rawValue }
        XCTAssertEqual(message?.actions.map(\.identifier), [
            MeeshyNotificationAction.reply.rawValue, MeeshyNotificationAction.markRead.rawValue,
        ])
    }
}

/// Un jeu de verrous déclaré, pour les gestes dont le test ne porte pas sur
/// la lecture de la liste.
@MainActor
final class DeclaredConversationLocks: ConversationLockProbing {
    nonisolated deinit {}

    private let lockedConversationIds: Set<String>

    init(_ lockedConversationIds: Set<String> = []) {
        self.lockedConversationIds = lockedConversationIds
    }

    func mayBeLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
    }
}
