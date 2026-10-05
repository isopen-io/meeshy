import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Doubles

private final class MockStickerPackService: StickerPackServiceProviding, @unchecked Sendable {
    var installedResult: Result<[StickerPack], Error> = .success([])
    var catalogueResult: Result<[StickerPack], Error> = .success([])
    var setInstalledError: Error?
    private(set) var installedCalls = 0
    private(set) var catalogueCalls = 0
    private(set) var setInstalledCalls: [(Bool, String)] = []

    func catalogue() async throws -> [StickerPack] {
        catalogueCalls += 1
        return try catalogueResult.get()
    }

    func installed() async throws -> [StickerPack] {
        installedCalls += 1
        return try installedResult.get()
    }

    func setInstalled(_ installed: Bool, slug: String) async throws -> StickerPack {
        setInstalledCalls.append((installed, slug))
        if let setInstalledError { throw setInstalledError }
        return StickerPack(slug: slug, name: slug, installed: installed, installCount: installed ? 1 : 0)
    }
}

@MainActor
private final class MemoryStickerPackCache: StickerPackCaching {
    var result: CacheResult<StickerPackSnapshot>
    private(set) var saved: [StickerPackSnapshot] = []

    init(_ result: CacheResult<StickerPackSnapshot> = .empty) {
        self.result = result
    }

    func load() async -> CacheResult<StickerPackSnapshot> { result }
    func save(_ snapshot: StickerPackSnapshot) async { saved.append(snapshot) }
}

/// **Les packs de stickers, servis depuis le cache et installés d'un geste**
/// (#9190).
///
/// - cache d'abord : un cache non vide s'affiche sans attendre le réseau ;
///   périmé, il s'affiche ET se revalide en silence ;
/// - installer ou retirer bascule À L'INSTANT, et revient en arrière si la
///   passerelle refuse — en le disant (`failed`).
@MainActor
final class StickerPackStoreTests: XCTestCase {

    private struct Refus: Error {}

    private func pack(_ slug: String, installed: Bool = true, count: Int = 0) -> StickerPack {
        StickerPack(slug: slug, name: slug, installed: installed, installCount: count)
    }

    // MARK: - Cache d'abord

    func test_aFreshCache_isServed_withoutTheNetwork() async {
        let service = MockStickerPackService()
        let cache = MemoryStickerPackCache(.fresh(StickerPackSnapshot(installed: [pack("mee")], catalogue: nil), age: 10))
        let store = StickerPackStore(service: service, cache: cache)

        await store.loadInstalled()

        XCTAssertEqual(store.installed?.map(\.slug), ["mee"])
        XCTAssertEqual(service.installedCalls, 0)
    }

    func test_aStaleCache_isServed_thenRevalidated() async {
        let service = MockStickerPackService()
        service.installedResult = .success([pack("mee"), pack("chats")])
        let cache = MemoryStickerPackCache(.stale(StickerPackSnapshot(installed: [pack("mee")], catalogue: nil), age: 99_999))
        let store = StickerPackStore(service: service, cache: cache)

        await store.loadInstalled()

        XCTAssertEqual(service.installedCalls, 1)
        XCTAssertEqual(store.installed?.map(\.slug), ["mee", "chats"])
        XCTAssertEqual(cache.saved.last?.installed.map(\.slug), ["mee", "chats"])
    }

    /// Un réseau en panne ne vide rien : ce que le cache a servi reste servi.
    func test_aNetworkFailure_keepsWhatTheCacheServed() async {
        let service = MockStickerPackService()
        service.installedResult = .failure(Refus())
        let cache = MemoryStickerPackCache(.stale(StickerPackSnapshot(installed: [pack("mee")], catalogue: nil), age: 99_999))
        let store = StickerPackStore(service: service, cache: cache)

        await store.loadInstalled()

        XCTAssertEqual(store.installed?.map(\.slug), ["mee"])
    }

    func test_anEmptyCache_fetches_andRemembers() async {
        let service = MockStickerPackService()
        service.installedResult = .success([pack("meo")])
        let cache = MemoryStickerPackCache(.empty)
        let store = StickerPackStore(service: service, cache: cache)

        XCTAssertNil(store.installed, "rien de connu : les intégrés restent installés par défaut")
        await store.loadInstalled()

        XCTAssertEqual(store.installed?.map(\.slug), ["meo"])
        XCTAssertEqual(cache.saved.count, 1)
    }

