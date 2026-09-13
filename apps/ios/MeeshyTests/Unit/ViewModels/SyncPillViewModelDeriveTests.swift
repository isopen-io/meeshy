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
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: UUID().uuidString,
            kind: .message,
            titlePreview: "x",
            iconKind: .text,
            attachmentCount: 0,
            source: .conversation(id: "c", messageId: nil),
            status: status,
            createdAt: createdAt ?? now,
            updatedAt: updatedAt ?? createdAt ?? now
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

    // MARK: - La pastille est un ÉTAT, pas un journal (#4660)

    /// **Une entrée qui a renoncé hier n'est pas un état de synchronisation.**
    /// Mesuré au simulateur le 2026-09-10 : sept lignes `.exhausted` de la
    /// veille (404 / 400 / 500 définitifs) occupaient la pastille depuis 25 h.
    /// La rétention de la TABLE est de sept jours ; ce que la pastille MONTRE
    /// doit se mesurer en minutes.
    func test_terminalItemOlderThanTheDisplayWindow_leavesThePill() {
        let deadYesterday = item(status: .exhausted,
                                 updatedAt: now.addingTimeInterval(-25 * 3_600))
        let s = SyncPillViewModel.derive(items: [deadYesterday], isOffline: false, now: now)
        XCTAssertEqual(s, .hidden)
    }

    /// Le contre-témoin : dans la fenêtre, l'échec se dit. Sans lui, « tout
    /// masquer » passerait le témoin précédent tout en supprimant la seule
    /// information que l'utilisateur attend — que son envoi vient d'échouer.
    func test_terminalItemInsideTheDisplayWindow_staysVisible() {
        let justDied = item(status: .exhausted, updatedAt: now.addingTimeInterval(-10))
        let s = SyncPillViewModel.derive(items: [justDied], isOffline: false, now: now)
        guard case .failed = s else { return XCTFail("expected .failed, got \(s)") }
    }

    /// Idem pour `.failed` : le flusher ne reprend que les `.pending`, donc une
    /// ligne `.failed` n'avance plus toute seule non plus.
    func test_failedItemOlderThanTheDisplayWindow_leavesThePill() {
        let stale = item(status: .failed, updatedAt: now.addingTimeInterval(-3_600))
        let s = SyncPillViewModel.derive(items: [stale], isOffline: false, now: now)
        XCTAssertEqual(s, .hidden)
    }

    /// **La péremption est par ENTRÉE, jamais par pastille.** Le témoin qui
    /// compte : une ligne morte périmée ne doit pas emporter avec elle le
    /// travail encore vivant — et, surtout, elle ne doit plus faire virer la
    /// pastille au rouge alors qu'un envoi est en cours.
    func test_anExpiredTerminalItem_doesNotHideNorRedden_theLiveOnes() {
        let dead = item(status: .exhausted, updatedAt: now.addingTimeInterval(-25 * 3_600))
        let alive = item(status: .pending)
        let s = SyncPillViewModel.derive(items: [dead, alive], isOffline: false, now: now)
        guard case .syncing(let items) = s else {
            return XCTFail("expected .syncing, got \(s)")
        }
        XCTAssertEqual(items.count, 1, "la ligne morte périmée voyage encore dans la pastille")
    }

    /// L'horloge lue est celle du RENONCEMENT. Une ligne née il y a une heure
    /// mais qui vient d'échouer est un état FRAIS : la mesurer sur `createdAt`
    /// la ferait naître périmée.
    func test_theWindowMeasuresTheGivingUp_notTheEnqueue() {
        let lateFailure = item(status: .exhausted,
                               createdAt: now.addingTimeInterval(-3_600),
                               updatedAt: now.addingTimeInterval(-5))
        let s = SyncPillViewModel.derive(items: [lateFailure], isOffline: false, now: now)
        guard case .failed = s else { return XCTFail("expected .failed, got \(s)") }
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
