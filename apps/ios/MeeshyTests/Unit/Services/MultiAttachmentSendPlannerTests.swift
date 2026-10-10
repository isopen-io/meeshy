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

    func test_plan_fivePhotosWithCaption_singleMessageCarriesCaptionAndPhotosInComposerOrder() {
        let atts = ["p4", "p2", "p5", "p1", "p3"].map { image($0) }
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "  Ordre 4,2,5,1,3  ", hasReply: false)

        XCTAssertEqual(plan.count, 1, "la légende voyage avec les photos, jamais en message texte séparé (#9860)")
        XCTAssertEqual(plan[0].kind, .visual)
        XCTAssertEqual(plan[0].attachments.map(\.id), ["p4", "p2", "p5", "p1", "p3"])
        XCTAssertEqual(plan[0].text, "Ordre 4,2,5,1,3")
        XCTAssertEqual(plan[0].messageContent, "Ordre 4,2,5,1,3")
    }

    func test_plan_audioThenVisual_captionRidesTheVisualGroup_inAddOrder() {
        let atts = [audio("a1"), audio("a2"), image("i1"), video("v1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "légende", hasReply: false)

        XCTAssertEqual(plan.count, 2)
        XCTAssertEqual(plan[0].kind, .audio)
        XCTAssertEqual(plan[0].attachments.map(\.id), ["a1", "a2"])
        XCTAssertNil(plan[0].text)
        XCTAssertEqual(plan[0].messageContent, "")
        XCTAssertEqual(plan[1].kind, .visual)
        XCTAssertEqual(plan[1].attachments.map(\.id), ["i1", "v1"])
        XCTAssertEqual(plan[1].text, "légende")
        XCTAssertFalse(plan.contains { $0.kind == .text })
    }

    func test_plan_audioOnlyWithText_textStaysItsOwnMessageSentLast() {
        let plan = MultiAttachmentSendPlanner.plan(attachments: [audio("a1")], text: "légende", hasReply: false)

        XCTAssertEqual(plan.map(\.kind), [.audio, .text])
        XCTAssertNil(plan[0].text)
        XCTAssertEqual(plan[1].text, "légende")
        XCTAssertTrue(plan[1].attachments.isEmpty)
    }

    func test_plan_visualWithoutText_carriesNoCaption() {
        let plan = MultiAttachmentSendPlanner.plan(attachments: [image("i1"), image("i2")], text: "", hasReply: false)

        XCTAssertEqual(plan.count, 1)
        XCTAssertNil(plan[0].text)
        XCTAssertEqual(plan[0].messageContent, "")
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

        XCTAssertEqual(plan.count, 2)
        XCTAssertTrue(plan[0].carriesReply)
        XCTAssertFalse(plan[1].carriesReply)
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

    /// Le chemin d'envoi groupé de la conversation passe la légende du lot au
    /// message de ses pièces — en ligne, hors ligne et au ré-enfilage après
    /// un échec — et à sa bulle optimiste. Un `content: ""` en dur sur ces
    /// sites renverrait les photos sans leur légende, même avec un plan juste.
    func test_wiring_groupSends_carryTheGroupCaption() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let source = try String(contentsOf: appRoot.appendingPathComponent(
            "Features/Main/Views/ConversationView+AttachmentHandlers.swift"), encoding: .utf8)
        let count: (String) -> Int = { needle in source.components(separatedBy: needle).count - 1 }

        XCTAssertEqual(count("content: send.group.messageContent,"), 2,
                       "la bulle optimiste et l'envoi en ligne du groupe portent sa légende")
        XCTAssertEqual(count("content: send.group.text,"), 4,
                       "les quatre mises en file (hors ligne et échec en ligne, audio et visuel) portent la légende")
    }
}
