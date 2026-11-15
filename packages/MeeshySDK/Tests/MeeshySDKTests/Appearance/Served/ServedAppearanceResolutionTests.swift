import XCTest
@testable import MeeshySDK

/// #16264 — un pack installé NON embarqué se propose et se peint comme l'embarqué : mêmes modèles,
/// mêmes types (`AppearanceDesign`, `AvatarRingDesign`, `BannerFrameDesign`), donc mêmes peintres.
final class ServedAppearanceResolutionTests: XCTestCase {

    private typealias F = ServedAppearanceFixtures

    private func preparedStore(domain: PackDomain, slug: String, contract: F.Contract) async -> ServedAppearanceStore {
        let bytes = FakeContractBytes(network: [contract.src: contract.data])
        let details = FakePackDetails(["\(domain.rawValue)/\(slug)": F.detail(slug, contract: contract)])
        let store = ServedAppearanceStore(bytes: bytes, detail: { try await details.fetch(domain: $0, slug: $1) }, defaults: F.defaults())
        await store.prepare(domain: domain, installed: [F.installed(slug)])
        return store
    }

    private func emptyStore() -> ServedAppearanceStore {
        ServedAppearanceStore(bytes: FakeContractBytes(), detail: { _, _ in throw URLError(.notConnectedToInternet) }, defaults: F.defaults())
    }

    // MARK: Le sélecteur de fonds

    func test_wallpaperPicker_offersAnInstalledServedPack_afterTheEmbeddedOnes() async {
        let served = await preparedStore(domain: .wallpaper, slug: "fonds-servis", contract: F.wallpaper)
        let packs = WallpaperPackOptions.packs(installed: [F.installed("essentiels", builtin: true), F.installed("fonds-servis")], served: served)
        XCTAssertEqual(packs.map(\.slug), ["essentiels", "fonds-servis"])
        XCTAssertEqual(packs.last?.designs.count, 4)
        XCTAssertGreaterThan(packs.last?.order ?? 0, packs.first?.order ?? 0)
    }

    func test_wallpaperPicker_leavesOutAServedPackWhoseContractIsNotLoaded() {
        let packs = WallpaperPackOptions.packs(installed: [F.installed("fonds-servis")], served: emptyStore())
        XCTAssertTrue(packs.isEmpty)
    }

    func test_wallpaperPicker_neverOffersAServedPackThatIsNoLongerInstalled() async {
        let served = await preparedStore(domain: .wallpaper, slug: "fonds-servis", contract: F.wallpaper)
        XCTAssertTrue(WallpaperPackOptions.packs(installed: [F.installed("fonds-servis", installed: false)], served: served).isEmpty)
        XCTAssertFalse(WallpaperPackOptions.packs(installed: nil, served: served).contains { $0.slug == "fonds-servis" })
    }

    // MARK: Le sélecteur du décor de profil

    func test_profileDecorOptions_offerServedRingsBannersAndFrames() async {
        let rings = await preparedStore(domain: .avatarRing, slug: "contours-servis", contract: F.ring)
        let banners = await preparedStore(domain: .banner, slug: "bannieres-servies", contract: F.banner)
        let frames = await preparedStore(domain: .bannerFrame, slug: "cadres-servis", contract: F.frame)
        XCTAssertEqual(ProfileDecorOptions.rings(installed: [F.installed("contours-servis")], served: rings).map(\.pack), ["contours-servis"])
        XCTAssertEqual(ProfileDecorOptions.banners(installed: [F.installed("bannieres-servies")], served: banners).first?.items.count, 3)
        XCTAssertEqual(ProfileDecorOptions.bannerFrames(installed: [F.installed("cadres-servis")], served: frames).first?.items.map(\.ref),
                       [ProfileDecorRef(pack: "cadres-servis", item: "grec"), ProfileDecorRef(pack: "cadres-servis", item: "grec-anime")])
    }

    func test_profileDecorOptions_neverOfferAServedPackThatIsLockedOrUnpaid() async {
        let rings = await preparedStore(domain: .avatarRing, slug: "contours-servis", contract: F.ring)
        XCTAssertTrue(ProfileDecorOptions.rings(installed: [F.installed("contours-servis", owned: false)], served: rings).isEmpty)
    }

    // MARK: Le décor servi (le mien ou celui d'autrui)

    func test_resolver_paintsAServedRingBannerAndFrame_fromTheirContract() async {
        let ring = F.ring
        let banner = F.banner
        let frame = F.frame
        let bytes = FakeContractBytes(disk: [ring.src: ring.data, banner.src: banner.data, frame.src: frame.data])
        let served = ServedAppearanceStore(bytes: bytes, detail: { _, _ in throw URLError(.notConnectedToInternet) }, defaults: F.defaults())
        let bannerKey = ServedAppearanceContract(data: banner.data)?.appearanceDesigns.first?.key ?? ""

        let wornRing = ServedProfileDecorItem(pack: "contours-servis", item: "grec-anime", origin: .official, contract: ring.src)
        let wornBanner = ServedProfileDecorItem(pack: "bannieres-servies", item: bannerKey, origin: .community, contract: banner.src)
        let wornFrame = ServedProfileDecorItem(pack: "cadres-servis", item: "grec", origin: .official, contract: frame.src)

        XCTAssertEqual(ProfileDecorResolver.ring(wornRing, served: served), AvatarRingCatalog.shared.ring(pack: "contours-grec", item: "grec-anime"))
        XCTAssertEqual(ProfileDecorResolver.banner(wornBanner, served: served)?.key, bannerKey)
        XCTAssertEqual(ProfileDecorResolver.bannerFrame(wornFrame, served: served), BannerFrameCatalog.shared.frame(pack: "cadres-grec", item: "grec"))
        XCTAssertEqual(ProfileDecorResolver.bannerPaint(photo: nil, decor: wornBanner, served: served),
                       ProfileBannerPaint.design(ServedAppearanceContract(data: banner.data)!.appearanceDesigns[0]))
        XCTAssertTrue(bytes.fetches.isEmpty, "le résolveur ne touche jamais le réseau")
    }

    func test_resolver_failsClosed_onAContractOfAnotherSideOrAnUnknownItem() {
        let ring = F.ring
        let served = ServedAppearanceStore(bytes: FakeContractBytes(disk: [ring.src: ring.data]),
                                           detail: { _, _ in throw URLError(.notConnectedToInternet) }, defaults: F.defaults())
        XCTAssertNil(ProfileDecorResolver.bannerFrame(ServedProfileDecorItem(pack: "p", item: "grec", origin: .official, contract: ring.src), served: served))
        XCTAssertNil(ProfileDecorResolver.ring(ServedProfileDecorItem(pack: "p", item: "inconnu", origin: .official, contract: ring.src), served: served))
        XCTAssertNil(ProfileDecorResolver.ring(ServedProfileDecorItem(pack: "x", item: "y", origin: .official, contract: "0123456789abcdef.json"), served: served))
    }

    func test_resolver_fallsBackOnTheEmbeddedCopy_whileAServedContractIsNotYetOnTheDevice() {
        let item = ServedProfileDecorItem(pack: "cadres-celte", item: "celte", origin: .official, contract: "0123456789abcdef.json")
        XCTAssertEqual(ProfileDecorResolver.bannerFrame(item, served: emptyStore())?.key, "celte")
    }
}
