import XCTest
import Combine
@testable import MeeshySDK

/// Témoins du compteur de non-lus SERVEUR dans le store RAM (#6997).
///
/// Le compteur d'une conversation ne voyage que sur `conversation:unread-updated`
/// (par destinataire). Le store ne l'écoutait pas : il regreffait son
/// `userState` périmé sur la ligne à sa prochaine republication — c'est la
/// pastille qui disparaît puis revient (0 ↔ N).
@MainActor
final class ConversationStoreUnreadTests: XCTestCase {

    // MARK: Builders

    private func makeStore() -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("unread-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    private func makeConv(
        id: String,
        userState: ConversationUserState = ConversationUserState()
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: userState
        )
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    // MARK: - applyServerUnread

    func test_applyServerUnread_takesTheServedCount() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1", userState: ConversationUserState(unreadCount: 0)))

        await store.applyServerUnread(ConversationUnreadEvent(conversationId: "c1", unreadCount: 4))

        let count = await store.conversation(id: "c1")?.userState.unreadCount
        XCTAssertEqual(count, 4, "le compteur SERVEUR est autoritatif — le store doit le prendre")
    }

    /// Le cœur du défaut : `version` ne versionne QUE les préférences
    /// (`applyReadReceipt` et le zéro d'ouverture ne le bumpent jamais). Une
    /// préférence locale en vol figeait pourtant tout le `userState`, compteur
    /// compris — pastille gelée sur une conversation épinglée, muette ou
    /// archivée.
    func test_applyServerUnread_appliesEvenWhenALocalPreferenceIsInFlight() async {
        let store = makeStore()
        await store.hydrate(makeConv(
            id: "c1",
            userState: ConversationUserState(unreadCount: 0, isPinned: true, version: 7)
        ))

        await store.applyServerUnread(ConversationUnreadEvent(conversationId: "c1", unreadCount: 3))

        let state = await store.conversation(id: "c1")?.userState
        XCTAssertEqual(state?.unreadCount, 3, "une préférence en vol ne fige pas le compteur")
        XCTAssertEqual(state?.version, 7, "le compteur ne participe PAS au versionnement")
        XCTAssertEqual(state?.isPinned, true)
    }

    func test_applyServerUnread_clampsANegativeCountToZero() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1", userState: ConversationUserState(unreadCount: 2)))

        await store.applyServerUnread(ConversationUnreadEvent(conversationId: "c1", unreadCount: -1))

        let count = await store.conversation(id: "c1")?.userState.unreadCount
        XCTAssertEqual(count, 0, "un compteur serveur aberrant ne descend jamais sous zéro")
    }

    func test_applyServerUnread_unknownConversation_isANoOp() async {
        let store = makeStore()

        await store.applyServerUnread(ConversationUnreadEvent(conversationId: "inconnue", unreadCount: 9))

        let conv = await store.conversation(id: "inconnue")
        XCTAssertNil(conv, "un événement sur une conversation non hydratée ne fabrique pas de ligne")
    }

    // MARK: - hydrateMetadata : la garde de version ne couvre QUE les préférences

    /// `hydrateMetadata` préservait le `userState` LOCAL EN BLOC dès qu'une
    /// préférence avait bumpé `version`. Le compteur et la frontière de lecture
    /// n'ont pourtant aucune raison d'être gardés par ce numéro : ils ne le
    /// bumpent jamais. Un instantané serveur plus frais restait donc invisible.
    func test_hydrateMetadata_localVersionAhead_keepsPreferencesButTakesTheServerUnread() async {
        let store = makeStore()
        await store.hydrate(makeConv(
            id: "c1",
            userState: ConversationUserState(unreadCount: 0, isPinned: true, version: 9)
        ))

        var incoming = makeConv(
            id: "c1",
            userState: ConversationUserState(unreadCount: 5, isPinned: false, version: 3)
        )
        incoming.lastMessageAt = Date(timeIntervalSince1970: 1_700_009_000)
        await store.hydrateMetadata([incoming])

        let state = await store.conversation(id: "c1")?.userState
        XCTAssertEqual(state?.isPinned, true, "la préférence locale en vol garde la main")
        XCTAssertEqual(state?.version, 9, "…avec sa version")
        XCTAssertEqual(state?.unreadCount, 5, "…mais le compteur serveur passe : il n'est pas versionné")
    }

    /// Symétrique : la frontière de lecture LOCALE, elle, n'est pas gardée par
    /// la version non plus — c'est `reconcileUnread` qui tranche, et elle donne
    /// le même verdict quelle que soit la version.
    func test_hydrateMetadata_localReadFrontierAhead_stillWins() async {
        let store = makeStore()
        let frontier = Date(timeIntervalSince1970: 1_700_005_000)
        await store.hydrate(makeConv(
            id: "c1",
            userState: ConversationUserState(unreadCount: 0, lastReadAt: frontier, version: 9)
        ))

        let incoming = makeConv(
            id: "c1",
            userState: ConversationUserState(unreadCount: 5, version: 3)
        )
        await store.hydrateMetadata([incoming])

        let state = await store.conversation(id: "c1")?.userState
        XCTAssertEqual(state?.unreadCount, 0,
                       "frontière locale postérieure au dernier message ⇒ 0 (reconcileUnread, règle 2)")
        XCTAssertEqual(state?.lastReadAt, frontier, "la frontière locale ne recule jamais")
    }

    // MARK: - Le pont socket

    func test_bridge_routesUnreadUpdatedToTheStore() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1", userState: ConversationUserState(unreadCount: 0)))
        let env = UnreadBridgeEnv(store: store)

        env.unreadUpdated.send(UnreadUpdateEvent(conversationId: "c1", unreadCount: 6))

        let applied = await waitUntil { (await store.conversation(id: "c1"))?.userState.unreadCount == 6 }
        XCTAssertTrue(applied, "le store RAM doit être abonné à conversation:unread-updated")
    }

    /// Même gate « conversation ouverte » que `handleUnreadUpdated` côté cache
    /// disque : l'utilisateur la REGARDE, tout compteur non nul est un mensonge
    /// visuel. Les deux porteurs lisent LA MÊME valeur, donc ils ne peuvent pas
    /// diverger.
    func test_bridge_openConversation_isForcedToZero() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1", userState: ConversationUserState(unreadCount: 0)))
        let env = UnreadBridgeEnv(store: store, openConversationId: "c1")

        env.unreadUpdated.send(UnreadUpdateEvent(conversationId: "c1", unreadCount: 6))

        let lit = await waitUntil(timeout: 0.5) {
            (await store.conversation(id: "c1"))?.userState.unreadCount != 0
        }
        XCTAssertFalse(lit, "la conversation OUVERTE reste à 0, quel que soit le compte servi")
    }

    // MARK: Env

    @MainActor
    private struct UnreadBridgeEnv {
        let bridge: ConversationStoreSocketBridge
        let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
        let deleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()
        let prefsUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
        let reordered = PassthroughSubject<UserPreferencesReorderedSocketEvent, Never>()
        let readStatus = PassthroughSubject<ReadStatusUpdateEvent, Never>()
        let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
        let categoryCreated = PassthroughSubject<CategorySocketEvent, Never>()
        let categoryUpdated = PassthroughSubject<CategorySocketEvent, Never>()
        let categoryDeleted = PassthroughSubject<CategoryDeletedSocketEvent, Never>()
        let categoriesReordered = PassthroughSubject<CategoriesReorderedSocketEvent, Never>()

        init(store: ConversationStore, openConversationId: String? = nil) {
            bridge = ConversationStoreSocketBridge(
                store: store,
                categoryStore: UserCategoryStore(service: MockCategoryWriter()),
                currentUserId: { "me" },
                openConversationId: { openConversationId }
            )
            bridge.activate(
                conversationUpdated: conversationUpdated.eraseToAnyPublisher(),
                conversationDeleted: deleted.eraseToAnyPublisher(),
                userPreferencesUpdated: prefsUpdated.eraseToAnyPublisher(),
                userPreferencesReordered: reordered.eraseToAnyPublisher(),
                readStatusUpdated: readStatus.eraseToAnyPublisher(),
                unreadUpdated: unreadUpdated.eraseToAnyPublisher(),
                categoryCreated: categoryCreated.eraseToAnyPublisher(),
                categoryUpdated: categoryUpdated.eraseToAnyPublisher(),
                categoryDeleted: categoryDeleted.eraseToAnyPublisher(),
                categoriesReordered: categoriesReordered.eraseToAnyPublisher()
            )
        }
    }
}
