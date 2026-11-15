import XCTest
@testable import Meeshy

final class ReelCaptionRichTextGuardTests: XCTestCase {
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

    func test_reelFeedCard_usesMessageTextRenderer_notPlainText() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(source.contains("MessageTextRenderer.render(displayCaption"),
            "ReelFeedCard doit rendre displayCaption via MessageTextRenderer, pas Text() brut")
    }

    func test_reelRepostEmbedCell_usesMessageTextRenderer_notPlainText() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift")
        XCTAssertTrue(source.contains("MessageTextRenderer.render(repost.displayContent"),
            "ReelRepostEmbedCell doit rendre le texte servi par le Prisme (repost.displayContent, #16002) via MessageTextRenderer, pas Text() brut")
    }
}
