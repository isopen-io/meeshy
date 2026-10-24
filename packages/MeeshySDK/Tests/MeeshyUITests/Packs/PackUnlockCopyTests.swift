import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **La vitrine dit ce qui reste à débloquer** (S21 #11276, lot IC28 #11306) : une rangée de pack à
/// gagner porte sa ligne (rang et Gloire manquante, trophée, saison, fenêtre) et son verrou ; une
/// rangée libre ou déjà gagnée ne dit rien de plus qu'avant.
@MainActor
final class PackUnlockCopyTests: XCTestCase {

    private func shopPack(_ json: String) throws -> ShopPack {
        try JSONDecoder().decode(ShopPack.self, from: Data(json.utf8))
    }

    private let rank = #"{"slug":"contours-rituel","name":"Rituel","owned":false,"requirementPreview":{"met":false,"reward":{"kind":"rank","rank":"voix","currentRank":"echo","requirement":{"current":2500,"required":6000,"missing":3500,"met":false}},"window":null}}"#

    func test_row_aPackToEarnCarriesItsLockAndTheRankNamedByTheApp() throws {
        let row = UnifiedShopView.row(try shopPack(rank), language: "en", rankName: { _ in "Voice" })

        XCTAssertTrue(row.locked)
        let line = try XCTUnwrap(row.unlockText)
        XCTAssertTrue(line.contains("Voice"), line)
        XCTAssertTrue(line.contains("3,500"), line)
    }

    func test_row_withoutAnAppNameForTheRank_stillSaysTheGloryMissing() throws {
        let row = UnifiedShopView.row(try shopPack(rank), language: "en")

        let line = try XCTUnwrap(row.unlockText)
        XCTAssertTrue(line.contains("3,500"), line)
    }

    func test_row_theCountFollowsTheLanguageOfTheReader() throws {
        let row = UnifiedShopView.row(try shopPack(rank), language: "de")

        XCTAssertTrue(try XCTUnwrap(row.unlockText).contains("3.500"))
    }

    func test_row_aFreeOrAlreadyWonPackSaysNothingMoreThanBefore() throws {
        let free = UnifiedShopView.row(try shopPack(#"{"slug":"mee","name":"Mee"}"#))
        let won = UnifiedShopView.row(try shopPack(#"{"slug":"a","name":"A","owned":true}"#))

        XCTAssertFalse(free.locked)
        XCTAssertNil(free.unlockText)
        XCTAssertFalse(won.locked)
        XCTAssertNil(won.unlockText)
    }

    func test_row_anUnlockedPackWithAnOpenWindowIsNotLockedButSaysWhenItEnds() throws {
        let row = UnifiedShopView.row(try shopPack(#"{"slug":"a","name":"A","price":40,"owned":false,"requirementPreview":{"met":true,"reward":null,"window":{"state":"open","endsAt":"2026-12-01T00:00:00Z"}}}"#), language: "en")

        XCTAssertFalse(row.locked)
        XCTAssertNotNil(row.unlockText)
        XCTAssertTrue(row.needsPurchase, "le geste reste « Acheter »")
    }

    func test_showsLocked_onlyWhileTheLockedPackIsNotInstalled() {
        XCTAssertTrue(PackShopView.showsLocked(PackRow(slug: "a", name: "A", installed: false, locked: true)))
        XCTAssertFalse(PackShopView.showsLocked(PackRow(slug: "a", name: "A", installed: true, locked: true)))
        XCTAssertFalse(PackShopView.showsLocked(PackRow(slug: "a", name: "A", installed: false)))
    }
}
