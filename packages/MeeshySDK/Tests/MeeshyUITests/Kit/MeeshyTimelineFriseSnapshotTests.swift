import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la frise du temps (K22) : chaque état au repos, en sombre
/// et poignée tenue, puis les planches `grande-police` et `rtl`. K22 ne porte
/// aucun verre : une seule passe suffit, sans forçage du dessiné.
final class MeeshyTimelineFriseSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K22"), "l'entrée K22 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
