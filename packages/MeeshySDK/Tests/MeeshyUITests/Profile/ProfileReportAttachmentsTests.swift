import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19609, planche `Signaler` — « Joindre des messages · 2 joints ». Le brouillon joint au plus dix messages, d'un
/// toucher, sans doublon ; un message chiffré de bout en bout ne se joint qu'avec un consentement explicite ; et rien
/// ne part tant que la passerelle n'annonce pas le champ (la section n'existe pas).
@MainActor
final class ProfileReportAttachmentsTests: XCTestCase {

    private static func message(_ id: String, isEndToEnd: Bool = false) -> ProfileReportAttachment {
        ProfileReportAttachment(id: id, conversationId: "c1", excerpt: "Réponds. Je sais que tu es là.",
                                sentAt: Date(timeIntervalSince1970: 1_800_000_000), isEndToEnd: isEndToEnd)
    }

    // MARK: - Le brouillon

    func test_toggling_attachesThenDetaches() {
        let attached = ProfileReportDraft().toggling(Self.message("m1"))

        XCTAssertEqual(attached.sentMessageIds, ["m1"])
        XCTAssertTrue(attached.isAttached("m1"))
        XCTAssertTrue(attached.toggling(Self.message("m1")).attachments.isEmpty)
    }

    func test_toggling_keepsTheOrderOfTheTouches() {
        let draft = ProfileReportDraft().toggling(Self.message("m2")).toggling(Self.message("m1"))

        XCTAssertEqual(draft.sentMessageIds, ["m2", "m1"])
    }

    func test_toggling_neverGoesBeyondTheLimit() {
        let full = (1...10).reduce(ProfileReportDraft()) { draft, index in draft.toggling(Self.message("m\(index)")) }

        XCTAssertEqual(full.attachments.count, 10)
        XCTAssertEqual(full.toggling(Self.message("m11")), full, "un onzième message ne se joint pas")
        XCTAssertEqual(ProfileReportDraft.attachmentsLimit, 10)
    }

    func test_toggling_followsAnAnnouncedLimitBelowTen() {
        let draft = ProfileReportDraft().toggling(Self.message("m1"), limit: 1).toggling(Self.message("m2"), limit: 1)

        XCTAssertEqual(draft.sentMessageIds, ["m1"])
    }

    func test_init_dropsDuplicates_andBoundsTheList() {
        let many = (1...12).map { Self.message("m\($0)") } + [Self.message("m1")]
        let draft = ProfileReportDraft(attachments: [Self.message("m1")] + many)

        XCTAssertEqual(draft.attachments.count, 10)
        XCTAssertEqual(draft.sentMessageIds.filter { $0 == "m1" }.count, 1)
    }

    func test_otherGestures_keepTheAttachedMessages() {
        let draft = ProfileReportDraft().toggling(Self.message("m1")).choosing("harassment").writing("Il insiste").togglingBlock()

        XCTAssertEqual(draft.sentMessageIds, ["m1"])
    }

    // MARK: - Chiffré de bout en bout : consentement explicite

    func test_endToEndMessage_needsConsent() {
        let message = Self.message("m1", isEndToEnd: true)

        XCTAssertTrue(ProfileReportDraft().toggling(message).attachments.isEmpty)
        XCTAssertEqual(ProfileReportDraft().toggling(message, consented: true).sentMessageIds, ["m1"])
    }

    func test_endToEndMessage_detachesWithoutConsent() {
        let message = Self.message("m1", isEndToEnd: true)
        let attached = ProfileReportDraft().toggling(message, consented: true)

        XCTAssertTrue(attached.toggling(message).attachments.isEmpty)
    }

    // MARK: - La passerelle annonce, ou non

    func test_offeredLimit_isNilWhenTheGatewayAnnouncesNothing() {
        XCTAssertNil(ProfileReportAttachmentsRule.offeredLimit(nil))
        XCTAssertNil(ProfileReportAttachmentsRule.offeredLimit(0))
        XCTAssertEqual(ProfileReportAttachmentsRule.offeredLimit(5), 5)
        XCTAssertEqual(ProfileReportAttachmentsRule.offeredLimit(50), 10)
    }

