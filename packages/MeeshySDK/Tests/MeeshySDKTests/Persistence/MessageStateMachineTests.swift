import XCTest
@testable import MeeshySDK

final class MessageStateTests: XCTestCase {

    func test_comparable_sentIsGreaterThanSending() {
        XCTAssertTrue(MessageState.sent > MessageState.sending)
    }

    func test_comparable_readIsGreaterThanDelivered() {
        XCTAssertTrue(MessageState.read > MessageState.delivered)
    }

    func test_comparable_failedIsLessThanDraft() {
        XCTAssertTrue(MessageState.failed < MessageState.draft)
    }

    func test_codable_roundtrip() throws {
        let state = MessageState.delivered
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(MessageState.self, from: data)
        XCTAssertEqual(decoded, .delivered)
    }
}
