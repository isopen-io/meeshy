import Combine
import XCTest
@testable import MeeshyUI
import MeeshySDK

// MARK: - La vitrine montre AUSSI ce qui se télécharge, et le dit pendant qu'il arrive (#16268)

private final class StubServedAppearance: ServedAppearanceProviding, @unchecked Sendable {
    private var onDevice: [String: ServedAppearanceContract] = [:]
    private let fetchable: [String: ServedAppearanceContract]
    private(set) var prepared: [String] = []
    private let subject = PassthroughSubject<Void, Never>()

    init(onDevice: [String: ServedAppearanceContract] = [:], fetchable: [String: ServedAppearanceContract] = [:]) {
        self.onDevice = onDevice
        self.fetchable = fetchable
    }

    var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }

    func contract(src: String) -> ServedAppearanceContract? { onDevice[src] }
    func contractSource(domain: PackDomain, slug: String) -> String? {
        onDevice[slug] != nil || fetchable[slug] != nil ? slug : nil
    }
    func load(src: String) async -> ServedAppearanceContract? { onDevice[src] }
    func prepare(domain: PackDomain, installed: [ShopPack]) async {}
    func prepare(domain: PackDomain, slug: String) async -> ServedAppearanceContract? {
        prepared.append(domain.rawValue + "/" + slug)
        onDevice[slug] = fetchable[slug] ?? onDevice[slug]
        return onDevice[slug]
    }
}

private func stickerItem(_ key: String) -> StickerPackItem {
    StickerPackItem(key: key, title: key.capitalized, emoji: "", kind: .still, mimeType: "image/png",
                    fileUrl: "/files/\(key).png", width: 512, height: 512)
}

@MainActor
final class ServedPackElementDesignsTests: XCTestCase {
    private let ring = AvatarRingCatalog.shared.packs[0].rings[0]
    private let wallpaper = AppearanceCatalog.shared.wallpaperPacks[0].designs[0]

    func test_anEmbeddedPack_isPaintedWithoutAnyDownload() {
        let served = StubServedAppearance()
        let designs = ServedPackElementDesigns(served: served, stickerDetail: { _ in throw URLError(.notConnectedToInternet) })
        let pack = AvatarRingCatalog.shared.packs[0]

        XCTAssertEqual(designs.elements(domain: .avatarRing, pack: pack.slug, language: "fr"),
                       EmbeddedPackElementDesigns().elements(domain: .avatarRing, pack: pack.slug, language: "fr"))
    }

    func test_aServedPackWhoseContractIsOnTheDevice_isPaintedLikeTheEmbedded() {
        let served = StubServedAppearance(onDevice: ["anneaux-servis": .avatarRing([ring])])
        let designs = ServedPackElementDesigns(served: served, stickerDetail: { _ in throw URLError(.badURL) })

        let resolution = designs.elements(domain: .avatarRing, pack: "anneaux-servis", language: "fr")

        XCTAssertEqual(resolution, .ready([PackElement(pack: "anneaux-servis", item: ring.key,
                                                       name: AvatarRingCatalog.shared.ringName(ring.key, language: "fr") ?? ring.key,
                                                       art: .avatarRing(ring))]))
    }

    func test_preparingAServedPack_downloadsItsContract_thenPaintsIt() async {
        let served = StubServedAppearance(fetchable: ["fonds-servis": .wallpaper([wallpaper])])
        let designs = ServedPackElementDesigns(served: served, stickerDetail: { _ in throw URLError(.badURL) })
        XCTAssertEqual(designs.elements(domain: .wallpaper, pack: "fonds-servis", language: "fr"), .downloadRequired)

        await designs.prepare(domain: .wallpaper, pack: "fonds-servis")

        XCTAssertEqual(served.prepared, ["wallpaper/fonds-servis"])
        guard case .ready(let elements) = designs.elements(domain: .wallpaper, pack: "fonds-servis", language: "fr") else {
            return XCTFail("le fond servi devait se peindre")
        }
        XCTAssertEqual(elements.map(\.art), [.wallpaper(wallpaper)])
    }

    func test_aContractOfAnotherDomain_isNeverPainted() {
        let served = StubServedAppearance(onDevice: ["piege": .wallpaper([wallpaper])])
        let designs = ServedPackElementDesigns(served: served, stickerDetail: { _ in throw URLError(.badURL) })

        XCTAssertEqual(designs.elements(domain: .banner, pack: "piege", language: "fr"), .downloadRequired)
    }

    func test_aThirdPartyStickerPack_showsItsImages_onceItsDetailIsRead() async {
        let detail = StickerPack(slug: "chats", name: "Chats", items: [stickerItem("miaou"), stickerItem("ronron")])
        let designs = ServedPackElementDesigns(served: StubServedAppearance(), stickerDetail: { _ in detail })

        await designs.prepare(domain: .sticker, pack: "chats")

        guard case .ready(let elements) = designs.elements(domain: .sticker, pack: "chats", language: "fr") else {
            return XCTFail("les stickers du pack devaient se montrer")
        }
        XCTAssertEqual(elements.map(\.item), ["miaou", "ronron"])
        XCTAssertEqual(elements.first?.art, .stickerImage(stickerItem("miaou")))
        XCTAssertNil(elements.first?.equipSide)
    }

