import SwiftUI
import MeeshyUI

/// Reusable quick-reaction strip — a horizontally scrollable emoji
/// picker with an optional trailing "+" expand button. Used by both
/// the in-conversation `ConversationView+MessageRow`'s inline pop-up
/// (sliding next to a long-pressed bubble) and the long-press
/// `MessageOverlayMenu`'s mid-screen quick-reaction CTA.
///
/// Layout: capped at 280pt visible width to preserve the pill
/// silhouette regardless of the surface's available room. The
/// underlying `EmojiReactionPicker` handles scroll + leading-edge
/// fade mask when there are more emojis than fit. The "+" button is
/// anchored OUTSIDE the scroll viewport so it stays accessible
/// after the user has swiped emojis aside.
///
/// Interaction is fully delegated:
///   - `onReact(emoji)` fires when an emoji tile is tapped.
///   - `onExpandFullPicker` fires when the trailing "+" is tapped;
///     pass `nil` to suppress the "+" entirely.
///
/// `EmojiUsageTracker.recordUsage(emoji:)` is the caller's
/// responsibility — different surfaces want different ordering
/// strategies (recency-only vs. blend with popularity defaults), so
/// recording lives at the call site, not inside this view.
struct QuickReactionBar: View {
    let isDark: Bool
    let quickEmojis: [String]
    var onReact: (String) -> Void
    var onExpandFullPicker: (() -> Void)?

    var body: some View {
        EmojiReactionPicker(
            quickEmojis: quickEmojis,
            style: isDark ? .dark : .light,
            scrollable: true,
            onReact: onReact,
            onExpandFullPicker: onExpandFullPicker
        )
        .frame(maxWidth: 280)
    }
}
