import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class StatusBubbleControllerReplyTests: XCTestCase {

    private func makeEntry(userId: String = "u1") -> StatusEntry {
        StatusEntry(id: "s1", userId: userId, username: "alice",
                    avatarColor: "FF0000", moodEmoji: "🔥", content: "en forme")
    }

    private func resetController() -> StatusBubbleController {
        let c = StatusBubbleController.shared
        c.currentEntry = nil
        c.replyConfirmationEntry = nil
        c.onConfirmedReply = nil
        c.onOpenSpotlight = nil
        return c
    }

    func test_openSpotlight_opensTheMoodPage_withoutBubbleNorPopup() {
        let c = resetController()
        var opened: StatusEntry?
        var replied: StatusEntry?
        c.onOpenSpotlight = { opened = $0 }
        c.onConfirmedReply = { replied = $0 }
        c.currentEntry = makeEntry(userId: "u2")
        c.replyConfirmationEntry = makeEntry(userId: "u2")

        c.openSpotlight(entry: makeEntry(userId: "u1"))

        XCTAssertEqual(opened?.userId, "u1")
        XCTAssertNil(replied)
        XCTAssertNil(c.currentEntry)
        XCTAssertNil(c.replyConfirmationEntry)
    }

    func test_requestReply_elsewhere_showsConfirmationPopup() {
        let c = resetController()
        var replied: StatusEntry?
        c.onConfirmedReply = { replied = $0 }
        c.currentEntry = makeEntry(userId: "u1")

        c.requestReply()

        XCTAssertEqual(c.replyConfirmationEntry?.userId, "u1")
        XCTAssertNil(replied)
        XCTAssertNil(c.currentEntry)
    }

    func test_requestReply_noCurrentEntry_isNoOp() {
        let c = resetController()
        c.requestReply()
        XCTAssertNil(c.replyConfirmationEntry)
    }
}
