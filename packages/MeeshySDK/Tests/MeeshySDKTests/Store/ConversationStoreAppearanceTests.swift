import XCTest
@testable import MeeshySDK

/// #10631 — le fond et l'accent PERSONNELS d'une conversation voyagent avec les
/// préférences : liste, écho socket d'un autre appareil, remise à zéro.
final class ConversationStoreAppearanceTests: XCTestCase {

    private func makeStore() -> ConversationStore {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: path)
        )
    }

    private func makeConv(id: String = "conv-1", version: Int = 5, appearance: ConversationAppearance? = nil) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(appearance: appearance, version: version)
        )
    }

    private func event(version: Int, reset: Bool = false, appearance: ConversationAppearance?) -> UserPreferencesUpdatedRemote {
        UserPreferencesUpdatedRemote(
            userId: "u1", conversationId: "conv-1", version: version, reset: reset,
            preferences: reset ? nil : RemotePreferencesPayload(
                isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false, tags: [],
                categoryId: nil, orderInCategory: nil, customName: nil, reaction: nil,
                deletedForUserAt: nil, clearHistoryBefore: nil, appearance: appearance
            )
        )
    }

    func test_applyRemote_withAppearance_storesItOnTheUserState() async {
        let store = makeStore()
        await store.hydrate(makeConv())
        let chosen = ConversationAppearance(background: .solid(color: "sable"), accent: "lagon", animate: true)

        await store.applyRemote(event(version: 6, appearance: chosen))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.appearance, chosen)
        XCTAssertEqual(ConversationAppearanceChange.latest(for: "conv-1"), chosen)
    }

    func test_applyRemote_staleVersion_keepsTheCurrentAppearance() async {
        let store = makeStore()
        var conv = makeConv(version: 9)
        conv.userState.appearance = ConversationAppearance(background: .solid(color: "azur"))
        await store.hydrate(conv)

        await store.applyRemote(event(version: 3, appearance: ConversationAppearance(background: .solid(color: "sable"))))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.appearance?.background, .solid(color: "azur"))
    }

    func test_applyRemote_reset_returnsToSignature() async {
        let store = makeStore()
        var conv = makeConv()
        conv.userState.appearance = ConversationAppearance(background: .solid(color: "azur"), accent: "corail")
        await store.hydrate(conv)

        await store.applyRemote(event(version: 6, reset: true, appearance: nil))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertNil(after.userState.appearance)
    }

    func test_apiPreferencesDecoding_readsAppearance_andIgnoresAFutureKind() throws {
        let json = #"{"isPinned":false,"appearance":{"v":1,"background":{"kind":"lottie-wall"},"accent":"prune","animate":true}}"#
        let prefs = try JSONDecoder().decode(APIConversationPreferences.self, from: Data(json.utf8))
        XCTAssertEqual(prefs.appearance?.background, .signature)
        XCTAssertEqual(prefs.appearance?.accent, "prune")
    }

    func test_apiPreferencesDecoding_withoutAppearance_isNil() throws {
        let prefs = try JSONDecoder().decode(APIConversationPreferences.self, from: Data(#"{"isPinned":true}"#.utf8))
        XCTAssertNil(prefs.appearance)
    }

    func test_updateRequest_encodesAppearance_andOmitsItWhenUnset() throws {
        let with = try JSONEncoder().encode(UpdateConversationPreferencesRequest(appearance: .default))
        XCTAssertTrue(String(decoding: with, as: UTF8.self).contains(#""appearance":{"#))
        let without = try JSONEncoder().encode(UpdateConversationPreferencesRequest(isPinned: true))
        XCTAssertFalse(String(decoding: without, as: UTF8.self).contains("appearance"))
    }

    func test_preferencesGrafted_keepsTheLocalAppearance() {
        var local = ConversationUserState()
        local.appearance = ConversationAppearance(background: .solid(color: "olive"))
        let merged = local.preferencesGrafted(onto: ConversationUserState())
        XCTAssertEqual(merged.appearance, local.appearance)
    }

    // MARK: Liste rafraîchie et cache disque

    func test_hydrateMetadata_withAnotherAppearance_relaysItToTheOpenThread() async {
        let store = makeStore()
        let id = "conv-refresh-\(UUID().uuidString)"
        await store.hydrate(makeConv(id: id, appearance: ConversationAppearance(background: .solid(color: "azur"))))
        ConversationAppearanceChange.post(conversationId: id, appearance: ConversationAppearance(background: .solid(color: "azur")))
        let fromAnotherDevice = ConversationAppearance(background: .solid(color: "sable"), accent: "lagon")

        await store.hydrateMetadata([makeConv(id: id, version: 6, appearance: fromAnotherDevice)])

        XCTAssertEqual(ConversationAppearanceChange.latest(for: id), fromAnotherDevice)
    }

    func test_hydrateList_withoutAppearanceAnyMore_relaysSignature() async {
        let store = makeStore()
        let id = "conv-cleared-\(UUID().uuidString)"
        await store.hydrate(makeConv(id: id, appearance: ConversationAppearance(background: .solid(color: "azur"))))

        await store.hydrateList([makeConv(id: id, version: 6, appearance: nil)])

        XCTAssertEqual(ConversationAppearanceChange.latest(for: id), .default)
    }

    func test_hydrateList_firstSeed_relaysNothing() async {
        let store = makeStore()
        let id = "conv-seed-\(UUID().uuidString)"

        await store.hydrateList([makeConv(id: id, appearance: ConversationAppearance(background: .solid(color: "sable")))])

        XCTAssertNil(ConversationAppearanceChange.latest(for: id))
    }

    func test_reset_forgetsTheRelayedAppearances() async {
        let store = makeStore()
        let id = "conv-logout-\(UUID().uuidString)"
        ConversationAppearanceChange.post(conversationId: id, appearance: ConversationAppearance(background: .solid(color: "sable")))

        await store.reset()

        XCTAssertNil(ConversationAppearanceChange.latest(for: id))
    }

    func test_cachedConversation_keepsItsAppearanceAcrossTheDiskRow() throws {
        let chosen = ConversationAppearance(background: .photo(attachmentId: "a1", veil: 0.4, blur: 6), accent: "lagon")
        let row = try JSONEncoder().encode(makeConv(appearance: chosen))

        let restored = try JSONDecoder().decode(MeeshyConversation.self, from: row)

        XCTAssertEqual(restored.userState.appearance, chosen)
    }

    func test_cachedConversation_writtenBeforeTheAppearance_readsNone() throws {
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(makeConv())) as? [String: Any])
        legacy.removeValue(forKey: "appearance")
        let row = try JSONSerialization.data(withJSONObject: legacy)

        let restored = try JSONDecoder().decode(MeeshyConversation.self, from: row)

        XCTAssertNil(restored.userState.appearance)
    }

    // MARK: Le choix LOCAL atteint la ligne de liste, sans réseau

    func test_adoptLocalAppearance_repaintsTheListRowWithoutBumpingTheVersion() async {
        let store = makeStore()
        let id = "conv-local-\(UUID().uuidString)"
        await store.hydrate(makeConv(id: id, version: 5))

        await store.adoptLocalAppearance(ConversationAppearance(accent: "corail"), for: id)

        let after = await store.conversation(id: id)!
        XCTAssertEqual(after.displayPalette(scheme: .light).primary, "E0604E")
        XCTAssertEqual(after.userState.version, 5)
    }

    func test_adoptLocalAppearance_unknownConversation_isIgnored() async {
        let store = makeStore()

        await store.adoptLocalAppearance(ConversationAppearance(accent: "corail"), for: "conv-absent")

        let absent = await store.conversation(id: "conv-absent")
        XCTAssertNil(absent)
    }

    func test_adoptingAppearance_signatureAndNoChoiceAreTheSame_soNothingRepaints() {
        let conv = makeConv(appearance: nil)
        XCTAssertNil(conv.adoptingAppearance(.default))
        XCTAssertEqual(conv.adoptingAppearance(ConversationAppearance(accent: "lagon"))?.userState.appearance?.accent, "lagon")
    }
}
