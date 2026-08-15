import XCTest
@testable import Meeshy

/// F-089 (WS-10) — `NullAgentAssistProvider` : le SEUL provider de cette
/// branche, systématiquement vide. Critère §WS-10 : « provider nul ⇒
/// `FocalBridgeRow` n'est jamais instanciée (compteur d'instanciation à 0
/// dans le VM de test) ».
final class NullAssistProviderTests: XCTestCase {

    private let provider = NullAgentAssistProvider()

    func test_bridge_isAlwaysNil() async {
        let bridge = await provider.bridge(for: "c1")
        XCTAssertNil(bridge)
    }

    func test_suggestions_isAlwaysEmpty() async {
        let suggestions = await provider.suggestions(for: "c1", anchoredTo: "m1")
        XCTAssertEqual(suggestions, [])
    }

    func test_shortcuts_isAlwaysEmpty() async {
        let shortcuts = await provider.shortcuts(for: "c1", anchoredTo: "m1")
        XCTAssertEqual(shortcuts, [])
    }

    func test_episodeTitles_isAlwaysEmpty() async {
        let episode = ConversationEpisode(
            id: "e1", start: Date(), end: Date(), messageIds: ["m1"], participantIds: ["u1"],
            deterministicTitle: "Titre"
        )
        let titles = await provider.episodeTitles(for: "c1", episodes: [episode])
        XCTAssertEqual(titles, [:])
    }

    // MARK: - Zéro instanciation de FocalBridgeRow avec le provider nul

    /// Harnais minimal : ne construit `FocalBridgeRow` QUE si le provider
    /// rend un `AgentBridgeLine` non-nil — exactement la règle du contrat
    /// (« rendue uniquement si `provider.bridge(for:)` renvoie non-nil »).
    /// Avec `NullAgentAssistProvider`, `bridge(for:)` est TOUJOURS nil : le
    /// compteur reste à 0, quel que soit le nombre d'appels.
    @MainActor
    private final class MountCounter {
        private(set) var instantiationCount = 0

        func mount(provider: NullAgentAssistProvider, conversationId: String) async {
            guard let line = await provider.bridge(for: conversationId) else { return }
            _ = FocalBridgeRow(line: line, isDark: false)
            instantiationCount += 1
        }
    }

    @MainActor
    func test_nullProvider_neverInstantiatesFocalBridgeRow() async {
        let counter = MountCounter()
        await counter.mount(provider: provider, conversationId: "c1")
        await counter.mount(provider: provider, conversationId: "c2")
        await counter.mount(provider: provider, conversationId: "c3")

        XCTAssertEqual(counter.instantiationCount, 0)
    }
}
