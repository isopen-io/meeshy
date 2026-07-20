import XCTest
@testable import Meeshy

/// Source-analysis guard for the failed-publish history added to
/// `MyStoriesView` (retry/discard on top of the published stories list).
final class MyStoriesFailedItemsGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_discardFailedItem_alsoClearsOptimisticPlaceholder() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        guard let range = viewSource.range(of: "private func discardFailedItem(_ item: StoryPublishQueueItem) {") else {
            XCTFail("MyStoriesView doit définir discardFailedItem(_:)")
            return
        }
        let end = viewSource.index(range.lowerBound, offsetBy: 250, limitedBy: viewSource.endIndex)
            ?? viewSource.endIndex
        let block = String(viewSource[range.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("StoryPublishService.shared.discard(item)"),
            "discardFailedItem doit déléguer à StoryPublishService.discard. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            block.contains("viewModel.removeOptimisticStories(tempStoryId: item.tempStoryId)"),
            "discardFailedItem doit aussi nettoyer le placeholder optimiste correspondant — sinon il reste bloqué en tray. Bloc lu: \(block)"
        )
    }

    func test_myStoriesView_showsFailedItemsSectionWhenNonEmpty() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("if !publishService.failedItems.isEmpty {"),
            "MyStoriesView doit conditionner la section d'historique d'échecs sur publishService.failedItems"
        )
        XCTAssertTrue(
            viewSource.contains("ForEach(publishService.failedItems)"),
            "MyStoriesView doit lister publishService.failedItems dans la section dédiée"
        )
    }
}
