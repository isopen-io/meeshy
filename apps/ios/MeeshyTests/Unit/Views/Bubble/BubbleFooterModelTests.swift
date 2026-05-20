import XCTest
import MeeshySDK
@testable import Meeshy

final class BubbleFooterModelTests: XCTestCase {

    private func makeModel(
        deliveryStatus: MeeshyMessage.DeliveryStatus = .sent,
        isMe: Bool = true,
        isDirect: Bool = true,
        isLastSentMessage: Bool = false,
        isLastReceivedMessage: Bool = false,
        isOnline: Bool = true
    ) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: "09:41",
            deliveryStatus: deliveryStatus,
            isMe: isMe,
            isDirect: isDirect,
            isLastSentMessage: isLastSentMessage,
            isLastReceivedMessage: isLastReceivedMessage,
            isOnline: isOnline,
            sender: nil,
            flags: [],
            showsTranslate: false
        )
    }

    func test_make_directNonLastSent_hidesTimestamp() {
        XCTAssertNil(makeModel(deliveryStatus: .sent, isDirect: true, isLastSentMessage: false).timestamp)
    }

    func test_make_directLastSent_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent, isDirect: true, isLastSentMessage: true).timestamp, "09:41")
    }

    func test_make_directNonLastButSending_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sending, isDirect: true, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_directNonLastButFailed_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .failed, isDirect: true, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_groupNonLast_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent, isDirect: false, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_received_hidesDelivery() {
        XCTAssertNil(makeModel(deliveryStatus: .read, isMe: false, isLastReceivedMessage: true).delivery)
    }

    func test_make_sent_carriesDelivery() {
        XCTAssertEqual(makeModel(deliveryStatus: .delivered, isMe: true, isLastSentMessage: true).delivery, .delivered)
    }

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
}
