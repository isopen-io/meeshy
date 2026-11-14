import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de l'anneau de progression (K09) : chaque état du catalogue
/// en clair et en sombre, puis les planches `grande-police` et `rtl`.
final class MeeshyProgressRingSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_clairEtSombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K09"), "l'entrée K09 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
