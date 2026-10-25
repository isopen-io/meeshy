import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// `ConversationView.unreadCallIndicator(for:)` maps the last unread
/// message's `CallSummaryMetadata` to the scroll-to-bottom pill's SF Symbol +
/// hex tint. Reads `isLive` BEFORE `outcome` (a live message's outcome is a
/// neutral placeholder) and keeps "annulé" on the same error hex as "manqué"
/// — mirrors `CallNoticePresentation` (`BubbleCallNoticeView.swift`), the
/// SSOT for call vocabulary, without re-decoding `message.metadata`.
@MainActor
final class ConversationScrollControlsCallIndicatorTests: XCTestCase {

    func test_noCallSummary_returnsNilSymbolAndTint() {
        let result = ConversationView.unreadCallIndicator(for: nil)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    func test_liveAudioCall_returnsPhoneGlyphAndNilTint() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertNil(result.tint, "la pastille est déjà teintée accent — le glyphe retombe sur contentColor")
    }

    func test_liveVideoCall_returnsVideoGlyph() {
        let summary = makeSummary(callType: .video, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
    }

    func test_liveCall_readsIsLiveBeforeOutcome_evenWithCompletedPlaceholder() {
        // Un message vivant porte outcome:.completed comme placeholder neutre —
        // isLive doit gagner, jamais retomber sur la branche "abouti" (nil/nil).
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNotNil(result.symbol)
    }

    func test_missedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .audio, outcome: .missed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_rejectedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .video, outcome: .rejected)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_cancelledCall_missedEndedByInitiator_staysOnErrorHex_sameFamilyAsMissed() {
        let summary = CallSummaryMetadata(
            callId: "call1", initiatorId: "u1", callType: .audio, outcome: .missed,
            durationSeconds: 0, bytesTotal: nil, bytesEstimated: false, networkQuality: nil,
            endedByInitiator: true
        )

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_failedCall_returnsWarningHex_notError() {
        let summary = makeSummary(callType: .audio, outcome: .failed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.warningHex)
        XCTAssertNotEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_completedCall_returnsNilSymbolAndTint_noPendingActionToFlag() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: false)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    private func makeSummary(
        callType: CallSummaryMetadata.MediaType,
        outcome: CallSummaryMetadata.Outcome,
        isLive: Bool = false
    ) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: "call1",
            initiatorId: "peer",
            callType: callType,
            outcome: outcome,
            durationSeconds: 30,
            bytesTotal: 100_000,
            bytesEstimated: false,
            networkQuality: .good,
            isLive: isLive
        )
    }
}

/// #13109 — la pastille « revenir en bas » ne montre jamais ce que la bulle
/// scelle ou voile : ni texte, ni vignette, ni image, ni audio.
final class ConversationScrollPillProtectionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_792_970_000)
    private let secret = "Le code du coffre est 4417"

    private func photo(isViewOnce: Bool = false, isBlurred: Bool = false) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn.example/secret.jpg",
                                isViewOnce: isViewOnce, isBlurred: isBlurred, thumbnailUrl: "https://cdn.example/secret-thumb.jpg")
    }

    private func message(
        content: String? = nil,
        effects: MessageEffects = .none,
        expiresAt: Date? = nil,
        deletedAt: Date? = nil,
        isEncrypted: Bool = false,
        encryptionMode: String? = nil,
        attachments: [MeeshyMessageAttachment]? = nil
    ) -> Message {
        Message(conversationId: "c1", senderId: "peer", content: content ?? secret, deletedAt: deletedAt,
                expiresAt: expiresAt, effects: effects, isEncrypted: isEncrypted, encryptionMode: encryptionMode,
                attachments: attachments ?? [photo()])
    }

    func test_anOrdinaryMessage_showsItsTextAndItsPiece() {
        let preview = ConversationView.unreadPreview(of: message(), now: now)

        XCTAssertEqual(preview.text, secret)
        XCTAssertEqual(preview.attachment?.id, "a1")
    }

    func test_aProtectedMessage_showsNothingOfItsContent() {
        let cases: [(String, Message)] = [
            ("vue unique", message(effects: MessageEffects(flags: [.viewOnce]))),
            ("flou", message(effects: MessageEffects(flags: [.blurred]))),
            ("pièce à vue unique", message(attachments: [photo(isViewOnce: true)])),
            ("pièce floutée", message(attachments: [photo(isBlurred: true)])),
            ("éphémère échu", message(expiresAt: now.addingTimeInterval(-1))),
            ("supprimé", message(deletedAt: now.addingTimeInterval(-60))),
            ("chiffré non ouvert", message(content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee")),
        ]
        for (label, protected) in cases {
            let preview = ConversationView.unreadPreview(of: protected, now: now)
            XCTAssertNil(preview.text, "\(label) : le texte ne part pas dans la pastille")
            XCTAssertNil(preview.attachment, "\(label) : ni vignette, ni image, ni audio")
        }
    }

    func test_anEphemeralStillAlive_staysReadableLikeItsBubble() {
        let preview = ConversationView.unreadPreview(of: message(expiresAt: now.addingTimeInterval(60)), now: now)

        XCTAssertEqual(preview.text, secret)
    }

    func test_anEndToEndMessageThisDeviceOpened_showsItsPlaintext() {
        let preview = ConversationView.unreadPreview(of: message(content: "Bonjour", isEncrypted: true, encryptionMode: "e2ee", attachments: []), now: now)

        XCTAssertEqual(preview.text, "Bonjour")
    }
}
