import SwiftUI

// MARK: - iOS 18+ scroll-offset tracking

public extension View {
    /// Tracks a vertical `ScrollView`'s content offset on **iOS 18+**, where the
    /// `.onPreferenceChange`-based reader stops re-firing on scroll — it delivers
    /// only the initial value, so a `CollapsibleHeader` driven by it never collapses
    /// or reveals (verified on iOS 18.2 and iOS 26). Reports `contentOffset.y`
    /// (0 at the top, positive scrolling down). No-op on iOS 16–17, which keep the
    /// `.onPreferenceChange` + `ScrollOffsetPreferenceKey` path.
    ///
    /// Pair it with the existing preference reader so both iOS ranges are covered:
    /// ```
    /// ScrollView { content }
    ///     .coordinateSpace(name: "scroll")
    ///     .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 } // iOS 16–17
    ///     .trackScrollContentOffset { scrollOffset = -$0 }                          // iOS 18+
    /// ```
    /// The negation matches the `minY` sign the preference path produces (negative
    /// while scrolling down), so `CollapsibleHeader`'s `progress = -scrollOffset / 60`
    /// behaves identically across iOS versions. Requires the content to sit at
    /// `contentOffset.y == 0` at rest (use the ZStack-overlay + `Color.clear` spacer
    /// header pattern, NOT `.safeAreaInset`, which shifts the rest offset).
    @ViewBuilder
    func trackScrollContentOffset(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, newValue in
                onChange(newValue)
            }
        } else {
            self
        }
    }
}
