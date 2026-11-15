import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de K13 : chaque état du catalogue en clair et en sombre, pressé
/// pour ceux qui se touchent (le libellé, puis le chevron), puis les planches
/// `grande-police` (la hauteur suit le texte, le libellé se replie) et `rtl`
/// (le chevron passe au début visuel, le filet reste entre les deux), puis le
/// verre dessiné (`-dessine`).
final class MeeshySplitActionButtonSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K13"), "l'entrée K13 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    /// Le verre DESSINÉ (sous iOS 26, ou forcé) : le bouton plein n'a pas d'autre
    /// matière que celle de K01, et ses deux rendus se photographient.
    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K13"), "l'entrée K13 doit être livrée")
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
