import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la ligne de liste (K06) : chaque état au repos, en clair et en
/// sombre, pressé pour ceux qui se touchent, et les planches `grande-police` et `rtl`.
final class MeeshyToggleRowSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        SnapshotHelpers.assertKitComponent(try Self.entry())
    }

    private static func entry() throws -> MeeshyKitCatalogEntry {
        try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K06"), "l'entrée K06 doit être livrée")
    }
}
