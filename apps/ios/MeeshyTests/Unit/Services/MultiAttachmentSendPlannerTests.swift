import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class MultiAttachmentSendPlannerTests: XCTestCase {

    private func audio(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "audio/mp4", duration: 1000, channels: 2)
    }
    private func image(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "image/jpeg")
    }
    private func video(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "video/mp4", duration: 3000)
    }

    func test_plan_audioThenVisual_thenText_inAddOrder() {
        let atts = [audio("a1"), audio("a2"), image("i1"), video("v1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "légende", hasReply: false)

        XCTAssertEqual(plan.count, 3)
        XCTAssertEqual(plan[0].kind, .audio)
        XCTAssertEqual(plan[0].attachments.map(\.id), ["a1", "a2"])
        XCTAssertNil(plan[0].text)
        XCTAssertEqual(plan[1].kind, .visual)
        XCTAssertEqual(plan[1].attachments.map(\.id), ["i1", "v1"])
        XCTAssertEqual(plan[2].kind, .text)
        XCTAssertEqual(plan[2].text, "légende")
        XCTAssertTrue(plan[2].attachments.isEmpty)
    }

    func test_plan_visualAddedFirst_visualGroupComesFirst() {
        let atts = [image("i1"), audio("a1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "", hasReply: false)

        XCTAssertEqual(plan.count, 2)
        XCTAssertEqual(plan[0].kind, .visual)
        XCTAssertEqual(plan[1].kind, .audio)
    }

    func test_plan_replyGoesOnFirstMessageOnly() {
        let atts = [audio("a1"), image("i1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "txt", hasReply: true)

        XCTAssertTrue(plan[0].carriesReply)
        XCTAssertFalse(plan[1].carriesReply)
        XCTAssertFalse(plan[2].carriesReply)
    }

    func test_plan_emptyText_omitsTextMessage() {
        let atts = [audio("a1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "   ", hasReply: false)

        XCTAssertEqual(plan.count, 1)
        XCTAssertEqual(plan[0].kind, .audio)
    }

    func test_plan_textOnly_noAttachments_singleTextMessage() {
        let plan = MultiAttachmentSendPlanner.plan(attachments: [], text: "hello", hasReply: true)

        XCTAssertEqual(plan.count, 1)
        XCTAssertEqual(plan[0].kind, .text)
        XCTAssertEqual(plan[0].text, "hello")
        XCTAssertTrue(plan[0].carriesReply)
    }

    func test_plan_emptyInput_returnsEmptyPlan() {
        let plan = MultiAttachmentSendPlanner.plan(attachments: [], text: "", hasReply: false)
        XCTAssertTrue(plan.isEmpty)
    }
}
