import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés des lignes de contexte (K24) : chaque état du catalogue en
/// clair et en sombre, pressé s'il se touche, puis les planches `grande-police`
/// (le texte s'arrête à ×1,5) et `rtl` (glyphe au début, ordre des références
/// inversé), puis le verre dessiné de la puce (`-dessine`).
final class MeeshyContextLinesSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K24"), "l'entrée K24 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    /// Le verre DESSINÉ de la puce (sous iOS 26, ou forcé) : sa seule matière
    /// est celle de K01, et ses deux rendus se photographient.
    @MainActor
    func test_puce_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K24"), "l'entrée K24 doit être livrée")
        for state in entry.states where state.id.hasPrefix("puce") {
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
