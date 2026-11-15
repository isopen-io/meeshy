import XCTest

/// La croix « Fermer » de l'inscription vit dans SA zone (#8080).
///
/// Posée en `safeAreaInset(edge: .top)` sans fond, la barre laissait le
/// formulaire défiler DESSOUS : au premier geste, le titre puis le sous-titre
/// passaient sous la croix (recette simulateur 2026-09-26). Empilée AU-DESSUS
/// du `ScrollView`, elle borne le défilement : ce qui défile est rogné au bord
/// de la zone de défilement, jamais dessiné sous la croix — quelle que soit la
/// taille du texte.
final class SignupCloseBarZoneTests: XCTestCase {

    private func signupSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Auth/Signup/SignupView.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laCroix_estEmpiléeAuDessusDuDéfilement() throws {
        let code = try signupSource()
        XCTAssertTrue(code.contains("VStack(spacing:0){closeBarScrollView{"),
                      "la barre de fermeture doit précéder le ScrollView dans une pile, hors de la zone qui défile")
    }

    func test_laCroix_neFlottePlusSurLeContenu() throws {
        let code = try signupSource()
        XCTAssertFalse(code.contains("safeAreaInset(edge:.top){closeBar}"),
                       "un inset sans fond laisse le formulaire défiler sous la croix")
    }
}
