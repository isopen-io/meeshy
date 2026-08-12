import XCTest
@testable import Meeshy

@MainActor
final class BookmarksViewAccessibilityTests: XCTestCase {

    private func bookmarksViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/BookmarksView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - emptyState

    func test_emptyState_hidesDecorativeHeroIconFromVoiceOver() throws {
        let source = try bookmarksViewSource()
        guard let range = source.range(of: "private var emptyState") else {
            XCTFail("emptyState must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityHidden(true)"),
            "The empty-state hero glyph (bookmark, 48pt) is purely decorative — without " +
            ".accessibilityHidden(true) VoiceOver announces the raw symbol name as its own stop."
        )
    }

    func test_emptyState_combinesTitleAndSubtitleIntoSingleAccessibilityElement() throws {
        let source = try bookmarksViewSource()
        guard let range = source.range(of: "private var emptyState") else {
            XCTFail("emptyState must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .combine)"),
            "emptyState must combine its title + subtitle into one VoiceOver stop " +
            "('Aucun favori, Les posts que vous sauvegardez apparaitront ici') instead of two separate swipes."
        )
    }
}
