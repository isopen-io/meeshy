import XCTest
@testable import MeeshySDK

/// #19307 — le filigrane du rattrapage des préférences est persisté par compte : un redémarrage ne relit que ce qui a
/// changé depuis, au lieu des 20 × 100 lignes.
final class ConversationPreferencesWatermarkTests: XCTestCase {

    private let stamp = Date(timeIntervalSince1970: 1_700_000_500)

    private func row(updatedAt: Date) -> APIConversationPreferences {
        APIConversationPreferences(isPinned: true, version: 2, updatedAt: updatedAt)
    }

    private func catchUp(
        as userId: String?, store: ConversationPreferencesWatermarkStore,
        asking: Locked<[Date?]>, serving rows: [APIConversationPreferences]
    ) async {
        await ConversationStoreSocketBridge.catchUpServedPreferences(
            into: ConversationStore(
                preferenceService: MockPreferenceWriter(),
                conversationService: MockLifecycleWriter(),
                outbox: ConversationStateOutbox(
                    dbPath: FileManager.default.temporaryDirectory
                        .appendingPathComponent("wm-outbox-\(UUID().uuidString).db").path)
            ),
            fetchingWith: { since in asking.mutate { $0.append(since) }; return rows },
            watermark: Locked<Date?>(nil),
            owner: { userId },
            persistedIn: store
        )
    }

    func test_catchUp_persistsTheServedWatermark_andARestartAsksOnlyWhatChangedSince() async {
        let store = ConversationPreferencesWatermarkStore.inMemory()
        let asked = Locked<[Date?]>([])

        await catchUp(as: "alice", store: store, asking: asked, serving: [row(updatedAt: stamp)])
        await catchUp(as: "alice", store: store, asking: asked, serving: [])

        XCTAssertEqual(asked.read { $0 }, [nil, stamp], "le second démarrage reprend au filigrane persisté")
    }

    func test_catchUp_theWatermarkIsPerAccount() async {
        let store = ConversationPreferencesWatermarkStore.inMemory()
        let asked = Locked<[Date?]>([])

        await catchUp(as: "alice", store: store, asking: asked, serving: [row(updatedAt: stamp)])
        await catchUp(as: "bob", store: store, asking: asked, serving: [])

        XCTAssertEqual(asked.read { $0 }, [nil, nil], "un autre compte repart de zéro")
    }
}
