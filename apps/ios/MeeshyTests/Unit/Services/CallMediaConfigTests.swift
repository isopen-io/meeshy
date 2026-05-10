import XCTest
@testable import Meeshy

final class CallMediaConfigTests: XCTestCase {

    func test_default_audioConfig_hasOpusBitrateRange() {
        let config = CallMediaConfig()
        XCTAssertEqual(config.audio.maxBitrateBps, 64_000)
        XCTAssertEqual(config.audio.minBitrateBps, 16_000)
        XCTAssertTrue(config.audio.dtx)
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
