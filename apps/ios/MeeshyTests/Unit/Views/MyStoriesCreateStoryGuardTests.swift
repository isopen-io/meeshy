import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Créer une story" entry point added to
/// `MyStoriesView`. Directive user 2026-07-14.
final class MyStoriesCreateStoryGuardTests: XCTestCase {

    /// Le fichier principal est lu comme un CORPUS — les gardes cherchent
    /// dans tous les fichiers de « Mes stories », pour survivre a sa
    /// decomposition. Tout autre chemin est lu tel quel.
    private func source(_ relativePath: String) throws -> String {
        relativePath.hasSuffix("MyStoriesView.swift")
            ? MyStoriesSourceCorpus.text()
            : try MyStoriesSourceCorpus.text(of: relativePath)
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
