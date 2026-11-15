import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés des pastilles de couleur (K07) : chaque état du catalogue en
/// clair et en sombre, pressé pour ceux qui se touchent, puis les planches
/// `grande-police` (disques figés) et `rtl` (première couleur au bord de début,
/// estompe au bord de fin, dégradé non reflété).
final class MeeshyColorDotsSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K07"), "l'entrée K07 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
