import XCTest
@testable import Meeshy

/// Covers the P2 audit fix: `ReelFeedVideoSurface.onDisappear` gated its
/// `manager.pause()` on `ownsEngine, isShowingThis` but never reset
/// `ownsEngine` back to `false` afterward — unlike the identical guard in the
/// inactive branch of `drive()`, which did. Since `@State` persists across an
/// abrupt `onDisappear` (a fast fling can tear a card down before its
/// `isActive` prop ever flips through `.adaptiveOnChange`), a card could be
/// left with a permanently stale `ownsEngine == true`. If that same card later
/// re-mounts while inactive and a DIFFERENT active card is genuinely driving
/// the engine on the same underlying video URL, the stale flag would make the
/// dead card's guard fire and pause the truly active card — reintroducing the
/// exact repost/active-card-pause bug `ownsEngine` was added to prevent.
///
/// `ReelEngineOwnershipPolicy.shouldRelease` extracts the shared boolean
/// decision used by BOTH call sites so it can no longer drift apart; both
/// `onDisappear` and `drive()` now reset `ownsEngine = false` in the same
/// branch that calls this predicate.
final class ReelEngineOwnershipPolicyTests: XCTestCase {

    func test_shouldRelease_ownsEngineAndShowing_true() {
        XCTAssertTrue(ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: true, isShowingThis: true))
    }

    func test_shouldRelease_ownsEngineButNotShowing_false() {
        // Owned the engine previously but the shared manager has since moved
        // on to a different URL — nothing to release.
        XCTAssertFalse(ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: true, isShowingThis: false))
    }

    func test_shouldRelease_showingButDoesNotOwnEngine_false() {
        // A repost card matches `isShowingThis` by bare URL coincidence while
        // a DIFFERENT card genuinely owns the engine — must not release.
        XCTAssertFalse(ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: false, isShowingThis: true))
    }

    func test_shouldRelease_neitherOwnsNorShowing_false() {
        XCTAssertFalse(ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: false, isShowingThis: false))
    }
}
