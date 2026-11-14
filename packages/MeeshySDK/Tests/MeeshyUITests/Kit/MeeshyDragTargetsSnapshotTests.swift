import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de K25 : chaque état au repos, en clair et en sombre, puis
/// les planches `grande-police` et `rtl`. Aucun état ne se touche : le geste
/// se juge au témoin de comportement, l'image fige l'état résolu.
final class MeeshyDragTargetsSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_clair_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K25"), "l'entrée K25 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
