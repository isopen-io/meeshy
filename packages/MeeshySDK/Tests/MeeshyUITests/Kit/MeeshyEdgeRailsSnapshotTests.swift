import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés des rails d'actions des bords (K12) : chaque état du
/// catalogue en clair et en sombre, puis les planches `grande-police` (le mot
/// passe à deux lignes, les glyphes restent figés) et `rtl` (les côtés
/// s'échangent, le glyphe reste du côté de début de sa rangée), puis le verre
/// dessiné (`-dessine`).
final class MeeshyEdgeRailsSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K12"), "l'entrée K12 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    /// Le verre DESSINÉ (sous iOS 26, ou forcé) : les rails n'ont pas d'autre
    /// matière que celle de K01, et leurs deux rendus se photographient.
    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K12"), "l'entrée K12 doit être livrée")
        for state in entry.states {
            for variant in SnapshotHelpers.kitVariants(for: state) {
                SnapshotHelpers.assertKitImage(
                    of: MeeshyKitCatalogStage(key: entry.key, state: state, isPressed: variant == .presse)
                        .environment(\.meeshyGlassForcesDrawn, true),
                    component: entry.name, id: "\(state.id)-dessine", variant: variant,
                    colorScheme: variant == .sombre ? .dark : .light
                )
            }
        }
    }
}
