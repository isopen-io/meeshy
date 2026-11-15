import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du curseur d'un réglage continu (K05) : chaque état au
/// repos, en sombre et pouce tenu, puis les planches `grande-police` et `rtl`.
/// K05 ne porte aucun verre : une seule passe suffit, sans forçage du dessiné.
final class MeeshyLabeledSliderSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K05"), "l'entrée K05 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
