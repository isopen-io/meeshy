import XCTest
@testable import Meeshy

final class FeedPostCardMentionColorGuardTests: XCTestCase {
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

    func test_feedPostCard_messageTextRenderer_passesMentionColor() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(source.contains("mentionColor:"),
            "FeedPostCard doit passer mentionColor à MessageTextRenderer.render, sinon les mentions ne sont pas colorées")
    }

    func test_postDetailView_messageTextRenderer_passesMentionColor() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(source.contains("mentionColor:"),
            "PostDetailView doit passer mentionColor à MessageTextRenderer.render, sinon les mentions ne sont pas colorées")
    }
}
