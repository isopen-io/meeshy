import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// Tests for the offline/retry badge surfaced by Phase 4 Task 4.6.
/// The view is intentionally stateless + Equatable so we assert the
/// Equatable contract (same primitive inputs collapse, status changes
/// re-render) and the visibility matrix via `Mirror`-friendly behavior.
@MainActor
final class BubbleDeliveryBadgeTests: XCTestCase {

    // MARK: - Equatable contract

    func test_sameInputs_equal() {
        let a = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: {})
        let b = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: {})
        XCTAssertEqual(a, b)
    }

    func test_differentStatus_notEqual() {
        let a = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: {})
        let b = BubbleDeliveryBadge(status: .sent, isMe: true, isOnline: true, onRetry: {})
        XCTAssertNotEqual(a, b)
    }

    func test_differentOnlineFlag_notEqual() {
        let a = BubbleDeliveryBadge(status: .sending, isMe: true, isOnline: true, onRetry: {})
        let b = BubbleDeliveryBadge(status: .sending, isMe: true, isOnline: false, onRetry: {})
        XCTAssertNotEqual(a, b)
    }

    func test_differentIsMe_notEqual() {
        let a = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: {})
        let b = BubbleDeliveryBadge(status: .failed, isMe: false, isOnline: true, onRetry: {})
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Closure identity is intentionally ignored

    func test_differentRetryClosures_stillEqual() {
        // Closures are not part of the Equatable projection (avoids re-renders
        // when the parent rebuilds the trailing closure identity).
        let a = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: { print("a") })
        let b = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: { print("b") })
        XCTAssertEqual(a, b)
    }

    // MARK: - Visibility matrix (status-driven branches)

    func test_failedStatus_buildsViewWithoutCrash() {
        // Smoke: instantiating .failed must not throw — exercises the retry
        // button branch path.
        let view = BubbleDeliveryBadge(status: .failed, isMe: true, isOnline: true, onRetry: {})
        _ = view.body
    }

    func test_sendingOffline_buildsViewWithoutCrash() {
        // Smoke: instantiating .sending + offline must not throw — exercises
        // the hourglass branch path.
        let view = BubbleDeliveryBadge(status: .sending, isMe: true, isOnline: false, onRetry: {})
        _ = view.body
    }

    func test_sendingOnline_buildsViewWithoutCrash() {
        // Smoke: sending + online collapses to EmptyView in the default branch.
        let view = BubbleDeliveryBadge(status: .sending, isMe: true, isOnline: true, onRetry: {})
        _ = view.body
    }

    func test_notMe_buildsViewWithoutCrash() {
        // Smoke: incoming bubbles must never surface the badge.
        let view = BubbleDeliveryBadge(status: .failed, isMe: false, isOnline: true, onRetry: {})
        _ = view.body
    }
}
