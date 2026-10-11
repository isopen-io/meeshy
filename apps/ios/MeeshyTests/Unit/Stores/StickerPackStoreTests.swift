import XCTest
import MeeshySDK
import MeeshyUI
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
    private(set) var savedAccounts: [String] = []

    init(_ result: CacheResult<StickerPackSnapshot> = .empty) {
        self.result = result
    }

    func load(account: String) async -> CacheResult<StickerPackSnapshot> { result }
    func save(_ snapshot: StickerPackSnapshot, account: String) async {
        saved.append(snapshot)
        savedAccounts.append(account)
    }
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

    /// Frais ou non, le cache s'affiche, puis l'étagère se REVALIDE à chaque
    /// apparition (#10150) : un pack installé ailleurs — le web, un autre
    /// appareil — rejoint la feuille dès sa prochaine ouverture.
    func test_aFreshCache_isServed_thenRevalidatedAtEachAppearance() async {
        let service = MockStickerPackService()
        service.installedResult = .failure(Refus())
        let cache = MemoryStickerPackCache(.fresh(StickerPackSnapshot(installed: [pack("mee")], catalogue: nil), age: 10))
        let store = StickerPackStore(service: service, cache: cache, account: { "u1" })

        await store.loadInstalled()
        XCTAssertEqual(store.installed?.map(\.slug), ["mee"], "le cache reste servi quand le réseau échoue")

        service.installedResult = .success([pack("mee"), pack("exemple-meeshy")])
        await store.loadInstalled()

        XCTAssertEqual(service.installedCalls, 2)
        XCTAssertEqual(store.installed?.map(\.slug), ["mee", "exemple-meeshy"])
    }

    func test_aStaleCache_isServed_thenRevalidated() async {
        let service = MockStickerPackService()
        service.installedResult = .success([pack("mee"), pack("chats")])
        let cache = MemoryStickerPackCache(.stale(StickerPackSnapshot(installed: [pack("mee")], catalogue: nil), age: 99_999))
        let store = StickerPackStore(service: service, cache: cache, account: { "u1" })

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
        let store = StickerPackStore(service: service, cache: cache, account: { "u1" })

        await store.loadInstalled()

        XCTAssertEqual(store.installed?.map(\.slug), ["mee"])
    }

    func test_anEmptyCache_fetches_andRemembers() async {
        let service = MockStickerPackService()
        service.installedResult = .success([pack("meo")])
        let cache = MemoryStickerPackCache(.empty)
        let store = StickerPackStore(service: service, cache: cache, account: { "u1" })

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
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache(), account: { "u1" })
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
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache(), account: { "u1" })
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
        let store = StickerPackStore(service: service, cache: MemoryStickerPackCache(), account: { "u1" })
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

// MARK: - Deux comptes, deux étagères ; la Boutique des cadres (#10150)

private final class MockFramePackService: PackServiceProviding, @unchecked Sendable {
    var catalogueResult: Result<[FramePack], Error> = .success([])
    var installedResult: Result<[FramePack], Error> = .success([])
    var detailResult: Result<FramePack, Error> = .success(FramePack(slug: "x", name: "x"))
    private(set) var setInstalledCalls: [(Bool, String)] = []

    var domain: PackDomain { .gloryFrame }
    func catalogue() async throws -> [FramePack] { try catalogueResult.get() }
    func installed() async throws -> [FramePack] { try installedResult.get() }
    func detail(slug: String) async throws -> FramePack { try detailResult.get() }
    func setInstalled(_ installed: Bool, slug: String) async throws -> FramePack {
        setInstalledCalls.append((installed, slug))
        return FramePack(slug: slug, name: slug, installed: installed, installCount: installed ? 1 : 0)
    }
}

@MainActor
private final class MemoryFramePackCache: PackCaching {
    private(set) var byAccount: [String: PackSnapshot<FramePack>] = [:]

    func load(account: String) async -> CacheResult<PackSnapshot<FramePack>> {
        byAccount[account].map { .fresh($0, age: 1) } ?? .empty
    }

    func save(_ snapshot: PackSnapshot<FramePack>, account: String) async {
        byAccount[account] = snapshot
    }
}

private struct MemoryPackAssets: PackAssetReading {
    let files: [String: Data]

    func data(for file: PackAssetFile) async throws -> Data {
        guard let data = files[file.name] else { throw URLError(.fileDoesNotExist) }
        return data
    }
}

@MainActor
final class FramePackStoreTests: XCTestCase {

    private static let sha = String(repeating: "ab", count: 32)
    private static let contractSha = String(repeating: "cd", count: 32)
    private static let stringsSha = String(repeating: "ef", count: 32)

    private func savane(installed: Bool) -> FramePack {
        FramePack(slug: "exemple-savane", name: "Savane", installed: installed, installCount: 0,
                  usage: .rank(.ambassadeur, division: nil))
    }

    private func ref(_ sha: String, _ ext: String) -> PackAssetRef {
        PackAssetRef(src: "\(sha.prefix(16)).\(ext)", bytes: 10, sha256: sha)!
    }

    // MARK: - Installer ⇒ onglet ; retirer ⇒ disparu

