import XCTest
@testable import MeeshySDK

/// LES PRÉFÉRENCES SERVIES (#18916) — ce que le store fait d'une ligne relue par
/// `/user-preferences/conversations` : l'accusé d'un geste (M2) et le rattrapage
/// d'une préférence posée ailleurs pendant une coupure (IOS-01).
///
/// Le seul témoin opposé est l'état que le store PUBLIE ensuite.
final class ConversationStoreServedPreferencesTests: XCTestCase {

    private func makeServedStore(prefs: MockPreferenceWriter = MockPreferenceWriter()) -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("served-prefs-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    private func makeServedConv(id: String = "conv-1", state: ConversationUserState) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .group,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: state
        )
    }

    // MARK: - M2 — l'accusé d'un geste adopte la ligne relue

    /// Le web a archivé « conv-1 » pendant la coupure (serveur v4) ; l'iPhone,
    /// resté en v3, l'épingle. Le PUT porte le serveur en v5, et la ligne que
    /// l'adaptateur relit dit `isArchived: true`. N'en retenir que la version
    /// laissait l'iPhone en v5 SANS l'archivage : ni la diffusion de ce PUT
    /// (`5 <= 5`) ni un rattrapage par version ne pouvaient plus le ramener.
    func test_apply_ack_adoptsServedRow_whenServerVersionJumped() async throws {
        let prefs = MockPreferenceWriter()
        prefs.stubbedResponse = APIConversationPreferences(isPinned: true, isArchived: true, version: 5)
        let store = makeServedStore(prefs: prefs)
        await store.hydrate(makeServedConv(state: ConversationUserState(version: 3)))

        try await store.apply(.setPinned(true), for: "conv-1")

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isArchived, true, "le changement fait ailleurs voyage avec la version de l'accusé")
        XCTAssertEqual(state?.isPinned, true)
        XCTAssertEqual(state?.version, 5)
    }

    /// Un geste encore en file (échec transitoire) garde son état optimiste quand
    /// l'accusé d'un AUTRE geste arrive avec une ligne qui ne le porte pas
    /// encore ; c'est son propre accusé, au vidage de la file, qui adopte la
    /// ligne servie — changement fait ailleurs compris.
    func test_apply_ack_withAnotherWritePending_keepsItOnScreen_untilItsOwnAck() async throws {
        let prefs = MockPreferenceWriter()
        let store = makeServedStore(prefs: prefs)
        await store.hydrate(makeServedConv(state: ConversationUserState(version: 3)))
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")
        try await store.apply(.setPinned(true), for: "conv-1")

        prefs.errorToThrow = nil
        prefs.stubbedResponse = APIConversationPreferences(isPinned: false, isMuted: true, isArchived: true, version: 9)
        try await store.apply(.setMuted(true), for: "conv-1")

        let whilePending = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(whilePending?.isPinned, true, "l'épinglage encore en file ne recule pas à l'écran")
        XCTAssertEqual(whilePending?.isMuted, true)

        prefs.stubbedResponse = APIConversationPreferences(isPinned: true, isMuted: true, isArchived: true, version: 10)
        await store.flushOutbox()

        let landed = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(landed?.isArchived, true, "son propre accusé adopte la ligne servie")
        XCTAssertEqual(landed?.isPinned, true)
        XCTAssertEqual(landed?.version, 10)
    }

    // MARK: - IOS-01 — le rattrapage des préférences servies

    func test_applyServedPreferences_newerVersion_writesTheServedFieldsOnly() async {
        let store = makeServedStore()
        let clearedAt = Date(timeIntervalSince1970: 1_700_000_500)
        let deletedAt = Date(timeIntervalSince1970: 1_700_000_600)
        await store.hydrate(makeServedConv(state: ConversationUserState(
            unreadCount: 4,
            mentionsOnly: false,
            deletedForUserAt: deletedAt,
            clearHistoryBefore: clearedAt,
            customName: "Ancien nom",
            sectionId: "cat-ancienne",
            isLocked: true,
            hasDraft: true,
            version: 2
        )))
        let served = APIConversationPreferences(
            isPinned: true, isMuted: false, isArchived: true, tags: ["famille"],
            categoryId: "cat-neuve", customName: nil, mentionsOnly: true, version: 5,
            conversationId: "conv-1", orderInCategory: 3
        )

        await store.applyServedPreferences([served])

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isPinned, true)
        XCTAssertEqual(state?.isArchived, true)
        XCTAssertEqual(state?.tags, ["famille"])
        XCTAssertEqual(state?.sectionId, "cat-neuve")
        XCTAssertNil(state?.customName, "un nom servi `null` est un nom retiré ailleurs")
        XCTAssertEqual(state?.mentionsOnly, true, "la route riche ne le sert pas ; celle-ci, si")
        XCTAssertEqual(state?.orderInCategory, 3)
        XCTAssertEqual(state?.version, 5)
        XCTAssertEqual(state?.clearHistoryBefore, clearedAt, "la route ne le sert pas : l'historique effacé reste effacé")
        XCTAssertEqual(state?.deletedForUserAt, deletedAt)
        XCTAssertEqual(state?.isLocked, true, "propre à l'appareil")
        XCTAssertEqual(state?.hasDraft, true)
        XCTAssertEqual(state?.unreadCount, 4, "la lecture ne vient pas de cette route")
    }

    func test_applyServedPreferences_notNewerVersion_keepsTheLocalState() async {
        let store = makeServedStore()
        await store.hydrate(makeServedConv(state: ConversationUserState(isPinned: true, version: 5)))

        await store.applyServedPreferences([
            APIConversationPreferences(isPinned: false, version: 5, conversationId: "conv-1")
        ])

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isPinned, true, "une ligne qui n'est pas plus récente ne défait aucun geste en vol")
    }
}
