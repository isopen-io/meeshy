import XCTest
@testable import Meeshy

@MainActor
final class MessageRowEnvelopeTests: XCTestCase {

    func test_equality_sameMessage_sameFlags_returnsTrue() {
        let a = MessageRowEnvelope(messageId: "msg-1")
        let b = MessageRowEnvelope(messageId: "msg-1")

        XCTAssertEqual(a, b)
    }

    func test_equality_differentIsHiddenForOverlay_returnsFalse() {
        let a = MessageRowEnvelope(messageId: "msg-1", isHiddenForOverlay: false)
        let b = MessageRowEnvelope(messageId: "msg-1", isHiddenForOverlay: true)

        XCTAssertNotEqual(a, b)
    }

    func test_equality_differentIsShadowedByOverlay_returnsFalse() {
        let a = MessageRowEnvelope(messageId: "msg-1", isShadowedByOverlay: false)
        let b = MessageRowEnvelope(messageId: "msg-1", isShadowedByOverlay: true)

        XCTAssertNotEqual(a, b)
    }

    func test_equality_differentMessageId_returnsFalse() {
        let a = MessageRowEnvelope(messageId: "msg-1")
        let b = MessageRowEnvelope(messageId: "msg-2")

        XCTAssertNotEqual(a, b)
    }

    func test_defaultInit_setsAllFlagsFalse() {
        let envelope = MessageRowEnvelope(messageId: "msg-1")

        XCTAssertFalse(envelope.isHiddenForOverlay)
        XCTAssertFalse(envelope.isShadowedByOverlay)
    }
}
