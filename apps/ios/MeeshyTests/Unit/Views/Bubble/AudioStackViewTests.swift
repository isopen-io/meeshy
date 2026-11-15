import XCTest
import MeeshySDK
@testable import Meeshy

/// #10654 — un message à plusieurs vocaux les montre l'un sous l'autre, sous UN
/// seul pied. Ce pied doit dire les langues de TOUTES les pistes visibles (le
/// carrousel ne montrait que celles de la page courante), et chaque ligne garde
/// son rang pour VoiceOver, que le pager i/N disait à l'œil.
@MainActor
final class AudioStackViewTests: XCTestCase {

    private func transcription(_ attachmentId: String, _ language: String) -> MessageTranscription {
        MessageTranscription(attachmentId: attachmentId, text: "…", language: language)
    }

    private func translatedAudio(_ attachmentId: String, _ language: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "\(attachmentId)-\(language)", attachmentId: attachmentId, targetLanguage: language,
            url: "https://example.test/\(attachmentId)-\(language).m4a", transcription: "…",
            durationMs: 1_000, format: "m4a", cloned: false, quality: 0.9, ttsModel: "tts"
        )
    }

    private func baseFooter(flags: [FooterFlag] = []) -> BubbleFooterModel {
        BubbleFooterModel(
            sender: nil, flags: flags, showsTranslate: false, timestamp: "10:00",
            delivery: nil, isOffline: false, isMe: false, sendStartedAt: nil
        )
    }

    // MARK: - Pied partagé

    func test_sharedFooter_heterogeneousTracks_advertisesEveryTrackLanguageOnce() {
        let model = AudioStackView.sharedFooterModel(
            base: baseFooter(),
            trackIDs: ["a1", "a2"],
            transcriptions: ["a1": transcription("a1", "fr"), "a2": transcription("a2", "en")],
            translatedAudios: ["a1": [translatedAudio("a1", "en")], "a2": [translatedAudio("a2", "es")]],
            activeAudioLanguage: "en"
        )

        XCTAssertEqual(model.flags, [
            FooterFlag(code: "fr", isActive: false),
            FooterFlag(code: "en", isActive: true),
            FooterFlag(code: "es", isActive: false),
        ])
    }

    func test_sharedFooter_secondTrackOnlyLanguage_isNotDropped() {
        let model = AudioStackView.sharedFooterModel(
            base: baseFooter(),
            trackIDs: ["a1", "a2", "a3"],
            transcriptions: ["a3": transcription("a3", "de")],
            translatedAudios: [:],
            activeAudioLanguage: nil
        )

        XCTAssertEqual(model.flags, [FooterFlag(code: "de", isActive: false)])
    }

    func test_sharedFooter_noPerTrackLanguage_keepsMessageLevelFlags() {
        let messageFlags = [FooterFlag(code: "fr", isActive: true)]

        let model = AudioStackView.sharedFooterModel(
            base: baseFooter(flags: messageFlags),
            trackIDs: ["a1", "a2"],
            transcriptions: [:],
            translatedAudios: [:],
            activeAudioLanguage: nil
        )

        XCTAssertEqual(model, baseFooter(flags: messageFlags))
    }

    // MARK: - Rang annoncé par VoiceOver

    func test_rowAccessibilityLabel_secondOfThree_speaksRankAndTotal() {
        let label = AudioStackView.rowAccessibilityLabel(index: 1, count: 3)

        XCTAssertTrue(label.contains("2"), label)
        XCTAssertTrue(label.contains("3"), label)
        XCTAssertFalse(label.contains("bubble.audio"), "la clé ne doit jamais être lue brute : \(label)")
    }

    func test_rowAccessibilityLabel_eachRow_isDistinct() {
        let labels = (0..<3).map { AudioStackView.rowAccessibilityLabel(index: $0, count: 3) }

        XCTAssertEqual(Set(labels).count, 3)
    }

    // MARK: - #10678 — chaque piste reçoit ce que reçoit un vocal seul

    private func audioAttachment(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "audio/mp4", fileUrl: "https://example.test/\(id).m4a")
    }

    func test_fullscreenOpener_secondTrack_opensThatTrackNotTheFirst() {
        var opened: [String] = []
        let second = audioAttachment("a2")

        let opener = AudioStackView.fullscreenOpener(for: second, via: { opened.append($0.id) })
        opener?()

        XCTAssertEqual(opened, ["a2"])
    }

    func test_fullscreenOpener_withoutConversationOpener_isNilSoTheLocalCoverServes() {
        XCTAssertNil(AudioStackView.fullscreenOpener(for: audioAttachment("a1"), via: nil))
    }
}
