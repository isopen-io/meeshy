import XCTest
@testable import MeeshySDK

// MARK: - L'éditeur d'un pack, lu par la boutique (#16315, #16433)

final class PackPublisherTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func test_aShopPack_readsItsPublisher() throws {
        let pack = try decode(ShopPack.self, """
        {"slug":"chats","author":"vieux texte","publisher":{"slug":"studio-lumiere","name":"Studio Lumière","verified":true,"official":false}}
        """)

        XCTAssertEqual(pack.publisher, PackPublisherRef(slug: "studio-lumiere", name: "Studio Lumière", verified: true, official: false))
    }

    func test_aPackFromAnOldServer_hasNoPublisher_andAnUnreadablePublisherFallsAlone() throws {
        let old = try decode(ShopPack.self, #"{"slug":"a","author":"Awa"}"#)
        let broken = try decode(ShopPack.self, #"{"slug":"b","publisher":{"name":42}}"#)

        XCTAssertNil(old.publisher)
        XCTAssertNil(broken.publisher)
        XCTAssertEqual(broken.slug, "b")
    }

    func test_thePublisherSurvivesTheShopSnapshot() throws {
        let pack = ShopPack(slug: "a", name: "A", publisher: PackPublisherRef(slug: "meeshy", name: "Meeshy", verified: true, official: true))

        let back = try JSONDecoder().decode(ShopPack.self, from: JSONEncoder().encode(pack))

        XCTAssertEqual(back.publisher, pack.publisher)
    }

    func test_thePublisherPage_readsTheIdentityAndTheProfileThatEdits() throws {
        let page = try decode(PackPublisherPage.self, """
        {"publisher":{"slug":"studio-lumiere","name":"Studio Lumière","verified":false,"official":false},
         "owner":{"id":"68d0000000000000000000a1","username":"awa","displayName":"Awa D.","avatar":null},
         "website":"https://studio.example"}
        """)

        XCTAssertEqual(page.publisher.slug, "studio-lumiere")
        XCTAssertEqual(page.owner, PackPublisherOwner(id: "68d0000000000000000000a1", username: "awa", displayName: "Awa D.", avatar: nil))
        XCTAssertEqual(page.website, "https://studio.example")
    }

    func test_aPageWithoutALiveOwner_readsWithoutProfile() throws {
        let page = try decode(PackPublisherPage.self, #"{"publisher":{"slug":"x","name":"X","verified":false,"official":false},"owner":null,"website":null}"#)

        XCTAssertNil(page.owner)
        XCTAssertNil(page.website)
    }

    func test_theService_readsThePageAtItsAddress() async throws {
        let api = MockAPIClient()
        api.stubWire("/publishers/studio-lumiere/page", json: """
        {"success":true,"data":{"publisher":{"slug":"studio-lumiere","name":"Studio Lumière","verified":true,"official":false},"owner":null,"website":null}}
        """)

        let page = try await PackPublisherService(api: api).page(slug: "studio-lumiere")

        XCTAssertEqual(page.publisher.name, "Studio Lumière")
        XCTAssertEqual(api.lastRequest?.endpoint, "/publishers/studio-lumiere/page")
    }
}
