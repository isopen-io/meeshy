import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de K25 : chaque état au repos, en clair et en sombre, puis
/// les planches `grande-police` et `rtl`, puis le verre dessiné (`-dessine`).
/// Aucun état ne se touche : le geste se juge au témoin de comportement,
/// l'image fige l'état résolu. Sous iOS 26, la capture hors écran ne voit pas
/// le Liquid Glass du système : les images `-dessine` photographient les
/// disques, que les images de l'état ne montrent que par leur glyphe.
final class MeeshyDragTargetsSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_clair_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K25"), "l'entrée K25 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K25"), "l'entrée K25 doit être livrée")
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
