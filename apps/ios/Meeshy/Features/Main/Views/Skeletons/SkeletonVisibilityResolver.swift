import Foundation
import MeeshySDK

/// Pure decision helper for cache-first skeleton rendering.
///
/// The Instant App Principle says: skeleton/placeholder ONLY on empty
/// cache (cold start). If the cache surfaces ANY data — fresh OR stale
/// — we render it immediately and skip the skeleton. The View asks this
/// helper a single question and renders the answer; the decision lives
/// in one testable place so every list/feed view stays in lockstep.
///
/// `shouldShowSkeleton` is intentionally narrow: it captures the union
/// of "still loading" + "no cached data" without leaking the surrounding
/// View's structure. Views translate their domain state into the
/// `(loadState, hasCachedData)` pair and the resolver returns a single
/// Bool. Tests cover the full LoadState × hasCachedData matrix without
/// instantiating any SwiftUI view.
public enum SkeletonVisibilityResolver {
    /// Returns `true` when the View should render skeleton placeholders
    /// instead of the real content list.
    ///
    /// - Parameters:
    ///   - loadState: the ViewModel's current `LoadState`.
    ///   - hasCachedData: `false` when the underlying collection is
    ///     empty (no rows to display), `true` otherwise. Cached-stale
    ///     rows count as data — they MUST be shown immediately, not
    ///     hidden behind a skeleton.
    /// - Returns: `true` only when the cache is empty AND a network
    ///   load is in flight. Empty + idle / loaded yields `false` so
    ///   the View falls through to its empty-state branch.
    public static func shouldShowSkeleton(loadState: LoadState, hasCachedData: Bool) -> Bool {
        guard !hasCachedData else { return false }
        switch loadState {
        case .loading:
            return true
        case .idle, .cachedStale, .cachedFresh, .loaded, .offline, .error:
            return false
        }
    }

    /// Convenience overload for ViewModels that do not yet expose a
    /// `LoadState` and still rely on a binary `isLoading: Bool` flag.
    /// Same contract: skeleton iff no data AND a load is in flight.
    public static func shouldShowSkeleton(isLoading: Bool, hasCachedData: Bool) -> Bool {
        !hasCachedData && isLoading
    }
}
