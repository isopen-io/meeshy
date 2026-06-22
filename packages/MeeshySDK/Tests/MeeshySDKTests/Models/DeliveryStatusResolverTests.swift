import XCTest
@testable import MeeshySDK

/// The sender's checkmark must EXACTLY represent the real state of all the other
/// interlocutors: ✓ sent → ✓✓ delivered (everyone received) → ✓✓ read (everyone
/// read). These tests pin the WhatsApp-style all-or-nothing group semantics.
final class DeliveryStatusResolverTests: XCTestCase {

    // MARK: - resolve(status:deliveredCount:readCount:recipientCount:)

    // 1:1 — a single recipient: the stored status is trustworthy as-is.
    func test_resolve_direct_oneRecipientRead_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 1)
        XCTAssertEqual(result, .read)
    }

    func test_resolve_direct_oneRecipientDelivered_isDelivered() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 1, readCount: 0, recipientCount: 1)
        XCTAssertEqual(result, .delivered)
    }

    // Unknown denominator (0) must not regress 1:1 behaviour — trust the status.
    func test_resolve_unknownRecipientCount_trustsStatus() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 0)
        XCTAssertEqual(result, .read)
    }

    // THE bug: a group where ONE of several members read must NOT show "read".
    func test_resolve_group_partialRead_demotesBelowRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 10)
        XCTAssertEqual(result, .sent,
            "one reader out of ten is neither delivered-to-all nor read-by-all")
    }

    // A group where ONE member received (but not all) must NOT show "delivered".
    func test_resolve_group_partialDelivery_demotesToSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 1, readCount: 0, recipientCount: 10)
        XCTAssertEqual(result, .sent,
            "one recipient out of ten is not delivered-to-all")
    }

    func test_resolve_group_allDeliveredSomeRead_isDelivered() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 4, readCount: 2, recipientCount: 4)
        XCTAssertEqual(result, .delivered,
            "everyone received but not everyone read → delivered, not read")
    }

    func test_resolve_group_allRead_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 4, readCount: 4, recipientCount: 4)
        XCTAssertEqual(result, .read)
    }

    func test_resolve_group_noneYet_isSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .sent, deliveredCount: 0, readCount: 0, recipientCount: 4)
        XCTAssertEqual(result, .sent)
    }

    // Pre-delivery send lifecycle is always returned verbatim — it is not a
    // function of recipient counts.
    func test_resolve_sending_isAlwaysVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .sending, deliveredCount: 9, readCount: 9, recipientCount: 10),
            .sending)
    }

    func test_resolve_failed_isAlwaysVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .failed, deliveredCount: 0, readCount: 0, recipientCount: 10),
            .failed)
    }

    func test_resolve_slowAndClock_areVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .slow, deliveredCount: 5, readCount: 5, recipientCount: 5),
            .slow)
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .clock, deliveredCount: 5, readCount: 5, recipientCount: 5),
            .clock)
    }

    // Counts exceeding the denominator (a member left after sending) still read.
    func test_resolve_group_countsExceedRecipients_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 6, readCount: 5, recipientCount: 4)
        XCTAssertEqual(result, .read)
    }

    // MARK: - "All" markers (live count-blind path) take precedence over counts

    // C1: the real-time group path advances state + stamps readByAllAt but does
    // NOT carry per-row counters. The marker must win so the checkmark doesn't
    // regress to a single check while the stale counters say "not everyone".
    func test_resolve_group_readByAllMarker_winsOverStaleCounts() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: Date())
        XCTAssertEqual(result, .read)
    }

    func test_resolve_group_deliveredToAllMarker_winsOverStaleCounts() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: nil)
        XCTAssertEqual(result, .delivered)
    }

    // No markers (cold-start: gateway currently leaves them null) → counts decide.
    func test_resolve_group_noMarkers_partialRead_isSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 10,
            deliveredToAllAt: nil, readByAllAt: nil)
        XCTAssertEqual(result, .sent)
    }

    // A marker never resurrects a pre-delivery lifecycle state.
    func test_resolve_sending_markerIgnored() {
        let result = DeliveryStatusResolver.resolve(
            status: .sending, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: Date())
        XCTAssertEqual(result, .sending)
    }

    // MARK: - fromCounts(deliveredCount:readCount:recipientCount:)

    func test_fromCounts_group_partialRead_isSent() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 5),
            .sent)
    }

    func test_fromCounts_group_allDelivered_isDelivered() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 5, readCount: 0, recipientCount: 5),
            .delivered)
    }

    func test_fromCounts_group_allRead_isRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 5, readCount: 5, recipientCount: 5),
            .read)
    }

    func test_fromCounts_direct_oneRead_isRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 1),
            .read)
    }

    // Unknown denominator falls back to legacy "any > 0" so 1:1 still advances.
    func test_fromCounts_unknownDenominator_anyReadIsRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 0),
            .read)
    }

    func test_fromCounts_unknownDenominator_anyDeliveredIsDelivered() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 0, recipientCount: 0),
            .delivered)
    }

    func test_fromCounts_nothing_isSent() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 0, readCount: 0, recipientCount: 3),
            .sent)
    }
}