    func test_stickerPacksAlreadyRead_needNoDownload() {
        let designs = ServedPackElementDesigns(served: StubServedAppearance(),
                                               stickerDetail: { _ in throw URLError(.badURL) })

        designs.seed(stickerPacks: [StickerPack(slug: "chiens", name: "Chiens", items: [stickerItem("ouaf")])])

        guard case .ready(let elements) = designs.elements(domain: .sticker, pack: "chiens", language: "fr") else {
            return XCTFail("un pack déjà lu se montre sans relire le réseau")
        }
        XCTAssertEqual(elements.map(\.item), ["ouaf"])
    }

    func test_aSceneFrame_isShownButNeverEquippedOnTheProfile() throws {
        let file = try XCTUnwrap(PackAssetFile(name: String(repeating: "a", count: 16) + ".png"))
        let element = PackElement(pack: "or", item: "aube", name: "Aube",
                                  art: .gloryFrame(FrameTile(id: "aube", name: "Aube", usageText: "Rang Or", thumb: file)))

        XCTAssertNil(element.equipSide)
    }
}

// MARK: - Le modèle : un pack qui se télécharge se DIT en chargement, jamais une page vide

@MainActor
private final class StubDesigns: PackElementDesignProviding {
    var resolution: PackElementsResolution = .downloadRequired
    var onPrepare: PackElementsResolution?
    private(set) var prepares: [String] = []
    var gate: CheckedContinuation<Void, Never>?
    var holds = false

    func elements(domain: PackDomain, pack: String, language: String) -> PackElementsResolution { resolution }

    func prepare(domain: PackDomain, pack: String) async {
        prepares.append(pack)
        if holds { await withCheckedContinuation { gate = $0 } }
        if let onPrepare { resolution = onPrepare }
    }
}

private final class NoDecorService: ProfileDecorProviding, @unchecked Sendable {
    func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor { .empty }
}

@MainActor
final class PackShowcaseLoadingTests: XCTestCase {
    private func makeModel(_ designs: StubDesigns) -> PackShowcaseModel {
        PackShowcaseModel(designs: designs,
                          equipment: PackDecorEquipment(service: NoDecorService(), currentDecor: { nil }, publish: { _ in }))
    }

    func test_aPackNotYetPrepared_readsAsLoading_notAsADownloadToDo() {
        let model = makeModel(StubDesigns())

        XCTAssertEqual(model.elements(domain: .wallpaper, pack: "servi"), .loading)
    }

    func test_aPackWhoseDownloadFailed_saysSo() async {
        let designs = StubDesigns()
        let model = makeModel(designs)

        await model.prepare(domain: .wallpaper, pack: "servi")

        XCTAssertEqual(model.elements(domain: .wallpaper, pack: "servi"), .downloadRequired)
    }

    func test_preparing_paintsThePackOnceArrived_andAsksOnlyOnce() async {
        let designs = StubDesigns()
        let element = PackElement(pack: "servi", item: "a", name: "A",
                                  art: .wallpaper(AppearanceCatalog.shared.wallpaperPacks[0].designs[0]))
        designs.onPrepare = .ready([element])
        let model = makeModel(designs)

        await model.prepare(domain: .wallpaper, pack: "servi")
        await model.prepare(domain: .wallpaper, pack: "servi")

        XCTAssertEqual(model.elements(domain: .wallpaper, pack: "servi"), .ready([element]))
        XCTAssertEqual(designs.prepares, ["servi"])
    }

    func test_aPackAlreadyPaintable_isNeverDownloaded() async {
        let designs = StubDesigns()
        designs.resolution = .ready([])
        let model = makeModel(designs)

        await model.prepare(domain: .wallpaper, pack: "embarque")

        XCTAssertTrue(designs.prepares.isEmpty)
    }

    func test_whileTheDownloadRuns_thePackStaysLoading() async {
        let designs = StubDesigns()
        designs.holds = true
        let model = makeModel(designs)

        let running = Task { await model.prepare(domain: .wallpaper, pack: "servi") }
        while designs.gate == nil { await Task.yield() }

        XCTAssertEqual(model.elements(domain: .wallpaper, pack: "servi"), .loading)
        designs.gate?.resume()
        await running.value
        XCTAssertEqual(model.elements(domain: .wallpaper, pack: "servi"), .downloadRequired)
    }

    func test_equippingAServedRing_carriesItsContractSoItPaintsAtOnce() async throws {
        let ring = AvatarRingCatalog.shared.packs[0].rings[0]
        let element = PackElement(pack: "anneaux-servis", item: ring.key, name: "R", art: .avatarRing(ring))
        var published: [ServedProfileDecor] = []
        let model = PackShowcaseModel(
            designs: StubDesigns(),
            equipment: PackDecorEquipment(
                service: NoDecorService(), currentDecor: { nil }, publish: { published.append($0) },
                item: { ref, _ in ServedProfileDecorItem(pack: ref.pack, item: ref.item, origin: .official, contract: "abc.json") }
            )
        )

        await model.equip(element)

        XCTAssertEqual(published.first?.avatarRing?.contract, "abc.json")
        XCTAssertEqual(published.first?.avatarRing?.origin, .official)
    }
}
