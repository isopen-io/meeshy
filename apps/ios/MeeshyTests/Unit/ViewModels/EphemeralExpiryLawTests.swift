import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EphemeralExpiryLawTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeMessage(id: String, expiresAt: Date? = nil, isBurning: Bool = false) -> Message {
        var message = Message(
            id: id,
            conversationId: "000000000000000000000093",
            senderId: "u1",
            content: "texte",
            expiresAt: expiresAt,
            isMe: false
        )
        message.isBurning = isBurning
        return message
    }

    func test_aMessageWithoutExpiry_hasNoDeadlineAndIsNeverElapsed() {
        let messages = [makeMessage(id: "plain")]

        XCTAssertTrue(EphemeralExpiryLaw.deadlines(of: messages, now: now).isEmpty)
        XCTAssertTrue(EphemeralExpiryLaw.elapsedIds(in: messages, now: now).isEmpty)
    }

    func test_aFutureExpiry_isADeadline_notAnElapsedMessage() {
        let messages = [makeMessage(id: "soon", expiresAt: now.addingTimeInterval(600))]

        XCTAssertEqual(EphemeralExpiryLaw.deadlines(of: messages, now: now).keys.sorted(), ["soon"])
        XCTAssertTrue(EphemeralExpiryLaw.elapsedIds(in: messages, now: now).isEmpty)
    }

    func test_aPastExpiry_isElapsed() {
        let messages = [makeMessage(id: "gone", expiresAt: now.addingTimeInterval(-600))]

        XCTAssertEqual(EphemeralExpiryLaw.elapsedIds(in: messages, now: now), ["gone"])
    }

    func test_scheduled_marksElapsedMessagesAsDueNow_exceptTheOnesAlreadyBurning() {
        let messages = [
            makeMessage(id: "gone", expiresAt: now.addingTimeInterval(-600)),
            makeMessage(id: "burning", expiresAt: now.addingTimeInterval(-600), isBurning: true),
            makeMessage(id: "soon", expiresAt: now.addingTimeInterval(600)),
        ]

        let table = EphemeralExpiryLaw.scheduled(for: messages, now: now)

        XCTAssertEqual(table["gone"], .distantPast)
        XCTAssertNil(table["burning"])
        XCTAssertNotNil(table["soon"])
    }
}
