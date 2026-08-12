import XCTest
@testable import MeeshySDK

/// Miroir de `apps/web/__tests__/utils/playback-stretch-tracker.test.ts` : les
/// deux implémentations doivent se comporter identiquement.
///
/// Un échantillonnage périodique perd structurellement du contenu — un média
/// d'une seconde n'est jamais relevé, une écoute de 500 ms non plus. Le lecteur
/// connaît les frontières exactes, et la frontière elle-même est une
/// information : s'arrêter en pause, sauter ailleurs ou laisser le média finir
/// ne racontent pas la même chose.
///
/// Voir `docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md`.
final class PlaybackStretchTrackerTests: XCTestCase {

    // MARK: - Capture exacte

    func test_shortListen_isCaptured_whereSamplingWouldLoseIt() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.pause(500)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 500, endedBy: .pause)])
    }

    func test_oneSecondMedia_playedFully_isCaptured() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.completed(1000)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 1000, endedBy: .completed)])
    }

    func test_noTailLoss_afterTheLastMarker() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.pause(47_000)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 47_000, endedBy: .pause)])
    }

    // MARK: - Fidélité de l'interaction

    func test_pauseAndSeek_areDistinguished() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.pause(1000)
        tracker.begin(1000)
        tracker.seek(from: 2000, to: 8000)
        tracker.pause(8500)

        XCTAssertEqual(tracker.drain(), [
            PlaybackStretch(startMs: 0, endMs: 1000, endedBy: .pause),
            PlaybackStretch(startMs: 1000, endMs: 2000, endedBy: .seek),
            PlaybackStretch(startMs: 8000, endMs: 8500, endedBy: .pause),
        ])
    }

    func test_abandoned_isNotConfusedWithCompleted() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.dismissed(1200)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 1200, endedBy: .dismissed)])
    }

    func test_muted_endsTheStretch() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.muted(800)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 800, endedBy: .muted)])
        XCTAssertFalse(tracker.hasOpenStretch)
    }

    /// L'utilisateur écoute la fin, puis revient au début : la trace doit dire
    /// « fin d'abord », ce qu'un tri par position effacerait.
    func test_chronologicalOrder_notPositionalOrder() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(9000)
        tracker.seek(from: 9500, to: 0)
        tracker.pause(400)

        XCTAssertEqual(tracker.drain(), [
            PlaybackStretch(startMs: 9000, endMs: 9500, endedBy: .seek),
            PlaybackStretch(startMs: 0, endMs: 400, endedBy: .pause),
        ])
    }

    func test_threeFragmentedListens_differFromOneContinuous() {
        var fragmented = PlaybackStretchTracker()
        fragmented.begin(0); fragmented.pause(300)
        fragmented.begin(300); fragmented.pause(600)
        fragmented.begin(600); fragmented.pause(900)

        var continuous = PlaybackStretchTracker()
        continuous.begin(0); continuous.pause(900)

        XCTAssertEqual(fragmented.drain().count, 3)
        XCTAssertEqual(continuous.drain().count, 1)
    }

    // MARK: - Robustesse

    func test_closeWithoutOpen_isIgnored() {
        var tracker = PlaybackStretchTracker()
        tracker.pause(500)

        XCTAssertEqual(tracker.drain(), [])
    }

    func test_zeroLengthListen_isIgnored() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(300)
        tracker.pause(300)

        XCTAssertEqual(tracker.drain(), [])
    }

    func test_closeBeforeOpen_isIgnored() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(900)
        tracker.pause(400)

        XCTAssertEqual(tracker.drain(), [])
    }

    /// Le lecteur a manqué un événement : on ne perd pas ce qui précède.
    func test_secondBegin_closesTheFirstAsSuperseded() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.begin(700)
        tracker.pause(1200)

        XCTAssertEqual(tracker.drain(), [
            PlaybackStretch(startMs: 0, endMs: 700, endedBy: .superseded),
            PlaybackStretch(startMs: 700, endMs: 1200, endedBy: .pause),
        ])
    }

    /// Parcourir la barre de progression d'un média en pause ne fait rien
    /// entendre : compter cela comme une écoute serait inventer une consommation.
    func test_seekWhilePaused_opensNothing() {
        var tracker = PlaybackStretchTracker()
        tracker.seek(from: 0, to: 5000)

        XCTAssertFalse(tracker.hasOpenStretch)
        tracker.pause(6000)
        XCTAssertEqual(tracker.drain(), [])
    }

    func test_seekWhilePlaying_reopens() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.seek(from: 1000, to: 5000)

        XCTAssertTrue(tracker.hasOpenStretch)
    }

    func test_drain_neverYieldsTheSameStretchTwice() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.pause(500)

        XCTAssertEqual(tracker.drain().count, 1)
        XCTAssertEqual(tracker.drain(), [])
    }

    func test_drain_preservesAnOpenStretch() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.pause(400)
        tracker.begin(400)

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 400, endedBy: .pause)])
        XCTAssertTrue(tracker.hasOpenStretch)

        tracker.pause(900)
        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 400, endMs: 900, endedBy: .pause)])
    }

    /// Fermeture brutale : la position finale n'est pas toujours lisible, mais
    /// la dernière observée vaut mieux que perdre l'écoute entière.
    func test_dismissedWithoutPosition_closesAtLastObserved() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.observe(650)
        tracker.dismissed()

        XCTAssertEqual(tracker.drain(), [PlaybackStretch(startMs: 0, endMs: 650, endedBy: .dismissed)])
    }

    func test_observe_createsNoStretchOnItsOwn() {
        var tracker = PlaybackStretchTracker()
        tracker.begin(0)
        tracker.observe(200)
        tracker.observe(400)

        XCTAssertEqual(tracker.drain(), [])
        XCTAssertTrue(tracker.hasOpenStretch)
    }
}
