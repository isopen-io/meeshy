import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Un éphémère DÉJÀ échu, rechargé au fil, le quitte** (#8352).
///
/// Relevé pendant #8303 : un éphémère échu (ou une flamme-œil consommée, mort
/// gravée au registre) que le fil recharge — base, réseau — n'avait plus
/// d'échéance future. L'ordonnanceur ne voyait que les échéances : aucun réveil,
/// donc aucun retrait. Les Bulles le masquaient (`isExpired` ⇒ `EmptyView`),
/// Focal, Script et la Rivière le rendaient. Le retrait vit désormais dans la
/// liste elle-même, que les quatre modes lisent.
@MainActor
final class ConversationViewModelElapsedEphemeralTests: XCTestCase {

    private let conversationId = "00000000000000000000ab52"
    private let userId = "00000000000000000000ab98"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeSUT() async throws -> ConversationViewModel {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "echu", displayName: "Échu"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
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
        return sut
    }

    private func uniqueId() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(24)).lowercased()
    }

    private func plain(_ id: String) -> Message {
        Message(id: id, conversationId: conversationId, senderId: "autre", content: "reste", isMe: false)
    }

    private func elapsed(_ id: String) -> Message {
        var message = Message(id: id, conversationId: conversationId, senderId: "autre", content: "échu", isMe: false)
        message.effects.flags = [.ephemeral]
        message.expiresAt = Date().addingTimeInterval(-60)
        return message
    }

    private func consumedAfterRead(_ id: String) -> Message {
        var message = Message(id: id, conversationId: conversationId, senderId: "autre", content: "", isMe: false)
        message.effects.flags = [.ephemeral, .ephemeralAfterRead]
        message.deletedAt = Date()
        EphemeralReceiptLedger.shared.noteDestruction(of: id)
        return message
    }

    private func waitUntil(timeout: TimeInterval, _ condition: () -> Bool) async {
        let limit = Date().addingTimeInterval(timeout)
        while !condition(), Date() < limit {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    func test_reload_alreadyElapsedEphemeral_leavesTheThread() async throws {
        let sut = try await makeSUT()
        let echu = uniqueId(), reste = uniqueId()

        sut.messages = [elapsed(echu), plain(reste)]
        await waitUntil(timeout: 3) { !sut.messages.contains { $0.id == echu } }

        XCTAssertFalse(sut.messages.contains { $0.id == echu }, "l'échu rechargé doit quitter la liste que les quatre modes lisent")
        XCTAssertTrue(sut.messages.contains { $0.id == reste })
    }

    func test_reload_consumedAfterRead_leavesAtOnce_withoutReplayingTheBurn() async throws {
        let sut = try await makeSUT()
        let lue = uniqueId()

        sut.messages = [consumedAfterRead(lue), plain(uniqueId())]
        await waitUntil(timeout: 0.3) { !sut.messages.contains { $0.id == lue } }

        XCTAssertFalse(sut.messages.contains { $0.id == lue },
                       "un mort déjà gravé part sans rejouer sa combustion (\(EphemeralBurn.fullDuration) s)")
    }

    func test_reload_serverServesTheDeadAgain_leavesAgain_withoutLoop() async throws {
        let sut = try await makeSUT()
        let lue = uniqueId(), reste = uniqueId()

        sut.messages = [consumedAfterRead(lue), plain(reste)]
        await waitUntil(timeout: 0.3) { !sut.messages.contains { $0.id == lue } }
        sut.messages.append(consumedAfterRead(lue))
        await waitUntil(timeout: 0.3) { !sut.messages.contains { $0.id == lue } }

        XCTAssertEqual(sut.messages.map(\.id), [reste])
    }

    /// Relevé de recette #8303 : une flamme-œil consommée reparaissait en
    /// « Message supprimé » en Bulles — l'effet local réemploie celui de
    /// `message:expired` (`deletedAt` posé). Un éphémère mort DISPARAÎT.
    func test_bubble_deletedEphemeral_rendersNothing_notATombstone() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy/Features/Main/Views/ThemedMessageBubble.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("case .deleted where content.protection.isExpired:"),
                      "un éphémère échu ou consommé ne laisse pas de pierre tombale")
    }

    // MARK: - Ce que le fil REND : les lignes de `MessageStore`

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func gone(flags: MessageEffectFlags = [.ephemeral], expiresAt: Date? = nil, duration: Int? = nil,
                      ledger: FakeEphemeralLedger = FakeEphemeralLedger()) -> Bool {
        ExpiredEphemeralRow.isGone(id: "m1", flags: flags, expiresAt: expiresAt, ephemeralDuration: duration,
                                   ledger: ledger, now: now)
    }

    func test_isGone_consumedFlameEye_servedAgainWithoutDeletedAt_isGone() {
        let ledger = FakeEphemeralLedger(deaths: ["m1": now.addingTimeInterval(-30)])
        XCTAssertTrue(gone(flags: [.ephemeral, .ephemeralAfterRead], ledger: ledger))
    }

    func test_isGone_servedDeadlinePassedWhileAsleep_isGone() {
        XCTAssertTrue(gone(expiresAt: now.addingTimeInterval(-1)))
    }

    func test_isGone_durationElapsedSinceLocalReception_isGone() {
        let ledger = FakeEphemeralLedger(receptions: ["m1": now.addingTimeInterval(-120)])
        XCTAssertTrue(gone(duration: 60, ledger: ledger))
    }

    func test_isGone_runningEphemeral_stays() {
        XCTAssertFalse(gone(expiresAt: now.addingTimeInterval(60)))
        let ledger = FakeEphemeralLedger(receptions: ["m1": now.addingTimeInterval(-10)])
        XCTAssertFalse(gone(duration: 60, ledger: ledger))
    }

    func test_isGone_unreadFlameEye_stays() {
        XCTAssertFalse(gone(flags: [.ephemeral, .ephemeralAfterRead]))
    }

    func test_isGone_ordinaryMessage_stays() {
        XCTAssertFalse(gone(flags: []))
    }

    // MARK: - #8630 : une réponse part avec le message éphémère qu'elle cite

    /// La passerelle sert à une réponse ORDINAIRE l'échéance du message cité
    /// quand celui-ci est mort pour ce lecteur : aucune durée, aucun drapeau,
    /// seule l'échéance servie dit qu'elle est morte.
    func test_isGone_ordinaryReplyWithPassedInheritedDeadline_isGone() {
        XCTAssertTrue(gone(flags: [], expiresAt: now.addingTimeInterval(-60)))
    }

    /// Ma propre réponse flamme-œil (contagion #8557) : la seule échéance que
    /// son auteur puisse recevoir est celle de ce qu'elle cite.
    func test_isGone_myAfterReadReplyWithPassedInheritedDeadline_isGone() {
        XCTAssertTrue(gone(flags: [.ephemeral, .ephemeralAfterRead], expiresAt: now.addingTimeInterval(-60)))
    }

    func test_isGone_ordinaryReplyWithFutureInheritedDeadline_stays() {
        XCTAssertFalse(gone(flags: [], expiresAt: now.addingTimeInterval(60)))
    }

    // MARK: - #7552 : le cache ne ressuscite pas un éphémère en message ordinaire

    private func cached(_ id: String, flags: MessageEffectFlags = [.ephemeral], expiresAt: Date? = nil,
                        duration: Int? = nil) -> Message {
        var message = Message(id: id, conversationId: conversationId, senderId: "autre", content: "secret", isMe: false)
        message.effects.flags = flags
        message.effects.ephemeralDuration = duration
        message.expiresAt = expiresAt
        return message
    }

    func test_cacheRowsToSurface_elapsedEphemeralAbsentFromThread_isNotResurrected() {
        let rows = CachedThreadSurfacing.rows(
            [cached("m1", expiresAt: now.addingTimeInterval(-5))],
            present: [], ledger: FakeEphemeralLedger(), now: now)
        XCTAssertTrue(rows.isEmpty, "un éphémère échu que GRDB a effacé ne revient pas depuis le cache")
    }

    func test_cacheRowsToSurface_deadInLedger_isNotResurrected() {
        let ledger = FakeEphemeralLedger(deaths: ["m1": now.addingTimeInterval(-30)])
        let rows = CachedThreadSurfacing.rows(
            [cached("m1", duration: 60)], present: [], ledger: ledger, now: now)
        XCTAssertTrue(rows.isEmpty)
    }

    func test_cacheRowsToSurface_liveEphemeral_keepsItsProtection() throws {
        let deadline = now.addingTimeInterval(45)
        let rows = CachedThreadSurfacing.rows(
            [cached("m1", flags: [.ephemeral, .blurred], expiresAt: deadline, duration: 60)],
            present: [], ledger: FakeEphemeralLedger(), now: now)
        let row = try XCTUnwrap(rows.first)
        XCTAssertEqual(row.effectFlags, MessageEffectFlags([.ephemeral, .blurred]).rawValue)
        XCTAssertEqual(row.ephemeralDuration, 60)
        XCTAssertEqual(row.expiresAt, deadline)
    }

    func test_cacheRowsToSurface_alreadyInThread_isSkipped() {
        let rows = CachedThreadSurfacing.rows(
            [cached("m1", flags: [])], present: ["m1"],
            ledger: FakeEphemeralLedger(), now: now)
        XCTAssertTrue(rows.isEmpty)
    }

    func test_cacheRowsToSurface_ordinaryMessage_surfaces() {
        let rows = CachedThreadSurfacing.rows(
            [cached("m1", flags: [])], present: [],
            ledger: FakeEphemeralLedger(), now: now)
        XCTAssertEqual(rows.map(\.id), ["m1"])
        XCTAssertEqual(rows.first?.effectFlags, 0)
    }

    func test_wiring_theCacheSurfacingGoesThroughTheEphemeralFilter() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy/Features/Main/ViewModels/ConversationViewModel+Lifecycle.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("CachedThreadSurfacing.rows("),
                      "le rattrapage depuis le cache ne recopie plus les messages champ par champ")
    }

    func test_wiring_theStorePublishesNoDeadEphemeral() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy/Features/Main/Stores/MessageStore.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains(".filter { !ExpiredEphemeralRow.isGone($0) }"),
                      "le fil rend `MessageStore.messages` : c'est là qu'un mort doit partir")
    }
}

final class FakeEphemeralLedger: EphemeralReceiptRecording, @unchecked Sendable {
    private var receptions: [String: Date]
    private var deaths: [String: Date]

    init(receptions: [String: Date] = [:], deaths: [String: Date] = [:]) {
        self.receptions = receptions
        self.deaths = deaths
    }

    func firstReception(of messageId: String) -> Date? { receptions[messageId] }

    func noteReception(of messageId: String, at date: Date) -> Date {
        if let known = receptions[messageId] { return known }
        receptions[messageId] = date
        return date
    }

    func destruction(of messageId: String) -> Date? { deaths[messageId] }

    func noteDestruction(of messageId: String, at date: Date) {
        if deaths[messageId] == nil { deaths[messageId] = date }
    }
}
