import CoreGraphics

/// Disk-cache key scheme (`CacheCoordinator.thumbnails`) for a story/draft's
/// locally-rendered composite cover. Shared between the app (publish-time cover,
/// `StoryViewModel`) and the SDK (draft autosave hook,
/// `StoryComposerView+SyncRestore`) — a pure naming/sizing convention, no product
/// decision, so it lives here rather than being duplicated on both sides of the
/// SDK/app boundary.
public nonisolated enum StoryCoverCacheKey {
    /// 9:16, crisp enough for the tray ring avatar and the My Stories grid card.
    public static let renderSize = CGSize(width: 270, height: 480)

    /// Synthetic scheme so it never collides with a media-URL cache entry.
    public static func key(for id: String) -> String { "story-cover:\(id)" }
}
