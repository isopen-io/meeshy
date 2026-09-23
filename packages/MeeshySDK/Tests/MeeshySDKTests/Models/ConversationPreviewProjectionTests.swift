import XCTest
@testable import MeeshySDK

/// #7548 — la ligne de liste compose depuis `MeeshyConversation` : ce que la
/// conversation TIENT du dernier message doit arriver au composeur, et rien de
/// ce qu'une protection retient.
final class ConversationPreviewProjectionTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func strings() -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: "fr") { $0.rawValue }
    }

    private func conversation(
        preview: String? = "Bonjour",
        id: String? = "m-1",
        configure: (inout MeeshyConversation) -> Void = { _ in }
    ) -> MeeshyConversation {
        var row = MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .group,
                                     lastMessageAt: now.addingTimeInterval(-60),
                                     lastMessagePreview: preview, lastMessageId: id)
        row.lastMessageSenderName = "Alice"
        configure(&row)
        return row
    }

    private func compose(
        _ row: MeeshyConversation, preferred: [String] = ["fr"], typing: [String]? = nil, draft: String? = nil
    ) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: row, viewerId: "u-me", language: "fr",
            preferredLanguages: preferred, now: now, typing: typing, draft: draft
        )
        return ConversationPreviewComposer.compose(input, strings: strings())
    }

    func test_textMessage_carriesTheAuthorAndTheText() {
        let preview = compose(conversation())

        XCTAssertEqual(preview.kind, .message)
        XCTAssertEqual(preview.author?.label, "Alice")
        XCTAssertEqual(preview.segments, [.text("Bonjour", language: nil)])
    }

    func test_prism_servesTheSecondRank_whenTheFirstHasNoTranslation() {
        let row = conversation(preview: "Hello") {
            $0.lastMessageOriginalLanguage = "en"
            $0.lastMessageTranslations = ["fr": "Bonjour"]
        }

        let preview = compose(row, preferred: ["de", "fr"])

        XCTAssertEqual(preview.segments, [.text("Bonjour", language: "fr")])
    }

    func test_voiceMessage_withoutText_saysItsNatureAndDuration() {
        let row = conversation(preview: "") {
            $0.lastMessageAttachments = [MeeshyMessageAttachment(
                id: "att-1", originalName: "voice-1.webm", mimeType: "audio/webm", fileSize: 49152, duration: 12000
            )]
            $0.lastMessageAttachmentCount = 1
        }

        let preview = compose(row)

        XCTAssertEqual(preview.icon, .voice)
        XCTAssertTrue(preview.segments.contains(.label("0:12")), "\(preview.segments)")
    }

    func test_severalAttachments_withoutServedSummary_areCountedFromTheRow() {
        let photo = MeeshyMessageAttachment(id: "a", originalName: "", mimeType: "image/jpeg", fileSize: 10)
        let row = conversation(preview: "") {
            $0.lastMessageAttachments = [photo, MeeshyMessageAttachment(id: "b", originalName: "", mimeType: "image/png", fileSize: 10)]
            $0.lastMessageAttachmentCount = 2
        }

        let preview = compose(row)

        XCTAssertEqual(preview.icon, .photo)
        XCTAssertEqual(preview.segments.first, .label(ConversationPreviewStringKey.attachmentPhotoMany.rawValue))
    }

    func test_viewOnceMessage_neverCarriesItsText() {
        let row = conversation(preview: "code 4242") {
            $0.lastMessageIsViewOnce = true
            $0.lastMessageTranslations = ["en": "code 4242"]
        }

        let preview = compose(row, preferred: ["en"])

        XCTAssertEqual(preview.icon, .viewOnce)
        XCTAssertFalse(preview.segments.map(\.text).joined().contains("4242"))
    }

    func test_blurredAttachment_hidesTheMessage() {
        let row = conversation(preview: "") {
            var attachment = MeeshyMessageAttachment(id: "a", originalName: "", mimeType: "image/jpeg", fileSize: 10)
            attachment.isBlurred = true
            $0.lastMessageAttachments = [attachment]
            $0.lastMessageAttachmentCount = 1
        }

        XCTAssertEqual(compose(row).icon, .hidden)
    }

    func test_liveEphemeral_countsDownToItsServedDeadline() {
        let deadline = now.addingTimeInterval(240)
        let row = conversation {
            $0.lastMessageExpiresAt = deadline
            $0.lastMessageNature = LastMessageNature(ephemeralDuration: 300)
        }

        let preview = compose(row)

        XCTAssertEqual(preview.icon, .ephemeral)
        XCTAssertEqual(preview.liveUntil, deadline)
    }

    func test_locationWithoutNature_isNamedAsAPlace() {
        let row = conversation(preview: "") {
            $0.lastMessageLocation = SharedPlace(latitude: 1, longitude: 2, name: "Gare de Lyon")
        }

        let preview = compose(row)

        XCTAssertEqual(preview.icon, .location)
        XCTAssertTrue(preview.segments.contains(.label("Gare de Lyon")))
    }

    func test_activeCall_offersToJoin() {
        let row = conversation {
            $0.activeCall = ConversationActiveCall(id: "call-1", kind: "audio", participantCount: 2, startedAt: self.now)
        }

        XCTAssertTrue(compose(row).offersJoin)
    }

    func test_newerReaction_takesTheLine() {
        let row = conversation {
            $0.lastReaction = ConversationLastReaction(
                emoji: "❤️", reactorId: "p-b", reactorUserId: "u-b", reactorName: "Bob", messageId: "m-1",
                targetSenderId: nil, targetSenderUserId: "u-me", excerpt: "Bonjour", excerptOriginalLanguage: "fr",
                excerptTranslations: nil, excerptProtection: nil, createdAt: self.now
            )
        }

        XCTAssertEqual(compose(row).kind, .reaction)
    }

    func test_typingAndDraft_keepTheirPriority() {
        XCTAssertEqual(compose(conversation(), typing: ["Bob"]).kind, .typing)
        XCTAssertEqual(compose(conversation(), draft: "à finir").kind, .draft)
    }

    func test_conversationWithoutAnyMessage_isEmpty() {
        XCTAssertEqual(compose(conversation(preview: nil, id: nil)).kind, .empty)
    }
}
