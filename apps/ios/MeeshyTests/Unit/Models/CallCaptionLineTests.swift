import XCTest
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
    ) -> TranscriptionSegment {
        TranscriptionSegment(
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
        _ segment: TranscriptionSegment,
        isLocal: Bool = false,
        prefersOriginal: Bool = false,
        isRevealed: Bool = false
    ) -> CallCaptionLine {
        CallCaptionLine.make(segment: segment, isLocal: isLocal, speakerName: "Ana", prefersOriginal: prefersOriginal, isRevealed: isRevealed)
    }

    // MARK: - Traduit / original

    func test_make_remoteWithTranslation_showsTranslationAndTag() {
        let sut = line(segment())
        XCTAssertEqual(sut.text, "Bonjour")
        XCTAssertEqual(sut.languageTag, "EN → FR")
        XCTAssertFalse(sut.isShowingOriginal)
        XCTAssertTrue(sut.canRevealOriginal)
    }

    func test_make_tappedTranslatedLine_showsOriginalWithoutTag() {
        let sut = line(segment(), isRevealed: true)
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertNil(sut.languageTag)
        XCTAssertTrue(sut.isShowingOriginal)
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

    func test_make_noTranslation_showsOriginalWithoutTag() {
        let sut = line(segment(translatedText: nil, translatedLanguage: nil))
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertNil(sut.languageTag)
        XCTAssertFalse(sut.canRevealOriginal)
    }

    func test_make_emptyTranslation_isTreatedAsAbsent() {
        let sut = line(segment(translatedText: "  "))
        XCTAssertEqual(sut.text, "Hello")
        XCTAssertNil(sut.languageTag)
    }

    // MARK: - Couleur stable par personne

    func test_speakerColor_sameId_returnsSameHexAcrossCalls() {
        XCTAssertEqual(CallSpeakerColor.hex(for: "user-42"), CallSpeakerColor.hex(for: "user-42"))
    }

    func test_speakerColor_isDerivedFromTheId_notTheName() {
        let a = line(segment(speakerId: "user-42"))
        XCTAssertEqual(a.speakerColorHex, CallSpeakerColor.hex(for: "user-42"))
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
        XCTAssertEqual(tiles.map(\.accentHex), ["me", "b", "c"].map(CallSpeakerColor.hex(for:)))
    }

    // MARK: - VoiceOver

    func test_announcement_finalLine_readsSpeakerAndText() {
        XCTAssertEqual(line(segment()).announcement, "Ana : Bonjour")
    }

    func test_announcement_partialLine_isSilent() {
        XCTAssertNil(line(segment(isFinal: false)).announcement)
    }
}
