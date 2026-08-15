import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Greffe du sectionnement (contrat LWS-5, `groupConversations`) — drapeau
/// `lentille_list` OFF.
///
/// `groupConversations` reste `nonisolated private static`
/// (`ConversationListViewModel.swift`) : aucun test ne peut l'appeler
/// directement depuis un autre fichier. Comme le reste de la suite
/// `ConversationListViewModelTests`, ce test pilote le pipeline PUBLIC
/// (`conversations`/`userCategories`/`selectedFilter` → `groupedConversations`)
/// et observe le résultat après le debounce 16 ms.
///
/// **Snapshot figé AVANT la greffe** (critère LWS-5) : drapeau OFF, ce test
/// doit rester vert à l'IDENTIQUE après le remplacement du corps de
/// `groupConversations` par un appel à `LentilleSectionResolver` — c'est
/// exactement ce qu'il garde. 30 conversations, 2 catégories déclarées,
/// répartition pinned(3) + cat-work(4) + cat-family(3) + other(20), chaque
/// bucket trié `lastMessageAt` décroissant (ordre déjà légal aujourd'hui,
/// `conversationsAreInOrder`).
///
/// Aucun `UserDefaults.standard`/`ProcessInfo` réel n'est touché ici : le
/// drapeau lu par `groupConversations` (`LentilleFeatureFlag.isLentilleListEnabled`)
/// retombe sur son défaut OFF tant qu'aucune suite du bundle n'écrit la clé
/// `meeshy.flag.lentille_list` sur `.standard` — vérifié : seule
/// `LentilleFlagGateTests` référence cette clé, et exclusivement via des
/// suites `UserDefaults` isolées (jamais `.standard`).
@MainActor
final class LentilleGroupingGraftTests: XCTestCase {

    // MARK: - Fabrique SUT — même patron que `ConversationListViewModelTests.makeSUT`

    private func makeSUT() -> ConversationListViewModel {
        let draftStore = DraftStore(userDefaults: UserDefaults(suiteName: "LentilleGroupingGraftTests-\(UUID().uuidString)")!)
        draftStore.clearAll()
        let store = ConversationListViewModelTests.makeTestStore()
        let categoryStore = UserCategoryStore(service: ConvListTestCategoryWriter())
        return ConversationListViewModel(
            api: MockAPIClientForApp(),
            conversationService: MockConversationService(),
            preferenceService: MockPreferenceService(),
            messageSocket: MockMessageSocket(),
            messageService: MockMessageService(),
            authManager: MockAuthManager(),
            storyService: MockStoryService(),
            syncEngine: MockConversationSyncEngine(),
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: draftStore,
            store: store,
            categoryStore: categoryStore
        )
    }

    private func makeConversation(id: String, isPinned: Bool = false, sectionId: String? = nil, lastMessageAt: Date) -> Conversation {
        Conversation(id: id, identifier: id, title: id, lastMessageAt: lastMessageAt, isPinned: isPinned, sectionId: sectionId)
    }

    /// Même patron de polling que `ConversationListViewModelTests.waitForGrouping` :
    /// le regroupement part d'un `Task.detached`, un délai fixe est flaky sous
    /// CI chargé.
    private func waitForGrouping(
        timeout: TimeInterval = 5.0,
        until condition: @escaping @MainActor () -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Grouping pipeline did not settle within \(timeout)s")
    }

    // MARK: - Snapshot : 30 conversations, drapeau OFF

    func test_groupConversations_flagOff_30Conversations_matchesTodaysSections() async throws {
        let sut = makeSUT()

        let workSection = ConversationSection(id: "cat-work", name: "Work", icon: "briefcase.fill", color: "3498DB", order: 0)
        let familySection = ConversationSection(id: "cat-family", name: "Family", icon: "house.fill", color: "2ECC71", order: 1)
        sut.userCategories = [workSection, familySection]

        var conversations: [Conversation] = []

        // 3 épinglées — INSÉRÉES à rebours (pin-3 d'abord) pour que l'ordre
        // attendu (pin-1 le plus récent → pin-3) exige un VRAI tri, pas une
        // coïncidence d'ordre d'insertion.
        for i in stride(from: 3, through: 1, by: -1) {
            conversations.append(makeConversation(
                id: "pin-\(i)",
                isPinned: true,
                lastMessageAt: Date(timeIntervalSince1970: TimeInterval(300 - (i - 1) * 100))
            ))
        }

        // 4 en catégorie "cat-work" — insérées à rebours, t décroissant attendu work-1 → work-4
        for i in stride(from: 4, through: 1, by: -1) {
            conversations.append(makeConversation(
                id: "work-\(i)",
                sectionId: "cat-work",
                lastMessageAt: Date(timeIntervalSince1970: TimeInterval(400 - (i - 1) * 100))
            ))
        }

        // 3 en catégorie "cat-family" — insérées à rebours, t décroissant attendu family-1 → family-3
        for i in stride(from: 3, through: 1, by: -1) {
            conversations.append(makeConversation(
                id: "family-\(i)",
                sectionId: "cat-family",
                lastMessageAt: Date(timeIntervalSince1970: TimeInterval(300 - (i - 1) * 100))
            ))
        }

        // 20 non catégorisées ("other") — insérées à rebours, t décroissant attendu other-1 → other-20
        for i in stride(from: 20, through: 1, by: -1) {
            conversations.append(makeConversation(
                id: "other-\(i)",
                lastMessageAt: Date(timeIntervalSince1970: TimeInterval((21 - i) * 10))
            ))
        }

        XCTAssertEqual(conversations.count, 30, "fixture mal formée — 30 conversations attendues")

        sut.conversations = conversations
        sut.selectedFilter = .all

        try await waitForGrouping { sut.groupedConversations.count == 4 }

        let sections = sut.groupedConversations
        XCTAssertEqual(sections.map(\.section.id), ["pinned", "cat-work", "cat-family", "other"])

        XCTAssertEqual(sections[0].conversations.map(\.id), ["pin-1", "pin-2", "pin-3"])
        XCTAssertEqual(sections[1].conversations.map(\.id), ["work-1", "work-2", "work-3", "work-4"])
        XCTAssertEqual(sections[2].conversations.map(\.id), ["family-1", "family-2", "family-3"])
        XCTAssertEqual(sections[3].conversations.map(\.id), (1...20).map { "other-\($0)" })

        let total = sections.reduce(0) { $0 + $1.conversations.count }
        XCTAssertEqual(total, 30, "aucune conversation perdue ni dupliquée par la partition")
    }
}
