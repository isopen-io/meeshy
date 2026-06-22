import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Covers the pure `SyncPillViewModel.derive(items:isOffline:now:)` function.
/// Each case exercises one of the four output states or one of the priority
/// rules so the truth table stays explicit and easy to reason about.
@MainActor
final class SyncPillViewModelDeriveTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func item(
        status: OutboxStatus = .pending,
        createdAt: Date? = nil
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: UUID().uuidString,
            kind: .message,
            titlePreview: "x",
            iconKind: .text,
            attachmentCount: 0,
            source: .conversation(id: "c"),
            status: status,
            createdAt: createdAt ?? now
        )
    }

    func test_hidden_when_empty_and_online() {
        let s = SyncPillViewModel.derive(items: [], isOffline: false, now: now)
        XCTAssertEqual(s, .hidden)
    }

    func test_syncing_when_pending_and_online() {
        let s = SyncPillViewModel.derive(items: [item()], isOffline: false, now: now)
        guard case .syncing = s else { return XCTFail("expected .syncing, got \(s)") }
    }

    func test_offline_when_isOffline_true_with_items() {
        let s = SyncPillViewModel.derive(items: [item()], isOffline: true, now: now)
        guard case .offline = s else { return XCTFail("expected .offline, got \(s)") }
    }

    func test_offline_when_isOffline_true_empty_queue() {
        let s = SyncPillViewModel.derive(items: [], isOffline: true, now: now)
        XCTAssertEqual(s, .offline(items: []))
    }

    func test_failed_takes_priority_over_offline() {
        let s = SyncPillViewModel.derive(
            items: [item(status: .failed), item(status: .pending)],
            isOffline: true,
            now: now
        )
        guard case .failed = s else { return XCTFail("expected .failed, got \(s)") }
    }

    func test_failed_takes_priority_over_syncing() {
        let s = SyncPillViewModel.derive(
            items: [item(status: .failed), item(status: .pending)],
            isOffline: false,
            now: now
        )
        guard case .failed = s else { return XCTFail("expected .failed, got \(s)") }
    }

    func test_exhausted_maps_to_failed() {
        // T14b — a permanently-failed (.exhausted) mutation surfaces like a
        // transient .failed: the pill must flag it for the user, not stay syncing.
        let s = SyncPillViewModel.derive(items: [item(status: .exhausted)], isOffline: false, now: now)
        guard case .failed = s else { return XCTFail("expected .failed for an exhausted row, got \(s)") }
    }

    func test_offline_when_stale_inflight_above_4s_and_online() {
        let stale = item(status: .inflight, createdAt: now.addingTimeInterval(-5))
        let s = SyncPillViewModel.derive(items: [stale], isOffline: false, now: now)
        guard case .offline = s else {
            return XCTFail("expected .offline (stale inflight), got \(s)")
        }
    }

    func test_syncing_when_inflight_below_4s() {
        let fresh = item(status: .inflight, createdAt: now.addingTimeInterval(-3.5))
        let s = SyncPillViewModel.derive(items: [fresh], isOffline: false, now: now)
        guard case .syncing = s else {
            return XCTFail("expected .syncing, got \(s)")
        }
    }

    func test_priority_order_failed_over_offline_over_syncing_over_hidden() {
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .failed)], isOffline: true, now: now).caseName,
            "failed"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .pending)], isOffline: true, now: now).caseName,
            "offline"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .pending)], isOffline: false, now: now).caseName,
            "syncing"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [], isOffline: false, now: now).caseName,
            "hidden"
        )
    }
}

private extension PillState {
    var caseName: String {
        switch self {
        case .hidden: return "hidden"
        case .syncing: return "syncing"
        case .offline: return "offline"
        case .failed: return "failed"
        }
    }
}
