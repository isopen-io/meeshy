import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la piste de coupe (K21) : chaque état au repos, en sombre
/// et poignée tenue, puis les planches `grande-police` et `rtl`. K21 ne porte
/// aucun verre : une seule passe suffit, sans forçage du dessiné.
final class MeeshyTrimTrackSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K21"), "l'entrée K21 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
