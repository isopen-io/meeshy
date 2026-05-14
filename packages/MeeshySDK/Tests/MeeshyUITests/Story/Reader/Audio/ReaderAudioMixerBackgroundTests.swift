import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class ReaderAudioMixerBackgroundTests: XCTestCase {
    func test_configureBackground_acceptsValidURL() throws {
        let mixer = ReaderAudioMixer()
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "m4a")
        guard let url = testURL else { throw XCTSkip("test-1s.m4a missing") }
        let audio = StoryAudioPlayerObject(id: "bg-1", postMediaId: "bg-1",
                                           isBackground: true)
        XCTAssertNoThrow(try mixer.configureBackground(audio: audio, url: url, looping: true))
        XCTAssertEqual(mixer.backgroundClipCount, 1)
    }
}
