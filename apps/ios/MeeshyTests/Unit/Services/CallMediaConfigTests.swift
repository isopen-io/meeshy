import XCTest
@testable import Meeshy

@MainActor
final class CallMediaConfigTests: XCTestCase {

    func test_default_audioConfig_hasOpusBitrateRange() {
        let config = CallMediaConfig()
        XCTAssertEqual(config.audio.maxBitrateBps, QualityThresholds.defaultBitrate,
                       "max audio bitrate must equal QualityThresholds.defaultBitrate")
        XCTAssertEqual(config.audio.minBitrateBps, QualityThresholds.audioCodecFloorBitrateBps,
                       "min audio bitrate must equal QualityThresholds.audioCodecFloorBitrateBps")
        XCTAssertTrue(config.audio.dtx)
    }

    func test_default_audioConfig_minBelowAdaptationFloor() {
        // The SDP codec floor must be strictly below the adaptation algorithm's floor
        // (minBitrate). This allows the encoder to survive extreme network conditions
        // even after the adaptation algorithm has already descended to its own floor.
        XCTAssertLessThan(
            QualityThresholds.audioCodecFloorBitrateBps,
            QualityThresholds.minBitrate,
            "SDP codec floor (\(QualityThresholds.audioCodecFloorBitrateBps)) must be < " +
            "adaptation floor (\(QualityThresholds.minBitrate))"
        )
    }

    func test_default_video_isNil() {
        let config = CallMediaConfig()
        XCTAssertNil(config.video)
    }

    func test_videoConfig_hd720p30_hasExpectedValues() {
        let video = VideoConfig.hd720p30
        XCTAssertEqual(video.maxResolution.width, 1280)
        XCTAssertEqual(video.maxResolution.height, 720)
        XCTAssertEqual(video.maxFrameRate, 30)
        XCTAssertTrue(video.preferHardwareCodec)
    }

    func test_codecPreferences_default_orderH264VP8VP9() {
        let codecs = CodecPreferences.default
        XCTAssertEqual(codecs.audioCodecs, ["opus", "red"])
        XCTAssertEqual(codecs.videoCodecs, ["H264", "VP8", "VP9"])
    }
}
