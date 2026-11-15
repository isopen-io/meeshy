import XCTest
@testable import MeeshySDK

/// #9929 — Global d'un mineur reste dans ses archives : ni une préférence
/// locale plus récente, ni un événement d'un autre appareil, ni un geste
/// « désarchiver » ne l'en sortent tant que la restriction est servie.
final class ConversationStoreImposedArchiveTests: XCTestCase {

    private func makeStore() -> (ConversationStore, MockPreferenceWriter) {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        let prefs = MockPreferenceWriter()
        let store = ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
        return (store, prefs)
    }

    private func makeGlobal(restriction: ConversationWriteRestriction?, archived: Bool, version: Int = 1) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "global", identifier: "meeshy", type: .global,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isArchived: archived, version: version)
        )
        conversation.viewerWriteRestriction = restriction
        return conversation
    }

    func test_apply_unarchiveOnImposedArchive_staysArchivedAndWritesNothing() async throws {
        let (store, prefs) = makeStore()
        await store.hydrate(makeGlobal(restriction: .minorGlobal, archived: true))

        try await store.apply(.setArchived(false), for: "global")

        let stored = await store.conversation(id: "global")
        XCTAssertEqual(stored?.userState.isArchived, true)
        XCTAssertTrue(prefs.calls.isEmpty)
    }

    func test_hydrateMetadata_newerLocalUnarchivedPreference_staysArchived() async {
        let (store, _) = makeStore()
        await store.hydrate(makeGlobal(restriction: nil, archived: false, version: 9))

        await store.hydrateMetadata([makeGlobal(restriction: .minorGlobal, archived: true, version: 2)])

        let stored = await store.conversation(id: "global")
        XCTAssertEqual(stored?.userState.isArchived, true)
    }

    func test_applyRemote_unarchivedPreferenceOnImposedArchive_staysArchived() async {
        let (store, _) = makeStore()
        await store.hydrate(makeGlobal(restriction: .minorGlobal, archived: true, version: 1))

        await store.applyRemote(UserPreferencesUpdatedRemote(
            userId: "me", conversationId: "global", version: 2, reset: false,
            preferences: RemotePreferencesPayload(
                isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false,
                tags: [], categoryId: nil, orderInCategory: nil, customName: nil,
                reaction: nil, deletedForUserAt: nil, clearHistoryBefore: nil
            )
        ))

        let stored = await store.conversation(id: "global")
        XCTAssertEqual(stored?.userState.isArchived, true)
    }

    func test_hydrateMetadata_restrictionLifted_followsTheServedPreference() async {
        let (store, _) = makeStore()
        await store.hydrate(makeGlobal(restriction: .minorGlobal, archived: true, version: 1))

        await store.hydrateMetadata([makeGlobal(restriction: nil, archived: false, version: 1)])

        let stored = await store.conversation(id: "global")
        XCTAssertEqual(stored?.userState.isArchived, false)
    }
}
