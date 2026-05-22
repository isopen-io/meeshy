import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("effectiveSlideDuration — loop completion")
struct SlideDurationLoopTests {

    @Test("no looping background returns staticBaseDuration")
    func noLoopingBackground_returnsStaticBase() {
        let slide = StoryFixtures.emptySlide(staticBaseDuration: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 5s in loop with base 12s returns 15s (3 repetitions)")
    func video5s_returns15s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 5.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 15.0)
    }

    @Test("video 6s in loop with base 12s returns 12s (2 repetitions)")
    func video6s_returns12s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 6.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 4s in loop with base 12s returns 12s (3 repetitions)")
    func video4s_returns12s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 4.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 7s in loop with base 12s returns 14s (2 repetitions)")
    func video7s_returns14s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 7.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 14.0)
    }

    @Test("video 15s in loop with base 12s returns 15s (longer than base)")
    func video15s_returns15s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 15.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 15.0)
    }

    // MARK: - B1: sticker bounds extend the total duration

    /// A sticker that fires at `startTime=8` for `duration=2` on a slide
    /// whose user-set `duration` is only 5s must extend the slide to 10s
    /// — otherwise the export truncates the sticker's tail.
    @Test("sticker startTime+duration extends bound past slide.duration")
    func test_computedTotalDuration_includesStickerEndTime() {
        let sticker = StorySticker(
            id: UUID().uuidString,
            emoji: "🔥",
            x: 0.5, y: 0.5,
            startTime: 8.0,
            duration: 2.0
        )
        var effects = StoryEffects()
        effects.stickerObjects = [sticker]
        let slide = StorySlide(id: UUID().uuidString,
                               effects: effects,
                               duration: 5.0,
                               order: 0)
        let result = slide.computedTotalDuration()
        #expect(abs(result - 10.0) < 0.001,
                "Expected 10.0 (sticker tail at 8+2), got \(result)")
    }

    // MARK: - B2: empty-slide floor

    /// An entirely empty slide with `duration=0` must still floor to 0.5s —
    /// AVFoundation rejects zero-length compositions.
    @Test("empty slide with duration=0 floors to 0.5s minimum")
    func test_computedTotalDuration_emptySlide_returnsFloor() {
        let slide = StorySlide(id: UUID().uuidString,
                               effects: StoryEffects(),
                               duration: 0.0,
                               order: 0)
        let result = slide.computedTotalDuration()
        #expect(result >= 0.5,
                "Expected at least 0.5s floor, got \(result)")
    }
}
