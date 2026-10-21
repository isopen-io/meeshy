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

    // MARK: Le cadre de bannière, troisième côté (#10932)

    func test_servedDecor_readsTheBannerFrameBesideTheBanner() throws {
        let decor = try decode(ServedProfileDecor.self, """
        {"avatarRing":null,
         "banner":{"pack":"bannieres-essentielles","item":"aurore","origin":"builtin","contract":null},
         "bannerFrame":{"pack":"cadres-heritages","item":"haussmannien","origin":"official","contract":"0123456789abcdef.json"}}
        """)
        XCTAssertEqual(decor.banner?.item, "aurore")
        XCTAssertEqual(decor.bannerFrame?.item, "haussmannien")
        XCTAssertEqual(decor[.bannerFrame]?.contract, "0123456789abcdef.json")
    }

    func test_servedDecor_anOlderServerWithoutTheFrameIsReadAsBefore() throws {
        let decor = try decode(ServedProfileDecor.self, #"{"avatarRing":null,"banner":{"pack":"p","item":"i","origin":"builtin","contract":null}}"#)
        XCTAssertNil(decor.bannerFrame)
        XCTAssertEqual(decor.banner?.item, "i")
    }

    func test_servedDecor_aMalformedFrameOrAnUnknownSideTakesNothingWithIt() throws {
        let decor = try decode(ServedProfileDecor.self, """
        {"avatarRing":{"pack":"c","item":"filet","origin":"builtin","contract":null},
         "bannerFrame":{"pack":"cadres"},
         "coverFrame":{"pack":"x","item":"y","origin":"builtin","contract":null}}
        """)
        XCTAssertNil(decor.bannerFrame)
        XCTAssertEqual(decor.avatarRing?.item, "filet")
    }

    func test_write_theFrameSideSendsOnlyItsOwnKey() throws {
        let set = try body(ProfileDecorWrite(side: .bannerFrame, choice: ProfileDecorRef(pack: "cadres-heritages", item: "celte")))
        XCTAssertEqual(Set(set.keys), ["bannerFrame"])
        XCTAssertEqual(set["bannerFrame"] as? [String: String], ["pack": "cadres-heritages", "item": "celte"])

        let clear = try body(ProfileDecorWrite(side: .bannerFrame, choice: nil))
        XCTAssertEqual(Set(clear.keys), ["bannerFrame"])
        XCTAssertTrue(clear["bannerFrame"] is NSNull)
    }

    func test_equip_rollingBackTheFrameLeavesTheBannerBackgroundAlone() {
        var state = ProfileDecorState(decor: ServedProfileDecor(banner: item("bannieres-essentielles", "aurore")))

        let previous = state.equip(item("cadres-heritages", "celte"), side: .bannerFrame)
        XCTAssertEqual(state.decor.bannerFrame?.item, "celte")
        XCTAssertEqual(state.decor.banner?.item, "aurore", "le cadre se pose À CÔTÉ du fond, jamais à sa place")

        state.rollback(side: .bannerFrame, to: previous)
        XCTAssertNil(state.decor.bannerFrame)
        XCTAssertEqual(state.decor.banner?.item, "aurore")
    }

    func test_sides_areThreeEachInItsOwnDomain() {
        XCTAssertEqual(ProfileDecorSide.allCases, [.avatarRing, .banner, .bannerFrame])
        XCTAssertEqual(ProfileDecorSide.bannerFrame.packDomain, "banner-frame")
        XCTAssertEqual(ProfileDecorSide.banner.packDomain, "banner")
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
        api.stub("/me/profile-decor", result: APIResponse<ServedProfileDecor>(success: true, data: served, error: nil))

        let result = try await ProfileDecorService(api: api).update(ProfileDecorWrite(side: .avatarRing, choice: ProfileDecorRef(pack: "contours-essentiels", item: "filet")))

        XCTAssertEqual(result, served)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.path, "/me/profile-decor")
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

    // MARK: Mes autres appareils, quel que soit l'écran (#10715)

    func test_userApplying_myEvent_repaintsOnlyTheDecor() {
        let user = MeeshyUser(id: "moi", username: "alice")
        let decor = ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"))

        let repainted = user.applying(ProfileDecorUpdatedEvent(userId: "moi", decor: decor))

        XCTAssertEqual(repainted?.profileDecor, decor)
        XCTAssertEqual(repainted?.username, "alice")
    }

    func test_userApplying_anotherAccountOrAnUnchangedDecor_isNil() {
        let decor = ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"))
        let user = MeeshyUser(id: "moi", username: "alice").withProfileDecor(decor)

        XCTAssertNil(user.applying(ProfileDecorUpdatedEvent(userId: "autre", decor: .empty)))
        XCTAssertNil(user.applying(ProfileDecorUpdatedEvent(userId: "moi", decor: decor)))
    }

    @MainActor
    func test_authManagerApply_repaintsTheSignedInUserWithoutAnyScreen() {
        let manager = AuthManager.shared
        let previous = manager.currentUser
        defer { manager.currentUser = previous }
        manager.currentUser = MeeshyUser(id: "moi", username: "alice")
        let decor = ServedProfileDecor(banner: item("bannieres-essentielles", "aurore"))

        manager.apply(ProfileDecorUpdatedEvent(userId: "moi", decor: decor))
        XCTAssertEqual(manager.currentUser?.profileDecor, decor)

        manager.apply(ProfileDecorUpdatedEvent(userId: "autre", decor: .empty))
        XCTAssertEqual(manager.currentUser?.profileDecor, decor, "l'événement d'un autre compte ne touche rien")
    }

    func test_catalog_embedsTheSevenRingsAndTheSevenBanners() {
        let firstPacks = AvatarRingCatalog.shared.packs.filter { ["contours-essentiels", "contours-animes"].contains($0.slug) }
        XCTAssertEqual(firstPacks.flatMap(\.rings).map(\.key), ["filet", "double-filet", "perle", "aurore", "deco", "laurier", "halo-or"])
        XCTAssertEqual(AppearanceCatalog.shared.bannerPacks.flatMap(\.designs).count, 7)
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

    // MARK: Les cadres de bannière embarqués (#10936)

    private static let styles = ["haussmannien", "arabe", "grec", "ancestral", "technologique", "rituel", "celte"]

    func test_frameCatalog_embedsTheSevenPacks_fixedAndAnimated_named() {
        let catalog = BannerFrameCatalog.shared
        XCTAssertEqual(catalog.framePacks.map(\.slug), Self.styles.map { "cadres-" + $0 })
        for style in Self.styles {
            XCTAssertEqual(catalog.framePacks.first { $0.slug == "cadres-" + style }?.frames.map(\.key), [style, style + "-anime"])
            XCTAssertNotNil(catalog.frameName(style + "-anime", language: "ar"))
            XCTAssertNotNil(catalog.packName("cadres-" + style, language: "pt"))
        }
        XCTAssertEqual(catalog.frameName("haussmannien", language: "fr"), "Haussmannien")
        XCTAssertEqual(catalog.frameName("haussmannien", language: "xx"), "Haussmannien", "langue inconnue : le français")
        XCTAssertEqual(
            Set(catalog.framePacks.filter(\.installedByDefault).map(\.slug)),
            ["cadres-haussmannien", "cadres-ancestral"],
            "deux packs de cadres installés d'office, les cinq autres en boutique (#11165)"
        )
    }

    func test_frameCatalog_anUnreadableFrameFallsAlone() throws {
        let good = ##"{"key":"ok","viewBox":[0,0,300,100],"palette":["#000000"],"border":{"width":4,"color":0,"opacity":1},"reach":{"corner":0}}"##
        let bad = #"{"key":"ko","viewBox":[0,0,300,100],"palette":["red"],"border":{"width":4,"color":0,"opacity":1},"reach":{"corner":0}}"#
        let json = #"{"bannerFrames":[{"slug":"p","order":1,"frames":[\#(bad),\#(good)]}],"strings":{"fr":{"frames":{"ok":"Bon"},"packs":{"p":{"name":"Pack"}}}}}"#
        let catalog = try BannerFrameCatalog.decode(Data(json.utf8))
        XCTAssertEqual(catalog.framePacks.first?.frames.map(\.key), ["ok"])
        XCTAssertEqual(catalog.frameName("ok", language: "en"), "Bon")
        XCTAssertEqual(catalog.packName("p", language: "fr"), "Pack")
        XCTAssertTrue(try BannerFrameCatalog.decode(Data(#"{"rings":[]}"#.utf8)).framePacks.isEmpty, "un ancien catalogue sans cadres se lit vide")
    }

    func test_resolver_readsAnEmbeddedBannerFrame() {
        XCTAssertEqual(ProfileDecorResolver.bannerFrame(item("cadres-celte", "celte-anime"))?.key, "celte-anime")
        XCTAssertNil(ProfileDecorResolver.bannerFrame(item("cadres-celte", "inconnu")))
        let official = ServedProfileDecorItem(pack: "cadres-celte", item: "celte", origin: .official, contract: "0123456789abcdef.json")
        XCTAssertNil(ProfileDecorResolver.bannerFrame(official), "un contrat adressé n'est pas encore chargé : aucun cadre, jamais une erreur")
    }

    func test_options_frames_listOnlyInstalledAndOwnedPacks_twoByDefault() {
        let byDefault = ProfileDecorOptions.bannerFrames(installed: nil)
        XCTAssertEqual(byDefault.map(\.pack), ["cadres-haussmannien", "cadres-ancestral"], "un cadre fixe et un animé par pack installé d'office (#11165)")
        XCTAssertEqual(ProfileDecorOptions.flattened(byDefault).map { !$0.design.motion.isEmpty }, [false, true, false, true])
        XCTAssertTrue(ProfileDecorOptions.bannerFrames(installed: [ShopPack(slug: "cadres-grec", name: "x", installed: true, price: 40, owned: false)]).isEmpty)
        let ok = ProfileDecorOptions.bannerFrames(installed: [ShopPack(slug: "cadres-grec", name: "x", installed: true)])
        XCTAssertEqual(ok.first?.items.map(\.ref), [ProfileDecorRef(pack: "cadres-grec", item: "grec"), ProfileDecorRef(pack: "cadres-grec", item: "grec-anime")])
    }

    func test_options_theStyleContoursAreOfferedOnceInstalled() {
        let rings = ProfileDecorOptions.rings(installed: [ShopPack(slug: "contours-rituel", name: "x", installed: true)])
        XCTAssertEqual(rings.first?.items.map(\.ref.item), ["rituel", "rituel-anime"])
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

    /// #10719 — les packs ANIMÉS installés et possédés sont proposés, avec leur arc doré / leur reflet.
    func test_options_installedAnimatedPacks_areOffered() {
        let rings = ProfileDecorOptions.rings(installed: [
            ShopPack(slug: "contours-essentiels", name: "x", installed: true),
            ShopPack(slug: "contours-animes", name: "x", installed: true),
        ])
        XCTAssertEqual(rings.map(\.pack), ["contours-essentiels", "contours-animes"])
        XCTAssertEqual(rings.last?.items.first?.ref, ProfileDecorRef(pack: "contours-animes", item: "halo-or"))
        let banners = ProfileDecorOptions.banners(installed: [ShopPack(slug: "bannieres-animees", name: "x", installed: true)])
        XCTAssertEqual(banners.first?.items.first?.ref, ProfileDecorRef(pack: "bannieres-animees", item: "aurore-vive"))
    }

    func test_flattened_firstTileOfEachPackKeepsItsOwnUniqueId() {
        let rings = ProfileDecorOptions.rings(installed: nil)
        let entries = ProfileDecorOptions.flattened(rings)

        XCTAssertGreaterThan(rings.count, 1)
        XCTAssertEqual(Set(entries.map(\.id)).count, entries.count)
        XCTAssertEqual(entries.count, rings.reduce(0) { $0 + $1.items.count })
        XCTAssertTrue(entries.contains { $0.ref == ProfileDecorRef(pack: "contours-animes", item: "halo-or") })
    }

    /// Le fil RÉEL de `GET /packs/{avatar-ring,banner}/installed` (staging, 2026-10-16, champs servis
    /// conservés) se décode comme le transport le décode, et la feuille propose les packs animés (#10719).
    func test_installedWire_staging_offersTheAnimatedPacksInTheFlatGrid() throws {
        func served(_ domain: String, _ packs: [(slug: String, removable: Bool)]) -> String {
            let items = packs.map { p in
                #"{"slug":"\#(p.slug)","name":"\#(p.slug)","author":"Meeshy","builtin":true,"status":"approved","itemCount":1,"#
                + #""coverUrl":"/api/v1/pack-assets/a0040abf0d734e87.webp","installed":true,"installCount":0,"domain":"\#(domain)","#
                + #""origin":"builtin","version":1,"downloadBytes":{"story":328,"square":null},"removable":\#(p.removable),"#
                + #""names":{"en":{"name":"Animated","description":"A golden arc."}},"preview":null,"#
                + #""usage":{"kind":"free","surfaces":["avatar"]},"price":null,"owned":true,"contractSchema":1,"#
                + #""contract":{"src":"b9b7392e7d283e2a.json","bytes":328,"sha256":"b9b7"}}"#
            }
            return #"{"success":true,"data":["# + items.joined(separator: ",") + "]}"
        }
        let rings = try decode(APIResponse<LossyDecodableArray<ShopPack>>.self, served("avatar-ring", [
            ("contours-essentiels", false), ("contours-animes", true)
        ])).data.elements
        let banners = try decode(APIResponse<LossyDecodableArray<ShopPack>>.self, served("banner", [
            ("bannieres-essentielles", false), ("bannieres-animees", true)
        ])).data.elements

        let ringIds = ProfileDecorOptions.flattened(ProfileDecorOptions.rings(installed: rings)).map(\.id)
        let bannerIds = ProfileDecorOptions.flattened(ProfileDecorOptions.banners(installed: banners)).map(\.id)

        XCTAssertEqual(rings.map(\.slug), ["contours-essentiels", "contours-animes"])
        XCTAssertTrue(ringIds.contains("contours-animes/halo-or"))
        XCTAssertTrue(bannerIds.contains("bannieres-animees/aurore-vive"))
        XCTAssertEqual(Set(ringIds).count, ringIds.count)
        XCTAssertEqual(Set(bannerIds).count, bannerIds.count)
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

    // MARK: Ce que la bannière peint (#10933) — la photo gagne toujours

    func test_bannerPaint_aPhotoAndAnEquippedDesign_paintsThePhoto() {
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: "https://cdn/b.jpg", decor: item("bannieres-essentielles", "aurore")), .photo("https://cdn/b.jpg"))
    }

    func test_bannerPaint_aDesignWithoutPhoto_paintsTheDesign() {
        let design = ProfileDecorResolver.banner(item("bannieres-essentielles", "aurore"))
        XCTAssertNotNil(design)
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: nil, decor: item("bannieres-essentielles", "aurore")), design.map(ProfileBannerPaint.design))
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: "", decor: item("bannieres-essentielles", "aurore")), design.map(ProfileBannerPaint.design), "une adresse vide n'est pas une photo")
    }

    func test_bannerPaint_neitherPhotoNorDesign_paintsTheDefault() {
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: nil, decor: nil), .plain)
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: nil, decor: item("bannieres-essentielles", "inconnu")), .plain)
    }
}
