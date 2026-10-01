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

        let label = player.timeLabel(totalDuration: vocalDurationMs)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 33))")
    }

    func test_spokenTotalDuration_trackNotLoaded_announcesAttachmentDurationInSeconds() {
        let player = OverlayAudioPlayer()

        let spoken = player.spokenTotalDuration(totalDuration: vocalDurationMs)

        XCTAssertEqual(spoken, LocalizedNumber.spokenDuration(seconds: 33))
    }

    func test_timeLabel_trackLoaded_prefersMeasuredDuration() {
        let player = OverlayAudioPlayer()
        player.duration = 40

        let label = player.timeLabel(totalDuration: vocalDurationMs)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 40))")
    }

    func test_timeLabel_noDurationAnywhere_showsZero() {
        let player = OverlayAudioPlayer()

        let label = player.timeLabel(totalDuration: nil)

        XCTAssertEqual(label, "\(LocalizedNumber.duration(seconds: 0)) / \(LocalizedNumber.duration(seconds: 0))")
    }
}
