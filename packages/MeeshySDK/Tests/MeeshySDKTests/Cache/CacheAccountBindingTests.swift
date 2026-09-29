import XCTest
import GRDB
@testable import MeeshySDK

/// #8674 — changer de compte GARDE le cache de chaque compte.
///
/// Avant : le cache (`meeshy.sqlite`) était un fichier commun, vidé à chaque
/// sortie de session. Revenir sur un compte rechargeait sa liste entière depuis
/// le réseau, squelette compris. Désormais le cache d'un compte quitté mais
/// gardé est mis de côté avec son point de reprise, et rendu à son retour.
final class CacheAccountBindingTests: XCTestCase {

    private static let origin = "https://gate.staging.meeshy.me"

    private func key(_ userId: String) -> MessageStoreAccountKey {
        MessageStoreAccountKey(userId: userId, serverOrigin: Self.origin)!
    }

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-cache-accounts-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    private func makeSuite() -> String {
        let name = "meeshy-cache-accounts-\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: name) }
        return name
    }

    private func makeCache(archives: URL, suite: String) throws -> CacheCoordinator {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        return CacheCoordinator(
            messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db,
            accountArchiveDirectory: archives, ownerDefaultsSuite: suite
        )
    }

    private static let kept: @Sendable @concurrent (String) async -> Bool = { _ in true }
    private static let signedOut: @Sendable @concurrent (String) async -> Bool = { _ in false }

