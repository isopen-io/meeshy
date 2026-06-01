import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Sans pin timeline, la durée d'un slide est dérivée du CONTENU : un background
/// vidéo boucle jusqu'à atteindre la cible auto de 6 s (ou tient sa durée naturelle
/// si ≥ 6 s). La durée configurée EXPLICITEMENT passe désormais par le timeline
/// (`effects.timelineDuration`, autoritaire — cf. `StoryTimelineDurationTests` +
/// les tests export), et le legacy `slide.duration` est ignoré par
/// `computedTotalDuration()` (centralisation 2026-05-28). Cette suite couvre donc
/// le chemin AUTO (aucun pin) : la cible est 6 s, pas une base configurable.
@Suite("computedTotalDuration — bg video auto-loops to the 6s target (no timeline pin)")
struct SlideDurationLoopTests {

    @Test("no media → 6s static default")
    func noMedia_returns6s() {
        #expect(StoryFixtures.emptySlide().effectiveSlideDuration() == 6.0)
    }

    @Test("bg video 5s auto-loops to 10s (2× to reach the 6s target)")
    func video5s_returns10s() {
        #expect(StoryFixtures.loopVideoSlide(videoDurationSec: 5.0).effectiveSlideDuration() == 10.0)
    }

    @Test("bg video 6s → 6s (exact, already meets target)")
    func video6s_returns6s() {
        #expect(StoryFixtures.loopVideoSlide(videoDurationSec: 6.0).effectiveSlideDuration() == 6.0)
    }

    @Test("bg video 4s auto-loops to 8s (2× to reach the 6s target)")
    func video4s_returns8s() {
        #expect(StoryFixtures.loopVideoSlide(videoDurationSec: 4.0).effectiveSlideDuration() == 8.0)
    }

    @Test("bg video 7s → 7s (already ≥ 6s, natural length)")
    func video7s_returns7s() {
        #expect(StoryFixtures.loopVideoSlide(videoDurationSec: 7.0).effectiveSlideDuration() == 7.0)
    }

    @Test("bg video 15s → 15s (natural length, longer than target)")
    func video15s_returns15s() {
        #expect(StoryFixtures.loopVideoSlide(videoDurationSec: 15.0).effectiveSlideDuration() == 15.0)
    }

    @Test("a timeline pin overrides the bg-video auto-loop (authoritative)")
    func timelinePin_overridesAutoLoop() {
        // Même bg vidéo 5s, mais durée timeline configurée à 4s → 4s exact (rognage),
        // pas 10s : « la timeline EST la story ».
        var slide = StoryFixtures.loopVideoSlide(videoDurationSec: 5.0)
        slide.effects.timelineDuration = 4.0
        #expect(slide.effectiveSlideDuration() == 4.0)
    }
}
