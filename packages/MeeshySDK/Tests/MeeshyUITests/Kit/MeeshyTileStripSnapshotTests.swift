import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la bande de vignettes (K19) : chaque état au repos, en
/// sombre et pressé, puis les planches `grande-police` et `rtl`.
final class MeeshyTileStripSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K19"), "l'entrée K19 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