    private func conversation(_ id: String) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: "conv-\(id)", type: .direct, lastMessageAt: Date(), unreadCount: 0)
    }

    private func listIds(_ cache: CacheCoordinator) async -> [String] {
        (await cache.conversations.load(for: "list").snapshot() ?? []).map(\.id)
    }

    // MARK: - A → B → A

    func test_bind_returningToAKeptAccount_servesItsOwnCacheAndNeverTheOtherAccounts() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)
        try await cache.conversations.save([conversation("c-alice")], for: "list")
        await cache.conversations.saveCursor(nextCursor: "cursor-alice", hasMore: true, for: "list")

        let toBob = await cache.bindAccount(key("bob"), isPreserved: Self.kept)
        let bobSees = await listIds(cache)
        try await cache.conversations.save([conversation("c-bob")], for: "list")
        let backToAlice = await cache.bindAccount(key("alice"), isPreserved: Self.kept)

        XCTAssertEqual(toBob.archived, key("alice"), "le cache d'Alice, gardée, est mis de côté")
        XCTAssertTrue(bobSees.isEmpty, "Bob ne lit jamais la liste d'Alice : \(bobSees)")
        XCTAssertEqual(backToAlice.restored, key("alice"))
        XCTAssertEqual(backToAlice.archived, key("bob"))
        let aliceSees = await listIds(cache)
        XCTAssertEqual(aliceSees, ["c-alice"], "Alice retrouve SA liste, et rien de Bob")
        let cursor = await cache.conversations.loadCursor(for: "list")
        XCTAssertEqual(cursor?.nextCursor, "cursor-alice", "sa pagination revient avec elle")
    }

    func test_bind_sameAccountTwice_changesNothing() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)
        try await cache.conversations.save([conversation("c-alice")], for: "list")

        let again = await cache.bindAccount(key("alice"), isPreserved: Self.kept)

        XCTAssertFalse(again.ownerChanged)
        let ids = await listIds(cache)
        XCTAssertEqual(ids, ["c-alice"])
    }

    // MARK: - Déconnexion

    func test_bind_leavingASignedOutAccount_dropsItsCacheAndSparesTheOthers() async throws {
        let archives = try makeDirectory()
        let cache = try makeCache(archives: archives, suite: makeSuite())
        _ = await cache.bindAccount(key("bob"), isPreserved: Self.kept)
        try await cache.conversations.save([conversation("c-bob")], for: "list")
        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)
        try await cache.conversations.save([conversation("c-alice")], for: "list")

        let logout = await cache.bindAccount(nil, isPreserved: Self.signedOut)

        XCTAssertEqual(logout.dropped, key("alice"))
        XCTAssertNil(logout.archived)
        XCTAssertFalse(cache.hasArchive(for: key("alice")), "rien d'Alice ne reste de côté")
        XCTAssertTrue(cache.hasArchive(for: key("bob")), "la déconnexion d'Alice ne touche pas Bob")
        let nobodySees = await listIds(cache)
        XCTAssertTrue(nobodySees.isEmpty)

        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)
        let aliceAfterLogout = await listIds(cache)
        XCTAssertTrue(aliceAfterLogout.isEmpty, "Alice reconnectée repart d'un cache vide")
    }

    func test_bind_addingAnAccountFromTheLoginScreen_keepsTheSuspendedAccountsCache() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)
        try await cache.conversations.save([conversation("c-alice")], for: "list")

        let suspended = await cache.bindAccount(nil, isPreserved: Self.kept)
        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)

        XCTAssertEqual(suspended.archived, key("alice"))
        let ids = await listIds(cache)
        XCTAssertEqual(ids, ["c-alice"])
    }

    // MARK: - Orphelins et reprises

    func test_sweepArchives_removesTheCacheOfAccountsNoLongerOnTheDevice() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        for user in ["alice", "bob", "carol"] {
            _ = await cache.bindAccount(key(user), isPreserved: Self.kept)
            try await cache.conversations.save([conversation("c-\(user)")], for: "list")
        }
        _ = await cache.bindAccount(nil, isPreserved: Self.kept)

        await cache.sweepArchives(keeping: [key("alice"), key("carol")])

        XCTAssertTrue(cache.hasArchive(for: key("alice")))
        XCTAssertFalse(cache.hasArchive(for: key("bob")), "Bob, absent du sélecteur, est un orphelin")
        XCTAssertTrue(cache.hasArchive(for: key("carol")))
    }

    func test_bind_unrecordedCache_isAdoptedByTheFirstAccountWithoutLosingIt() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        try await cache.conversations.save([conversation("c-legacy")], for: "list")
        XCTAssertEqual(cache.liveOwner, .unrecorded)

        _ = await cache.bindAccount(key("alice"), isPreserved: Self.kept)

        XCTAssertEqual(cache.liveOwner, .account(key("alice")))
        let ids = await listIds(cache)
        XCTAssertEqual(ids, ["c-legacy"], "le cache d'avant la mise à jour n'est pas rechargé")
    }

    func test_bind_afterAnInterruptedSwitch_neverServesTheLeftovers() async throws {
        let suite = makeSuite()
        let cache = try makeCache(archives: try makeDirectory(), suite: suite)
        try await cache.conversations.save([conversation("c-leftover")], for: "list")
        UserDefaults(suiteName: suite)?.set("~", forKey: CacheCoordinator.liveOwnerDefaultsKey)

        _ = await cache.bindAccount(key("bob"), isPreserved: Self.kept)

        let ids = await listIds(cache)
        XCTAssertTrue(ids.isEmpty, "un cache à moitié basculé n'appartient à personne : \(ids)")
    }

    // MARK: - Le retour ne recharge que l'écart

    @MainActor
    func test_returningAccount_resynchronisesOnlyTheGapFromItsOwnCheckpoint() async throws {
        let cache = try makeCache(archives: try makeDirectory(), suite: makeSuite())
        let service = MockConversationService()
        let api = MockAPIClient()
        api.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))
        let engine = ConversationSyncEngine(
            cache: cache, conversationService: service, messageService: MockMessageService(),
            messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(),
            api: api, syncDelta: MockSyncDeltaMuet(), currentUserId: { "alice" }
        )
        let checkpointBefore = engine.currentSyncCheckpoint()
        addTeardownBlock { engine.restoreSyncCheckpoint(checkpointBefore) }
        let vault = SyncCheckpointVault(
            defaults: UserDefaults(suiteName: makeSuite())!,
            captureLive: { engine.currentSyncCheckpoint() },
            applyLive: { checkpoint in
                guard let checkpoint else { return engine.resetSyncCheckpoints() }
                engine.restoreSyncCheckpoint(checkpoint)
            }
        )
        let binder = CacheAccountBinder(cache: cache, vault: vault, isPreserved: Self.kept)
        let aliceWatermark = Date(timeIntervalSince1970: 1_790_000_000)

        await binder.bind(key("alice")).value
        try await cache.conversations.save([conversation("c-alice")], for: "list")
        engine.restoreSyncCheckpoint(SyncCheckpoint(lastSync: aliceWatermark, lastCleanup: nil, lastFullReconcile: Date()))

        await binder.bind(nil).value
        await binder.bind(key("bob")).value
        XCTAssertEqual(engine.lastSyncTimestamp, .distantPast, "Bob n'hérite jamais du point de reprise d'Alice")
        await binder.bind(nil).value
        await binder.bind(key("alice")).value

        let shown = await listIds(cache)
        XCTAssertEqual(shown, ["c-alice"], "le retour affiche le cache d'Alice avant tout réseau")
        XCTAssertEqual(engine.lastSyncTimestamp, aliceWatermark)

        _ = await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(service.listCallCount, 0, "aucune liste complète n'est redemandée au retour")
        let since = api.lastRequest?.queryItems?.first(where: { $0.name == "updatedSince" })?.value
        XCTAssertEqual(since, WireDate.string(from: aliceWatermark), "seul l'écart depuis le point de reprise d'Alice")
    }
}
