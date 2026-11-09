import XCTest
@testable import MeeshyUI

final class MeeshyKitCatalogEntryTests: XCTestCase {

    private func entry(_ states: [MeeshyKitCatalogState]) -> MeeshyKitCatalogEntry {
        MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton", states: states)
    }

    func test_uneEntreeSansEtat_neSeLivrePas() {
        XCTAssertFalse(entry([]).isDelivered)
        XCTAssertEqual(entry([]).tiles, [])
    }

    func test_unEtatDefaut_estSombreEtNeSeTouchePas() {
        let state = MeeshyKitCatalogState(id: "repos")
        XCTAssertEqual(state.backdrop, .dark)
        XCTAssertFalse(state.isTouchable)
        XCTAssertNil(state.boardView)
    }

    func test_laTuilePresseN_existeQuePourUnEtatQuiSeTouche() {
        let tiles = entry([
            MeeshyKitCatalogState(id: "repos", boardView: "R1"),
            MeeshyKitCatalogState(id: "actif", boardView: "R3", isTouchable: true),
        ]).tiles
        XCTAssertEqual(tiles.map(\.id), ["repos", "actif", "actif-presse"])
        XCTAssertEqual(tiles.map(\.isPressed), [false, false, true])
    }

    func test_laTuilePresse_suitLaTuileVivante_dansLOrdreDeLaFiche() {
        let tiles = entry([
            MeeshyKitCatalogState(id: "a", isTouchable: true),
            MeeshyKitCatalogState(id: "b", isTouchable: true),
        ]).tiles
        XCTAssertEqual(tiles.map(\.id), ["a", "a-presse", "b", "b-presse"])
    }

    func test_leNomAccessible_ditLaCleEtLeNom() {
        XCTAssertEqual(entry([]).accessibilityName, "K02 MeeshyGlassButton")
    }

    func test_leCatalogue_vingtCinqEntrees_clesDansLOrdre() {
        XCTAssertEqual(MeeshyKitCatalog.entries.count, 25)
        XCTAssertEqual(MeeshyKitCatalog.entries.map(\.key), (1...25).map { String(format: "K%02d", $0) })
    }

    func test_laListe_nAfficheQueLesEntreesNonVides() {
        XCTAssertTrue(MeeshyKitCatalog.listedEntries.allSatisfy(\.isDelivered))
        XCTAssertEqual(MeeshyKitCatalog.listedEntries, MeeshyKitCatalog.entries.filter { !$0.states.isEmpty })
    }

    func test_uneCleInconnueOuNonLivree_nOuvreRien() {
        XCTAssertNil(MeeshyKitCatalog.listedEntry(matching: "K99"))
        XCTAssertNil(MeeshyKitCatalog.listedEntry(matching: ""))
    }

    func test_lesVariantes_unEtatQuiSeTouche_aSaVarianteStatique() {
        XCTAssertEqual(SnapshotHelpers.kitVariants(for: MeeshyKitCatalogState(id: "a", isTouchable: true)), [.clair, .sombre, .presse])
        XCTAssertEqual(SnapshotHelpers.kitVariants(for: MeeshyKitCatalogState(id: "a")), [.clair, .sombre])
    }

    func test_lesNomsDImage_sontLesMemesPartout() {
        XCTAssertEqual(SnapshotHelpers.kitImageStem(id: "actif", variant: .presse), "actif.presse")
        XCTAssertEqual(SnapshotHelpers.kitImageStem(id: SnapshotHelpers.kitBoardID, variant: .grandePolice), "planche.grande-police")
    }
}
