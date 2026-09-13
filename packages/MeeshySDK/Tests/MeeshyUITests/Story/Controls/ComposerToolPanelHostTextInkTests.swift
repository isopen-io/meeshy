import XCTest
import SwiftUI
@testable import MeeshyUI

/// LA PASTILLE « Aa » DU COMPOSER DE TEXTE (#5955) — `ComposerToolPanelHost`
/// élisait l'encre du glyphe par `Color(hex: textHex).luminance > 0.6 ? .black
/// : .white`, le même seuil fautif que #5950 (se trompe sur toute la plage
/// `0,179 → 0,6`, ex. `#46BDCA`). Miroir direct : `Color.readableInk`
/// (`ColorExtensions.swift`, déjà exhaustivement testée par
/// `ReadableInkTests`) pose le seuil correct — ce fichier prouve que CE SITE
/// le consomme, et n'a pas régressé vers le seuil arrondi.
final class ComposerToolPanelHostTextInkTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Controls/
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_textColorSwatch_consumesReadableInk() throws {
        let source = try sdkSource("Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift")
        XCTAssertTrue(
            source.contains(".foregroundColor(Color(hex: textHex).readableInk)"),
            "La pastille « Aa » doit consommer Color.readableInk (#5950) au lieu de comparer sa " +
            "luminance à un seuil arrondi en dur."
        )
        XCTAssertFalse(
            source.contains("luminance > 0.6"),
            "Le seuil arrondi 0.6 (#5955) ne doit plus apparaître sur ce site."
        )
    }

    /// Preuve directe sur la teinte fautive du jeu de fixtures (#46BDCA,
    /// L ≈ 0,4196) : `readableInk` élit désormais le noir, exactement ce que
    /// consomme `ComposerToolPanelHost` depuis le correctif ci-dessus.
    func test_midRangeTextColor_electsBlackInk() {
        XCTAssertEqual(Color(hex: "#46BDCA").readableInk, .black)
    }
}
