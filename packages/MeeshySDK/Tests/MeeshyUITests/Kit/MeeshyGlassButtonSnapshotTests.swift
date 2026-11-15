import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du bouton rond de verre (K02) : chaque état au repos, en
/// sombre et pressé, les planches `grande-police` et `rtl`, puis le verre
/// DESSINÉ par le forçage de debug (#17334) — sur iOS 26 le verre du système,
/// dessous le verre dessiné.
final class MeeshyGlassButtonSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        SnapshotHelpers.assertKitComponent(try Self.entry())
    }

    @MainActor
    func test_verreDessine_parLeForcageDeDebug() throws {
        let entry = try Self.entry()
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

    private static func entry() throws -> MeeshyKitCatalogEntry {
        try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K02"), "l'entrée K02 doit être livrée")
    }
}