    func test_installingAFramePack_givesItATab_removingIt_takesTheTabAway() async {
        let service = MockFramePackService()
        service.catalogueResult = .success([savane(installed: false)])
        service.installedResult = .success([])
        let store = FramePackStore(service: service, cache: MemoryFramePackCache(), account: { "u1" })
        await store.loadInstalled()
        await store.loadCatalogue()
        XCTAssertEqual(PackShopPage.offered(installed: (store.installed ?? []).map(\.slug)), [.shop])

        service.installedResult = .success([savane(installed: true)])
        await store.toggle(slug: "exemple-savane")

        XCTAssertEqual(service.setInstalledCalls.first?.0, true)
        XCTAssertEqual(PackShopPage.offered(installed: (store.installed ?? []).map(\.slug)),
                       [.shop, .pack("exemple-savane")])

        await store.toggle(slug: "exemple-savane")

        XCTAssertEqual(service.setInstalledCalls.last?.0, false)
        XCTAssertEqual(PackShopPage.offered(installed: (store.installed ?? []).map(\.slug)), [.shop])
        XCTAssertEqual(store.state.catalogue?.first?.installed, false)
    }

    // MARK: - Deux comptes ⇒ deux étagères

    func test_twoAccounts_haveTwoShelves() async {
        let service = MockFramePackService()
        let cache = MemoryFramePackCache()
        var account = "u1"
        let store = FramePackStore(service: service, cache: cache, account: { account })

        service.installedResult = .success([savane(installed: true)])
        await store.loadInstalled()
        XCTAssertEqual(store.installed?.map(\.slug), ["exemple-savane"])

        account = "u2"
        service.installedResult = .failure(URLError(.notConnectedToInternet))
        await store.loadInstalled()

        XCTAssertNil(store.installed, "l'étagère du premier compte n'est jamais servie au second")
        XCTAssertEqual(cache.byAccount["u1"]?.installed.map(\.slug), ["exemple-savane"])
        XCTAssertNil(cache.byAccount["u2"])
    }

    // MARK: - L'onglet d'un pack : ses cadres et leur usage

    func test_theShelf_showsEachFrame_withItsUsage_andItsTranslatedName() async {
        let contract = Data(#"""
        {"schema":1,"frames":[
          {"id":"exemple-savane.ambassadeur-4","usage":{"kind":"rank","rank":"ambassadeur","division":4},
           "thumb":{"src":"\#(Self.sha.prefix(16)).webp","bytes":10,"sha256":"\#(Self.sha)"},"i18n":{"name":"a4"}},
          {"id":"libre","usage":{"kind":"free","surfaces":["call"]},
           "thumb":{"src":"\#(Self.sha.prefix(16)).webp","bytes":10,"sha256":"\#(Self.sha)"},"i18n":{"name":"x"}}
        ]}
        """#.utf8)
        let service = MockFramePackService()
        service.detailResult = .success(FramePack(slug: "exemple-savane", name: "Savane", contractSchema: 1,
                                                  contract: ref(Self.contractSha, "json"),
                                                  strings: ["fr": ref(Self.stringsSha, "json")]))
        let assets = MemoryPackAssets(files: [
            "\(Self.contractSha.prefix(16)).json": contract,
            "\(Self.stringsSha.prefix(16)).json": Data(#"{"a4":"Savane IV"}"#.utf8),
        ])
        let loader = FramePackShelfLoader(service: service, assets: assets, language: { "de" },
                                          usageText: { usage in usage == .rank(.ambassadeur, division: .iv) ? "Rang Ambassadeur IV uniquement" : "?" })

        await loader.load(savane(installed: true))

        guard case .frames(let tiles) = loader.contents["exemple-savane"] else {
            return XCTFail("les cadres du pack installé s'affichent")
        }
        XCTAssertEqual(tiles.map(\.id), ["exemple-savane.ambassadeur-4"], "un cadre libre ne passe jamais")
        XCTAssertEqual(tiles.first?.name, "Savane IV", "langue absente ⇒ le français")
        XCTAssertEqual(tiles.first?.usageText, "Rang Ambassadeur IV uniquement")
    }

    func test_anUnknownContractVersion_asksToUpdate_andDownloadsNothing() async {
        let service = MockFramePackService()
        service.detailResult = .success(FramePack(slug: "exemple-savane", name: "Savane", contractSchema: 2,
                                                  contract: ref(Self.contractSha, "json")))
        let loader = FramePackShelfLoader(service: service, assets: MemoryPackAssets(files: [:]),
                                          language: { "fr" }, usageText: { _ in "" })

        await loader.load(savane(installed: true))

        XCTAssertEqual(loader.contents["exemple-savane"], .needsUpdate)
    }

    /// L'usage d'un cadre de rang se lit avec le nom du rang du jeu (#10146).
    func test_theUsageCopy_namesTheRank() {
        let text = FrameUsageCopy.text(.rank(.ambassadeur, division: .iv))
        XCTAssertTrue(text.contains(GameCopy.rankName(.ambassadeur)))
        XCTAssertTrue(text.contains("IV"))
    }
}
