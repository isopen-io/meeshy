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

    /// Deux gestes en file ; l'accusé du second ramène la version locale à la valeur servie (4, le premier n'ayant
    /// jamais atteint le serveur). La ligne servie à cette version égale effaçait alors l'épingle encore en file et
    /// les champs propres à l'appareil.
    func test_hydrateMetadata_twoWritesQueued_theAckOfOneLeavesTheOtherAndTheDeviceFieldsOnScreen() async throws {
        let prefs = MockPreferenceWriter()
        let store = makeStore(prefs: prefs)
        await store.hydrate(makeConv(state: ConversationUserState(isLocked: true, version: 3)))
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")
        try await store.apply(.setPinned(true), for: "conv-1")
        prefs.errorToThrow = nil
        prefs.stubbedResponse = APIConversationPreferences(isMuted: true, version: 4)
        try await store.apply(.setMuted(true), for: "conv-1")
        let acknowledged = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(acknowledged?.version, 4, "l'accusé du second geste ramène la version à la valeur servie")
        XCTAssertEqual(acknowledged?.pendingMutationCount, 1, "l'épingle est toujours en file")

        await store.hydrateMetadata([makeConv(state: ConversationUserState(isMuted: true, version: 4))])

        let state = await store.conversation(id: "conv-1")?.userState
        XCTAssertEqual(state?.isPinned, true, "le geste encore en file reste affiché")
        XCTAssertEqual(state?.isMuted, true)
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
