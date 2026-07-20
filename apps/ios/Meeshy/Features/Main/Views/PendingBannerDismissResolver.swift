import Foundation
import CoreGraphics

/// Pure helper deciding whether a drag gesture on `PendingStoryBannerInline`
/// (or any similarly-shaped dismissible banner) should dismiss it. Covers
/// swipe up/left/right — the three directions users naturally try — and
/// deliberately ignores swipe down (reserved, matches no existing gesture
/// here so a stray downward drag inside the banner does nothing surprising).
enum PendingBannerDismissResolver {
    static func shouldDismiss(translation: CGSize, threshold: CGFloat = 24) -> Bool {
        abs(translation.width) > threshold || translation.height < -threshold
    }
}
