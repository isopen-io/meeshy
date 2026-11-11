import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la rangée de puces (K04) : chaque état au repos, en
/// sombre et pressé, puis les planches `grande-police` et `rtl`.
final class MeeshyChipRowSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K04"), "l'entrée K04 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
