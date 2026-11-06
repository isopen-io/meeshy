import XCTest
import os
@testable import MeeshyUI
import MeeshySDK

// MARK: - La boutique montre chaque décoration en plein écran (#16268)

@MainActor
final class EmbeddedPackElementDesignsTests: XCTestCase {
    private let designs = EmbeddedPackElementDesigns()

    private func ready(_ resolution: PackElementsResolution, file: StaticString = #filePath, line: UInt = #line) -> [PackElement] {
        guard case .ready(let elements) = resolution else {
            XCTFail("attendu .ready, reçu \(resolution)", file: file, line: line)
            return []
        }
        return elements
    }

    func test_elements_ofAnEmbeddedWallpaperPack_areItsDesignsInOrder() {
        let pack = AppearanceCatalog.shared.wallpaperPacks[0]

        let elements = ready(designs.elements(domain: .wallpaper, pack: pack.slug, language: "fr"))

        XCTAssertEqual(elements.map(\.item), pack.designs.map(\.key))
        XCTAssertEqual(elements.first?.art, .wallpaper(pack.designs[0]))
        XCTAssertNil(elements.first?.equipSide)
    }

    func test_elements_ofAnEmbeddedRingPack_equipTheAvatarRing() {
        let pack = AvatarRingCatalog.shared.packs[0]

        let elements = ready(designs.elements(domain: .avatarRing, pack: pack.slug, language: "en"))

        XCTAssertEqual(elements.count, pack.rings.count)
        XCTAssertEqual(elements.first?.art, .avatarRing(pack.rings[0]))
        XCTAssertEqual(elements.first?.equipSide, .avatarRing)
        XCTAssertEqual(elements.first?.name, AvatarRingCatalog.shared.ringName(pack.rings[0].key, language: "en"))
    }

    func test_elements_ofEmbeddedBannerAndFramePacks_equipTheirSide() {
        let banner = AppearanceCatalog.shared.bannerPacks[0]
        let frame = BannerFrameCatalog.shared.framePacks[0]

        let banners = ready(designs.elements(domain: .banner, pack: banner.slug, language: "fr"))
        let frames = ready(designs.elements(domain: .bannerFrame, pack: frame.slug, language: "fr"))

        XCTAssertEqual(banners.first?.equipSide, .banner)
        XCTAssertEqual(banners.first?.art, .banner(banner.designs[0]))
        XCTAssertEqual(frames.first?.equipSide, .bannerFrame)
        XCTAssertEqual(frames.count, frame.frames.count)
    }

    func test_elements_ofTheMeeStickerPack_areItsFilms() {
        let elements = ready(designs.elements(domain: .sticker, pack: "mee", language: "fr"))

        XCTAssertEqual(elements.count, MeeStickerCatalog.stickers(of: .mee).count)
        XCTAssertNil(elements.first?.equipSide)
    }

    func test_elements_ofAPackItCannotPaintYet_requireADownload() {
        XCTAssertEqual(designs.elements(domain: .wallpaper, pack: "pack-servi-inconnu", language: "fr"), .downloadRequired)
        XCTAssertEqual(designs.elements(domain: .gloryFrame, pack: "or", language: "fr"), .downloadRequired)
        XCTAssertEqual(designs.elements(domain: .sticker, pack: "chats", language: "fr"), .downloadRequired)
    }
}

@MainActor
final class PackZoomTests: XCTestCase {
    func test_aFreshZoom_fitsAndAllowsPaging() {
        let zoom = PackZoom()

        XCTAssertEqual(zoom.scale, 1)
        XCTAssertTrue(zoom.allowsPaging)
    }

    func test_pinch_isClampedBetweenOneAndFour() {
        XCTAssertEqual(PackZoom().pinching(6).scale, 4)
        XCTAssertEqual(PackZoom().pinching(0.3).scale, 1)
        XCTAssertEqual(PackZoom().pinching(2.5).scale, 2.5)
    }

    func test_pinch_continuesFromTheScaleOfTheLastGesture() {
        let settled = PackZoom().pinching(2).settled()

        XCTAssertEqual(settled.pinching(1.5).scale, 3)
    }

    func test_doubleTap_togglesBetweenFitAndTwice() {
        XCTAssertEqual(PackZoom().doubleTapped().scale, 2)
        XCTAssertEqual(PackZoom().pinching(3.2).settled().doubleTapped().scale, 1)
    }

