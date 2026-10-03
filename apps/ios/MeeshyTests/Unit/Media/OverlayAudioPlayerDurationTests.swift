import XCTest
@testable import Meeshy

/// L'aperçu d'appui long d'un vocal annonce la durée de la pièce jointe tant que sa piste n'est
/// pas chargée (#9008). `MessageAttachment.duration` est en MILLISECONDES : un vocal de 33 955 ms
/// s'affichait « 0:00 / 565:55 » et VoiceOver annonçait 9 heures.
@MainActor
final class OverlayAudioPlayerDurationTests: XCTestCase {
    private let vocalDurationMs = 33_955

    func test_timeLabel_trackNotLoaded_showsAttachmentDurationInSeconds() {
        let player = OverlayAudioPlayer()

        let label = player.timeLabel(attachmentDurationMs: vocalDurationMs)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 33))")
    }

    func test_spokenTotalDuration_trackNotLoaded_announcesAttachmentDurationInSeconds() {
        let player = OverlayAudioPlayer()

        let spoken = player.spokenTotalDuration(attachmentDurationMs: vocalDurationMs)

        XCTAssertEqual(spoken, LocalizedNumber.spokenDuration(seconds: 33))
    }

    func test_timeLabel_trackLoaded_prefersMeasuredDuration() {
        let player = OverlayAudioPlayer()
        player.duration = 40

        let label = player.timeLabel(attachmentDurationMs: vocalDurationMs)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 40))")
    }

    func test_timeLabel_noDurationAnywhere_showsZero() {
        let player = OverlayAudioPlayer()

        let label = player.timeLabel(attachmentDurationMs: nil)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 0))")
    }

    // MARK: - #9010 — l'aperçu joue la piste que la bulle sert

    private func voice() -> MessageAttachment {
        MessageAttachment(
            id: "a1", fileName: "vocal-minjun.p-ko.m4a", originalName: "vocal-minjun.p-ko.m4a",
            mimeType: "audio/mp4", fileUrl: "https://cdn/orig-ko.m4a", duration: 33_000
        )
    }

    func test_previewAudioTrack_servedTranslation_playsTheTranslatedTrack() {
        let french = ServedAudioTrack(language: "fr", url: "https://cdn/voix-fr.m4a", durationMs: 38_000, transcript: "Je pense à toi")

        let track = MessageOverlayMenu.previewAudioTrack(for: voice(), served: ["a1": french])

        XCTAssertEqual(track, french, "l'aperçu d'appui long joue la piste élue par le Prisme, pas attachment.fileUrl")
    }

    func test_previewAudioTrack_nothingServed_playsTheOriginal() {
        let track = MessageOverlayMenu.previewAudioTrack(for: voice(), served: [:])

        XCTAssertEqual(track, ServedAudioTrack(language: nil, url: "https://cdn/orig-ko.m4a", durationMs: 33_000, transcript: nil))
    }

}
