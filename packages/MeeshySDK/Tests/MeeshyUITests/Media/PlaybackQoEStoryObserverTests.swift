import XCTest
import AVFoundation
import Combine
import MeeshySDK
@testable import MeeshyUI

/// #11287 — la lecture d'une story remonte un QoE comme un réel, avec le
/// temps-à-première-image mesuré depuis `isReadyForDisplay`.
@MainActor
final class PlaybackQoEStoryObserverTests: XCTestCase {

    private final class Clock { var nowMs = 10_000 }

    private func makeObserver(clock: Clock, tier: PlaybackDeviceTier? = .mid) -> PlaybackQoEObserver {
        let subject = PlaybackQoESubject(target: SocialTarget(kind: .story, id: "story-1"), surface: SocialSurface(.story), mediaId: "media-1")
        return PlaybackQoEObserver(subject: subject, player: AVPlayer(), mutedAtStart: true, deviceTier: tier, clockMs: { clock.nowMs })
    }

    private func summary(_ event: SocialEventV2?) throws -> PlaybackSummary {
        guard case .playback(let summary)? = event?.payload else {
            XCTFail("un événement playback était attendu")
            throw CancellationError()
        }
        return summary
    }

    func test_firstFrameComposed_measuresStartupFromTheSessionStart() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        let readiness = PassthroughSubject<Bool, Never>()
        observer.observeFirstFrame(readiness: readiness.eraseToAnyPublisher())
        clock.nowMs += 180
        readiness.send(true)
        clock.nowMs += 2_000
        let result = try summary(observer.finish(reason: .completed))
        XCTAssertEqual(result.startupMs, 180)
        XCTAssertFalse(result.exitBeforeStart)
    }

    func test_startup_countsTheWaitThatPrecededThePlayer_whenTheSessionIsBackdated() throws {
        let clock = Clock()
        let subject = PlaybackQoESubject(target: SocialTarget(kind: .story, id: "story-1"), surface: SocialSurface(.story), mediaId: "media-1")
        let observer = PlaybackQoEObserver(subject: subject, player: AVPlayer(), mutedAtStart: true, deviceTier: nil, startedAtMs: clock.nowMs - 1_500, clockMs: { clock.nowMs })
        let readiness = PassthroughSubject<Bool, Never>()
        observer.observeFirstFrame(readiness: readiness.eraseToAnyPublisher())
        clock.nowMs += 180
        readiness.send(true)
        let result = try summary(observer.finish(reason: .completed))
        XCTAssertEqual(result.startupMs, 1_680)
    }

    func test_firstFrameComposed_alreadyTrue_isAWarmStartAroundZero() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        observer.observeFirstFrame(readiness: Just(true).eraseToAnyPublisher())
        let result = try summary(observer.finish(reason: .swiped))
        XCTAssertEqual(result.startupMs, 0)
    }

    func test_readinessFalse_isNotAFirstFrame() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        let readiness = PassthroughSubject<Bool, Never>()
        observer.observeFirstFrame(readiness: readiness.eraseToAnyPublisher())
        readiness.send(false)
        clock.nowMs += 500
        let result = try summary(observer.finish(reason: .swiped))
        XCTAssertNil(result.startupMs)
        XCTAssertTrue(result.exitBeforeStart)
    }

    func test_secondReadiness_neverMovesTheStartup() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        let readiness = PassthroughSubject<Bool, Never>()
        observer.observeFirstFrame(readiness: readiness.eraseToAnyPublisher())
        clock.nowMs += 90
        readiness.send(true)
        clock.nowMs += 700
        readiness.send(false)
        readiness.send(true)
        let result = try summary(observer.finish(reason: .completed))
        XCTAssertEqual(result.startupMs, 90)
    }

    func test_playingBeforeTheComposedFrame_neverTakesTheStartup() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        let readiness = PassthroughSubject<Bool, Never>()
        observer.observeFirstFrame(readiness: readiness.eraseToAnyPublisher())
        clock.nowMs += 60
        observer.noteTimeControl(.playing)
        clock.nowMs += 120
        readiness.send(true)
        let result = try summary(observer.finish(reason: .completed))
        XCTAssertEqual(result.startupMs, 180)
    }

    func test_playing_stillTakesTheStartup_whenNoComposedFrameIsObserved() throws {
        let clock = Clock()
        let observer = makeObserver(clock: clock)
        clock.nowMs += 75
        observer.noteTimeControl(.playing)
        let result = try summary(observer.finish(reason: .completed))
        XCTAssertEqual(result.startupMs, 75)
    }

    func test_summaryEvent_carriesStorySurfaceAndTarget() throws {
        let observer = makeObserver(clock: Clock())
        let event = try XCTUnwrap(observer.finish(reason: .closed))
        XCTAssertEqual(event.surface, SocialSurface(.story))
        XCTAssertEqual(event.target, SocialTarget(kind: .story, id: "story-1"))
    }

    func test_summaryEvent_carriesDeviceTier() throws {
        XCTAssertEqual(try summary(makeObserver(clock: Clock(), tier: .low).finish(reason: .closed)).deviceTier, .low)
        XCTAssertNil(try summary(makeObserver(clock: Clock(), tier: nil).finish(reason: .closed)).deviceTier)
    }

    func test_finish_emitsOnce() {
        let observer = makeObserver(clock: Clock())
        XCTAssertNotNil(observer.finish(reason: .completed))
        XCTAssertNil(observer.finish(reason: .completed))
    }
}
