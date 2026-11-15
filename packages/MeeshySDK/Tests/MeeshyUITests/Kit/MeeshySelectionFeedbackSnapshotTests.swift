import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de K23 : chaque état au repos, en sombre, puis les planches
/// `grande-police` et `rtl`. Le halo et les repères ne portent aucun verre :
/// une seule passe suffit, sans forçage du dessiné. Aucun état ne se touche.
final class MeeshySelectionFeedbackSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K23"), "l'entrée K23 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
