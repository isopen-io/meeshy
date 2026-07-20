import Foundation

/// Pure helper deciding when `MyStoriesView` shows its empty state. The
/// screen now also surfaces the live `activeUpload` and the permanently-failed
/// items history (`StoryPublishService.failedItems`) ABOVE the published
/// stories list — so the empty state must only appear when all three sources
/// are empty, not just when there are no published stories yet.
enum MyStoriesEmptyStateResolver {
    static func shouldShowEmptyState(hasStories: Bool, hasActiveUpload: Bool, hasFailedItems: Bool) -> Bool {
        !hasStories && !hasActiveUpload && !hasFailedItems
    }
}
