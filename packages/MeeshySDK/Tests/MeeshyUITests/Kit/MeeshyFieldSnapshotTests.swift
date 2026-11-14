import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés du champ de feuille (K08) : chaque état du catalogue en
/// clair et en sombre — recherche vide et avec texte, occupé, hashtag, phrase à
/// compteur, plafond, paragraphe, temps, thème, désactivé — puis les planches
/// `grande-police` (compteur sous la saisie) et `rtl` (tête au bord de début,
/// compteur, croix et `trailing` au bord de fin).
final class MeeshyFieldSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_clair_sombre_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K08"), "l'entrée K08 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
