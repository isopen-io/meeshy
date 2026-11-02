import Foundation
import MeeshySDK

/// Pure lookup resolving a story's playback index within its group by id.
/// `StoryViewerContainer` receives `postId` from entry points that know the
/// exact story tapped (My Stories list, notifications, deep links,
/// bookmarks) but historically only used it to trigger a targeted fetch —
/// never to compute where playback should start, so the viewer always
/// opened at `initialStoryIndex` (default 0) regardless of which story was
/// tapped.
///
/// Known limitation, explicitly not fixed here: `StoryViewerView` gates
/// `initialStoryIndex` application with `if initialStoryIndex > 0`, so a
/// resolved index of `0` combined with `startAtFirstUnviewed: true` would
/// fall through to the unviewed-story branch instead. No current caller
/// combines `postId` with `startAtFirstUnviewed: true`, so this resolver's
/// index-0 test documents the boundary without touching that unrelated
/// code path.
enum StoryIndexResolver {
    /// Returns the index of `postId` within `group.stories`, or `fallback`
    /// when `postId` is `nil` or not found in the group.
    ///
    /// - Important: `group.stories` is ascending by `createdAt` (oldest
    ///   first, the group's read order) — NOT the same order as any
    ///   display-sorted list (e.g. `MyStoriesView.stories`, newest first).
    ///   Search here, never in a display-sorted array.
    static func index(forPostId postId: String?, in group: StoryGroup, fallback: Int) -> Int {
        guard let postId, let idx = group.stories.firstIndex(where: { $0.id == postId }) else {
            return fallback
        }
        return idx
    }
}
