import AVFoundation
import Foundation
import Testing
@testable import MeeshyUI

/// **Le budget d'un balayage de story se mesure** (#18510) : un intervalle se
/// classe dans ou hors de son budget, la distribution rend p50 et p95, et un
/// battement en retard d'au moins 100 ms est un blocage.
struct StoryNavigationBudgetTests {

    @Test func verdict_playbackWithin100ms_isWithinBudget() {
        #expect(StoryNavigationBudget.verdict(0.08, for: .swapToPlayback) == .withinBudget)
        #expect(StoryNavigationBudget.verdict(0.1, for: .swapToPlayback) == .withinBudget)
    }

    @Test func verdict_playbackAfter100ms_isOverBudget() {
        #expect(StoryNavigationBudget.verdict(0.101, for: .swapToPlayback) == .overBudget)
    }

    @Test func verdict_firstFrame_hasOneFrameOfBudget() {
        #expect(StoryNavigationBudget.verdict(0.016, for: .swapToFirstFrame) == .withinBudget)
        #expect(StoryNavigationBudget.verdict(0.034, for: .swapToFirstFrame) == .overBudget)
    }

    @Test func hang_aBeatOnTime_isNoHang() {
        #expect(StoryNavigationBudget.hang(previousBeat: 1, beat: 1.05) == nil)
        #expect(StoryNavigationBudget.hang(previousBeat: 1, beat: 1.099) == nil)
    }

    @Test func hang_aBeat100msLate_isAHangOfItsGap() {
        #expect(StoryNavigationBudget.hang(previousBeat: 1, beat: 1.25) == 0.25)
    }

    @Test func hang_beforeTheFirstBeat_isNoHang() {
        #expect(StoryNavigationBudget.hang(previousBeat: nil, beat: 5) == nil)
    }

    @Test func distribution_rendersNearestRankPercentiles() {
        var distribution = LatencyDistribution()
        (1...20).forEach { distribution.record(Double($0) / 100) }
        #expect(distribution.count == 20)
        #expect(distribution.p50 == 0.10)
        #expect(distribution.p95 == 0.19)
        #expect(distribution.overBudgetCount(0.15) == 5)
    }

    @Test func distribution_empty_hasNoPercentile() {
        #expect(LatencyDistribution().p50 == nil)
        #expect(LatencyDistribution().p95 == nil)
    }
}

/// **Le trajet geste → échange → première image → lecture** (#18510).
@MainActor
struct StoryNavigationTraceTests {

    @Test func aSwipe_recordsTheThreeIntervals() {
        let trace = StoryNavigationTrace()
        trace.gestureBegan(at: 10)
        trace.swapped(to: "s1", at: 10.01)
        trace.firstFrame(storyId: "s1", at: 10.02)
        trace.playbackStarted(storyId: "s1", at: 10.06)

        #expect(trace.distribution(.gestureToSwap).count == 1)
        #expect(abs((trace.distribution(.swapToFirstFrame).p50 ?? 0) - 0.01) < 0.0001)
        #expect(abs((trace.distribution(.swapToPlayback).p50 ?? 0) - 0.05) < 0.0001)
    }

    @Test func aLateSignal_fromAStoryAlreadyLeft_isIgnored() {
        let trace = StoryNavigationTrace()
        trace.swapped(to: "s1", at: 1)
        trace.swapped(to: "s2", at: 1.1)
        trace.firstFrame(storyId: "s1", at: 1.2)

        #expect(trace.distribution(.swapToFirstFrame).count == 0)
    }

    @Test func aStoryLeftBeforeItsFirstFrame_countsAsSkippedUnseen() {
        let trace = StoryNavigationTrace()
        trace.swapped(to: "s1", at: 1)
        trace.swapped(to: "s2", at: 1.1)
        trace.firstFrame(storyId: "s2", at: 1.12)
        trace.swapped(to: "s3", at: 1.3)

        #expect(trace.skippedUnseen == 1)
    }

    @Test func hangs_areCountedFrom100msAndAbove250ms() {
        let trace = StoryNavigationTrace()
        trace.hang(0.12)
        trace.hang(0.3)

        #expect(trace.hangs == 2)
        #expect(trace.blockingHangs == 1)
    }

    @Test func livePlayers_keepsTheirPeakAcrossSwaps() {
        var live = 2
        let trace = StoryNavigationTrace(livePlayers: { live })
        trace.swapped(to: "s1", at: 1)
        live = 5
        trace.swapped(to: "s2", at: 2)
        live = 1
        trace.swapped(to: "s3", at: 3)

        #expect(trace.peakLivePlayers == 5)
    }

    @Test func summary_namesEveryMeasure() {
        let trace = StoryNavigationTrace()
        trace.swapped(to: "s1", at: 1)
        trace.playbackStarted(storyId: "s1", at: 1.05)
        let summary = trace.summary()

        for term in ["geste→échange", "échange→première image", "échange→lecture", "blocages", "lecteurs vivants", "non affichées"] {
            #expect(summary.contains(term), "le tableau doit dire \(term)")
        }
    }
}

/// **Le nombre de lecteurs vivants** : créés moins libérés (#18510).
@MainActor
struct PlaybackPlayerCensusTests {

    /// AVFoundation peut libérer un `AVPlayer` un tour de boucle après sa dernière référence (mesuré sur le
    /// simulateur iOS 26.1 de la CI) : la table faible le perd alors, mais pas dans la même pile.
    @Test func liveCount_followsCreationAndRelease() async {
        let census = PlaybackPlayerCensus()
        let kept = AVPlayer()
        census.track(kept)
        autoreleasepool {
            let released = AVPlayer()
            census.track(released)
            #expect(census.liveCount == 2)
        }
        for _ in 0..<50 where census.liveCount != 1 {
            try? await Task.sleep(for: .milliseconds(20))
        }
        #expect(census.liveCount == 1)
        withExtendedLifetime(kept) {}
    }
}
