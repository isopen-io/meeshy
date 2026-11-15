import XCTest
@testable import MeeshyUI

/// Recette #10150 au simulateur : l'en-tête d'un pack dans la feuille de
/// stickers se lisait en DEUX titres à VoiceOver — « Hdr » (la description
/// système du symbole décoratif) puis « EXEMPLE · MEESHY » ; une catégorie
/// d'emoji, « Amour » puis « AMOUR ». L'icône d'un en-tête est décorative :
/// le titre seul se lit. Garde de source, le corps SwiftUI n'étant pas
/// introspectable sans ViewInspector.
final class StickerSectionHeaderAccessibilityTests: XCTestCase {

    private func sectionHeaderSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView+Vertical.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: "func sectionHeader<"))
        let rest = source[start.upperBound...]
        let end = rest.range(of: "accessibilityAddTraits(.isHeader)")?.lowerBound ?? rest.endIndex
        return String(rest[..<end])
    }

    func test_sectionHeader_emojiIcon_isHiddenFromVoiceOver() throws {
        let header = try sectionHeaderSource()
        let emoji = try XCTUnwrap(header.range(of: "Text(icone)"))
        let symbol = try XCTUnwrap(header.range(of: "Image(systemName: symbole)"))
        XCTAssertTrue(header[emoji.upperBound..<symbol.lowerBound].contains(".accessibilityHidden(true)"),
                      "L'emoji d'en-tête est décoratif : VoiceOver ne doit lire que le titre.")
    }

    func test_sectionHeader_symbolIcon_isHiddenFromVoiceOver() throws {
        let header = try sectionHeaderSource()
        let symbol = try XCTUnwrap(header.range(of: "Image(systemName: symbole)"))
        let title = try XCTUnwrap(header.range(of: "Text(titre.uppercased())"))
        XCTAssertTrue(header[symbol.upperBound..<title.lowerBound].contains(".accessibilityHidden(true)"),
                      "Le symbole d'en-tête est décoratif : sans masquage, VoiceOver lit « Hdr ».")
    }
}
