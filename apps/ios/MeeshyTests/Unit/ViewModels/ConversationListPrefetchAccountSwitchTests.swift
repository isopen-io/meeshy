import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #8651 — le préchargement des messages de la liste appartient au compte qui
/// l'a lancé.
///
/// Incident de production du 2026-09-29 : juste après un changement de compte,
/// une rafale de ~30 `GET /conversations/:id/messages` → 404 — les
/// conversations du compte QUITTÉ, demandées sous le jeton du compte suivant.
/// Le préchargement est une tâche détachée : elle survit à la vue et au modèle
/// qui l'ont lancée, et chaque requête lit le jeton COURANT, pas celui de son
/// lancement.
@MainActor
final class ConversationListPrefetchAccountSwitchTests: XCTestCase {

    private func makeSUT(
        authManager: MockAuthManager,
        messageService: MockMessageService
    ) -> ConversationListViewModel {
        let draftStore = DraftStore(userDefaults: UserDefaults(suiteName: "PrefetchSwitch-\(UUID().uuidString)")!)
        return ConversationListViewModel(
            conversationService: MockConversationService(),
            preferenceService: MockPreferenceService(),
            messageSocket: MockMessageSocket(),
            messageService: messageService,
            authManager: authManager,
            storyService: MockStoryService(),
            syncEngine: MockConversationSyncEngine(),
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: draftStore,
            store: ConversationListViewModelTests.makeTestStore(),
            categoryStore: UserCategoryStore(service: ConvListTestCategoryWriter())
        )
    }

    private func conversation(_ id: String) -> Conversation {
        Conversation(
            id: id,
            identifier: id,
            type: .direct,
            title: "Conv \(id)",
            isActive: true,
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            unreadCount: 0
        )
    }

    private func uniqueId() -> String {
        "switch-\(UUID().uuidString)"
    }

    private func waitForCalls(_ service: MockMessageService, atLeast count: Int) async {
        for _ in 0..<40 where service.listCallCount < count {
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    func test_prefetch_whenTheAccountChangesRightAfterTheLoad_requestsNothingForThePreviousAccount() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let messageService = MockMessageService()
        try await CacheCoordinator.shared.conversations.save([conversation(uniqueId())], for: "list")
        let sut = makeSUT(authManager: authManager, messageService: messageService)

        await sut.loadConversations()
        authManager.currentUser = MeeshyUser(id: "user-B", username: "b")
        try? await Task.sleep(for: .milliseconds(600))

        XCTAssertEqual(messageService.listCallCount, 0,
                       "aucune conversation du compte quitté ne se demande sous le compte suivant")
    }

    func test_prefetch_skipsAnEmptyConversationId_andStillPrefetchesTheOthers() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let messageService = MockMessageService()
        let real = uniqueId()
        try await CacheCoordinator.shared.conversations.save([conversation(""), conversation(real)], for: "list")
        let sut = makeSUT(authManager: authManager, messageService: messageService)

        await sut.loadConversations()
        await waitForCalls(messageService, atLeast: 1)
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(messageService.listCallCount, 1, "l'identifiant vide ne part pas")
        XCTAssertEqual(messageService.lastListConversationId, real)
    }
}
