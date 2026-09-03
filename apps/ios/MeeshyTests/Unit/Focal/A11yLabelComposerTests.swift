import XCTest
import MeeshySDK
@testable import Meeshy

/// F-080 (WS-1) — `MessageAccessibilityLabelComposer` : réplique fidèle,
/// segment par segment et DANS L'ORDRE, de
/// `BubbleStandardLayout.messageAccessibilityLabel`. Les valeurs attendues
/// sont résolues via `String(localized:bundle:)` AU MOMENT DU TEST (même
/// patron que `BubbleLocationRenderingTests`) — locale-agnostique par
/// construction, jamais une chaîne recopiée en dur qui romprait sous une
/// autre locale de simulateur.
@MainActor
final class A11yLabelComposerTests: XCTestCase {

    // MARK: - Fabrique minimale

    private func makeContent(
        isMe: Bool = false,
        senderName: String? = "Ali",
        text: String? = nil,
        reply: BubbleContent.Reply? = nil,
        attachments: BubbleContent.Attachments = .none,
        location: SharedPlace? = nil,
        editedAt: Date? = nil,
        isPinned: Bool = false,
        ephemeral: BubbleContent.Ephemeral? = nil,
        reactions: [MeeshyReactionSummary] = [],
        deliveryStatus: MeeshyMessage.DeliveryStatus? = nil
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1",
            kind: .standard,
            text: text.map {
                BubbleContent.Text(
                    raw: $0, isEmojiOnly: false, emojiFontSize: nil,
                    firstLinkURL: nil, embeddedVideo: nil, trackedLinks: [:], embedTrackedURL: nil
                )
            },
            translation: nil,
            reply: reply,
            attachments: attachments,
            location: location,
            ephemeral: ephemeral,
            isBlurred: false,
            isViewOnce: false,
            isPinned: isPinned,
            forwardAttribution: nil,
            editedAt: editedAt,
            isEditSaving: false,
            hasEditHistory: false,
            reactions: reactions,
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: deliveryStatus),
            isMe: isMe,
            senderName: senderName,
            callNotice: nil, joinNotice: nil
        )
    }

    /// `MeeshyMessageAttachment.type` est un `var` CALCULÉ depuis `mimeType`
    /// (`CoreModels.swift:1374`) — pas un paramètre d'`init`.
    private func attachment(id: String = "a1", type: MeeshyMessageAttachment.AttachmentType, originalName: String = "x") -> MeeshyMessageAttachment {
        let mimeType: String
        switch type {
        case .image: mimeType = "image/jpeg"
        case .video: mimeType = "video/mp4"
        case .audio: mimeType = "audio/mpeg"
        case .location: mimeType = "application/x-location"
        case .file: mimeType = "application/octet-stream"
        }
        return MeeshyMessageAttachment(id: id, fileName: originalName, originalName: originalName, mimeType: mimeType, fileSize: 1)
    }

    // MARK: - Segments isolés

    func test_compose_receivedMessage_startsWithSenderName() {
        let content = makeContent(isMe: false, senderName: "Ali", text: "Salut")
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).hasPrefix("Ali"))
    }

    func test_compose_receivedMessage_nilSenderName_usesUnknownSenderLabel() {
        let expected = String(localized: "a11y.message.unknown_sender", bundle: .main)
        let content = makeContent(isMe: false, senderName: nil, text: "Salut")
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).hasPrefix(expected))
    }

    func test_compose_ownMessage_doesNotIncludeSenderSegment() {
        let content = makeContent(isMe: true, senderName: nil, text: "Salut")
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).hasPrefix("Salut"))
    }

    func test_compose_includesRawText() {
        let content = makeContent(text: "Bonjour le monde")
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains("Bonjour le monde"))
    }

    func test_compose_alwaysIncludesTimeString() {
        let content = makeContent(text: "Salut")
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains("10:41"))
    }

    func test_compose_editedMessage_includesEditedLabel() {
        let expected = String(localized: "a11y.message.edited", bundle: .main)
        let content = makeContent(text: "Salut", editedAt: Date())
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    func test_compose_pinnedMessage_includesPinnedLabel() {
        let expected = String(localized: "a11y.message.pinned", bundle: .main)
        let content = makeContent(text: "Salut", isPinned: true)
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    func test_compose_ephemeralMessage_includesEphemeralLabel() {
        let expected = String(localized: "a11y.message.ephemeral", bundle: .main)
        let content = makeContent(text: "Salut", ephemeral: BubbleContent.Ephemeral(expiresAt: Date()))
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    /// The literal « lu » these two asserted on until 270i was doubly wrong. It only
    /// ever matched because `a11y.delivery.read` was ABSENT from the catalog, so every
    /// locale fell back to the French `defaultValue` — and the positive assertion passed
    /// for the wrong reason on top of that: its own fixture text, « Salut », CONTAINS
    /// « lu », so it would have held even if the delivery segment were dropped entirely.
    /// Asking the catalog, as every neighbouring test here already does, fixes both.
    func test_compose_ownMessage_includesDeliveryStatusSegment() {
        let expected = String(localized: "a11y.delivery.read", bundle: .main)
        let content = makeContent(isMe: true, text: "Salut", deliveryStatus: .read)
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    func test_compose_receivedMessage_omitsDeliveryStatusSegment() {
        let unexpected = String(localized: "a11y.delivery.read", bundle: .main)
        let content = makeContent(isMe: false, senderName: "Ali", text: "Bonjour", deliveryStatus: nil)
        XCTAssertFalse(MessageAccessibilityLabelComposer.compose(content).contains(unexpected))
    }

    func test_compose_locationMessage_includesLocationLabel() {
        let expected = String(localized: "a11y.message.location", bundle: .main)
        let place = SharedPlace(latitude: 1, longitude: 2, name: nil, address: nil)
        let content = makeContent(location: place)
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    func test_compose_reactions_includesFormattedSummary() {
        let content = makeContent(text: "Salut", reactions: [MeeshyReactionSummary(emoji: "❤️", count: 3)])
        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains("❤️ 3"))
    }

    // MARK: - Réponse citée

    func test_compose_replyWithExcerpt_includesAuthorAndExcerpt() {
        let reference = ReplyReference(authorName: "Sami", previewText: "à quelle heure ?")
        let content = makeContent(text: "18h", reply: BubbleContent.Reply(reference: reference, isStory: false))
        let composed = MessageAccessibilityLabelComposer.compose(content)

        XCTAssertTrue(composed.contains("Sami"))
        XCTAssertTrue(composed.contains("à quelle heure ?"))
    }

    func test_compose_replyToSelf_usesYouLabel() {
        let expected = String(localized: "a11y.bubble.replyTo.you", bundle: .main)
        let reference = ReplyReference(authorName: "Ali", previewText: "ok", isMe: true)
        let content = makeContent(text: "18h", reply: BubbleContent.Reply(reference: reference, isStory: false))

        XCTAssertTrue(MessageAccessibilityLabelComposer.compose(content).contains(expected))
    }

    // MARK: - Critère d'acceptation WS-1 : réponse + 2 images + réaction, DANS L'ORDRE

    func test_compose_replyPlusTwoImagesPlusReaction_containsFiveSegmentsInOrder() {
        let reference = ReplyReference(authorName: "Sami", previewText: "regarde ça")
        let content = makeContent(
            isMe: false,
            senderName: "Ali",
            text: "Voilà !",
            reply: BubbleContent.Reply(reference: reference, isStory: false),
            attachments: .visualGrid([attachment(id: "i1", type: .image), attachment(id: "i2", type: .image)]),
            reactions: [MeeshyReactionSummary(emoji: "👍", count: 1)]
        )

        let composed = MessageAccessibilityLabelComposer.compose(content)
        let parts = composed.components(separatedBy: ", ")

        let senderIndex = parts.firstIndex(of: "Ali")!
        let replyIndex = parts.firstIndex { $0.contains("Sami") }!
        let textIndex = parts.firstIndex(of: "Voilà !")!
        let imagesIndex = parts.firstIndex { $0.contains("2") }!
        let reactionsIndex = parts.firstIndex { $0.contains("👍") }!

        // 5 segments distincts : sender, reply, text, images, reactions —
        // et dans l'ordre gelé sender → reply → text → images → … → reactions.
        XCTAssertTrue(senderIndex < replyIndex)
        XCTAssertTrue(replyIndex < textIndex)
        XCTAssertTrue(textIndex < imagesIndex)
        XCTAssertTrue(imagesIndex < reactionsIndex)
    }
}
