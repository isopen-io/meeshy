import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la rangée de vignettes (K20) : chaque état au repos, en
/// sombre et pressé, puis les planches `grande-police` et `rtl`.
final class MeeshyThumbnailRowSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K20"), "l'entrée K20 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
