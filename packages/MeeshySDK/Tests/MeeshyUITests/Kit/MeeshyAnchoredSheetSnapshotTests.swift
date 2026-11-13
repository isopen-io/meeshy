import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la feuille ancrée (K15) : chaque état du catalogue en clair et en
/// sombre, pressé pour ceux qui se touchent, puis les planches `grande-police` et `rtl`
/// (titre au bord de début, ✕ au bord de fin). Chacun cadre la feuille sous un bloc d'hôte
/// réduit.
final class MeeshyAnchoredSheetSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K15"), "l'entrée K15 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
