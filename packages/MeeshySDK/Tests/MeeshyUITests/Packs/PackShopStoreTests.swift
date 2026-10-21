import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

private final class StubShopService: PackShopProviding, @unchecked Sendable {
    var shopResult: Result<PackShopResponse, Error>
    var purchaseResult: Result<PackPurchaseResponse, Error> = .failure(URLError(.notConnectedToInternet))
    var installResult: Result<ShopPack, Error> = .failure(URLError(.notConnectedToInternet))
    private(set) var purchaseRequestIds: [String] = []
    private(set) var installCalls: [(Bool, PackDomain, String)] = []
    private(set) var shopDomains: [[PackDomain]?] = []

    init(shop: PackShopResponse) { shopResult = .success(shop) }

    func shop(domains: [PackDomain]?) async throws -> PackShopResponse {
        shopDomains.append(domains)
        return try shopResult.get()
    }

    func setInstalled(_ installed: Bool, domain: PackDomain, slug: String) async throws -> ShopPack {
        installCalls.append((installed, domain, slug))
        return try installResult.get()
    }

    func purchase(domain: PackDomain, slug: String, requestId: String) async throws -> PackPurchaseResponse {
        purchaseRequestIds.append(requestId)
        return try purchaseResult.get()
    }
}

/// **L'achat enchaîné au réseau** (#10632) : optimiste, `requestId` posé au
/// geste et réutilisé au nouvel essai, retour arrière dit sur 409.
@MainActor
final class PackShopStoreTests: XCTestCase {

    private func shop(_ packs: [ShopPack], balance: Int = 50) -> PackShopResponse {
        PackShopResponse(sections: [PackShopSection(domain: .wallpaper, packs: packs)], balance: balance)
    }

    private func paid(_ slug: String, price: Int = 20) -> ShopPack { ShopPack(slug: slug, name: slug, price: price, owned: false) }

    private func makeStore(_ service: StubShopService, snapshots: any PackShopSnapshotStoring = EmptySnapshots()) -> PackShopStore {
        var counter = 0
        return PackShopStore(service: service, snapshots: snapshots, makeRequestId: { counter += 1; return "req-\(counter)" })
    }

    func test_load_servesTheShopAndTheBalance() async {
        let store = makeStore(StubShopService(shop: shop([paid("aurore")], balance: 42)))

        await store.load()

        XCTAssertEqual(store.state.packs(in: .wallpaper)?.map(\.slug), ["aurore"])
        XCTAssertEqual(store.state.balance, 42)
    }

    func test_load_asksOnlyForTheDomainsTheShelfShows() async {
        let service = StubShopService(shop: shop([paid("aurore")]))
        let store = makeStore(service)

        await store.load(domains: [.wallpaper])

        XCTAssertEqual(service.shopDomains, [[.wallpaper]],
                       "une vitrine filtrée ne lit pas les quatre autres domaines (cinq requêtes sur un ancien serveur)")
    }

    func test_buyButton_saysThePriceInMeeshesToVoiceOver() {
        let label = PackShopView.voiceOverLabel(for: UnifiedShopView.row(paid("aurore", price: 20)))

        XCTAssertTrue(label.contains("aurore"))
        XCTAssertTrue(label.contains("20"))
        XCTAssertTrue(label.contains("Meeshes"), "« Acheter · 20 » ne dit pas ce que coûte le geste")
    }

    func test_buy_isOptimisticThenConfirmedByTheServer() async {
        let service = StubShopService(shop: shop([paid("aurore")]))
        service.purchaseResult = .success(PackPurchaseResponse(
            pack: ShopPack(slug: "aurore", name: "aurore", installed: true, price: 20, owned: true), balance: 30))
        let store = makeStore(service)
        await store.load()

        await store.tap(domain: .wallpaper, slug: "aurore")

        XCTAssertEqual(store.state.balance, 30)
        XCTAssertEqual(store.state.pack(.wallpaper, "aurore")?.isOwned, true)
        XCTAssertEqual(service.purchaseRequestIds, ["req-1"])
    }

    func test_buy_insufficientMeeshes_rollsBackAndSaysSo() async {
        let service = StubShopService(shop: shop([paid("aurore", price: 80)]))
        service.purchaseResult = .failure(MeeshyError.rejected(
            APIRejection(statusCode: 409, code: "INSUFFICIENT_MEESHES", message: "solde")))
        let store = makeStore(service)
        await store.load()

        await store.tap(domain: .wallpaper, slug: "aurore")

        XCTAssertEqual(store.state.failure, .insufficientMeeshes)
        XCTAssertEqual(store.state.pack(.wallpaper, "aurore")?.needsPurchase, true)
        XCTAssertEqual(store.state.balance, 50)
    }

    func test_buy_retryAfterANetworkFailureReusesTheSameRequestId() async {
        let service = StubShopService(shop: shop([paid("aurore")]))
        let store = makeStore(service)
        await store.load()

        await store.tap(domain: .wallpaper, slug: "aurore")
        await store.tap(domain: .wallpaper, slug: "aurore")

        XCTAssertEqual(service.purchaseRequestIds, ["req-1", "req-1"])
    }

