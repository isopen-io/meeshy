import XCTest
@testable import MeeshySDK

/// **Un pack d'apparence d'un vendeur tiers dans la vitrine iOS** (#10709) : la
/// passerelle le sert `origin: "community"`, sans couverture ni aperçu, avec le
/// prix fixé par la modération. Il doit apparaître dans la vitrine, payant et
/// non possédé — et ne jamais faire tomber la section qui le porte.
final class CommunityShopPackTests: XCTestCase {

    private func communityPack(domain: String, owned: Bool = false) -> String {
        let usage = domain == "avatar-ring" ? #","usage":{"kind":"free","surfaces":["avatar"]}"# : ""
        return """
        {"slug":"dunes-pack","name":"Dunes","description":"Des dunes","author":"Awa","builtin":false,"status":"approved",
         "itemCount":1,"coverUrl":null,"installed":false,"installCount":3,"domain":"\(domain)","origin":"community","version":1,
         "downloadBytes":{"story":412,"square":null},"removable":true,"names":{},"price":40,"owned":\(owned),"preview":null\(usage)}
        """
    }

    func test_shop_communityPackOfEachAppearanceDomain_appearsPaidAndNotOwned() throws {
        let json = """
        {"domains":[
          {"domain":"wallpaper","packs":[\(communityPack(domain: "wallpaper"))]},
          {"domain":"avatar-ring","packs":[\(communityPack(domain: "avatar-ring"))]},
          {"domain":"banner","packs":[\(communityPack(domain: "banner"))]}
        ],"balance":12}
        """
        let shop = try JSONDecoder().decode(PackShopResponse.self, from: Data(json.utf8))

        for domain in [PackDomain.wallpaper, .avatarRing, .banner] {
            let pack = try XCTUnwrap(shop.packs(in: domain).first, "\(domain)")
            XCTAssertEqual(pack.slug, "dunes-pack")
            XCTAssertEqual(pack.origin, .community)
            XCTAssertEqual(pack.author, "Awa")
            XCTAssertNil(pack.coverUrl)
            XCTAssertNil(pack.coverFile)
            XCTAssertEqual(pack.price, 40)
            XCTAssertTrue(pack.needsPurchase)
            XCTAssertFalse(pack.isBundled)
        }
    }

    func test_shop_boughtCommunityPack_isOwnedAndNoLongerNeedsPurchase() throws {
        let pack = try JSONDecoder().decode(ShopPack.self, from: Data(communityPack(domain: "banner", owned: true).utf8))
        XCTAssertTrue(pack.isOwned)
        XCTAssertFalse(pack.needsPurchase)
    }
}
