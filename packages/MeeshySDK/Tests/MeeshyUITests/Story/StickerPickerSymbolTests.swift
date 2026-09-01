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

    /// **La garde BALAIE, elle ne nomme plus.**
    ///
    /// La première version de ce lot nommait deux sites — la porte du rail et
    /// l'en-tête de la feuille — et les corrigeait tous les deux. Il en existait
    /// un TROISIÈME : le bouton sticker du panneau d'outils du composer SDK
    /// (`ComposerToolPanelHost`), qui ouvre la MÊME palette et gardait son
    /// visage. Une énumération porte toujours deux affirmations — « ces sites
    /// appliquent la règle » (vérifiable) et « ce sont les seuls » (presque
    /// jamais vérifiée).
    ///
    /// La règle, elle, est vérifiable : **tout site qui OUVRE la palette porte
    /// le glyphe de la palette.** Un quatrième site l'appliquera donc sans
    /// qu'on ait à y penser.
    func test_everySiteThatOpensThePalette_carriesItsGlyph() throws {
        let racine = Self.storySourcesRoot
        let énumérateur = try XCTUnwrap(
            FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil))
        var examinés = 0
        for cas in énumérateur {
            guard let url = cas as? URL, url.pathExtension == "swift" else { continue }
            let code = Self.strippingLineComments(
                try String(contentsOf: url, encoding: .utf8))
            let ouvreLaPalette = code.contains("onOpenStickerPicker?()")
                || code.contains("StickerPickerView(")
            guard ouvreLaPalette else { continue }
            examinés += 1
            XCTAssertFalse(code.contains("face.smiling"),
                           "\(url.lastPathComponent) ouvre la palette et porte encore un smiley.")
        }
        XCTAssertGreaterThan(examinés, 1,
                             "Le balayage ne trouve presque aucun site — la garde passerait "
                              + "au vert par omission, pas parce que la règle est tenue.")
    }

    private static var storySourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI/Story")
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
