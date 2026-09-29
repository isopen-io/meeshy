import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Une protection armée reste armée** (#8305) — directive porteur du
/// 2026-09-27 : « si je sélectionne éphémère 1 min, sauf désactivation tous mes
/// prochains messages de la conversation seront en éphémère 1 min ». Les
/// protections (éphémère dont flamme-œil, flou, vue unique) seulement ; les
/// effets décoratifs restent à usage unique.
@MainActor
final class ConversationArmedProtectionTests: XCTestCase {

    private let conversationId = "00000000000000000000ab04"
    private let userId = "00000000000000000000ab96"

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeSUT(store: ConversationProtectionPreferenceProviding) async throws
        -> (sut: ConversationViewModel, messageService: MockMessageService) {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "colle", displayName: "Colle"))
        let messageService = MockMessageService()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            protectionPreferences: store
        )
        sut.start()
        return (sut, messageService)
    }

    private func isolatedStore() -> ConversationProtectionPreferenceStore {
        let suite = "armed-protection-\(UUID().uuidString)"
        return ConversationProtectionPreferenceStore(defaults: UserDefaults(suiteName: suite)!)
    }

    // MARK: - Le store

    func test_store_relitCeQuIlAÉcrit_parConversation() {
        let store = isolatedStore()
        let armed = ConversationProtectionPreference(ephemeralChoice: .duration(.oneMinute), isBlurred: true, isViewOnce: false)
        store.save(armed, for: "c1")

        XCTAssertEqual(store.preference(for: "c1"), armed)
        XCTAssertEqual(store.preference(for: "c2"), .none, "une conversation ne prête pas ses protections à une autre")
        XCTAssertEqual(store.preference(for: "c1").ephemeralChoice, .duration(.oneMinute))
    }

    func test_store_flammeOeil_survitÀLaRelecture() {
        let store = isolatedStore()
        store.save(ConversationProtectionPreference(ephemeralChoice: .afterRead, isBlurred: false, isViewOnce: false), for: "c1")
        XCTAssertEqual(store.preference(for: "c1").ephemeralChoice, .afterRead)
    }

    func test_store_désarmer_effaceLEntrée() {
        let store = isolatedStore()
        store.save(ConversationProtectionPreference(ephemeralChoice: nil, isBlurred: true, isViewOnce: false), for: "c1")
        store.save(.none, for: "c1")
        XCTAssertEqual(store.preference(for: "c1"), .none)
    }

    // MARK: - Le ViewModel

    func test_ouverture_restaureCeQueLaConversationAvaitArmé() async throws {
        let store = isolatedStore()
        store.save(ConversationProtectionPreference(ephemeralChoice: .duration(.oneMinute), isBlurred: true, isViewOnce: false),
                   for: conversationId)

        let (sut, _) = try await makeSUT(store: store)

        XCTAssertEqual(sut.ephemeralChoice, .duration(.oneMinute))
        XCTAssertTrue(sut.isBlurEnabled)
        XCTAssertFalse(sut.isViewOnceEnabled)
    }

    func test_armer_persiste_pourLaProchaineVisite() async throws {
        let store = isolatedStore()
        let (sut, _) = try await makeSUT(store: store)

        sut.isViewOnceEnabled = true
        sut.ephemeralChoice = .afterRead

        XCTAssertEqual(store.preference(for: conversationId),
                       ConversationProtectionPreference(ephemeralChoice: .afterRead, isBlurred: false, isViewOnce: true))
    }

    func test_deuxEnvoisSuccessifs_sontTousDeuxProtégés() async throws {
        let (sut, messageService) = try await makeSUT(store: isolatedStore())
        sut.isBlurEnabled = true
        sut.ephemeralChoice = .duration(.oneMinute)

        _ = await sut.sendMessage(content: "premier", protection: sut.captureArmedProtection(replyingTo: nil))
        let premier = messageService.lastSendRequest
        _ = await sut.sendMessage(content: "second", protection: sut.captureArmedProtection(replyingTo: nil))
        let second = messageService.lastSendRequest

        XCTAssertEqual(premier?.isBlurred, true)
        XCTAssertEqual(premier?.ephemeralDuration, 60)
        XCTAssertEqual(second?.isBlurred, true, "le second message garde le flou armé")
        XCTAssertEqual(second?.ephemeralDuration, 60, "et l'éphémère 1 min")
        XCTAssertTrue(sut.isBlurEnabled, "la rangée reste armée après l'envoi")
    }

    func test_effetDécoratif_resteÀUsageUnique() async throws {
        let (sut, _) = try await makeSUT(store: isolatedStore())
        sut.pendingEffects = MessageEffects(flags: .confetti)

        _ = await sut.sendMessage(content: "fête", protection: sut.captureArmedProtection(replyingTo: nil))

        XCTAssertFalse(sut.pendingEffects.hasAnyEffect)
    }
}
