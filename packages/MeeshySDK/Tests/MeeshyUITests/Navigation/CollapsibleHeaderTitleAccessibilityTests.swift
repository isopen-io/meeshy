import XCTest
@testable import MeeshyUI

/// LE TITRE DE L'EN-TÊTE PARTAGÉ EST UN EN-TÊTE pour VoiceOver (#6481).
///
/// Relevé à la conversion des pages de Réglages (2026-09-14) : neuf pages
/// marquaient leur titre fait main `.accessibilityAddTraits(.isHeader)`. En
/// passant à `CollapsibleHeader`, qui ne le faisait pas, elles perdaient le
/// saut par titres du rotor — la navigation la plus rapide d'un lecteur d'écran.
/// Le trait vit dans le composant, pas dans chaque écran : un oubli d'écran ne
/// peut plus l'effacer.
final class CollapsibleHeaderTitleAccessibilityTests: XCTestCase {

    func test_theTitle_carriesTheHeaderTrait() throws {
        let code = ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Navigation/CollapsibleHeader.swift"),
                encoding: .utf8
            )
        )
        let titre = try XCTUnwrap(code.range(of: "Text(title)"), "Le titre texte de l'en-tête a disparu.")
        // Jusqu'à la fin de la chaîne de modificateurs du titre : le retrait des
        // commentaires laisse leurs lignes indentées, qui comptent en caractères.
        let chaine = String(code[titre.upperBound...].prefix(900))
        XCTAssertTrue(chaine.contains(".accessibilityAddTraits(.isHeader)"),
                      "Le titre de l'en-tête partagé n'est pas annoncé comme en-tête.")
    }
}
