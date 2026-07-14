import CoreGraphics

/// Pure sizing helper for `MyStoryRow` thumbnails. Derives width from the
/// story's real content aspect ratio (width / height, cf.
/// `FeedMedia.aspectRatio`) instead of forcing every thumbnail into a
/// fixed 9:16 frame, while keeping row height constant so the list's
/// vertical rhythm never varies.
enum StoryThumbnailSizing {
    /// Fallback ratio (9:16 portrait) used for text-only stories (no media)
    /// or legacy stories with no recorded aspect ratio.
    static let fallbackAspectRatio: Double = 0.5625

    /// Clamp range in points — keeps thumbnails legible at extreme ratios.
    static let minWidth: CGFloat = 36
    static let maxWidth: CGFloat = 64

    static func width(forAspectRatio aspectRatio: Double?, height: CGFloat = 64) -> CGFloat {
        let ratio = aspectRatio ?? fallbackAspectRatio
        let raw = height * CGFloat(ratio)
        return min(max(raw, minWidth), maxWidth)
    }
}
