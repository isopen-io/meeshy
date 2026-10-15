import XCTest
@testable import MeeshySDK

/// **Le décor de profil** (#10632, §§ 5.5, 9, 10.2) : lecture tolérante par côté,
/// écriture « absent = inchangé, null = retiré », équipement optimiste avec
/// retour arrière du seul côté touché, et un sélecteur qui ne liste que ce qui
/// est possédé et installé.
final class ProfileDecorTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func item(_ pack: String, _ key: String) -> ServedProfileDecorItem {
        ServedProfileDecorItem(pack: pack, item: key, origin: .builtin)
    }

    // MARK: Lecture

    func test_servedDecor_aMalformedRingDoesNotTakeTheBannerWithIt() throws {
        let decor = try decode(ServedProfileDecor.self, """
        {"avatarRing":{"pack":"contours-essentiels"},
         "banner":{"pack":"bannieres-essentielles","item":"aurore","origin":"builtin","contract":null}}
        """)
        XCTAssertNil(decor.avatarRing)
        XCTAssertEqual(decor.banner?.item, "aurore")
    }

    func test_servedDecor_anUnknownOriginIsReadNotRejected() throws {
        let decor = try decode(ServedProfileDecor.self, #"{"avatarRing":{"pack":"p","item":"i","origin":"galaxy","contract":"0123456789abcdef.json"}}"#)
        XCTAssertEqual(decor.avatarRing?.origin, .unknown)
    }

    // MARK: Écriture

    private func body(_ write: ProfileDecorWrite) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(write)) as? [String: Any])
    }

    func test_write_aMissingFieldIsUnchangedAndNullIsCleared() throws {
        let json = try body(ProfileDecorWrite(side: .banner, choice: nil))
        XCTAssertEqual(Set(json.keys), ["banner"])
        XCTAssertTrue(json["banner"] is NSNull)
    }

    func test_write_aChoiceSendsOnlyThePackAndTheItem() throws {
        let json = try body(ProfileDecorWrite(side: .avatarRing, choice: ProfileDecorRef(pack: "contours-essentiels", item: "filet")))
        XCTAssertEqual(Set(json.keys), ["avatarRing"])
        XCTAssertEqual(json["avatarRing"] as? [String: String], ["pack": "contours-essentiels", "item": "filet"])
    }

    func test_service_putsToTheProfileDecorRouteAndReadsTheServedDecor() async throws {
        let api = MockAPIClient()
        let served = ServedProfileDecor(avatarRing: item("contours-essentiels", "filet"), banner: nil)
        api.stub("/api/v1/me/profile-decor", result: APIResponse<ServedProfileDecor>(success: true, data: served, error: nil))

        let result = try await ProfileDecorService(api: api).update(ProfileDecorWrite(side: .avatarRing, choice: ProfileDecorRef(pack: "contours-essentiels", item: "filet")))

        XCTAssertEqual(result, served)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.path, "/api/v1/me/profile-decor")
    }

    // MARK: Équiper

    func test_equip_isOptimisticAndRollbackRestoresOnlyTheTouchedSide() {
        var state = ProfileDecorState(decor: ServedProfileDecor(avatarRing: item("contours-essentiels", "filet"), banner: item("bannieres-essentielles", "aurore")))

        let previous = state.equip(item("contours-essentiels", "perle"), side: .avatarRing)
        XCTAssertEqual(state.decor.avatarRing?.item, "perle")

        _ = state.equip(item("bannieres-essentielles", "maille"), side: .banner)
        state.rollback(side: .avatarRing, to: previous)

        XCTAssertEqual(state.decor.avatarRing?.item, "filet")
        XCTAssertEqual(state.decor.banner?.item, "maille", "le retour arrière du contour n'efface pas la bannière touchée entre-temps")
    }

    func test_event_ofAnotherAccountIsIgnored() {
        var state = ProfileDecorState(decor: ServedProfileDecor(avatarRing: item("contours-essentiels", "filet")))
        let foreign = ProfileDecorUpdatedEvent(userId: "autre", decor: .empty)
        state.apply(event: foreign, myUserId: "moi")
        XCTAssertEqual(state.decor.avatarRing?.item, "filet")

        state.apply(event: ProfileDecorUpdatedEvent(userId: "moi", decor: .empty), myUserId: "moi")
        XCTAssertNil(state.decor.avatarRing)
    }

    // MARK: Résolution embarquée

    func test_catalog_embedsTheSixRingsAndTheSixBanners() {
        XCTAssertEqual(AvatarRingCatalog.shared.packs.flatMap(\.rings).map(\.key), ["filet", "double-filet", "perle", "aurore", "deco", "laurier"])
        XCTAssertEqual(AppearanceCatalog.shared.bannerPacks.flatMap(\.designs).count, 6)
        XCTAssertEqual(AvatarRingCatalog.shared.ringName("filet", language: "en") != nil, true)
    }

    func test_resolver_readsABuiltinFromTheEmbeddedCatalogAndFailsClosedOtherwise() {
        XCTAssertEqual(ProfileDecorResolver.ring(item("contours-essentiels", "aurore"))?.stroke.style, .gradient)
        XCTAssertNil(ProfileDecorResolver.ring(item("contours-essentiels", "inconnu")))
        XCTAssertNil(ProfileDecorResolver.ring(nil))
        XCTAssertEqual(ProfileDecorResolver.banner(item("bannieres-essentielles", "aurore"))?.key, "aurore")
        let official = ServedProfileDecorItem(pack: "x", item: "y", origin: .official, contract: "0123456789abcdef.json")
        XCTAssertNil(ProfileDecorResolver.ring(official))
    }

    // MARK: Sélecteur

    func test_options_listOnlyInstalledAndOwnedPacks() {
        let none = ProfileDecorOptions.rings(installed: [ShopPack(slug: "contours-essentiels", name: "x", installed: false)])
        XCTAssertTrue(none.isEmpty)
        let unpaid = ProfileDecorOptions.rings(installed: [ShopPack(slug: "contours-essentiels", name: "x", installed: true, price: 50, owned: false)])
        XCTAssertTrue(unpaid.isEmpty)
        let ok = ProfileDecorOptions.rings(installed: [ShopPack(slug: "contours-essentiels", name: "x", installed: true, price: 50, owned: true)])
        XCTAssertEqual(ok.first?.items.count, 6)
        XCTAssertEqual(ok.first?.items.first?.ref, ProfileDecorRef(pack: "contours-essentiels", item: "filet"))
    }

    func test_options_beforeTheInstalledListIsKnownShowsTheDefaultPacks() {
        XCTAssertEqual(ProfileDecorOptions.rings(installed: nil).first?.pack, "contours-essentiels")
        XCTAssertEqual(ProfileDecorOptions.banners(installed: nil).first?.pack, "bannieres-essentielles")
    }

    func test_ring_withAnOrnamentPointingAtAMissingColorDoesNotDecode() {
        XCTAssertThrowsError(try decode(AvatarRingDesign.self, """
        {"key":"x","stroke":{"style":"solid","width":0.03,"colors":["#6366F1"]},"ornament":{"paths":[{"d":"M0 0","color":2,"opacity":1}]}}
        """))
    }
}
