import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un onglet par pack installé, puis la Boutique** (#9190, suite iOS de
/// #9141) : Favoris · Mee · Meo · Mee & Meo · les packs des tiers ·
/// Personnalisés · Boutique — Recherche, Récents et Smileys gardant leur place.
///
/// Ce que ces témoins gardent est la RÈGLE des onglets, pure : loi 4 (un
/// onglet n'existe que s'il a un effet) et l'ordre de la feuille web.
@MainActor
final class StickerSheetPageTests: XCTestCase {

    private func pack(_ slug: String, builtin: Bool = false, items: [StickerPackItem] = []) -> StickerPack {
        StickerPack(slug: slug, name: slug, isBuiltin: builtin, installed: true, items: items)
    }

    private let still = StickerPackItem(key: "a", title: "A", emoji: "✨", kind: .still,
                                        mimeType: "image/png", fileUrl: "/f/a.png", width: 512, height: 512)
    private let instant = StickerPackItem(key: "b", title: "B", emoji: "✍️", kind: .instant,
                                          mimeType: "image/png", fileUrl: "/f/b.png", width: 512, height: 512)

    // MARK: - Sans hôte qui envoie Mee ni pack

    func test_withoutAnyPackHost_theSheetKeepsItsFixedTabs() {
        let pages = StickerSheetPage.offered(hasMee: false, installed: nil, hasPackPick: false, hasShop: false)
        XCTAssertEqual(pages, [.fixed(.search), .fixed(.favorites), .fixed(.recents),
                               .fixed(.custom), .fixed(.smileys)])
    }

    // MARK: - Les packs intégrés

    /// Avant que la passerelle ait répondu (`installed == nil`), les trois packs
    /// intégrés sont installés par défaut — la feuille ne les cache pas le
    /// temps d'un aller-retour (cache-first).
    func test_unknownInstallations_showTheThreeBuiltinPacks_installedByDefault() {
        let pages = StickerSheetPage.offered(hasMee: true, installed: nil, hasPackPick: true, hasShop: true)
        XCTAssertEqual(pages, [.fixed(.search), .fixed(.favorites), .fixed(.recents),
                               .pack("mee"), .pack("meo"), .pack("mee-et-meo"),
                               .fixed(.custom), .fixed(.smileys), .shop])
    }

    /// Un pack intégré RETIRÉ n'a plus d'onglet ; l'ordre des intégrés reste le
    /// leur, quel que soit l'ordre du serveur.
    func test_aRemovedBuiltinPack_losesItsTab_andBuiltinsKeepTheirOrder() {
        let installed = [pack("mee-et-meo", builtin: true), pack("mee", builtin: true)]
        let pages = StickerSheetPage.offered(hasMee: true, installed: installed, hasPackPick: true, hasShop: true)
        XCTAssertEqual(pages.filter(\.isPack), [.pack("mee"), .pack("mee-et-meo")])
    }

    /// Sans hôte qui sait poser un film, aucun pack intégré n'a d'onglet.
    func test_builtinPacks_needAHostThatSendsMee() {
        let pages = StickerSheetPage.offered(hasMee: false, installed: [pack("mee", builtin: true)],
                                             hasPackPick: true, hasShop: true)
        XCTAssertFalse(pages.contains(.pack("mee")))
    }

    // MARK: - Les packs des tiers

    func test_thirdPartyPacks_followTheBuiltins_inServerOrder() {
        let installed = [pack("chats", items: [still]), pack("mee", builtin: true), pack("oiseaux", items: [still])]
        let pages = StickerSheetPage.offered(hasMee: true, installed: installed, hasPackPick: true, hasShop: true)
        XCTAssertEqual(pages.filter(\.isPack), [.pack("mee"), .pack("chats"), .pack("oiseaux")])
    }

    /// Un pack de tiers dont iOS ne sait rien poser (que des Instants) n'a pas
    /// d'onglet vide ; sans hôte qui pose un sticker de pack, aucun n'en a.
    func test_aThirdPartyPack_needsSomethingIOSCanSend_andAHostThatSendsIt() {
        let installed = [pack("instants", items: [instant]), pack("chats", items: [still])]
        XCTAssertEqual(StickerSheetPage.offered(hasMee: true, installed: installed, hasPackPick: true, hasShop: false)
                        .filter(\.isPack), [.pack("chats")])
        XCTAssertEqual(StickerSheetPage.offered(hasMee: false, installed: installed, hasPackPick: false, hasShop: false)
                        .filter(\.isPack), [])
    }

    // MARK: - La Boutique

    func test_theShop_isLast_andOnlyWhenTheHostServesIt() {
        XCTAssertEqual(StickerSheetPage.offered(hasMee: true, installed: [], hasPackPick: true, hasShop: true).last, .shop)
        XCTAssertFalse(StickerSheetPage.offered(hasMee: true, installed: [], hasPackPick: true, hasShop: false).contains(.shop))
    }

    // MARK: - L'onglet choisi survit à la désinstallation

    /// Retirer le pack de l'onglet ouvert depuis la Boutique d'une AUTRE feuille
    /// ne laisse pas la feuille sur un onglet disparu : elle revient au premier.
    func test_aVanishedPage_fallsBackToTheFirstOffered() {
        let offered: [StickerSheetPage] = [.fixed(.search), .pack("mee"), .shop]
        XCTAssertEqual(StickerSheetPage.resolved(.pack("chats"), among: offered), .fixed(.search))
        XCTAssertEqual(StickerSheetPage.resolved(.pack("mee"), among: offered), .pack("mee"))
        XCTAssertEqual(StickerSheetPage.resolved(.shop, among: []), .fixed(.search))
    }

    // MARK: - Ce qu'un pack intégré montre

    func test_eachBuiltinPack_showsItsOwnCast() {
        XCTAssertEqual(MeeStickerCatalog.cast(forPackSlug: "mee"), .mee)
        XCTAssertEqual(MeeStickerCatalog.cast(forPackSlug: "meo"), .meo)
        XCTAssertEqual(MeeStickerCatalog.cast(forPackSlug: "mee-et-meo"), .duo)
        XCTAssertNil(MeeStickerCatalog.cast(forPackSlug: "chats"))
    }

    /// La planche d'un pack intégré ne montre que SA distribution, rangée par
    /// intention, sans section vide.
    func test_aBuiltinPackBoard_holdsOnlyItsCast_byIntent() {
        for cast in [MeeSticker.Character.mee, .meo, .duo] {
            let rows = MeeStickerCatalog.rows(columns: 3, cast: cast)
            let stickers = rows.flatMap { row -> [MeeSticker] in
                if case .stickers(let s) = row { return s }
                return []
            }
            XCTAssertEqual(stickers.count, MeeStickerCatalog.stickers(of: cast).count)
            XCTAssertTrue(stickers.allSatisfy { $0.tab == cast })
            for (index, row) in rows.enumerated() {
                guard case .title = row else { continue }
                XCTAssertTrue(rows.indices.contains(index + 1), "un titre n'est jamais le dernier")
                if case .title = rows[index + 1] { XCTFail("\(cast) : une intention vide a laissé son titre") }
            }
        }
    }
}
