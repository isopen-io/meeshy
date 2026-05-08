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
}
