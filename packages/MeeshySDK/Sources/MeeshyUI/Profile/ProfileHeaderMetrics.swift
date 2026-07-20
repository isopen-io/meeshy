import CoreGraphics

// MARK: - Profile Header Metrics

/// Pure, stateless metrics driving the collapsible profile header.
///
/// `progress` maps a signed scroll offset (negative while scrolling down, the
/// sign produced by the `ScrollOffsetPreferenceKey` minY reader and the
/// negated `trackScrollContentOffset` iOS 18+ path) to a normalized
/// `0 → 1` collapse factor:
///   - `0` = fully expanded (banner at `expandedBanner` height)
///   - `1` = fully collapsed (compact bar at `collapsedBar` height)
///
/// Extracted as an `enum` of static members so it can be unit-tested without a
/// SwiftUI render lifecycle. Nothing here imports SwiftUI or product singletons.
public enum ProfileHeaderMetrics {
    /// Expanded banner height — matches the historical banner (`130pt`).
    public nonisolated static let expandedBanner: CGFloat = 130
    /// Height of the compact pinned identity bar once fully collapsed.
    public nonisolated static let collapsedBar: CGFloat = 52
    /// Scroll distance (in points) over which the header interpolates from
    /// expanded to fully collapsed.
    public nonisolated static let collapseDistance: CGFloat = 120

    /// 0 = expanded, 1 = collapsed. `offset` is signed (negative while
    /// scrolling content downward / revealing lower content).
    ///
    /// `nonisolated` so it can be evaluated off the main actor — required for
    /// the `nonisolated` test target (MeeshyUI defaults to `MainActor`
    /// isolation per SE-0466). Pure math, no shared state.
    public nonisolated static func progress(offset: CGFloat) -> CGFloat {
        let scrolled = max(0, -offset)
        return min(1, scrolled / collapseDistance)
    }
}
