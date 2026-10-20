import XCTest
import AVFoundation
@testable import MeeshyUI

/// **Un média muet ne décode pas sa piste audio (#11282).**
///
/// `AVPlayer.isMuted` coupe la SORTIE, pas le décodage : une vignette muette
/// qui boucle dans chaque bulle ou carte du fil continuait de décoder, de
/// mettre en tampon et de mixer un son que personne n'entendrait. La loi dit
/// quelles pistes éteindre, dans quel ordre, et quand elles existent.
final class AudioTrackActivationLawTests: XCTestCase {

    private typealias Law = AudioTrackActivationLaw

    // MARK: - Quelle piste

    func test_desiredEnabled_audioTrackWhenMuted_isOff() {
        XCTAssertEqual(Law.desiredEnabled(mediaType: .audio, effectiveMuted: true), false)
    }

    func test_desiredEnabled_audioTrackWhenAudible_isOn() {
        XCTAssertEqual(Law.desiredEnabled(mediaType: .audio, effectiveMuted: false), true)
    }

    func test_desiredEnabled_videoSubtitleAndUnknownTracks_areNeverTouched() {
        for mediaType in [AVMediaType.video, .subtitle, .text, .closedCaption, .metadata, nil] {
            XCTAssertNil(Law.desiredEnabled(mediaType: mediaType, effectiveMuted: true),
                         "muet, seule la piste AUDIO s'éteint : l'image doit continuer")
            XCTAssertNil(Law.desiredEnabled(mediaType: mediaType, effectiveMuted: false))
        }
    }

    // MARK: - Ce qui s'écrit

    func test_writes_mutedItem_switchesOffOnlyTheEnabledAudioTracks() {
        let tracks = [
            Law.TrackState(mediaType: .video, isEnabled: true),
            Law.TrackState(mediaType: .audio, isEnabled: true),
            Law.TrackState(mediaType: .audio, isEnabled: false)
        ]
        XCTAssertEqual(Law.writes(for: tracks, effectiveMuted: true), [nil, false, nil],
                       "la vidéo ne bouge pas, la piste déjà éteinte n'est pas réécrite")
    }

    func test_writes_audibleItem_switchesBackOnTheDisabledAudioTracks() {
        let tracks = [
            Law.TrackState(mediaType: .video, isEnabled: true),
            Law.TrackState(mediaType: .audio, isEnabled: false)
        ]
        XCTAssertEqual(Law.writes(for: tracks, effectiveMuted: false), [nil, true])
    }

    func test_writes_isIdempotent_afterApplyingItsOwnResult() {
        let before = [Law.TrackState(mediaType: .audio, isEnabled: true)]
        let after = zip(before, Law.writes(for: before, effectiveMuted: true)).map {
            Law.TrackState(mediaType: $0.mediaType, isEnabled: $1 ?? $0.isEnabled)
        }
        XCTAssertEqual(Law.writes(for: after, effectiveMuted: true), [nil],
                       "une piste déjà dans l'état voulu n'est jamais réécrite")
    }

    func test_writes_itemWithoutTracks_isEmpty() {
        XCTAssertEqual(Law.writes(for: [], effectiveMuted: true), [])
    }

    // MARK: - Quand

    func test_mayTouchTracks_onlyOnceTheItemIsReady() {
        XCTAssertTrue(Law.mayTouchTracks(itemStatus: .readyToPlay))
        XCTAssertFalse(Law.mayTouchTracks(itemStatus: .unknown),
                       "avant d'être prêt, l'élément n'a pas encore ses pistes")
        XCTAssertFalse(Law.mayTouchTracks(itemStatus: .failed))
        XCTAssertFalse(Law.mayTouchTracks(itemStatus: nil))
    }

    // MARK: - Dans quel ordre

    func test_steps_mute_silencesTheOutputBeforeSwitchingTheTracksOff() {
        XCTAssertEqual(Law.steps(playerIsMuted: false, wantsMuted: true),
                       [.silencePlayer, .disableAudioTracks],
                       "la sortie se coupe d'abord : éteindre la piste d'abord ferait claquer le son")
    }

    func test_steps_unmute_switchesTheTracksOnBeforeSoundingTheOutput() {
        XCTAssertEqual(Law.steps(playerIsMuted: true, wantsMuted: false),
                       [.enableAudioTracks, .soundPlayer],
                       "la piste se rallume sous la sortie encore muette : le son revient sans coupure")
    }

    func test_steps_noChange_doesNothing() {
        XCTAssertEqual(Law.steps(playerIsMuted: true, wantsMuted: true), [])
        XCTAssertEqual(Law.steps(playerIsMuted: false, wantsMuted: false), [])
    }
}
