import XCTest
@testable import MeeshySDK

/// **La vitrine unique** (#10632, spec 2026-10-14 §§ 4, 11) : un domaine inconnu
/// ne fait pas tomber la liste, `/packs/shop` se recompose sur les boutiques par
/// domaine d'un ancien serveur, un domaine absent est une vitrine vide, et
/// l'achat est optimiste avec un `requestId` posé au geste.
final class PackShopTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func wallpaper(_ slug: String, price: Int? = nil, owned: Bool? = nil, installed: Bool = false) -> ShopPack {
        ShopPack(slug: slug, name: slug, installed: installed, price: price, owned: owned)
    }

    private func state(_ packs: [ShopPack], balance: Int? = 50) -> PackShopState {
        PackShopState(sections: [PackShopSection(domain: .wallpaper, packs: packs)], balance: balance)
    }

    // MARK: Le domaine tolérant

    func test_packDomain_decodesAnUnknownDomainAsUnknownWithoutDroppingTheList() throws {
        let sections = try decode(LossyDecodableArray<PackShopSection>.self, """
        [{"domain":"wallpaper","packs":[{"slug":"a"}]},
         {"domain":"hologram","packs":[{"slug":"x"}]},
         {"domain":"avatar-ring","packs":[]}]
        """)

        XCTAssertEqual(sections.elements.map(\.domain), [.wallpaper, .unknown, .avatarRing])
        XCTAssertEqual(sections.dropped, 0)
    }

    func test_packDomain_knowsTheThreeNewDomains() throws {
        XCTAssertEqual(try decode([PackDomain].self, #"["wallpaper","avatar-ring","banner","glory-frame","sticker"]"#),
                       [.wallpaper, .avatarRing, .banner, .gloryFrame, .sticker])
        XCTAssertFalse(PackDomain.allCases.contains(.unknown))
    }

    /// #10936 — les cadres de bannière se vendent en boutique, à leur propre adresse.
    func test_packDomain_bannerFrame_isReadRoutedAndSold() throws {
        XCTAssertEqual(try decode([PackDomain].self, #"["banner-frame","capture-frame"]"#), [.bannerFrame, .unknown])
        XCTAssertTrue(PackDomain.allCases.contains(.bannerFrame))
        XCTAssertEqual(PackDomain(queryValue: "banner-frame"), .bannerFrame)
        let routes = try XCTUnwrap(PackRoutes.of(.bannerFrame))
        XCTAssertEqual(routes.catalogue.path, "/api/v1/packs/banner-frame")
        XCTAssertEqual(routes.installed.path, "/api/v1/packs/banner-frame/installed")
        XCTAssertEqual(routes.detail("cadres-grec").path, "/api/v1/packs/banner-frame/cadres-grec")
        XCTAssertEqual(routes.install("cadres-grec").path, "/api/v1/packs/banner-frame/cadres-grec/install")
        XCTAssertEqual(routes.purchase?("cadres-grec").path, "/api/v1/packs/banner-frame/cadres-grec/purchase")
    }

    func test_packDomain_queryValueIgnoresTheUnknownAndTheBlank() {
        XCTAssertEqual(PackDomain(queryValue: " Wallpaper "), .wallpaper)
        XCTAssertNil(PackDomain(queryValue: "hologram"))
        XCTAssertNil(PackDomain(queryValue: "unknown"))
        XCTAssertNil(PackDomain(queryValue: nil))
    }

    func test_anUnknownDomainRoutesNothing() async {
        XCTAssertNil(PackRoutes.of(.unknown))
        let service = PackService<ShopPack>(domain: .unknown, api: MockAPIClient())
        do {
            _ = try await service.catalogue()
            XCTFail("un domaine inconnu ne route aucune requête")
        } catch {
            XCTAssertEqual(error as? PackServiceError, .unroutableDomain)
        }
    }

    func test_shopResponse_dropsAnUnknownDomainAndReadsTheBalance() throws {
        let response = try decode(PackShopResponse.self, """
        {"domains":[{"domain":"banner","packs":[{"slug":"b","price":30}]},{"domain":"capture-frame","packs":[]}],"balance":12}
        """)

        XCTAssertEqual(response.sections.map(\.domain), [.banner])
        XCTAssertEqual(response.balance, 12)
    }

    // MARK: Le prix et la possession

    func test_shopPack_aMissingPriceIsFreeAndOwned() throws {
        let pack = try decode(ShopPack.self, #"{"slug":"free"}"#)

        XCTAssertNil(pack.price)
        XCTAssertTrue(pack.isOwned)
        XCTAssertFalse(pack.needsPurchase)
    }

    func test_shopPack_aPaidPackIsOwnedOnlyWhenTheServerSaysSo() throws {
        let toBuy = try decode(ShopPack.self, #"{"slug":"p","price":40}"#)
        let bought = try decode(ShopPack.self, #"{"slug":"p","price":40,"owned":true}"#)

        XCTAssertTrue(toBuy.needsPurchase)
        XCTAssertFalse(bought.needsPurchase)
    }

    func test_shopPack_aZeroPriceReadsFree_andAnUnreadableFieldDoesNotDropThePack() throws {
        let pack = try decode(ShopPack.self, #"{"slug":"z","price":0,"installCount":"beaucoup","origin":"futur"}"#)

        XCTAssertNil(pack.price)
        XCTAssertEqual(pack.installCount, 0)
        XCTAssertEqual(pack.origin, .unknown)
    }

    // MARK: La vitrine, et le repli sur les boutiques par domaine

    func test_shop_readsThePackShopWithTheDomainsQuery() async throws {
        let mock = MockAPIClient()
        mock.stub("/packs/shop", result: APIResponse(success: true, data: PackShopResponse(sections: [
            PackShopSection(domain: .wallpaper, packs: [wallpaper("a", price: 20)])
        ], balance: 7), error: nil))

        let response = try await PackShopService(api: mock).shop(domains: [.wallpaper, .banner])

        XCTAssertEqual(response.balance, 7)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/packs/shop")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "domains", value: "wallpaper,banner")])
    }

    func test_shop_fallsBackOnTheDomainShopsWhenTheOldServerAnswers404() async throws {
        let mock = MockAPIClient()
        mock.stubError("/packs/shop", error: APIError.serverError(404, "Not found"))
        mock.stub("/sticker-packs", result: APIResponse(success: true, data: LossyDecodableArray(elements: [wallpaper("mee")]), error: nil))
        mock.stubError("/packs/wallpaper", error: MeeshyError.server(statusCode: 404, message: "Not found"))

        let response = try await PackShopService(api: mock).shop(domains: [.sticker, .wallpaper])

        XCTAssertEqual(response.packs(in: .sticker).map(\.slug), ["mee"])
        XCTAssertEqual(response.packs(in: .wallpaper), [], "un domaine que l'ancien serveur ne sert pas est vide, pas en erreur")
    }

    func test_shop_aRealFailureIsNotSwallowedByTheFallback() async {
        let mock = MockAPIClient()
        mock.stubError("/packs/shop", error: APIError.serverError(500, "boom"))

        do {
            _ = try await PackShopService(api: mock).shop(domains: nil)
            XCTFail("un 500 n'est pas un ancien serveur")
        } catch {
            XCTAssertEqual(PackHTTPStatus.code(of: error), 500)
        }
    }

    func test_shopResponse_anAbsentDomainIsAnEmptyShelf() {
        let response = PackShopResponse(sections: [PackShopSection(domain: .banner, packs: [wallpaper("b")])])

        XCTAssertEqual(response.packs(in: .wallpaper), [])
        XCTAssertEqual(response.packs(in: .banner).count, 1)
    }

    func test_purchase_postsOnlyTheRequestIdOnThePurchaseAddress() async throws {
        let mock = MockAPIClient()
        mock.stub("/packs/wallpaper/aurore/purchase", result: APIResponse(success: true,
            data: PackPurchaseResponse(pack: wallpaper("aurore", price: 20, owned: true, installed: true), balance: 30), error: nil))

        let bought = try await PackShopService(api: mock).purchase(domain: .wallpaper, slug: "aurore", requestId: "req-geste-1")

        XCTAssertEqual(bought.balance, 30)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["requestId"] as? String, "req-geste-1")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?.count, 1, "le client n'envoie jamais de prix")
    }

    func test_purchaseAddresses_declareStructuredRefusals_soTheInsufficientBalanceReachesTheScreen() throws {
        let purchasable = PackDomain.allCases.filter(\.isPurchasable)
        XCTAssertEqual(purchasable, [.wallpaper, .avatarRing, .banner, .bannerFrame])
        for domain in purchasable {
            let purchase = try XCTUnwrap(PackRoutes.of(domain)?.purchase, "\(domain)")
            XCTAssertEqual(purchase("aurore").rejectionPolicy, .structured,
                           "sans .structured, le 409 INSUFFICIENT_MEESHES arrive en .server(409) et l'écran ne dit jamais pourquoi")
            XCTAssertEqual(PackRoutes.of(domain)?.catalogue.rejectionPolicy, .opaque)
        }
        XCTAssertEqual(PacksEndpoint.shop.rejectionPolicy, .opaque, "le repli d'un ancien serveur lit son 404 opaque")
    }

    func test_purchase_aDomainWithoutPricesHasNoPurchaseAddress() async {
        do {
            _ = try await PackShopService(api: MockAPIClient()).purchase(domain: .sticker, slug: "mee", requestId: "req-geste-1")
            XCTFail("les stickers n'ont pas de route d'achat")
        } catch {
            XCTAssertEqual(error as? PackServiceError, .notPurchasable)
        }
    }

    // MARK: L'achat optimiste

    func test_purchasing_flipsToOwnedInstalledAndDebitsTheBalanceAtOnce() throws {
        let start = state([wallpaper("aurore", price: 20)])

        let (next, requestId) = try XCTUnwrap(start.purchasing(.wallpaper, "aurore", makeRequestId: { "req-1" }))

        let pack = try XCTUnwrap(next.pack(.wallpaper, "aurore"))
        XCTAssertTrue(pack.isOwned)
        XCTAssertTrue(pack.installed)
        XCTAssertEqual(next.balance, 30)
        XCTAssertEqual(requestId, "req-1")
        XCTAssertTrue(next.pending.contains("wallpaper.aurore"))
    }

    func test_purchasing_aFreeOrOwnedPackIsNotPurchasable_andASecondTapIsIgnored() throws {
        let start = state([wallpaper("libre"), wallpaper("acquis", price: 10, owned: true), wallpaper("payant", price: 10)])

        XCTAssertNil(start.purchasing(.wallpaper, "libre", makeRequestId: { "r" }))
        XCTAssertNil(start.purchasing(.wallpaper, "acquis", makeRequestId: { "r" }))
        let (inFlight, _) = try XCTUnwrap(start.purchasing(.wallpaper, "payant", makeRequestId: { "r" }))
        XCTAssertNil(inFlight.purchasing(.wallpaper, "payant", makeRequestId: { "r" }))
    }

    func test_purchase_aTransientFailureRollsBackButKeepsTheRequestIdForTheRetry() throws {
        let start = state([wallpaper("aurore", price: 20)])
        let (inFlight, first) = try XCTUnwrap(start.purchasing(.wallpaper, "aurore", makeRequestId: { "req-1" }))

        let failed = inFlight.purchaseRefused(.wallpaper, "aurore", restoring: start, failure: .generic, definitive: false)

        XCTAssertTrue(try XCTUnwrap(failed.pack(.wallpaper, "aurore")).needsPurchase)
        XCTAssertEqual(failed.balance, 50)
        XCTAssertEqual(failed.failure, .generic)
        let (_, retry) = try XCTUnwrap(failed.purchasing(.wallpaper, "aurore", makeRequestId: { "req-2" }))
        XCTAssertEqual(retry, first, "le nouvel essai du même geste réutilise le requestId : le serveur ne débite qu'une fois")
    }

    func test_purchase_anInsufficientBalanceRollsBackAndEndsTheGesture() throws {
        let start = state([wallpaper("aurore", price: 80)], balance: 50)
        let (inFlight, _) = try XCTUnwrap(start.purchasing(.wallpaper, "aurore", makeRequestId: { "req-1" }))

        let refused = inFlight.purchaseRefused(.wallpaper, "aurore", restoring: start, failure: .insufficientMeeshes, definitive: true)

        XCTAssertEqual(refused.failure, .insufficientMeeshes)
        XCTAssertEqual(refused.balance, 50)
        XCTAssertTrue(try XCTUnwrap(refused.pack(.wallpaper, "aurore")).needsPurchase)
        XCTAssertTrue(refused.pending.isEmpty)
        let (_, next) = try XCTUnwrap(refused.purchasing(.wallpaper, "aurore", makeRequestId: { "req-2" }))
        XCTAssertEqual(next, "req-2", "un refus définitif clôt le geste : le suivant est un geste neuf")
    }

    func test_purchase_theServerAnswerIsTheTruthForPackAndBalance() throws {
        let start = state([wallpaper("aurore", price: 20)])
        let (inFlight, _) = try XCTUnwrap(start.purchasing(.wallpaper, "aurore", makeRequestId: { "req-1" }))

        let settled = inFlight.purchaseSettled(.wallpaper, "aurore", PackPurchaseResponse(
            pack: wallpaper("aurore", price: 20, owned: true, installed: true), balance: 28))

        XCTAssertEqual(settled.balance, 28)
        XCTAssertTrue(settled.pending.isEmpty)
        XCTAssertNil(settled.requestIds["wallpaper.aurore"])
    }

    func test_aPartialRollbackLeavesTheOtherPackAlone() throws {
        let start = state([wallpaper("a", price: 10), wallpaper("b", price: 10)], balance: 100)
        let (afterA, _) = try XCTUnwrap(start.purchasing(.wallpaper, "a", makeRequestId: { "ra" }))
        let (afterB, _) = try XCTUnwrap(afterA.purchasing(.wallpaper, "b", makeRequestId: { "rb" }))

        let rolled = afterB.purchaseRefused(.wallpaper, "a", restoring: start, failure: .generic, definitive: true)

        XCTAssertTrue(try XCTUnwrap(rolled.pack(.wallpaper, "a")).needsPurchase)
        XCTAssertTrue(try XCTUnwrap(rolled.pack(.wallpaper, "b")).isOwned)
        XCTAssertEqual(rolled.balance, 90)
    }

    // MARK: Un pack gratuit s'installe directement

    func test_aFreePackInstallsDirectly_andRollsBackOnRefusal() throws {
        let start = state([wallpaper("libre")])

        let next = try XCTUnwrap(start.togglingInstall(.wallpaper, "libre"))
        XCTAssertTrue(try XCTUnwrap(next.pack(.wallpaper, "libre")).installed)
        XCTAssertEqual(next.balance, 50, "installer un pack gratuit ne touche pas au solde")

        let rolled = next.installRefused(.wallpaper, "libre", restoring: start)
        XCTAssertFalse(try XCTUnwrap(rolled.pack(.wallpaper, "libre")).installed)
        XCTAssertEqual(rolled.failure, .generic)
    }

    func test_aPaidPackNotYetOwnedCannotBeInstalledWithoutBuying() {
        XCTAssertNil(state([wallpaper("payant", price: 10)]).togglingInstall(.wallpaper, "payant"))
    }

    func test_refusalClassification() {
        XCTAssertTrue(PackHTTPStatus.isInsufficientMeeshes(MeeshyError.rejected(APIRejection(statusCode: 409, code: "INSUFFICIENT_MEESHES", message: "x"))))
        XCTAssertFalse(PackHTTPStatus.isInsufficientMeeshes(URLError(.notConnectedToInternet)))
        XCTAssertTrue(PackHTTPStatus.isDefinitiveRefusal(MeeshyError.rejected(APIRejection(statusCode: 409, message: "x"))))
        XCTAssertFalse(PackHTTPStatus.isDefinitiveRefusal(URLError(.notConnectedToInternet)))
        XCTAssertFalse(PackHTTPStatus.isDefinitiveRefusal(APIError.serverError(503, nil)))
    }

    // MARK: #10718 — removable

    func test_shopPack_decodesRemovable_andDefaultsToTrueFromAnOlderServer() throws {
        let included = try decode(ShopPack.self, #"{"slug":"essentiels","removable":false,"installed":true}"#)
        let legacy = try decode(ShopPack.self, #"{"slug":"ancien"}"#)
        XCTAssertFalse(included.removable)
        XCTAssertTrue(legacy.removable)
    }

    func test_stickerPack_removable_isDeducedFromBuiltin_whenTheWireIsSilent_andServedWhenItSpeaks() throws {
        XCTAssertFalse(try decode(StickerPack.self, #"{"slug":"x","builtin":true}"#).removable)
        XCTAssertTrue(try decode(StickerPack.self, #"{"slug":"x"}"#).removable)
        XCTAssertFalse(try decode(StickerPack.self, #"{"slug":"x","removable":false}"#).removable)
    }
}
