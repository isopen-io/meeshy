import XCTest
@testable import MeeshySDK

/// Gap-recovery watermark — a message only contributes its `createdAt` to the
/// backfill boundary if that timestamp is SERVER-authoritative. An own message
/// still optimistic (`.sending`/`.clock`/…) carries a LOCAL device-clock
/// `createdAt`; a device clock running ahead would push the watermark past real
/// missed messages and silently drop them from the backfill.
final class SyncWatermarkTests: XCTestCase {

    private func msg(_ createdAt: Date, status: MeeshyMessage.DeliveryStatus, isMe: Bool) -> MeeshyMessage {
        MeeshyMessage(conversationId: "c", content: "x", createdAt: createdAt, deliveryStatus: status, isMe: isMe)
    }

    private let past = Date(timeIntervalSince1970: 1_700_000_000) // fixed server instant
    private var future: Date { past.addingTimeInterval(3600) }    // device clock ahead by 1h

    // MARK: - isServerTimestamped

    func test_receivedMessage_isAlwaysServerTimestamped() {
        // A message from someone else always came from the server, whatever its
        // (sender-facing) delivery status happens to be.
        XCTAssertTrue(msg(past, status: .sending, isMe: false).isServerTimestamped)
        XCTAssertTrue(msg(past, status: .sent, isMe: false).isServerTimestamped)
    }

    func test_ownConfirmedMessage_isServerTimestamped() {
        for status: MeeshyMessage.DeliveryStatus in [.sent, .delivered, .read] {
            XCTAssertTrue(msg(past, status: status, isMe: true).isServerTimestamped, "\(status) own message is server-confirmed")
        }
    }

    func test_ownOptimisticMessage_isNotServerTimestamped() {
        for status: MeeshyMessage.DeliveryStatus in [.sending, .invisible, .clock, .slow, .failed] {
            XCTAssertFalse(msg(future, status: status, isMe: true).isServerTimestamped, "\(status) own message carries a local clock")
        }
    }

    // MARK: - SyncWatermark.newest

    func test_newest_excludesOwnOptimisticSend_soAheadClockDoesNotPoisonWatermark() {
        // Device clock is 1h ahead: the optimistic own-send is timestamped in the
        // future. The watermark MUST be the newest server-timestamped message
        // (the received one), NOT the skewed optimistic send — otherwise the
        // next `listAfter(after:)` would skip real missed messages.
        let messages = [
            msg(past, status: .sent, isMe: false),                 // received @ server time
            msg(future, status: .sending, isMe: true),             // optimistic own-send @ device time (ahead)
        ]
        XCTAssertEqual(SyncWatermark.newest(among: messages), past)
    }

    func test_newest_isNilWhenOnlyOptimisticOwnSends() {
        // Nothing server-timestamped → no safe boundary → caller does a full load.
        let messages = [
            msg(future, status: .sending, isMe: true),
            msg(future.addingTimeInterval(1), status: .clock, isMe: true),
        ]
        XCTAssertNil(SyncWatermark.newest(among: messages))
    }

    func test_newest_picksMaxAmongServerTimestamped_orderIndependent() {
        let mid = past.addingTimeInterval(10)
        let newest = past.addingTimeInterval(20)
        let messages = [
            msg(newest, status: .read, isMe: true),   // own confirmed → counts
            msg(past, status: .sent, isMe: false),    // received
            msg(mid, status: .delivered, isMe: false),
        ]
        XCTAssertEqual(SyncWatermark.newest(among: messages), newest)
    }

    // MARK: - Conversation delta / full-sync watermark (R15b)

    func test_advanced_derivesFromServerMax_notLocalClock() {
        // Delta conversations are stamped in SERVER time (behind a device clock
        // running ahead). The next `updatedSince` watermark must be the server
        // max — never the local now — else the next delta skips server updates.
        let serverMax = past.addingTimeInterval(30)
        let received = [past.addingTimeInterval(10), serverMax, past.addingTimeInterval(5)]
        XCTAssertEqual(SyncWatermark.advanced(previous: past, receivedUpdatedAt: received), serverMax)
    }

    func test_advanced_neverRegressesBelowPrevious() {
        // A stray older updatedAt must not pull the watermark backwards.
        let prev = past.addingTimeInterval(100)
        XCTAssertEqual(SyncWatermark.advanced(previous: prev, receivedUpdatedAt: [past]), prev)
    }

    func test_advanced_emptyDeltaKeepsPrevious() {
        let prev = past.addingTimeInterval(42)
        XCTAssertEqual(SyncWatermark.advanced(previous: prev, receivedUpdatedAt: []), prev)
    }

    func test_fromFullSync_setsToServerMax_flushingStaleLocalClockWatermark() {
        // A legacy device-ahead watermark (server-FUTURE) would freeze delta sync
        // forever (server returns nothing past a future cutoff). A full,
        // authoritative fetch TRUSTS the server: it resets to the real newest
        // updatedAt, flushing the poisoned value.
        let poison = future.addingTimeInterval(9999)
        let serverMax = past.addingTimeInterval(50)
        XCTAssertEqual(SyncWatermark.fromFullSync(receivedUpdatedAt: [past, serverMax], fallback: poison), serverMax)
    }

    func test_fromFullSync_emptyAccountKeepsFallback() {
        let fallback = past.addingTimeInterval(7)
        XCTAssertEqual(SyncWatermark.fromFullSync(receivedUpdatedAt: [], fallback: fallback), fallback)
    }
}
