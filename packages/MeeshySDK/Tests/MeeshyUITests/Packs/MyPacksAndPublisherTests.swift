import XCTest
import os
@testable import MeeshyUI
import MeeshySDK

// MARK: - Mes packs, rangés ; l'éditeur et tout son catalogue (#16433, #16315)

private let lumiere = PackPublisherRef(slug: "studio-lumiere", name: "Studio Lumière", verified: true, official: false)
private let meeshy = PackPublisherRef(slug: "meeshy", name: "Meeshy", verified: true, official: true)

private func pack(_ slug: String, installed: Bool = true, publisher: PackPublisherRef? = nil, removable: Bool = true) -> ShopPack {
    ShopPack(slug: slug, name: slug.capitalized, installed: installed, removable: removable, publisher: publisher)
}

private func shop(_ sections: [PackDomain: [ShopPack]]) -> PackShopState {
    PackShopState(sections: PackDomain.allCases.compactMap { domain in
        sections[domain].map { PackShopSection(domain: domain, packs: $0) }
    })
}

@MainActor
final class MyPacksTests: XCTestCase {
    func test_myPacks_areTheInstalledOnes_rangedByCategoryInTheShopOrder() {
        let state = shop([
            .wallpaper: [pack("aube"), pack("nuit", installed: false)],
            .sticker: [pack("chats")],
            .avatarRing: [pack("anneaux", installed: false)],
        ])

        let sections = MyPacks.sections(of: state, sort: .name, recency: [:], language: "fr") ?? []

        XCTAssertEqual(sections.map(\.domain), [.sticker, .wallpaper])
        XCTAssertEqual(sections.map { $0.packs.map(\.slug) }, [["chats"], ["aube"]])
    }

    func test_byName_sortsAlphabetically_ignoringCaseAndAccents() {
        let state = shop([.wallpaper: [pack("zebre"), pack("étoile"), pack("Aube")]])

        let sections = MyPacks.sections(of: state, sort: .name, recency: [:], language: "fr") ?? []

        XCTAssertEqual(sections.first?.packs.map(\.slug), ["Aube", "étoile", "zebre"])
    }

    func test_byPublisher_groupsAPublishersPacks_thenByName() {
        let state = shop([.wallpaper: [pack("b", publisher: meeshy), pack("c", publisher: lumiere), pack("a", publisher: meeshy)]])

        let sections = MyPacks.sections(of: state, sort: .publisher, recency: [:], language: "fr") ?? []

        XCTAssertEqual(sections.first?.packs.map(\.slug), ["a", "b", "c"])
    }

    func test_recent_putsTheLastInstalledFirst_andTheUnknownAfterInShopOrder() {
        let state = shop([.wallpaper: [pack("ancien"), pack("milieu"), pack("neuf"), pack("inconnu")]])
        let recency = ["wallpaper/ancien": Date(timeIntervalSince1970: 10),
                       "wallpaper/neuf": Date(timeIntervalSince1970: 30),
                       "wallpaper/milieu": Date(timeIntervalSince1970: 20)]

        let sections = MyPacks.sections(of: state, sort: .recent, recency: recency, language: "fr") ?? []

        XCTAssertEqual(sections.first?.packs.map(\.slug), ["neuf", "milieu", "ancien", "inconnu"])
    }

    func test_anUnreadShop_hasNoSectionsYet_andAnEmptyOneSaysSo() {
        XCTAssertNil(MyPacks.sections(of: PackShopState(), sort: .name, recency: [:], language: "fr"))
        XCTAssertEqual(MyPacks.sections(of: shop([.wallpaper: [pack("x", installed: false)]]), sort: .name, recency: [:], language: "fr"), [])
    }
}

private final class MemoryRecency: PackInstallRecording, Sendable {
    private let installs = OSAllocatedUnfairLock<[String: Date]>(initialState: [:])
    func recordInstall(domain: PackDomain, slug: String, at date: Date) {
        installs.withLock { $0[domain.rawValue + "/" + slug] = date }
    }
    func forget(domain: PackDomain, slug: String) { installs.withLock { $0[domain.rawValue + "/" + slug] = nil } }
    func installDates() -> [String: Date] { installs.withLock { $0 } }
}

private final class InstallingShop: PackShopProviding, Sendable {
    let response: PackShopResponse
    init(_ response: PackShopResponse) { self.response = response }
    func shop(domains: [PackDomain]?) async throws -> PackShopResponse { response }
    func setInstalled(_ installed: Bool, domain: PackDomain, slug: String) async throws -> ShopPack {
        ShopPack(slug: slug, name: slug, installed: installed)
    }
    func purchase(domain: PackDomain, slug: String, requestId: String) async throws -> PackPurchaseResponse {
        throw URLError(.badURL)
    }
}

private struct NoSnapshots: PackShopSnapshotStoring {
    func read(domains: [PackDomain]?) -> CacheResult<PackShopResponse> { .empty }
    func write(_ state: PackShopState, domains: [PackDomain]?) {}
}

@MainActor
final class PackInstallRecencyTests: XCTestCase {
    func test_aConfirmedInstall_isDated_andARemovalForgetsIt() async {
        let recency = MemoryRecency()
        let response = PackShopResponse(sections: [PackShopSection(domain: .wallpaper, packs: [pack("aube", installed: false)])])
        let store = PackShopStore(service: InstallingShop(response), snapshots: NoSnapshots(), recency: recency,
                                  now: { Date(timeIntervalSince1970: 42) })
        await store.load()

        await store.tap(domain: .wallpaper, slug: "aube")
        XCTAssertEqual(recency.installDates(), ["wallpaper/aube": Date(timeIntervalSince1970: 42)])

        await store.tap(domain: .wallpaper, slug: "aube")
        XCTAssertEqual(recency.installDates(), [:])
    }
}

@MainActor
final class PublisherCatalogueTests: XCTestCase {
    func test_aRow_carriesItsPublisher() {
        let row = UnifiedShopView.row(pack("chats", publisher: lumiere))

        XCTAssertEqual(row.publisher, lumiere)
    }

    func test_samePublisher_isEveryOtherPackOfThisPublisher_acrossCategories() {
        let state = shop([
            .wallpaper: [pack("aube", installed: false, publisher: lumiere), pack("nuit", publisher: meeshy)],
            .sticker: [pack("chats", publisher: lumiere)],
            .banner: [pack("ciel", installed: false, publisher: lumiere)],
        ])

        let others = PublisherCatalogue.entries(of: lumiere.slug, in: state, excluding: PackCatalogueEntry(domain: .sticker, slug: "chats"))

        XCTAssertEqual(others.map(\.id), ["wallpaper/aube", "banner/ciel"])
    }

    func test_thePublisherCatalogue_isAllItsPacks_byCategory() {
        let state = shop([
            .wallpaper: [pack("aube", publisher: lumiere), pack("nuit", publisher: meeshy)],
            .sticker: [pack("chats", installed: false, publisher: lumiere)],
        ])

        let sections = PublisherCatalogue.sections(of: lumiere.slug, in: state)

        XCTAssertEqual(sections.map(\.domain), [.sticker, .wallpaper])
        XCTAssertEqual(sections.map { $0.packs.map(\.slug) }, [["chats"], ["aube"]])
    }

    func test_aPackWithoutPublisher_belongsToNoCatalogue() {
        let state = shop([.wallpaper: [pack("orphelin")]])

        XCTAssertTrue(PublisherCatalogue.sections(of: "editeur", in: state).isEmpty)
    }
}
