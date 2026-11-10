import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du verre du kit : chaque état au repos, en sombre et pressé,
/// les planches `grande-police` et `rtl`, puis le verre DESSINÉ par le forçage de
/// debug (#17334) — sur iOS 26 le verre du système, dessous le verre dessiné.
final class MeeshyGlassToneSnapshotTests: XCTestCase {

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

    /// Le cadrage des images rend la taille NATURELLE : sous la proposition nulle
    /// de `.sizeThatFits`, la tuile mesure ce qu'elle mesure sans contrainte,
    /// libellé compris.
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
        try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K01"), "l'entrée K01 doit être livrée")
    }
}