    // MARK: - Installer, retirer

    func test_installing_isOptimistic_thenConfirmed() async {
        let service = MockStickerPackService()
        service.catalogueResult = .success([pack("chats", installed: false, count: 4)])
        service.installedResult = .success([pack("chats")])
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache())
        await store.loadCatalogue()

        let chats = pack("chats", installed: false, count: 4)
        await store.toggle(chats)

        XCTAssertEqual(service.setInstalledCalls.first?.0, true)
        XCTAssertEqual(store.state.catalogue?.first?.installed, true)
        XCTAssertTrue(store.state.pending.isEmpty)
        XCTAssertFalse(store.state.failed)
        XCTAssertEqual(store.installed?.map(\.slug), ["chats"], "le pack installé rejoint la feuille")
    }

    func test_aRefusedInstall_rollsBack_andSaysSo() async {
        let service = MockStickerPackService()
        service.catalogueResult = .success([pack("chats", installed: false, count: 4)])
        service.setInstalledError = Refus()
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache())
        await store.loadCatalogue()

        await store.toggle(pack("chats", installed: false, count: 4))

        XCTAssertEqual(store.state.catalogue?.first?.installed, false)
        XCTAssertEqual(store.state.catalogue?.first?.installCount, 4)
        XCTAssertTrue(store.state.failed)
        XCTAssertTrue(store.state.pending.isEmpty)
    }

    func test_removing_leavesTheSheet() async {
        let service = MockStickerPackService()
        service.catalogueResult = .success([pack("mee", installed: true, count: 9)])
        service.installedResult = .success([pack("mee")])
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache())
        await store.loadInstalled()
        await store.loadCatalogue()

        await store.toggle(pack("mee", installed: true, count: 9))

        XCTAssertEqual(service.setInstalledCalls.first?.0, false)
        XCTAssertEqual(store.installed?.map(\.slug), [])
        XCTAssertEqual(store.state.catalogue?.first?.installed, false)
    }

    // MARK: - La règle pure

    func test_theOptimisticFlip_isImmediate_andCountsTheInstall() throws {
        let state = StickerPackShelfState(installed: [], catalogue: [pack("chats", installed: false, count: 4)])
        let next = try XCTUnwrap(state.togglingInstall(of: pack("chats", installed: false, count: 4)))
        XCTAssertEqual(next.catalogue?.first?.installed, true)
        XCTAssertEqual(next.catalogue?.first?.installCount, 5)
        XCTAssertEqual(next.installed?.map(\.slug), ["chats"])
        XCTAssertEqual(next.pending, ["chats"])
    }

    /// Un second geste pendant que le premier part ne fait rien : deux
    /// requêtes contraires se croiseraient, et l'état final serait celui de
    /// la plus lente.
    func test_aPendingPack_cannotBeToggledTwice() throws {
        let state = StickerPackShelfState(installed: [], catalogue: [pack("chats", installed: false)])
        let next = try XCTUnwrap(state.togglingInstall(of: pack("chats", installed: false)))
        XCTAssertNil(next.togglingInstall(of: pack("chats", installed: true)))
    }

    /// Le retour en arrière ne touche QUE le pack refusé : un autre geste en
    /// vol reste ce qu'il est.
    func test_aRollback_restoresOnlyTheRefusedPack() throws {
        let start = StickerPackShelfState(installed: [],
                                          catalogue: [pack("chats", installed: false), pack("oiseaux", installed: false)])
        let one = try XCTUnwrap(start.togglingInstall(of: pack("chats", installed: false)))
        let two = try XCTUnwrap(one.togglingInstall(of: pack("oiseaux", installed: false)))

        let rolled = two.rolledBack(slug: "chats", to: start)

        XCTAssertEqual(rolled.catalogue?.map(\.installed), [false, true])
        XCTAssertEqual(rolled.installed?.map(\.slug), ["oiseaux"])
        XCTAssertEqual(rolled.pending, ["oiseaux"])
        XCTAssertTrue(rolled.failed)
    }
}
