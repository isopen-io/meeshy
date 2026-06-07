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
        c.repliesInline = false
        c.onConfirmedReply = nil
        return c
    }

    func test_requestReply_inDirectConversation_repliesImmediately_noPopup() {
        let c = resetController()
        var replied: StatusEntry?
        c.onConfirmedReply = { replied = $0 }
        c.repliesInline = true
        c.currentEntry = makeEntry(userId: "u1")

        c.requestReply()

        XCTAssertEqual(replied?.userId, "u1")
        XCTAssertNil(c.replyConfirmationEntry)
        XCTAssertNil(c.currentEntry)
    }

    func test_requestReply_elsewhere_showsConfirmationPopup() {
        let c = resetController()
        var replied: StatusEntry?
        c.onConfirmedReply = { replied = $0 }
        c.repliesInline = false // story tray / groupe / ailleurs
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
