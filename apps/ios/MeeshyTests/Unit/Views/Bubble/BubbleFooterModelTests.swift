import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleFooterModelTests: XCTestCase {

    private func makeModel(
        deliveryStatus: MeeshyMessage.DeliveryStatus = .sent,
        isMe: Bool = true,
        isOnline: Bool = true,
        sendStartedAt: Date? = nil
    ) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: "09:41",
            deliveryStatus: deliveryStatus,
            isMe: isMe,
            isOnline: isOnline,
            sender: nil,
            flags: [],
            showsTranslate: false,
            sendStartedAt: sendStartedAt
        )
    }

    // MARK: - Timestamp toujours visible

    func test_make_directNonLastSent_showsTimestamp() {
        // Nouveau contrat : l'heure s'affiche sur TOUTES les bulles, y compris
        // une bulle envoyée intermédiaire en conversation directe.
        XCTAssertEqual(makeModel(deliveryStatus: .sent).timestamp, "09:41")
    }

    func test_make_directNonLastReceived_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .read, isMe: false).timestamp, "09:41")
    }

    func test_make_directLastSent_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent).timestamp, "09:41")
    }

    func test_make_directSending_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sending).timestamp, "09:41")
    }

    func test_make_directFailed_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .failed).timestamp, "09:41")
    }

    func test_make_groupNonLast_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent).timestamp, "09:41")
    }

    // MARK: - Delivery côté sortant uniquement

    func test_make_received_hidesDelivery() {
        XCTAssertNil(makeModel(deliveryStatus: .read, isMe: false).delivery)
    }

    func test_make_sent_carriesDelivery() {
        XCTAssertEqual(makeModel(deliveryStatus: .delivered).delivery, .delivered)
    }

    // MARK: - États dérivés

    func test_make_offline_setsIsOffline() {
        XCTAssertTrue(makeModel(isOnline: false).isOffline)
    }

    func test_isPending_trueForSendingNotFailed() {
        XCTAssertTrue(makeModel(deliveryStatus: .sending).isPending)
        XCTAssertTrue(makeModel(deliveryStatus: .clock).isPending)
        XCTAssertFalse(makeModel(deliveryStatus: .sent).isPending)
        XCTAssertFalse(makeModel(deliveryStatus: .failed).isPending)
    }

    func test_isFailed_onlyForFailed() {
        XCTAssertTrue(makeModel(deliveryStatus: .failed).isFailed)
        XCTAssertFalse(makeModel(deliveryStatus: .sending).isFailed)
    }

    // MARK: - sendStartedAt (backlog B.4 — clock reveal debounce)

    func test_make_sending_carriesSendStartedAt() {
        let start = Date()
        XCTAssertEqual(makeModel(deliveryStatus: .sending, sendStartedAt: start).sendStartedAt, start)
    }

    func test_make_notSending_omitsSendStartedAt() {
        XCTAssertNil(makeModel(deliveryStatus: .sent, sendStartedAt: Date()).sendStartedAt)
    }

    func test_make_receivedSending_omitsSendStartedAt() {
        // isMe gates `delivery` itself to nil already; sendStartedAt must
        // follow the same gate rather than leaking a start time nobody reads.
        XCTAssertNil(makeModel(deliveryStatus: .sending, isMe: false, sendStartedAt: Date()).sendStartedAt)
    }

    // MARK: - BUG3 — single retry affordance (footer vs orange band)

    // A failed outgoing message renders the orange `BubbleFailedRetryBar`, which
    // owns the resend action. The footer must NOT also expose its own retry
    // button (the historical `arrow.clockwise`) — otherwise the user sees two
    // competing affordances and the footer tap conflicts with the status sheet.

    func test_footerShowsRetry_falseWhenFailedOutgoing_bandOwnsRetry() {
        XCTAssertFalse(BubbleStandardLayout.footerShowsRetry(isFailedOutgoing: true))
    }

    func test_footerShowsRetry_trueWhenNotFailedOutgoing() {
        XCTAssertTrue(BubbleStandardLayout.footerShowsRetry(isFailedOutgoing: false))
    }
}
