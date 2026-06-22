import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Covers `SyncPillLabels.operationLabel(for:)` — the French phrasing surfaced
/// by the sync pill. The label is status-aware: a pending / inflight row reads
/// as work in progress ("Envoi de…"), a terminal `.failed` / `.exhausted` row
/// reads as a failure ("… non envoyé") so a lingering row never looks active.
@MainActor
final class SyncPillLabelsTests: XCTestCase {

    private func item(
        kind: OutboxUIItem.Kind,
        status: OutboxStatus,
        iconKind: OutboxUIItem.IconKind = .text
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: UUID().uuidString,
            kind: kind,
            titlePreview: nil,
            iconKind: iconKind,
            attachmentCount: 0,
            source: .unknown,
            status: status,
            createdAt: Date()
        )
    }

    // MARK: - In-progress phrasing (pending / inflight)

    func test_reaction_pending_readsAsSending() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .reaction, status: .pending))
        XCTAssertEqual(label, "Envoi de réaction")
    }

    func test_createPost_pending_readsAsPublishingPost() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createPost"), status: .inflight))
        XCTAssertEqual(label, "Publication de post")
    }

    func test_createReel_pending_readsAsPublishingReel() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createReel"), status: .pending))
        XCTAssertEqual(label, "Publication de réel")
    }

    func test_createStatus_pending_readsAsPublishingMood() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createStatus"), status: .inflight))
        XCTAssertEqual(label, "Publication de mood")
    }

    func test_createStatus_exhausted_readsAsNotPublished() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createStatus"), status: .exhausted))
        XCTAssertEqual(label, "Mood non publié")
    }

    // MARK: - Failure phrasing (failed / exhausted)

    /// The user's report: a permanently-failed reaction lingered in the queue
    /// and read "Envoi de réaction" as if still sending. It must now read as a
    /// failure instead.
    func test_reaction_exhausted_readsAsNotSent() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .reaction, status: .exhausted))
        XCTAssertEqual(label, "Réaction non envoyée")
    }

    func test_reaction_failed_readsAsNotSent() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .reaction, status: .failed))
        XCTAssertEqual(label, "Réaction non envoyée")
    }

    func test_message_failed_readsAsNotSent() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .message, status: .failed))
        XCTAssertEqual(label, "Message non envoyé")
    }

    func test_createReel_exhausted_readsAsNotPublished() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createReel"), status: .exhausted))
        XCTAssertEqual(label, "Réel non publié")
    }

    func test_createPost_exhausted_readsAsNotPublished() {
        let label = SyncPillLabels.operationLabel(for: item(kind: .other("createPost"), status: .exhausted))
        XCTAssertEqual(label, "Post non publié")
    }
}
