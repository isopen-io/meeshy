import XCTest
@testable import Meeshy

final class ReelFeedCardMenuTriggerGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_reelFeedCard_hasOnlyOneMoreOptionsTrigger() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertFalse(source.contains("private var moreOptionsMenu:"),
            "Le trigger « … » bas-droite (property moreOptionsMenu) doit être entièrement supprimé — reelGlyph (haut-droite) devient le seul point d'entrée du menu")
        XCTAssertTrue(source.contains("private var reelGlyph"),
            "reelGlyph doit rester le seul trigger « … » de la carte")
        XCTAssertTrue(source.contains("moreOptionsMenuContent"),
            "Le contenu partagé du menu (moreOptionsMenuContent) doit rester, référencé uniquement par reelGlyph")
    }
}
