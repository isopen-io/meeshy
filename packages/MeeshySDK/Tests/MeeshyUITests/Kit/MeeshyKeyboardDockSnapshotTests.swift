import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du dock (K17) : chaque état du catalogue en clair et en sombre, pressé pour ceux qui se
/// touchent, puis les planches `grande-police` (la barre garde sa hauteur, « OK » passe en coche) et `rtl`
/// (les outils au bord de début, « OK » au bord de fin). Le clavier est un bloc neutre de la hauteur retenue.
final class MeeshyKeyboardDockSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K17"), "l'entrée K17 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
