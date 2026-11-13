import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la capsule de statut (K14) : chaque état du catalogue en
/// clair et en sombre, pressé pour l'échec (l'action « Réessayer »), puis les
/// planches `grande-police` (l'action passe sous le texte, quatre lignes au
/// plus) et `rtl` (icône au début, texte aligné au début, action à la fin),
/// puis le verre dessiné (`-dessine`).
final class MeeshyStatusCapsuleSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K14"), "l'entrée K14 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    /// Le verre DESSINÉ (sous iOS 26, ou forcé) : la capsule n'a pas d'autre
    /// matière que celle de K01, et ses deux rendus se photographient.
    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K14"), "l'entrée K14 doit être livrée")
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
