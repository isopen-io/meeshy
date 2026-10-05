import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Un éphémère qui échoit À L'ÉCRAN brûle et quitte le fil que l'on REND** (#8382).
///
/// Le fil (Bulles, Focal, Script) rend les lignes de `MessageStore` (GRDB), pas
/// `ConversationViewModel.messages`. L'ordonnanceur posait `isBurning` puis
/// retirait la ligne du seul modèle de vue : aucune cellule ne voyait la
/// combustion, et la ligne restait à l'écran jusqu'à la prochaine écriture en
/// base. Ces témoins n'écrivent RIEN en base après l'ouverture : seule
/// l'horloge bouge.
@MainActor
final class ConversationViewModelLiveEphemeralExpiryTests: XCTestCase {

    private let conversationId = "00000000000000000000ab82"
    private let userId = "00000000000000000000ab83"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeSUT(records: [MessageRecord]) async throws -> ConversationViewModel {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "vivant", displayName: "Vivant"))
        let pool = try MessageStoreObservationHelper.makeInMemoryDatabase()
        try await pool.write { db in
            for record in records { try record.insert(db) }
        }
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue()
        )
        sut.start()
        await sut.messageStore.refreshFromDB()
        return sut
    }

    private func uniqueId() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(24)).lowercased()
    }

    private func record(_ id: String, expiresIn seconds: TimeInterval?, createdAt: Date) -> MessageRecord {
        var record = MessageStoreObservationHelper.makeRecord(
            localId: id, conversationId: conversationId, content: seconds == nil ? "reste" : "éphémère",
            createdAt: createdAt, expiresAt: seconds.map { Date().addingTimeInterval($0) }
        )
        record.serverId = id
        record.effectFlags = seconds == nil ? 0 : MessageEffectFlags.ephemeral.rawValue
        return record
    }

    private func waitUntil(timeout: TimeInterval, _ condition: () -> Bool) async {
        let limit = Date().addingTimeInterval(timeout)
        while !condition(), Date() < limit {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func storeIds(_ sut: ConversationViewModel) -> [String] {
        sut.messageStore.messages.map { $0.serverId ?? $0.localId }
    }

    func test_liveEphemeral_expiringOnScreen_leavesTheStoreTheThreadRenders() async throws {
        let ephemere = uniqueId(), reste = uniqueId()
        let base = Date().addingTimeInterval(-10)
        let sut = try await makeSUT(records: [
            record(reste, expiresIn: nil, createdAt: base),
            record(ephemere, expiresIn: 0.4, createdAt: base.addingTimeInterval(1)),
        ])
        XCTAssertEqual(storeIds(sut), [reste, ephemere], "précondition : l'éphémère vivant est rendu")

        await waitUntil(timeout: 4) { !storeIds(sut).contains(ephemere) }

        XCTAssertEqual(storeIds(sut), [reste],
                       "échu à l'écran, il quitte les lignes que Bulles, Focal et Script rendent — sans écriture en base")
    }

    func test_liveEphemeral_burning_isPublishedToTheCells_thenCleared() async throws {
        let ephemere = uniqueId()
        let sut = try await makeSUT(records: [record(ephemere, expiresIn: 0.4, createdAt: Date().addingTimeInterval(-5))])

        await waitUntil(timeout: 3) { sut.burningEphemeralIds[ephemere] == true }
        XCTAssertEqual(sut.burningEphemeralIds[ephemere], true,
                       "la combustion est publiée là où les cellules du fil la lisent")

        await waitUntil(timeout: 3) { sut.burningEphemeralIds[ephemere] == nil }
        XCTAssertNil(sut.burningEphemeralIds[ephemere], "la combustion finie, rien ne reste")
        XCTAssertFalse(storeIds(sut).contains(ephemere))
    }
}
