import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du choix segmenté : chaque état en clair et en sombre (pressé
/// s'il se touche), puis les planches `grande-police` et `rtl` de l'ensemble.
final class MeeshySegmentedSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_clair_sombre_presse_etPlanches() throws {
        SnapshotHelpers.assertKitComponent(try Self.entry())
    }

    /// Le cadrage des images rend la taille NATURELLE : sous la proposition nulle
    /// de `.sizeThatFits`, la tuile mesure ce qu'elle mesure sans contrainte.
    @MainActor
    func test_cadrageDuKit_rendLaTailleNaturelleSousLaPropositionNulle() throws {
        let entry = try Self.entry()
        for state in entry.states {
            let stage = MeeshyKitCatalogStage(key: entry.key, state: state)
            let natural = UIHostingController(rootView: stage)
                .sizeThatFits(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
            let framed = UIHostingController(rootView: SnapshotHelpers.kitFramed(stage))
                .sizeThatFits(in: .zero)

            XCTAssertEqual(framed.width, natural.width, accuracy: 0.5, state.id)
            XCTAssertEqual(framed.height, natural.height, accuracy: 0.5, state.id)
        }
    }

    private static func entry() throws -> MeeshyKitCatalogEntry {
        try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K03"), "l'entrée K03 doit être livrée")
    }
}
