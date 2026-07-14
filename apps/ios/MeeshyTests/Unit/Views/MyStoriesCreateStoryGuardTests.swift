import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Créer une story" entry point added to
/// `MyStoriesView`. Directive user 2026-07-14.
final class MyStoriesCreateStoryGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoriesView_declaresOnCreateStoryCallback() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("let onCreateStory: () -> Void"),
            "MyStoriesView doit exposer un callback onCreateStory délégué au parent (même pattern que onOpen)."
        )
        XCTAssertTrue(
            viewSource.contains("onCreateStory()"),
            "Le bouton + de la toolbar doit appeler onCreateStory()."
        )
    }

    func test_storyTrayView_wiresOnCreateStory_closingSheetBeforeComposer() throws {
        let traySource = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        guard let callbackRange = traySource.range(of: "onCreateStory: {") else {
            XCTFail("StoryTrayView doit fournir onCreateStory: à MyStoriesView")
            return
        }
        let end = traySource.index(callbackRange.lowerBound, offsetBy: 550, limitedBy: traySource.endIndex)
            ?? traySource.endIndex
        let block = String(traySource[callbackRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("showMyStories = false"),
            "onCreateStory doit fermer la sheet Mes stories avant de présenter le composer. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            block.contains("viewModel.showStoryComposer = true"),
            "onCreateStory doit finir par ouvrir le composer. Bloc lu: \(block)"
        )
    }
}
