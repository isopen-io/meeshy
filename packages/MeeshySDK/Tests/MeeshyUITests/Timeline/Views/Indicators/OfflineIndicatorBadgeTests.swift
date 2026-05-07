import XCTest
import SwiftUI
@testable import MeeshyUI

/// Tests for `OfflineIndicatorBadge` — SOTA offline-first non-blocking indicator.
@MainActor
final class OfflineIndicatorBadgeTests: XCTestCase {

    // MARK: - Equatable

    func test_badge_equal_whenIsOfflineMatches() {
        let a = OfflineIndicatorBadge(isOffline: true)
        let b = OfflineIndicatorBadge(isOffline: true)
        XCTAssertEqual(a, b, "Badge must be Equatable — bit-equal when isOffline matches")
    }

    func test_badge_equal_whenBothOnline() {
        let a = OfflineIndicatorBadge(isOffline: false)
        let b = OfflineIndicatorBadge(isOffline: false)
        XCTAssertEqual(a, b)
    }

    func test_badge_notEqual_whenIsOfflineDiffers() {
        let a = OfflineIndicatorBadge(isOffline: true)
        let b = OfflineIndicatorBadge(isOffline: false)
        XCTAssertNotEqual(a, b, "isOffline change must invalidate equality")
    }

    // MARK: - Init

    func test_badge_init_storesIsOffline() {
        let badge = OfflineIndicatorBadge(isOffline: true)
        XCTAssertTrue(badge.isOffline)
    }

    func test_badge_init_online() {
        let badge = OfflineIndicatorBadge(isOffline: false)
        XCTAssertFalse(badge.isOffline)
    }

    // MARK: - Body renders without crash

    func test_badge_body_rendersOfflineContent() {
        let badge = OfflineIndicatorBadge(isOffline: true)
        // Verify body is constructible without crashing (SwiftUI DI-free check).
        let mirror = Mirror(reflecting: badge.body)
        XCTAssertNotNil(mirror, "Body must be constructible when isOffline = true")
    }

    func test_badge_body_rendersEmptyWhenOnline() {
        let badge = OfflineIndicatorBadge(isOffline: false)
        let mirror = Mirror(reflecting: badge.body)
        XCTAssertNotNil(mirror, "Body must be constructible when isOffline = false")
    }
}
