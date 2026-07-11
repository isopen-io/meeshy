import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// D0.1 (constat simulateur 2026-07-11) — une slide SANS vidéo foreground
/// (fond vidéo + textes, le cas le plus courant) produit une AVMutableComposition
/// VIDE : l'AVPlayer ne progresse jamais, le transport est mort (playhead figé
/// à 0:00, aucun onTimeUpdate, jamais de onPlaybackEnd). L'engine doit alors
/// piloter le temps avec une horloge interne main-thread jusqu'à slideDuration.
@MainActor
final class StoryTimelineEngineInternalClockTests: XCTestCase {

    private func makeProject(slideDuration: Float) -> TimelineProject {
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.startTime = 0
        return TimelineProject(
            slideId: "slide-clock",
            slideDuration: slideDuration,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [text],
            clipTransitions: []
        )
    }

    func test_play_emptyComposition_advancesTimeViaInternalClock() async throws {
        let engine = StoryTimelineEngine(audioMixer: MockAudioMixer())
        await engine.configure(project: makeProject(slideDuration: 5), mediaURLs: [:], images: [:])
        var ticks: [Float] = []
        engine.onTimeUpdate = { ticks.append($0) }

        engine.play()
        try await Task.sleep(nanoseconds: 350_000_000)
        engine.pause()

        XCTAssertGreaterThan(engine.currentTime, 0.15,
                             "Sans piste dans la composition, l'horloge interne doit faire avancer currentTime")
        XCTAssertGreaterThan(ticks.count, 3,
                             "onTimeUpdate doit tirer en continu pendant la lecture pilotée par l'horloge interne")
        XCTAssertTrue(ticks.contains(where: { $0 > 0.1 }),
                      "Les ticks doivent porter des temps croissants, pas des zéros")
        engine.shutdown()
    }

    func test_play_emptyComposition_reachesEnd_firesPlaybackEndAndStops() async throws {
        let engine = StoryTimelineEngine(audioMixer: MockAudioMixer())
        await engine.configure(project: makeProject(slideDuration: 0.2), mediaURLs: [:], images: [:])
        var ended = false
        engine.onPlaybackEnd = { ended = true }

        engine.play()
        try await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertTrue(ended, "Atteindre slideDuration doit émettre onPlaybackEnd")
        XCTAssertFalse(engine.isPlaying, "La lecture doit s'arrêter d'elle-même en fin de slide")
        XCTAssertEqual(engine.currentTime, 0.2, accuracy: 0.05,
                       "currentTime doit se figer à slideDuration, pas au-delà")
        engine.shutdown()
    }

    func test_pause_emptyComposition_freezesInternalClock() async throws {
        let engine = StoryTimelineEngine(audioMixer: MockAudioMixer())
        await engine.configure(project: makeProject(slideDuration: 5), mediaURLs: [:], images: [:])

        engine.play()
        try await Task.sleep(nanoseconds: 200_000_000)
        engine.pause()
        let frozen = engine.currentTime
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(engine.currentTime, frozen,
                       "pause() doit geler l'horloge interne — aucun tick après pause")
        engine.shutdown()
    }

    func test_seek_thenPlay_emptyComposition_resumesFromSeekedTime() async throws {
        let engine = StoryTimelineEngine(audioMixer: MockAudioMixer())
        await engine.configure(project: makeProject(slideDuration: 5), mediaURLs: [:], images: [:])

        engine.seek(to: 3.0)
        engine.play()
        try await Task.sleep(nanoseconds: 150_000_000)
        engine.pause()

        XCTAssertGreaterThan(engine.currentTime, 3.0,
                             "L'horloge interne doit reprendre depuis la position seekée, pas depuis 0")
        XCTAssertLessThan(engine.currentTime, 3.5)
        engine.shutdown()
    }
}
