import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du cadre d'un mode plein écran (K16) : chaque état du catalogue en clair et en sombre,
/// pressé pour ceux qui se touchent, puis les planches `grande-police` (l'en-tête se réduit) et `rtl`
/// (Quitter au bord de début, la validation au bord de fin).
final class MeeshyModeChromeSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K16"), "l'entrée K16 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
