import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Pure-logic tests for the cross-conversation unread pill embedded in
/// `ThemedBackButton`. The SwiftUI body itself is exercised manually via
/// smoke checks — these tests pin the formatting rules so the visual
/// invariant cannot regress without a build-breaking test failure.
@MainActor
final class ThemedBackButtonTests: XCTestCase {

    // MARK: - displayedUnread (text)

    func test_displayedUnread_underHundred_returnsRawNumber() {
        XCTAssertEqual(ThemedBackButton.displayedUnread(0), "0")
        XCTAssertEqual(ThemedBackButton.displayedUnread(1), "1")
        XCTAssertEqual(ThemedBackButton.displayedUnread(47), "47")
        XCTAssertEqual(ThemedBackButton.displayedUnread(99), "99")
    }

    func test_displayedUnread_atOrAboveHundred_clampsTo99Plus() {
        XCTAssertEqual(ThemedBackButton.displayedUnread(100), "99+")
        XCTAssertEqual(ThemedBackButton.displayedUnread(500), "99+")
        XCTAssertEqual(ThemedBackButton.displayedUnread(1_000), "99+")
    }

    // MARK: - showsUnread (visibility gate)

    func test_showsUnread_zeroCount_isFalse() {
        XCTAssertFalse(ThemedBackButton.showsUnread(unreadCount: 0, compactMode: false))
    }

    func test_showsUnread_positiveCount_andNotCompact_isTrue() {
        XCTAssertTrue(ThemedBackButton.showsUnread(unreadCount: 1, compactMode: false))
        XCTAssertTrue(ThemedBackButton.showsUnread(unreadCount: 99, compactMode: false))
    }

    /// When the composer expands, the back button collapses to a 24-pt
    /// chevron-only icon — the pill MUST disappear (no room) even if
    /// there are unreads.
    func test_showsUnread_compactMode_isFalse_evenWithUnreads() {
        XCTAssertFalse(ThemedBackButton.showsUnread(unreadCount: 7, compactMode: true))
        XCTAssertFalse(ThemedBackButton.showsUnread(unreadCount: 999, compactMode: true))
    }

    /// Defensive: negative counts are nonsense but must never render a pill.
    func test_showsUnread_negativeCount_isFalse() {
        XCTAssertFalse(ThemedBackButton.showsUnread(unreadCount: -5, compactMode: false))
    }

    // MARK: - Badge background color (dark/light parity with the list)

    /// The badge MUST delegate its background color to
    /// `MeeshyColors.unreadBadgeBackground(isDark:)`. Pinning that here
    /// guards against drift: the same red-light / red-dark pair the
    /// conversation list row badge uses must be applied here.
    func test_badgeBackgroundColor_lightMode_matchesSemanticError() {
        XCTAssertEqual(MeeshyColors.unreadBadgeBackground(isDark: false), MeeshyColors.error)
    }

    func test_badgeBackgroundColor_darkMode_matchesSemanticErrorDark() {
        XCTAssertEqual(MeeshyColors.unreadBadgeBackground(isDark: true), MeeshyColors.errorDark)
    }
}
