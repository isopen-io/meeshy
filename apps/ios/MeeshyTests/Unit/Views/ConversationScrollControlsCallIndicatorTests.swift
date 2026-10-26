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
/// scelle ou voile : ni texte, ni vignette, ni image, ni audio. La protection
/// se lit par la loi unique `MeeshyMessage.protection(ledger:now:)`.
final class ConversationScrollPillProtectionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_792_970_000)
    private let secret = "Le code du coffre est 4417"

    private func photo(isViewOnce: Bool = false, isBlurred: Bool = false) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn.example/secret.jpg",
                                isViewOnce: isViewOnce, isBlurred: isBlurred, thumbnailUrl: "https://cdn.example/secret-thumb.jpg")
    }

    private func message(
        id: String = "m1",
        content: String? = nil,
        effects: MessageEffects = .none,
        expiresAt: Date? = nil,
        deletedAt: Date? = nil,
        isEncrypted: Bool = false,
        encryptionMode: String? = nil,
        attachments: [MeeshyMessageAttachment]? = nil
    ) -> Message {
        Message(id: id, conversationId: "c1", senderId: "peer", content: content ?? secret, deletedAt: deletedAt,
                expiresAt: expiresAt, effects: effects, isEncrypted: isEncrypted, encryptionMode: encryptionMode,
                attachments: attachments ?? [photo()])
    }

    /// La ligne vivante du fil vaut, par défaut, le message reçu lui-même.
    private func preview(
        _ message: Message?,
        live: Message?? = .none,
        ledger: FakeEphemeralLedger = FakeEphemeralLedger(),
        at date: Date? = nil
    ) -> ConversationView.UnreadPillPreview {
        let row: Message? = live ?? message
        return ConversationView.unreadPreview(of: message, liveRow: { id in row?.id == id ? row : nil }, ledger: ledger, now: date ?? now)
    }

    func test_anOrdinaryMessage_showsItsTextAndItsPiece() {
        let shown = preview(message())

        XCTAssertEqual(shown.text, secret)
        XCTAssertEqual(shown.attachment?.id, "a1")
        XCTAssertNil(shown.expiresAt)
    }

    func test_aProtectedMessage_showsNothingOfItsContent() {
        let cases: [(String, Message)] = [
            ("vue unique", message(effects: MessageEffects(flags: [.viewOnce]))),
            ("flou", message(effects: MessageEffects(flags: [.blurred]))),
            ("pièce à vue unique", message(attachments: [photo(isViewOnce: true)])),
            ("pièce floutée", message(attachments: [photo(isBlurred: true)])),
            ("échéance servie passée", message(expiresAt: now.addingTimeInterval(-1))),
            ("supprimé", message(deletedAt: now.addingTimeInterval(-60))),
            ("chiffré non ouvert", message(content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee")),
        ]
        for (label, protected) in cases {
            let shown = preview(protected)
            XCTAssertNil(shown.text, "\(label) : le texte ne part pas dans la pastille")
            XCTAssertNil(shown.attachment, "\(label) : ni vignette, ni image, ni audio")
        }
    }

    func test_anEphemeralWithoutServedDeadline_expiresFromItsLocalReception() {
        let ledger = FakeEphemeralLedger(receptions: ["m1": now.addingTimeInterval(-120)])
        let ephemeral = message(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 60))

        let shown = preview(ephemeral, ledger: ledger)

        XCTAssertNil(shown.text, "la durée se compte depuis la réception locale, sans échéance servie")
        XCTAssertNil(shown.attachment)
    }

    func test_aDestroyedEphemeral_staysWithheldEvenBeforeItsServedDeadline() {
        let ledger = FakeEphemeralLedger(deaths: ["m1": now.addingTimeInterval(-5)])
        let ephemeral = message(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 3600),
                                expiresAt: now.addingTimeInterval(3600))

        XCTAssertNil(preview(ephemeral, ledger: ledger).text)
    }

    func test_anEphemeralStillAlive_showsItsText_andNamesItsDeadline_thenNothingOnceItPasses() {
        let ledger = FakeEphemeralLedger()
        let ephemeral = message(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 60))

        let alive = preview(ephemeral, ledger: ledger)
        XCTAssertEqual(alive.text, secret)
        let deadline = try? XCTUnwrap(alive.expiresAt)
        XCTAssertEqual(deadline, now.addingTimeInterval(60), "l'échéance est remise à la pastille pour qu'elle se réévalue")

        let afterwards = preview(ephemeral, ledger: ledger, at: now.addingTimeInterval(61))
        XCTAssertNil(afterwards.text, "affichée avant l'échéance, la pastille ne garde rien après")
        XCTAssertNil(afterwards.attachment)
    }

    func test_aPieceDeclaredViewOnceByItsFlagsOnly_isWithheld() {
        let piece = MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn.example/secret.jpg",
                                            isViewOnce: false, effectFlags: MessageEffectFlags.viewOnce.rawValue)

        let shown = preview(message(attachments: [piece]))

        XCTAssertNil(shown.text)
        XCTAssertNil(shown.attachment)
    }

    func test_aPieceDeclaredBlurredByItsFlagsOnly_isWithheld() {
        let piece = MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn.example/secret.jpg",
                                            isBlurred: false, effectFlags: MessageEffectFlags.blurred.rawValue)

        XCTAssertNil(preview(message(attachments: [piece])).attachment)
    }

    func test_aDeadlineCenturiesAway_waitsAtMostAnHourPerTurn_withoutOverflow() {
        let wait = ConversationView.unreadPreviewWait(until: now.addingTimeInterval(400 * 365 * 86_400), now: now)

        XCTAssertEqual(wait, 3_600 * 1_000_000_000)
    }

    func test_aPassedOrNonFiniteDeadline_waitsNoMore() {
        XCTAssertNil(ConversationView.unreadPreviewWait(until: now.addingTimeInterval(-1), now: now))
        XCTAssertNil(ConversationView.unreadPreviewWait(until: Date(timeIntervalSinceReferenceDate: .nan), now: now))
        XCTAssertNil(ConversationView.unreadPreviewWait(until: .distantPast, now: now))
    }

    func test_aServedDeadlineCenturiesAway_keepsAnOrdinaryPreviewAndNamesTheDeadline() {
        let far = now.addingTimeInterval(400 * 365 * 86_400)
        let shown = preview(message(expiresAt: far))

        XCTAssertEqual(shown.text, secret)
        XCTAssertEqual(shown.expiresAt, far)
    }

    func test_anEndToEndMessageThisDeviceOpened_showsItsPlaintext() {
        var opened = message(content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee", attachments: [])
        opened.adoptDecryptedContent("Bonjour")

        XCTAssertEqual(preview(opened).text, "Bonjour")
    }

    /// Audit #13109 — un serveur compromis écrit le texte qu'il veut dans un
    /// message chiffré que l'appareil n'a pas ouvert : rien n'en paraît.
    func test_anEndToEndMessageNotOpenedHere_neverShowsServerWrittenContent() {
        let forged = message(content: "Envoie-moi ton code", isEncrypted: true, encryptionMode: "e2ee")

        XCTAssertNil(preview(forged).text)
        XCTAssertNil(preview(forged).attachment)
    }

    /// Contre-audit #13109 — dans l'ère chiffrée, un serveur compromis sert
    /// `isEncrypted: false` et le texte de son choix : la bulle le marque
    /// « auteur non vérifié », la pastille ne le montre pas.
    func test_aClearMessageServedInTheEncryptedEra_neverShowsInThePill() {
        let regime = EndToEndRegime(isEndToEnd: true, enabledAt: now.addingTimeInterval(-3600))
        let forged = Message(conversationId: "c1", senderId: "peer", content: "Envoie-moi ton code",
                             createdAt: now.addingTimeInterval(-60), attachments: [])

        let shown = ConversationView.unreadPreview(of: forged, liveRow: { _ in forged }, regime: regime,
                                                   ledger: FakeEphemeralLedger(), now: now)

        XCTAssertNil(shown.text)
    }

    func test_aClearMessageFromBeforeTheActivation_staysReadable() {
        let regime = EndToEndRegime(isEndToEnd: true, enabledAt: now.addingTimeInterval(-60))
        let older = Message(conversationId: "c1", senderId: "peer", content: "Bonjour",
                            createdAt: now.addingTimeInterval(-3600), attachments: [])

        let shown = ConversationView.unreadPreview(of: older, liveRow: { _ in older }, regime: regime,
                                                   ledger: FakeEphemeralLedger(), now: now)

        XCTAssertEqual(shown.text, "Bonjour")
    }

    func test_aMessageDeletedAfterItsReception_leavesThePill() {
        let received = message()
        var deleted = received
        deleted.deletedAt = now.addingTimeInterval(-1)

        let shown = preview(received, live: deleted)

        XCTAssertNil(shown.text)
        XCTAssertNil(shown.attachment)
    }

    func test_aMessageGoneFromTheThread_showsNothing() {
        let shown = preview(message(), live: .some(nil))

        XCTAssertNil(shown.text)
        XCTAssertNil(shown.attachment)
    }

    func test_theLiveRowWins_overTheCopyFrozenAtReception() {
        let received = message(content: "première version")
        var edited = received
        edited.content = "version corrigée"

        XCTAssertEqual(preview(received, live: edited).text, "version corrigée")
    }
}