    func test_sending_dropsTheAttachmentsWhenTheGatewayAnnouncesNothing() {
        let draft = ProfileReportDraft().choosing("spam").writing("Il insiste").toggling(Self.message("m1"))

        let silent = ProfileReportAttachmentsRule.sending(draft, limit: nil)

        XCTAssertEqual(silent.sentMessageIds, [])
        XCTAssertEqual(silent.reason, .spam)
        XCTAssertEqual(silent.details, "Il insiste")
        XCTAssertEqual(ProfileReportAttachmentsRule.sending(draft, limit: 10).sentMessageIds, ["m1"])
    }

    func test_reportOfADraft_sendsReasonWordAndAttachedIds() async {
        let social = StubProfileSocialActions()
        let actions = ProfileConnectionActions(relationships: SpyProfileRelationshipState(), social: social)
        let draft = ProfileReportDraft().choosing("harassment").writing(" Il insiste ").toggling(Self.message("m1"))

        let reported = await actions.report(userId: "u-bob", draft: draft)

        XCTAssertTrue(reported)
        XCTAssertEqual(social.reportCalls.map(\.reportType), ["harassment"])
        XCTAssertEqual(social.reportCalls.map(\.reason), ["Il insiste"])
        XCTAssertEqual(social.reportAttachedMessageIds, [["m1"]])
    }

    func test_reportOfADraftWithoutReason_sendsNothing() async {
        let social = StubProfileSocialActions()
        let actions = ProfileConnectionActions(relationships: SpyProfileRelationshipState(), social: social)

        let reported = await actions.report(userId: "u-bob", draft: ProfileReportDraft())

        XCTAssertFalse(reported)
        XCTAssertTrue(social.reportCalls.isEmpty)
    }

    func test_canAdd_stopsAtTheLimit() {
        let one = ProfileReportDraft().toggling(Self.message("m1"))

        XCTAssertTrue(ProfileReportAttachmentsRule.canAdd(ProfileReportDraft(), limit: 1))
        XCTAssertFalse(ProfileReportAttachmentsRule.canAdd(one, limit: 1))
    }

    // MARK: - La source du cache

    func test_excerptFromTheCache_isNeverEndToEnd() {
        let excerpt = ReportableMessageExcerpt(messageId: "m1", conversationId: "c1", text: "Bonjour",
                                               sentAt: Date(timeIntervalSince1970: 1_800_000_000))

        let attachment = ProfileReportAttachment(excerpt: excerpt)

        XCTAssertEqual(attachment.id, "m1")
        XCTAssertEqual(attachment.excerpt, "Bonjour")
        XCTAssertFalse(attachment.isEndToEnd)
    }

    // MARK: - Le pied de la vignette

    @MainActor
    func test_caption_saysTodayAndYesterday() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let yesterday = now.addingTimeInterval(-86_400)

        let today = ProfileReportAttachmentsRule.caption(for: now, now: now, calendar: calendar)
        let before = ProfileReportAttachmentsRule.caption(for: yesterday, now: now, calendar: calendar)

        XCTAssertTrue(today.hasPrefix(ProfileReportAttachmentsCopy.today))
        XCTAssertTrue(before.hasPrefix(ProfileReportAttachmentsCopy.yesterday))
    }

    // MARK: - L'envoi

    @MainActor
    func test_report_sendsTheAttachedIds() async {
        let social = StubProfileSocialActions()
        let actions = ProfileConnectionActions(relationships: SpyProfileRelationshipState(), social: social)

        let reported = await actions.report(userId: "u-bob", reportType: "harassment", reason: nil,
                                            attachedMessageIds: ["m1", "m2"])

        XCTAssertTrue(reported)
        XCTAssertEqual(social.reportAttachedMessageIds, [["m1", "m2"]])
    }

    /// Loi 12 — la section est faite du kit : la rangée K20 à vignettes TEXTE cochées, les lignes K06, le bloc K38.
    func test_section_isMadeOfTheKit() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/ProfileReportAttachmentsSection.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        for part in ["MeeshyThumbnailRow(", "MeeshyThumbnailExcerpt(", "isChecked: true", "MeeshyToggleRow(", "MeeshyStateBlock("] {
            XCTAssertTrue(source.contains(part), part)
        }
    }
}
