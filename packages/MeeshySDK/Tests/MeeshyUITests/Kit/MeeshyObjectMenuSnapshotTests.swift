import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du menu d'objet (K18) : chaque état du catalogue en clair et en
/// sombre, `objet` pressé (une ligne figée sous le doigt), puis les planches
/// `grande-police` (la largeur monte à 320) et `rtl` (titre au bord de début,
/// glyphe au bord de fin, menu à gauche du (…)). Chacun cadre le menu ouvert dans
/// sa scène.
final class MeeshyObjectMenuSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K18"), "l'entrée K18 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
