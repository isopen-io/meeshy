import XCTest
import Darwin
@testable import MeeshyUI

/// #9702 — l'aperçu du composer démarrait la vidéo par `player.play()` et
/// l'audio à `mach_absolute_time() + délai` : deux horloges sans ancre commune,
/// d'où un décalage fixe A/V. La loi est une ancre en temps hôte UNIQUE, que la
/// vidéo (`setRate(_:time:atHostTime:)`) et l'audio (`play(at:)`) partagent.
@MainActor
final class TimelinePlaybackSyncTests: XCTestCase {

    private let identity = mach_timebase_info_data_t(numer: 1, denom: 1)
    private let intel = mach_timebase_info_data_t(numer: 1, denom: 3)

    func test_anchorHostTime_addsLeadToNow() {
        let anchor = TimelinePlaybackSync.anchorHostTime(now: 1_000,
                                                         leadSeconds: 0.05,
                                                         timebase: identity)
        XCTAssertEqual(anchor, 1_000 + 50_000_000)
    }

    func test_anchorHostTime_respectsTimebase() {
        let anchor = TimelinePlaybackSync.anchorHostTime(now: 0,
                                                         leadSeconds: 1,
                                                         timebase: intel)
        XCTAssertEqual(anchor, 3_000_000_000)
    }

    func test_anchorHostTime_saturatesInsteadOfWrapping() {
        let anchor = TimelinePlaybackSync.anchorHostTime(now: .max - 10,
                                                         leadSeconds: 1,
                                                         timebase: identity)
        XCTAssertEqual(anchor, .max)
    }

    func test_clipStartHostTime_futureClip_startsAfterAnchorByItsDelay() {
        let start = TimelinePlaybackSync.clipStartHostTime(anchor: 5_000,
                                                           clipStartSeconds: 3,
                                                           playheadSeconds: 1,
                                                           timebase: identity)
        XCTAssertEqual(start, 5_000 + 2_000_000_000)
    }

    func test_clipStartHostTime_clipAlreadyStarted_startsAtAnchor() {
        let start = TimelinePlaybackSync.clipStartHostTime(anchor: 5_000,
                                                           clipStartSeconds: 1,
                                                           playheadSeconds: 4,
                                                           timebase: identity)
        XCTAssertEqual(start, 5_000)
    }

    func test_hostSeconds_convertsThroughTimebase() {
        XCTAssertEqual(TimelinePlaybackSync.hostSeconds(3_000_000_000, timebase: intel),
                       1, accuracy: 1e-9)
    }

    func test_internalClockPlayhead_beforeAnchor_staysAtOrigin() {
        let playhead = TimelinePlaybackSync.internalClockPlayhead(origin: 2,
                                                                  anchorSeconds: 100,
                                                                  now: 99.97,
                                                                  duration: 10)
        XCTAssertEqual(playhead, 2, accuracy: 1e-6)
    }

    func test_internalClockPlayhead_isDerivedFromElapsedHostTime_notFromTickCount() {
        let playhead = TimelinePlaybackSync.internalClockPlayhead(origin: 2,
                                                                  anchorSeconds: 100,
                                                                  now: 101.5,
                                                                  duration: 10)
        XCTAssertEqual(playhead, 3.5, accuracy: 1e-6)
    }

    func test_internalClockPlayhead_clampsToDuration() {
        let playhead = TimelinePlaybackSync.internalClockPlayhead(origin: 9,
                                                                  anchorSeconds: 100,
                                                                  now: 105,
                                                                  duration: 10)
        XCTAssertEqual(playhead, 10, accuracy: 1e-6)
    }
}
