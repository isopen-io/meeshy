import XCTest
@testable import MeeshyUI

/// #4719 — **la feuille de stickers ne montre plus un visage.**
///
/// Elle n'affiche pas un clavier d'emoji : elle ouvre une palette de
/// CONSTRUCTIONS (#4579) — lieu, heure, décorations, « Mes stickers ». Un
/// visage y annonçait le contenu d'un seul de ses onglets.
///
/// Deux témoins, parce qu'une constante juste ne prouve pas qu'elle est LUE :
/// le premier porte sur la valeur, le second sur le fait que l'en-tête la
/// consomme au lieu de recopier un littéral à côté.
final class StickerPickerSymbolTests: XCTestCase {

    /// Aucun glyphe Apple ne s'appelle « sticker » ni « peel » — balayage de
    /// `CoreGlyphs.bundle`, noms ET index de recherche, zéro correspondance.
    /// Celui-ci DIT le geste : deux rectangles portrait, celui de devant
    /// incliné — la feuille qui se soulève de la planche. iOS 16.0, soit le
    /// plancher du projet : aucune garde de version.
    func test_sheetSymbol_isThePeelingSheet_notASmiley() {
        XCTAssertEqual(StickerPickerView.sheetSymbolName,
                       "rectangle.portrait.on.rectangle.portrait.angled")
    }

    /// **La constante doit être LUE.** Sans ce témoin, un littéral recopié dans
    /// le corps de la vue laisserait le premier au vert tout en peignant autre
    /// chose — un contrat mort, qui rassure sans rien tenir.
    func test_panelHeader_readsTheConstant_ratherThanALiteral() throws {
        let code = Self.strippingLineComments(
            try String(contentsOf: Self.pickerSourceURL, encoding: .utf8)
        )
        XCTAssertTrue(code.contains("Image(systemName: Self.sheetSymbolName)"),
                      "L'en-tête doit consommer la constante, jamais un littéral voisin.")
        XCTAssertFalse(code.contains("face.smiling"),
                       "Le smiley est revenu dans la feuille de stickers.")
    }

    private static var pickerSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView.swift")
    }

    /// Les commentaires sont retirés avant analyse : la prose qui explique
    /// pourquoi le smiley est parti contient le mot « face.smiling » et
    /// déclencherait sinon l'alerte elle-même.
    private static func strippingLineComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
    }
}
