import Foundation
import Testing
@testable import MeeshySDK

/// #11287 — le rang de l'appareil qui lit voyage avec le résumé de lecture.
@Suite("PlaybackQoE — le rang de l'appareil voyage avec le résumé")
struct PlaybackDeviceTierTests {

    @Test func playbackTier_followsMediaTier_andFoldsProIntoHigh() {
        #expect(DeviceMediaTier.low.playbackTier == .low)
        #expect(DeviceMediaTier.mid.playbackTier == .mid)
        #expect(DeviceMediaTier.high.playbackTier == .high)
        #expect(DeviceMediaTier.pro.playbackTier == .high)
    }

    @Test func playbackTier_rawValuesAreTheServerVocabulary() {
        #expect(PlaybackDeviceTier.allCases.map(\.rawValue) == ["low", "mid", "high"])
    }

    @Test func summary_carriesTheTierItWasOpenedWith() {
        var qoe = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: 4_000, mutedAtStart: true, deviceTier: .mid)
        qoe.noteFirstFrame(atMs: 120)
        #expect(qoe.finish(atMs: 900, reason: .completed).deviceTier == .mid)
    }

    @Test func summary_withoutTier_staysSilentOnTheWire() throws {
        let silent = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: nil, mutedAtStart: false).finish(atMs: 1, reason: .closed)
        #expect(silent.deviceTier == nil)
        let body = try wireBody(of: silent)
        #expect(body["deviceTier"] == nil)
    }

    @Test func summary_withTier_putsItFlatOnTheWire() throws {
        let summary = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: nil, mutedAtStart: false, deviceTier: .high).finish(atMs: 1, reason: .closed)
        let body = try wireBody(of: summary)
        #expect(body["deviceTier"] as? String == "high")
    }

    @Test func firstFrame_isTheFirstOne_aLaterPlayingNeverMovesIt() {
        var qoe = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: 4_000, mutedAtStart: true)
        qoe.noteFirstFrame(atMs: 180)
        qoe.noteFirstFrame(atMs: 900)
        #expect(qoe.finish(atMs: 2_000, reason: .completed).startupMs == 180)
    }

    private func wireBody(of summary: PlaybackSummary) throws -> [String: Any] {
        let event = SocialEventV2(target: SocialTarget(kind: .story, id: "s1"), surface: SocialSurface(.story), payload: .playback(summary))
        let data = try #require(try SocialEventsV2Wire.encode(event))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
