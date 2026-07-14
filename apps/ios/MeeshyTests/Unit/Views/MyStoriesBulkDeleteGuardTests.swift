import XCTest
@testable import Meeshy

/// Source-analysis guard for multi-select bulk delete in `MyStoriesView`.
/// Directive user 2026-07-14.
final class MyStoriesBulkDeleteGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoriesView_neverReadsSelectedIDsRaw_outsideItsOwnDeclarationAndToggle() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("private var selectedStoryIDs: Set<String>"),
            "MyStoriesView doit exposer selectedStoryIDs (filtré via StorySelectionResolver.liveSelection), pas lire selectedIDs brut ailleurs."
        )
        XCTAssertTrue(
            viewSource.contains("StorySelectionResolver.liveSelection(selectedIDs: selectedIDs, liveIDs: stories.map(\\.id))"),
            "selectedStoryIDs doit être calculé via StorySelectionResolver.liveSelection."
        )
    }

    func test_bulkDelete_reusesExistingDeleteStory_noNewViewModelMethod() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        guard let funcRange = viewSource.range(of: "private func bulkDelete()") else {
            XCTFail("MyStoriesView doit définir bulkDelete()")
            return
        }
        let end = viewSource.index(funcRange.lowerBound, offsetBy: 500, limitedBy: viewSource.endIndex)
            ?? viewSource.endIndex
        let block = String(viewSource[funcRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("await viewModel.deleteStory(storyId: id)"),
            "bulkDelete() doit réutiliser StoryViewModel.deleteStory(storyId:) en boucle, pas introduire une nouvelle méthode réseau. Bloc lu: \(block)"
        )
    }

    func test_myStoryRow_selectionCircle_hasAccessibilityLabel() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains(".accessibilityLabel(isSelected"),
            "Le cercle de sélection doit porter un accessibilityLabel qui change avec isSelected."
        )
    }
}
