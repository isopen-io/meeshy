import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasAudioIntegrationTests: XCTestCase {
    func test_canvas_observesComposerMuteNotification() {
        let slide = StorySlide(id: "s", effects: StoryEffects())
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext(mute: false))

        NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
        XCTAssertTrue(view.isAudioMuted)
    }

    func test_canvas_observesComposerUnmuteNotification() {
        let slide = StorySlide(id: "s", effects: StoryEffects())
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext(mute: true))

        NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
        XCTAssertFalse(view.isAudioMuted)
    }
}
