import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11287 — la session de QoE du fond vidéo d'une story : une par player,
/// un seul résumé à sa fin, rien sans sujet.
@MainActor
final class StoryBackgroundPlaybackQoETests: XCTestCase {

    private final class Sink { var events: [SocialEventV2] = [] }

    private func makeSession(sink: Sink, target: SocialTarget? = SocialTarget(kind: .story, id: "story-1")) -> StoryBackgroundPlaybackQoE {
        let session = StoryBackgroundPlaybackQoE(emit: { sink.events.append($0) })
        session.target = target
        return session
    }

    private func begin(_ session: StoryBackgroundPlaybackQoE, player: AVPlayer = AVPlayer()) -> AVPlayer {
        session.begin(player: player, layer: AVPlayerLayer(player: player), mediaId: "media-1", mutedAtStart: true, deviceTier: .high)
        return player
    }

    private func reasons(_ sink: Sink) -> [PlaybackSummary.ExitReason] {
        sink.events.compactMap { event in
            guard case .playback(let summary) = event.payload else { return nil }
            return summary.exitReason
        }
    }

    func test_finish_emitsExactlyOneSummary() {
        let sink = Sink()
        let session = makeSession(sink: sink)
        _ = begin(session)
        session.finish(reason: .completed)
        session.finish(reason: .completed)
        XCTAssertEqual(reasons(sink), [.completed])
    }

    func test_finish_withoutBegin_emitsNothing() {
        let sink = Sink()
        makeSession(sink: sink).finish(reason: .closed)
        XCTAssertTrue(sink.events.isEmpty)
    }

    func test_begin_withoutTarget_measuresNothing() {
        let sink = Sink()
        let session = makeSession(sink: sink, target: nil)
        _ = begin(session)
        XCTAssertFalse(session.isRunning)
        session.finish(reason: .closed)
        XCTAssertTrue(sink.events.isEmpty)
    }

    func test_begin_twiceOnTheSamePlayer_staysOneSession() {
        let sink = Sink()
        let session = makeSession(sink: sink)
        let player = begin(session)
        _ = begin(session, player: player)
        session.finish(reason: .swiped)
        XCTAssertEqual(reasons(sink), [.swiped])
    }

    func test_begin_onAnotherPlayer_closesThePreviousOneAsSwiped() {
        let sink = Sink()
        let session = makeSession(sink: sink)
        _ = begin(session)
        _ = begin(session)
        XCTAssertEqual(reasons(sink), [.swiped])
        XCTAssertTrue(session.isRunning)
    }

    func test_summary_isOnTheStorySurface_withTheTierItWasOpenedWith() throws {
        let sink = Sink()
        let session = makeSession(sink: sink)
        _ = begin(session)
        session.finish(reason: .backgrounded)
        let event = try XCTUnwrap(sink.events.first)
        XCTAssertEqual(event.surface, SocialSurface(.story))
        guard case .playback(let summary) = event.payload else { return XCTFail("playback attendu") }
        XCTAssertEqual(summary.deviceTier, .high)
        XCTAssertEqual(summary.mediaId, "media-1")
    }
}
