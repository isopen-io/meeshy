import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les instantanés de la capsule de statut (K14) : chaque état du catalogue en
/// clair et en sombre, pressé pour l'échec (l'action « Réessayer »), puis les
/// planches `grande-police` (l'action passe sous le texte, quatre lignes au
/// plus) et `rtl` (icône au début, texte aligné au début, action à la fin).
final class MeeshyStatusCapsuleSnapshotTests: XCTestCase {

    @MainActor
    func test_chaqueEtat_auRepos_sombre_presse_etPlanches() throws {
        let entry = try XCTUnwrap(MeeshyKitCatalog.listedEntry(matching: "K14"), "l'entrée K14 doit être livrée")
        SnapshotHelpers.assertKitComponent(entry)
    }
}
