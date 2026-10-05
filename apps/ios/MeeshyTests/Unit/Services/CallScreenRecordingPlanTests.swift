import AVFoundation
import MeeshySDK
import ReplayKit
import XCTest
@testable import Meeshy

// #8437 — ce que la capture ReplayKit garde, et ce qu'elle dépose. L'audio
// seul garde le son de l'app (les voix des autres) ET le micro, jamais
// l'image ; la vidéo garde les trois. Le dépôt MIXE les pistes audio en une :
// un lecteur web ne joue que la première piste audio d'un fichier.
final class CallScreenRecordingPlanTests: XCTestCase {

    func test_audio_keepsTheAppSoundAndTheMicrophone_butNotTheImage() {
        XCTAssertEqual(CallScreenCapturePlan(kind: .audio).track(for: .audioApp), .appAudio)
        XCTAssertEqual(CallScreenCapturePlan(kind: .audio).track(for: .audioMic), .micAudio)
        XCTAssertNil(CallScreenCapturePlan(kind: .audio).track(for: .video))
    }

    func test_video_keepsTheImageAndBothSounds() {
        let plan = CallScreenCapturePlan(kind: .video)

        XCTAssertEqual(plan.track(for: .video), .video)
        XCTAssertEqual(plan.track(for: .audioApp), .appAudio)
        XCTAssertEqual(plan.track(for: .audioMic), .micAudio)
    }

    func test_theFileStartsOnTheImageForAVideo_onAnySoundForAudio() {
        XCTAssertEqual(CallScreenCapturePlan(kind: .video).anchors, [.video])
        XCTAssertEqual(CallScreenCapturePlan(kind: .audio).anchors, [.appAudio, .micAudio])
    }

    func test_mixdown_audio_isAnM4AOfOneMixedTrack() {
        let mixdown = CallScreenCapturePlan(kind: .audio).mixdown

        XCTAssertEqual(mixdown.presetName, AVAssetExportPresetAppleM4A)
        XCTAssertEqual(mixdown.fileType, .m4a)
    }

    func test_mixdown_video_isAnMP4() {
        let mixdown = CallScreenCapturePlan(kind: .video).mixdown

        XCTAssertEqual(mixdown.presetName, AVAssetExportPresetHighestQuality)
        XCTAssertEqual(mixdown.fileType, .mp4)
    }
}