    func test_paging_isLockedWhileZoomed() {
        XCTAssertFalse(PackZoom().doubleTapped().allowsPaging)
        XCTAssertTrue(PackZoom().doubleTapped().doubleTapped().allowsPaging)
    }
}

@MainActor
final class PackViewerPagerTests: XCTestCase {
    func test_position_readsNOverN() {
        XCTAssertEqual(PackViewerPager(index: 1, count: 5).position, "2 / 5")
    }

    func test_nextAndPrevious_stayWithinThePack() {
        XCTAssertEqual(PackViewerPager(index: 4, count: 5).next().index, 4)
        XCTAssertEqual(PackViewerPager(index: 0, count: 5).previous().index, 0)
        XCTAssertEqual(PackViewerPager(index: 2, count: 5).next().index, 3)
        XCTAssertEqual(PackViewerPager(index: 2, count: 5).previous().index, 1)
    }

    func test_anOutOfRangeIndex_isClamped() {
        XCTAssertEqual(PackViewerPager(index: 9, count: 3).index, 2)
        XCTAssertEqual(PackViewerPager(index: 3, count: 0).index, 0)
    }
}

@MainActor
final class PackDetailFactsTests: XCTestCase {
    func test_availability_saysBundledInstalledOrToDownload() {
        XCTAssertEqual(PackDetailFacts.availability(PackRow(slug: "a", name: "A", installed: true, bundled: true)), .bundled)
        XCTAssertEqual(PackDetailFacts.availability(PackRow(slug: "a", name: "A", installed: true)), .installed)
        XCTAssertEqual(PackDetailFacts.availability(PackRow(slug: "a", name: "A", installed: false)), .toDownload)
    }

    func test_price_isShownOnlyWhenItExists() {
        XCTAssertNil(PackDetailFacts.priceText(PackRow(slug: "a", name: "A", installed: false)))
        XCTAssertNotNil(PackDetailFacts.priceText(PackRow(slug: "a", name: "A", installed: false, price: 40, owned: false)))
    }

    func test_weight_isShownOnlyWhenKnown() {
        XCTAssertNil(PackDetailFacts.weightText(PackRow(slug: "a", name: "A", installed: false)))
        XCTAssertNotNil(PackDetailFacts.weightText(PackRow(slug: "a", name: "A", installed: false, downloadBytes: 2_400_000)))
    }

    func test_alternatives_areTheOtherPacksOfTheSameShelf() {
        let rows = ["a", "b", "c"].map { PackRow(slug: $0, name: $0, installed: false) }

        XCTAssertEqual(PackDetailFacts.alternatives(to: "b", among: rows).map(\.slug), ["a", "c"])
    }

    func test_equip_isOfferedOnlyForAnInstalledOwnedUnlockedProfileDecor() {
        let ring = PackElement(pack: "p", item: "i", name: "I", art: .avatarRing(AvatarRingCatalog.shared.packs[0].rings[0]))
        let wallpaper = PackElement(pack: "p", item: "i", name: "I", art: .wallpaper(AppearanceCatalog.shared.wallpaperPacks[0].designs[0]))

        XCTAssertTrue(PackDetailFacts.canEquip(ring, in: PackRow(slug: "p", name: "P", installed: true)))
        XCTAssertFalse(PackDetailFacts.canEquip(ring, in: PackRow(slug: "p", name: "P", installed: false)))
        XCTAssertFalse(PackDetailFacts.canEquip(ring, in: PackRow(slug: "p", name: "P", installed: true, locked: true)))
        XCTAssertFalse(PackDetailFacts.canEquip(ring, in: PackRow(slug: "p", name: "P", installed: true, price: 9, owned: false)))
        XCTAssertFalse(PackDetailFacts.canEquip(wallpaper, in: PackRow(slug: "p", name: "P", installed: true)))
    }
}

// MARK: - Le modèle de la vitrine : ouvrir, parcourir, équiper

private final class StubDecorService: ProfileDecorProviding, Sendable {
    let result: Result<ServedProfileDecor, Error>
    private let recorded = OSAllocatedUnfairLock<[ProfileDecorWrite]>(initialState: [])

