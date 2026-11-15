import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la pilule de verre (K10) : chaque état du catalogue en
/// clair et en sombre, puis les planches `grande-police` (le libellé de l'action
/// grandit, la loi d'ajustement réduit les boutons) et `rtl` (la rangée se
/// retourne, l'action principale reste à la fin), puis le verre dessiné
/// (`-dessine`), seul visible quand le Liquid Glass du système est composé hors
/// de la capture.
final class MeeshyGlassPillSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K10"), "l'entrée K10 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K10"), "l'entrée K10 doit être livrée")
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
