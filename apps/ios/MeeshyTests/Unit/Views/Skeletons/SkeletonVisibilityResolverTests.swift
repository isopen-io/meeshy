import XCTest
import MeeshySDK
@testable import Meeshy

/// Pure-logic coverage for the resolver behind every cache-first
/// skeleton branch. The matrix is small (7 LoadState cases × 2 cache
/// states) and deterministic — no SwiftUI hosting required, the
/// resolver returns a Bool. These tests pin down the contract that the
/// View layer relies on so a regression in one screen can't drift
/// without breaking the rest.
@MainActor
final class SkeletonVisibilityResolverTests: XCTestCase {

    // MARK: - shouldShowSkeleton(loadState:hasCachedData:)

    func test_shouldShowSkeleton_loading_noCache_returnsTrue() {
        let result = SkeletonVisibilityResolver.shouldShowSkeleton(
            loadState: .loading,
            hasCachedData: false
        )
        XCTAssertTrue(result, "cold-start loading must render skeleton")
    }

    func test_shouldShowSkeleton_loading_withCache_returnsFalse() {
        let result = SkeletonVisibilityResolver.shouldShowSkeleton(
            loadState: .loading,
            hasCachedData: true
        )
        XCTAssertFalse(result, "loading on top of cache must NOT hide cache behind a skeleton")
    }

    func test_shouldShowSkeleton_cachedStale_noCache_returnsFalse() {
        // cachedStale with empty data is an impossible state in practice
        // (the VM would not transition there without rows) — the resolver
        // still refuses to render a skeleton to keep the contract simple.
        let result = SkeletonVisibilityResolver.shouldShowSkeleton(
            loadState: .cachedStale,
            hasCachedData: false
        )
        XCTAssertFalse(result)
    }

    func test_shouldShowSkeleton_cachedStale_withCache_returnsFalse() {
        let result = SkeletonVisibilityResolver.shouldShowSkeleton(
            loadState: .cachedStale,
            hasCachedData: true
        )
        XCTAssertFalse(result, "stale cache must surface immediately, never behind a skeleton")
    }

    func test_shouldShowSkeleton_cachedFresh_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .cachedFresh, hasCachedData: true)
        )
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .cachedFresh, hasCachedData: false)
        )
    }

    func test_shouldShowSkeleton_loaded_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .loaded, hasCachedData: true)
        )
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .loaded, hasCachedData: false),
            "loaded + empty is the empty-state branch, not a skeleton"
        )
    }

    func test_shouldShowSkeleton_idle_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .idle, hasCachedData: false),
            "idle (never fetched) hands off to the View's empty-state branch"
        )
    }

    func test_shouldShowSkeleton_offline_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .offline, hasCachedData: false),
            "offline must not be hidden by a skeleton — it surfaces its own banner"
        )
    }

    func test_shouldShowSkeleton_error_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(loadState: .error("boom"), hasCachedData: false),
            "error must not be hidden by a skeleton — it surfaces its own retry view"
        )
    }

    // MARK: - shouldShowSkeleton(isLoading:hasCachedData:)

    func test_shouldShowSkeleton_isLoadingTrue_noCache_returnsTrue() {
        XCTAssertTrue(
            SkeletonVisibilityResolver.shouldShowSkeleton(isLoading: true, hasCachedData: false)
        )
    }

    func test_shouldShowSkeleton_isLoadingTrue_withCache_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(isLoading: true, hasCachedData: true)
        )
    }

    func test_shouldShowSkeleton_isLoadingFalse_noCache_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(isLoading: false, hasCachedData: false)
        )
    }

    func test_shouldShowSkeleton_isLoadingFalse_withCache_returnsFalse() {
        XCTAssertFalse(
            SkeletonVisibilityResolver.shouldShowSkeleton(isLoading: false, hasCachedData: true)
        )
    }
}
