import XCTest
@testable import Meeshy

@MainActor
final class MyStoriesEmptyStateResolverTests: XCTestCase {

    func test_shouldShowEmptyState_allSourcesEmpty_returnsTrue() {
        let result = MyStoriesEmptyStateResolver.shouldShowEmptyState(
            hasStories: false, hasActiveUpload: false, hasFailedItems: false
        )
        XCTAssertTrue(result)
    }

    func test_shouldShowEmptyState_hasStories_returnsFalse() {
        let result = MyStoriesEmptyStateResolver.shouldShowEmptyState(
            hasStories: true, hasActiveUpload: false, hasFailedItems: false
        )
        XCTAssertFalse(result)
    }

    func test_shouldShowEmptyState_hasActiveUploadOnly_returnsFalse() {
        let result = MyStoriesEmptyStateResolver.shouldShowEmptyState(
            hasStories: false, hasActiveUpload: true, hasFailedItems: false
        )
        XCTAssertFalse(result, "an in-flight upload with zero published stories yet must still hide the empty state")
    }

    func test_shouldShowEmptyState_hasFailedItemsOnly_returnsFalse() {
        let result = MyStoriesEmptyStateResolver.shouldShowEmptyState(
            hasStories: false, hasActiveUpload: false, hasFailedItems: true
        )
        XCTAssertFalse(result, "a permanently-failed item with zero published stories yet must still hide the empty state")
    }
}
