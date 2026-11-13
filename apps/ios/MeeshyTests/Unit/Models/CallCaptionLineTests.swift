import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// #8396 — une ligne de sous-titres d'appel : ce qu'elle affiche (traduit ou
/// original), l'étiquette « EN → FR », la couleur STABLE de son locuteur (la
/// même que le liseré de sa vignette de groupe) et ce que VoiceOver annonce.
@MainActor
final class CallCaptionLineTests: XCTestCase {

    private func segment(
        speakerId: String = "peer",
        text: String = "Hello",
        language: String = "en",
        translatedText: String? = "Bonjour",
        translatedLanguage: String? = "fr",
        isFinal: Bool = true
    ) -> Meeshy.CallTranscriptionSegment {
        Meeshy.CallTranscriptionSegment(
            id: UUID(),
            text: text,
            speakerId: speakerId,
            startTime: 0,
            endTime: 1,
            isFinal: isFinal,
            confidence: 1,
            language: language,
            translatedText: translatedText,
            translatedLanguage: translatedLanguage,
            capturedAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func line(
        _ segment: Meeshy.CallTranscriptionSegment,
        isLocal: Bool = false,
        prefersOriginal: Bool = false,
        isRevealed: Bool = false,
        prism: [String] = ["fr"]
    ) -> CallCaptionLine {
        CallCaptionLine.make(
            segment: segment, isLocal: isLocal, speakerName: "Ana",
            prefersOriginal: prefersOriginal, isRevealed: isRevealed, readerPrism: prism
        )
    }

    // MARK: - Traduit / original

    func test_make_remoteWithTranslation_showsTranslationAndTag() {
        let sut = line(segment())
        XCTAssertEqual(sut.text, "Bonjour")
        XCTAssertEqual(sut.languageTag, "EN → FR")
        XCTAssertFalse(sut.isShowingOriginal)
        XCTAssertTrue(sut.canRevealOriginal)
    }

    func test_textColor_onlyATranslatedLineTakesTheSpeakerColor() {
        XCTAssertEqual(line(segment()).textColorHex, CallSpeakerColor.hex(for: "peer"))
        XCTAssertNil(line(segment(), prefersOriginal: true).textColorHex)
        XCTAssertNil(line(segment(translatedText: nil, translatedLanguage: nil)).textColorHex)
        XCTAssertNil(line(segment(speakerId: "me", text: "Salut", language: "fr"), isLocal: true).textColorHex)
    }

    func test_make_tappedTranslatedLine_keepsTheTranslationAndUnfoldsTheOriginalBelow() {
        let sut = line(segment(), isRevealed: true)
        XCTAssertEqual(sut.text, "Bonjour")
        XCTAssertEqual(sut.originalBelow, "Hello")
        XCTAssertEqual(sut.languageTag, "EN → FR")
        XCTAssertFalse(sut.isShowingOriginal)
        XCTAssertEqual(sut.textColorHex, CallSpeakerColor.hex(for: "peer"))
    }

    func test_make_untappedTranslatedLine_unfoldsNothing() {
        XCTAssertNil(line(segment()).originalBelow)
    }

    func test_make_journalOnOriginal_tapShowsTranslationWithoutUnfolding() {
        let sut = line(segment(), prefersOriginal: true, isRevealed: true)
        XCTAssertEqual(sut.text, "Bonjour")
        XCTAssertNil(sut.originalBelow)
    }

    func test_make_journalOnOriginal_tapShowsTranslation() {
        XCTAssertEqual(line(segment(), prefersOriginal: true).text, "Hello")
        XCTAssertEqual(line(segment(), prefersOriginal: true, isRevealed: true).text, "Bonjour")
    }

    func test_make_localSpeech_isNeverTranslatedNorTagged() {
        let sut = line(segment(speakerId: "me"), isLocal: true)
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertNil(sut.languageTag)
        XCTAssertFalse(sut.canRevealOriginal)
    }

    func test_make_noTranslation_showsTheOriginalLabelledWithItsLanguage() {
        let sut = line(segment(translatedText: nil, translatedLanguage: nil))
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertEqual(sut.languageTag, "EN")
        XCTAssertEqual(sut.originLanguage, "EN")
        XCTAssertNil(sut.servedLanguage)
        XCTAssertFalse(sut.canRevealOriginal)
    }

    // MARK: - L'attente de la traduction

    private func awaiting(_ overrides: (isFinal: Bool, language: String)? = nil, prism: [String] = ["fr"], isLocal: Bool = false) -> CallCaptionLine {
        line(
            segment(language: overrides?.language ?? "en", translatedText: nil, translatedLanguage: nil, isFinal: overrides?.isFinal ?? true),
            isLocal: isLocal,
            prism: prism
        )
    }

    func test_make_finalRemoteOriginalOutsideThePrism_awaitsItsTranslationUntilTheDeadline() {
        let sut = awaiting()
        XCTAssertTrue(sut.isAwaitingTranslation)
        XCTAssertEqual(sut.awaitingUntil, Date(timeIntervalSince1970: 0).addingTimeInterval(CallCaptionTranslationWait.timeout))
    }

    func test_make_partialRemoteOriginal_isLabelledButNeverAwaits() {
        let sut = awaiting((isFinal: false, language: "en"))
        XCTAssertEqual(sut.languageTag, "EN")
        XCTAssertFalse(sut.isAwaitingTranslation)
    }

    func test_make_originalAlreadyInThePrism_hasNoLabelAndNoWait() {
        let sut = awaiting((isFinal: true, language: "FR"))
        XCTAssertNil(sut.languageTag)
        XCTAssertFalse(sut.isAwaitingTranslation)
    }

    func test_make_prismDescendsInOrder_asecondaryLanguageIsAlsoServed() {
        let sut = awaiting((isFinal: true, language: "en"), prism: ["fr", "en"])
        XCTAssertNil(sut.languageTag)
        XCTAssertFalse(sut.isAwaitingTranslation)
    }

    func test_make_withoutAPrism_nothingIsAwaitedButTheOriginalIsLabelled() {
        let sut = awaiting(prism: [])
        XCTAssertEqual(sut.languageTag, "EN")
        XCTAssertFalse(sut.isAwaitingTranslation)
    }

    func test_make_myOwnSpeech_isNeverLabelledNorAwaited() {
        let sut = awaiting(isLocal: true)
        XCTAssertNil(sut.languageTag)
        XCTAssertFalse(sut.isAwaitingTranslation)
    }

    func test_make_translationArrives_theWaitEndsAndThePairReplacesTheLabel() {
        let sut = line(segment())
        XCTAssertFalse(sut.isAwaitingTranslation)
        XCTAssertEqual(sut.languageTag, "EN → FR")
        XCTAssertEqual(sut.originLanguage, "EN")
        XCTAssertEqual(sut.servedLanguage, "FR")
    }

    func test_settled_beforeTheDeadline_stillAwaits_andAfterIt_givesUpButKeepsTheLabel() throws {
        let sut = awaiting()
        let deadline = try XCTUnwrap(sut.awaitingUntil)
        XCTAssertTrue(sut.settled(at: deadline.addingTimeInterval(-0.1)).isAwaitingTranslation)
        let given = sut.settled(at: deadline)
        XCTAssertFalse(given.isAwaitingTranslation)
        XCTAssertEqual(given.languageTag, "EN")
        XCTAssertEqual(given.text, "Hello")
    }

    func test_make_emptyTranslation_isTreatedAsAbsent() {
        let sut = line(segment(translatedText: "  "))
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertEqual(sut.languageTag, "EN")
        XCTAssertTrue(sut.isAwaitingTranslation)
    }

    // MARK: - Couleur stable par personne

    func test_speakerColor_sameId_returnsSameHexAcrossCalls() {
        XCTAssertEqual(CallSpeakerColor.hex(for: "user-42"), CallSpeakerColor.hex(for: "user-42"))
    }

    func test_speakerColor_isDerivedFromTheId_notTheName() {
        let a = line(segment(speakerId: "user-42"))
        XCTAssertEqual(a.speakerColorHex, CallSpeakerColor.hex(for: "user-42"))
    }

    func test_speakerColor_onTheThread_isTheAuthorColorMadeLegibleByTheSmallestStep() {
        let base = DynamicColorGenerator.colorForName("user-42")
        XCTAssertEqual(CallSpeakerColor.hex(for: "user-42", mode: .light), AuthorInk.hex(base, for: .light))
        XCTAssertEqual(CallSpeakerColor.hex(for: "user-42", mode: .dark), AuthorInk.hex(base, for: .dark))
    }

    func test_speakerColor_onTheCallScreen_staysTheBrightenedPinnedDarkColor() {
        let base = DynamicColorGenerator.colorForName("user-42")
        XCTAssertEqual(CallSpeakerColor.hex(for: "user-42"), DynamicColorGenerator.adaptedColor(base, for: .dark))
    }

    func test_speakerColor_onTheThread_neverUsesTheFixedCeilingOrFloor() throws {
        let source = try String(contentsOfFile: #filePath
            .replacingOccurrences(of: "MeeshyTests/Unit/Models/CallCaptionLineTests.swift", with: "Meeshy/Features/Call/Models/CallCaptionLine.swift"))
        XCTAssertTrue(source.contains("AuthorInk.hex("))
    }

    func test_speakerColor_onTheThread_measuresTheThreadBackdropThatAuthorInkMirrors() throws {
        let source = try String(contentsOfFile: #filePath
            .replacingOccurrences(of: "MeeshyTests/Unit/Models/CallCaptionLineTests.swift", with: "Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift"))
        let stops = [
            #"Color(hex: "0F0C29")"#,
            #"Self.tinted("0F0C29", with: accent, amount: 0.12)"#,
            #"Color(hex: "24243E")"#,
            #"Self.tinted("FFFFFF", with: accent, amount: 0.08)"#,
            #"Self.tinted("FFFFFF", with: accent, amount: 0.05)"#,
        ]
        for stop in stops {
            XCTAssertTrue(source.contains(stop), "AuthorInk mesure cet arrêt du fond du fil : \(stop)")
        }
    }

    func test_speakerColor_differsForMostIds() {
        let hexes = Set((0..<12).map { CallSpeakerColor.hex(for: "user-\($0)") })
        XCTAssertGreaterThan(hexes.count, 4)
    }

    func test_speakerColor_matchesTheGroupTileBorder() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(GroupCallArrival(userId: "b"))
            .admitting(GroupCallArrival(userId: "c"))
        let tiles = GroupCallStage.tiles(
            roster: roster,
            speakingUserIds: [],
            localName: "Vous",
            isLocalMicMuted: false,
            isLocalVideoEnabled: false,
            isPrimaryVideoActive: false
        )
        XCTAssertEqual(tiles.map(\.accentHex), ["b", "c", "me"].map(CallSpeakerColor.hex(for:)))
    }

    // MARK: - VoiceOver

    func test_announcement_finalLine_readsSpeakerAndText() {
        XCTAssertEqual(line(segment()).announcement, "Ana : Bonjour")
    }

    func test_announcement_partialLine_isSilent() {
        XCTAssertNil(line(segment(isFinal: false)).announcement)
    }

    func test_queuedAnnouncement_waitsItsTurnInsteadOfCuttingTheOneInProgress() throws {
        let queued = try XCTUnwrap(line(segment()).queuedAnnouncement)
        XCTAssertEqual(queued.string, "Ana : Bonjour")
        XCTAssertEqual(queued.attribute(.accessibilitySpeechQueueAnnouncement, at: 0, effectiveRange: nil) as? Bool, true)
    }

    func test_queuedAnnouncement_partialLine_isSilent() {
        XCTAssertNil(line(segment(isFinal: false)).queuedAnnouncement)
    }
}
