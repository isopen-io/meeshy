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

    // MARK: - La taille vient des images, pas de l'écran physique

    /// `UIScreen.main.nativeBounds` donnait l'écran physique en portrait : faux
    /// sur iPad en paysage, en Split View / Stage Manager ou sur écran externe.
    func test_videoSize_readsTheCapturedFrameDimensions() throws {
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, 1180, 820, kCVPixelFormatType_32BGRA, nil, &pixelBuffer)
        let image = try XCTUnwrap(pixelBuffer)
        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: image, formatDescriptionOut: &format)
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .zero, decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: nil, imageBuffer: image,
                                                 formatDescription: try XCTUnwrap(format),
                                                 sampleTiming: &timing, sampleBufferOut: &sample)

        XCTAssertEqual(CallScreenSampleWriter.videoSize(of: try XCTUnwrap(sample)), CGSize(width: 1180, height: 820))
    }

    func test_recording_neverSizesItselfFromUIScreenMain() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallScreenRecordingService.swift"))
        XCTAssertFalse(code.contains("UIScreen.main"))
    }
}
