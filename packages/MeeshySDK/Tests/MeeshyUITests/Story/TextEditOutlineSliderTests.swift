import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le curseur de contour dit ce qu'il règle** (#13899) : il se lisait
/// « A … B 0.0 », avec les glyphes de la taille et du gras et un nombre sans
/// unité. Il montre maintenant un trait fin puis un trait épais, et une
/// épaisseur en points.
final class TextEditOutlineSliderTests: XCTestCase {

    func test_outlineWidthLabel_givesTheThicknessInPoints() {
        let fr = Locale(identifier: "fr_FR")
        XCTAssertEqual(TextEditToolOptions.outlineWidthLabel(0, locale: fr), "0 pt")
        XCTAssertEqual(TextEditToolOptions.outlineWidthLabel(4, locale: fr), "4 pt")
        XCTAssertEqual(TextEditToolOptions.outlineWidthLabel(4.5, locale: fr), "4,5 pt")
        XCTAssertEqual(TextEditToolOptions.outlineWidthLabel(4.5, locale: Locale(identifier: "en_US")), "4.5 pt")
    }

    func test_outlineWidthGlyphs_drawAStroke_notTheSizeOrBoldGlyphs() {
        let glyphes = TextEditToolOptions.outlineWidthGlyphs
        let ceuxDeLaTailleEtDuGras: Set<String> = ["textformat.size.smaller", "textformat.size.larger", "bold"]
        XCTAssertFalse(ceuxDeLaTailleEtDuGras.contains(glyphes.thin))
        XCTAssertFalse(ceuxDeLaTailleEtDuGras.contains(glyphes.thick))
        XCTAssertNotEqual(glyphes.thin, glyphes.thick, "un trait fin d'un côté, un trait épais de l'autre")
    }

    func test_outlineWidthColumn_holdsEveryThickness_soTheTrackNeverMovesWhileDragging() {
        let police = UIFont.monospacedSystemFont(ofSize: 12, weight: .bold)
        let valeurs = stride(from: 0.0, through: 12.0, by: 0.5)
        let largeurs = ["fr_FR", "en_US", "ar"].flatMap { id in
            valeurs.map { TextEditToolOptions.outlineWidthLabel($0, locale: Locale(identifier: id)) }
        }.map { ($0 as NSString).size(withAttributes: [.font: police]).width }
        XCTAssertLessThanOrEqual(largeurs.max() ?? .infinity, TextEditToolOptions.outlineWidthColumn,
                                 "l'épaisseur la plus large déborde de sa colonne : la piste bougerait sous le doigt")
    }
}
