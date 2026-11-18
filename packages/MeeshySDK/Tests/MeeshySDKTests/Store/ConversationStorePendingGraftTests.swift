import XCTest
@testable import MeeshySDK

/// #19307 — avec un geste encore en file, la ligne servie à version égale se greffe SOUS lui au lieu de le remplacer.
final class ConversationStorePendingGraftTests: XCTestCase {

    private func makeStore(prefs: MockPreferenceWriter) -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("pending-graft-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    private func makeConv(state: ConversationUserState) -> MeeshyConversation {
        MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .group,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: state
        )
    }

    func test_hydrateMetadata_equalVersionWithAWritePending_keepsItAndTheDeviceFields() async throws {
        let prefs = MockPreferenceWriter()
        let store = makeStore(prefs: prefs)
        await store.hydrate(makeConv(state: ConversationUserState(isLocked: true, version: 3)))
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")
        try await store.apply(.setPinned(true), for: "conv-1")

        await store.hydrateMetadata([makeConv(state: ConversationUserState(version: 3))])

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isPinned, true, "le geste en file survit à une ligne servie de même version")
        XCTAssertEqual(state?.isLocked, true, "les champs propres à l'appareil ne sont pas remis à zéro")
        XCTAssertEqual(state?.pendingMutationCount, 1)
    }

    func test_hydrateMetadata_equalVersionWithNothingPending_servedRowWins() async {
        let store = makeStore(prefs: MockPreferenceWriter())
        await store.hydrate(makeConv(state: ConversationUserState(isPinned: true, version: 3)))

        await store.hydrateMetadata([makeConv(state: ConversationUserState(isPinned: false, version: 3))])

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isPinned, false)
    }
}