    var writes: [ProfileDecorWrite] { recorded.withLock { $0 } }

    init(result: Result<ServedProfileDecor, Error>) {
        self.result = result
    }

    func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor {
        recorded.withLock { $0.append(write) }
        return try result.get()
    }
}

private struct Refused: Error {}

@MainActor
final class PackShowcaseModelTests: XCTestCase {
    private let ringPack = AvatarRingCatalog.shared.packs[0]

    private func makeModel(service: StubDecorService, decor: ServedProfileDecor = .empty,
                           published: @escaping (ServedProfileDecor) -> Void = { _ in }) -> PackShowcaseModel {
        PackShowcaseModel(
            equipment: PackDecorEquipment(service: service, currentDecor: { decor }, publish: published)
        )
    }

    private func firstRing(_ model: PackShowcaseModel) -> PackElement? {
        guard case .ready(let elements) = model.elements(domain: .avatarRing, pack: ringPack.slug) else { return nil }
        return elements.first
    }

    func test_touchingTheCover_opensTheFirstElementFullScreen() {
        let model = makeModel(service: StubDecorService(result: .success(.empty)))

        model.openViewer(domain: .avatarRing, slug: ringPack.slug)

        XCTAssertEqual(model.viewer, PackViewerTarget(domain: .avatarRing, slug: ringPack.slug, index: 0))
        XCTAssertNil(model.detail)
    }

    func test_touchingTheRow_opensThePackDetail_andItsGridOpensTheTouchedElement() {
        let model = makeModel(service: StubDecorService(result: .success(.empty)))

        model.openDetail(domain: .avatarRing, slug: ringPack.slug)
        model.openViewer(domain: .avatarRing, slug: ringPack.slug, index: 2)

        XCTAssertEqual(model.detail, PackDetailTarget(domain: .avatarRing, slug: ringPack.slug))
        XCTAssertEqual(model.viewer?.index, 2)
    }

    func test_showingAnAlternative_keepsTheViewerOpenOnItsFirstElement() {
        let model = makeModel(service: StubDecorService(result: .success(.empty)))
        model.openViewer(domain: .avatarRing, slug: ringPack.slug, index: 1)

        model.showAlternative("autre")

        XCTAssertEqual(model.viewer, PackViewerTarget(domain: .avatarRing, slug: "autre", index: 0))
    }

    func test_equip_isAppliedAtOnce_thenConfirmedByTheServer() async throws {
        let ring = try XCTUnwrap(firstRing(makeModel(service: StubDecorService(result: .success(.empty)))))
        let served = ServedProfileDecor(avatarRing: ServedProfileDecorItem(pack: ring.pack, item: ring.item, origin: .builtin))
        let service = StubDecorService(result: .success(served))
        var published: [ServedProfileDecor] = []
        let model = makeModel(service: service, published: { published.append($0) })

        await model.equip(ring)

        XCTAssertEqual(published.first?.avatarRing?.ref, ring.ref)
        XCTAssertEqual(service.writes, [ProfileDecorWrite(side: .avatarRing, choice: ring.ref)])
        XCTAssertTrue(model.isEquipped(ring))
        XCTAssertFalse(model.equipFailed)
    }

    func test_aRefusedEquip_rollsBackToWhatWasWorn() async throws {
        let worn = ServedProfileDecor(avatarRing: ServedProfileDecorItem(pack: "ancien", item: "x", origin: .builtin))
        var published: [ServedProfileDecor] = []
        let model = makeModel(service: StubDecorService(result: .failure(Refused())), decor: worn,
                              published: { published.append($0) })
        let ring = try XCTUnwrap(firstRing(model))

        await model.equip(ring)

        XCTAssertEqual(published.map(\.avatarRing?.pack), [ring.pack, "ancien"])
        XCTAssertFalse(model.isEquipped(ring))
        XCTAssertTrue(model.equipFailed)
    }

    func test_anElementWithoutSide_isNeverEquipped() async {
        let service = StubDecorService(result: .success(.empty))
        let model = makeModel(service: service)
        let wallpaper = PackElement(pack: "p", item: "i", name: "I",
                                    art: .wallpaper(AppearanceCatalog.shared.wallpaperPacks[0].designs[0]))

        await model.equip(wallpaper)

        XCTAssertTrue(service.writes.isEmpty)
    }
}
