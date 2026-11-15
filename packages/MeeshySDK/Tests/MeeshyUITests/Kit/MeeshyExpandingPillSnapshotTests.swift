import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la pilule qui s'ouvre vers le haut (K11) : chaque état du
/// catalogue en clair et en sombre, puis les planches `grande-police` (le titre
/// passe sur deux lignes, les disques ne grandissent pas, les choix s'empilent) et
/// `rtl` (‹ au bord de début, ✕ au bord de fin), puis le verre dessiné (`-dessine`),
/// seul visible quand le Liquid Glass du système est composé hors de la capture.
final class MeeshyExpandingPillSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K11"), "l'entrée K11 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }

    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K11"), "l'entrée K11 doit être livrée")
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