    func test_aFreePack_installsDirectlyWithoutPurchase() async {
        let service = StubShopService(shop: shop([ShopPack(slug: "libre", name: "libre")]))
        service.installResult = .success(ShopPack(slug: "libre", name: "libre", installed: true, installCount: 1))
        let store = makeStore(service)
        await store.load()

        await store.tap(domain: .wallpaper, slug: "libre")

        XCTAssertTrue(service.purchaseRequestIds.isEmpty)
        XCTAssertEqual(service.installCalls.map(\.2), ["libre"])
        XCTAssertEqual(store.state.pack(.wallpaper, "libre")?.installed, true)
    }

    // MARK: Cache-First (#10710)

    private struct EmptySnapshots: PackShopSnapshotStoring {
        func read(domains: [PackDomain]?) -> CacheResult<PackShopResponse> { .empty }
        func write(_ state: PackShopState, domains: [PackDomain]?) {}
    }

    private final class RecordingSnapshots: PackShopSnapshotStoring, @unchecked Sendable {
        var cached: CacheResult<PackShopResponse>
        var written: [PackShopState] = []
        init(_ cached: CacheResult<PackShopResponse>) { self.cached = cached }
        func read(domains: [PackDomain]?) -> CacheResult<PackShopResponse> { cached }
        func write(_ state: PackShopState, domains: [PackDomain]?) { written.append(state) }
    }

    func test_load_withAStaleSnapshot_servesItAtOnce_thenRefreshesSilently() async {
        let service = StubShopService(shop: shop([paid("frais")]))
        let snapshots = RecordingSnapshots(.stale(shop([paid("ancien")]), age: 600))
        let store = makeStore(service, snapshots: snapshots)

        await store.load()

        XCTAssertEqual(store.state.packs(in: .wallpaper)?.map(\.slug), ["frais"])
        XCTAssertEqual(snapshots.written.last?.packs(in: .wallpaper)?.map(\.slug), ["frais"])
    }

    func test_load_withAStaleSnapshot_andNoNetwork_keepsTheLastKnownContent_withoutError() async {
        let service = StubShopService(shop: shop([]))
        service.shopResult = .failure(URLError(.notConnectedToInternet))
        let store = makeStore(service, snapshots: RecordingSnapshots(.stale(shop([paid("ancien")]), age: 600)))

        await store.load()

        XCTAssertEqual(store.state.packs(in: .wallpaper)?.map(\.slug), ["ancien"])
        XCTAssertFalse(store.loadFailed)
    }

    func test_load_withAFreshSnapshot_servesItWithoutAskingTheNetwork() async {
        let service = StubShopService(shop: shop([paid("frais")]))
        let store = makeStore(service, snapshots: RecordingSnapshots(.fresh(shop([paid("ancien")]), age: 5)))

        await store.load()

        XCTAssertEqual(store.state.packs(in: .wallpaper)?.map(\.slug), ["ancien"])
    }

    func test_load_withNoSnapshot_andNoNetwork_leavesTheShelfEmptyAndFlagsTheFailure() async {
        let service = StubShopService(shop: shop([]))
        service.shopResult = .failure(URLError(.notConnectedToInternet))
        let store = makeStore(service)

        await store.load()

        XCTAssertNil(store.state.sections)
        XCTAssertTrue(store.loadFailed)
    }

    func test_aFailedLoad_keepsTheShopAlreadyRead() async {
        let service = StubShopService(shop: shop([paid("aurore")]))
        let store = makeStore(service)
        await store.load()
        service.shopResult = .failure(URLError(.notConnectedToInternet))

        await store.load()

        XCTAssertEqual(store.state.packs(in: .wallpaper)?.count, 1)
        XCTAssertFalse(store.loadFailed)
    }

    func test_row_carriesThePriceAndThePossession() {
        let row = UnifiedShopView.row(paid("aurore", price: 20))

        XCTAssertEqual(row.price, 20)
        XCTAssertTrue(row.needsPurchase)
        XCTAssertFalse(UnifiedShopView.row(ShopPack(slug: "libre", name: "libre")).needsPurchase)
    }

    /// #10718 — un pack inclus ne se retire pas : la rangée n'offre plus « Retirer » (le serveur répond 409).
    func test_row_carriesRemovability_soAnIncludedPackOffersNoRemove() {
        XCTAssertFalse(UnifiedShopView.row(ShopPack(slug: "essentiels", name: "Essentiels", installed: true, removable: false)).removable)
        XCTAssertTrue(UnifiedShopView.row(ShopPack(slug: "prestige", name: "Prestige", installed: true)).removable)
        let sticker = StickerPack(slug: "mee", name: "Mee", isBuiltin: true, installed: true)
        XCTAssertFalse(StickerPackShopView.row(sticker).removable)
    }
}
