import XCTest
@testable import Meeshy

/// Phase 1 — delivery status must be conveyed by a distinct VoiceOver label per
/// state, not by glyph shape + colour alone (sent / delivered / read are a
/// single / grey-double / indigo-double checkmark that VoiceOver and colour-blind
/// users cannot otherwise tell apart).
@MainActor
final class BubbleDeliveryCheckLabelTests: XCTestCase {

    func test_label_allStates_areNonEmpty() {
        let all: [BubbleDeliveryCheck.DeliveryLabel] = [
            .offlinePending, .sending, .slow, .sent, .delivered, .read, .failed
        ]
        for state in all {
            XCTAssertFalse(
                BubbleDeliveryCheck.label(state).isEmpty,
                "Delivery state \(state) must have a non-empty VoiceOver label"
            )
        }
    }

    func test_label_distinguishesSentDeliveredRead() {
        // The three checkmark states differ only by glyph/colour visually — their
        // spoken labels MUST be distinct so non-visual users can tell them apart.
        let sent = BubbleDeliveryCheck.label(.sent)
        let delivered = BubbleDeliveryCheck.label(.delivered)
        let read = BubbleDeliveryCheck.label(.read)
        XCTAssertNotEqual(sent, delivered)
        XCTAssertNotEqual(delivered, read)
        XCTAssertNotEqual(sent, read)
    }

    func test_label_allStates_areUnique() {
        let labels = [
            BubbleDeliveryCheck.label(.offlinePending),
            BubbleDeliveryCheck.label(.sending),
            BubbleDeliveryCheck.label(.slow),
            BubbleDeliveryCheck.label(.sent),
            BubbleDeliveryCheck.label(.delivered),
            BubbleDeliveryCheck.label(.read),
            BubbleDeliveryCheck.label(.failed)
        ]
        XCTAssertEqual(Set(labels).count, labels.count, "Each delivery state needs a distinct label")
    }
}
