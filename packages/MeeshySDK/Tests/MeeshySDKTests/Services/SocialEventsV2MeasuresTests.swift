import Foundation
import CoreGraphics
import Testing
@testable import MeeshySDK

/// #10501 — l'impression VISIBLE au sens MRC.
@Suite("ViewabilityMeter — 50 % pendant 1 s, 2 s pour une vidéo")
struct ViewabilityMeterTests {

    @Test func display_at999ms_isNotViewable_at1000ms_is() {
        var meter = ViewabilityMeter()
        meter.note(fraction: 0.6, atMs: 0)
        #expect(!meter.isViewable(atMs: 999))
        #expect(meter.isViewable(atMs: 1_000))
    }

    @Test func video_requires2000ms() {
        var meter = ViewabilityMeter(isVideo: true)
        meter.note(fraction: 1, atMs: 0)
        #expect(!meter.isViewable(atMs: 1_999))
        #expect(meter.isViewable(atMs: 2_000))
    }

    @Test func aBreakBelowHalf_restartsTheContinuousRun() {
        var meter = ViewabilityMeter()
        meter.note(fraction: 0.8, atMs: 0)
        meter.note(fraction: 0.3, atMs: 700)
        meter.note(fraction: 0.8, atMs: 800)
        #expect(!meter.isViewable(atMs: 1_700))
        #expect(meter.isViewable(atMs: 1_800))
    }

    @Test func underHalf_neverViewable_butVisibleTimeIsKept() {
        var meter = ViewabilityMeter()
        meter.note(fraction: 0.4, atMs: 0)
        meter.note(fraction: 0, atMs: 5_000)
        let measure = meter.measure(atMs: 6_000)
        #expect(!measure.viewable)
        #expect(measure.visibleMs == 5_000)
        #expect(measure.maxVisibleFraction == 0.4)
    }

    @Test func viewableOnceReached_staysViewableAfterLeaving() {
        var meter = ViewabilityMeter()
        meter.note(fraction: 1, atMs: 0)
        meter.note(fraction: 0, atMs: 1_200)
        #expect(meter.measure(atMs: 3_000).viewable)
    }

    @Test func visibleFraction_isTheOverlapShare() {
        let fraction = ViewabilityMeter.visibleFraction(of: CGRect(x: 0, y: 50, width: 100, height: 100), in: CGRect(x: 0, y: 0, width: 100, height: 100))
        #expect(fraction == 0.5)
        #expect(ViewabilityMeter.visibleFraction(of: CGRect(x: 0, y: 200, width: 10, height: 10), in: CGRect(x: 0, y: 0, width: 100, height: 100)) == 0)
    }
}

/// #10509 — le défilement, agrégé par passage.
@Suite("ScrollDepth — un passage, un événement")
struct ScrollDepthTests {

    @Test func thousandSamples_giveASingleEventAtTheEnd() {
        var session = ScrollListingSession(listingSessionId: "L", startedAtMs: 0)
        let emitted = (1...1_000).compactMap { i in session.sample(offsetPt: Double(i * 8), atMs: i * 16) }
        #expect(emitted.isEmpty)
        let summary = session.finish(atMs: 16_100)
        #expect(summary?.listingSessionId == "L")
        #expect(summary?.segment == 0)
        let again = session.finish(atMs: 17_000)
        #expect(again == nil)
    }

    @Test func samples_areDecimatedTo10Hz() {
        var accumulator = ScrollDepthAccumulator()
        let first = accumulator.sample(offsetPt: 0, atMs: 0)
        let tooSoon = accumulator.sample(offsetPt: 10, atMs: 50)
        let next = accumulator.sample(offsetPt: 20, atMs: 100)
        #expect(first)
        #expect(!tooSoon)
        #expect(next)
    }

    @Test func histogram_sumsTheActiveScrollDuration() {
        var accumulator = ScrollDepthAccumulator()
        accumulator.sample(offsetPt: 0, atMs: 0)
        accumulator.sample(offsetPt: 20, atMs: 100)      // 200 pt/s
        accumulator.sample(offsetPt: 120, atMs: 200)     // 1 000 pt/s
        accumulator.sample(offsetPt: 420, atMs: 300)     // 3 000 pt/s
        accumulator.sample(offsetPt: 1_020, atMs: 400)   // 6 000 pt/s
        #expect(accumulator.velocityHistogram == [100, 100, 100, 100])
        #expect(accumulator.velocityHistogram.reduce(0, +) == accumulator.activeScrollMs)
        #expect(accumulator.flings == 1)
        #expect(accumulator.distancePt == 1_020)
    }

    @Test func directionChanges_andUpRatio_areExact() {
        var accumulator = ScrollDepthAccumulator()
        accumulator.sample(offsetPt: 0, atMs: 0)
        accumulator.sample(offsetPt: 300, atMs: 100)
        accumulator.sample(offsetPt: 200, atMs: 200)
        accumulator.sample(offsetPt: 400, atMs: 300)
        accumulator.sample(offsetPt: 400, atMs: 400)
        accumulator.sample(offsetPt: 500, atMs: 500)
        #expect(accumulator.directionChanges == 2)
        #expect(accumulator.distancePt == 700)
        #expect(accumulator.upDistanceRatio == 0.14)
        #expect((0...1).contains(accumulator.upDistanceRatio))
    }

    @Test func aStillSecond_countsOneStop() {
        var accumulator = ScrollDepthAccumulator()
        accumulator.sample(offsetPt: 0, atMs: 0)
        accumulator.sample(offsetPt: 100, atMs: 100)
        accumulator.sample(offsetPt: 100, atMs: 600)
        accumulator.sample(offsetPt: 100, atMs: 1_100)
        accumulator.sample(offsetPt: 100, atMs: 2_500)
        #expect(accumulator.stops == 1)
    }

    @Test func aLongPassage_isCutInto60sSegments() {
        var session = ScrollListingSession(listingSessionId: "L", startedAtMs: 0)
        session.noteRendered(position: 12)
        let segment = session.sample(offsetPt: 0, atMs: 60_000)
        #expect(segment?.segment == 0)
        #expect(segment?.durationMs == 60_000)
        #expect(segment?.maxPosition == 12)
        _ = session.sample(offsetPt: 0, atMs: 60_100)
        _ = session.sample(offsetPt: 400, atMs: 60_200)
        let last = session.finish(atMs: 70_000)
        #expect(last?.segment == 1)
    }

    @Test func content_carouselAndText() {
        var carousel = ScrollContentAccumulator(contentKind: .carousel, itemsTotal: 5, startedAtMs: 0)
        carousel.noteIndex(1)
        carousel.noteIndex(3)
        carousel.noteIndex(2)
        let summary = carousel.finish(atMs: 4_000)
        #expect(summary?.maxIndexReached == 3)
        #expect(summary?.swipes == 3)
        #expect(summary?.durationMs == 4_000)

        var text = ScrollContentAccumulator(contentKind: .longText, startedAtMs: 0)
        #expect(text.finish(atMs: 10) == nil)
        text.noteScroll(fraction: 0.4, readThrough: 0.55)
        text.noteScroll(fraction: 0.2)
        #expect(text.finish(atMs: 10)?.maxScrollFraction == 0.4)
        #expect(text.finish(atMs: 10)?.readThroughFraction == 0.55)
    }
}

/// #10504 — la qualité de lecture, un résumé par session.
@Suite("PlaybackQoE — un résumé, jamais un battement")
struct PlaybackQoETests {

    @Test func twoEmptyBuffers_giveTwoRebuffers() {
        var qoe = PlaybackQoEAccumulator(playbackId: "pb", mediaId: "m", mediaDurationMs: 10_000, mutedAtStart: true)
        qoe.noteBufferEmpty(atMs: 10)                 // avant la 1re image : démarrage
        qoe.noteFirstFrame(atMs: 300)
        qoe.notePlaying(atMs: 300)
        qoe.noteBufferEmpty(atMs: 1_000)
        qoe.noteLikelyToKeepUp(atMs: 1_400)
        qoe.noteBufferEmpty(atMs: 3_000)
        qoe.noteLikelyToKeepUp(atMs: 3_100)
        let summary = qoe.finish(atMs: 5_000, reason: .closed)
        #expect(summary.rebufferCount == 2)
        #expect(summary.rebufferMs == 500)
        #expect(summary.startupMs == 300)
        #expect(!summary.exitBeforeStart)
        #expect(summary.playedMs == 4_700)
        #expect(summary.mutedAtStart)
    }

    @Test func reelLoops_incrementLoops_andCompleteTheQuartiles() {
        var qoe = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: 8_000, mutedAtStart: false)
        qoe.noteFirstFrame(atMs: 100)
        qoe.noteLoop()
        qoe.noteLoop()
        let summary = qoe.finish(atMs: 20_000, reason: .swiped)
        #expect(summary.loops == 2)
        #expect(summary.quartiles == 15)
    }

    @Test func quartiles_setTheRightBitmask() {
        #expect(PlaybackQuartiles.mask(reachedMs: 2_400, durationMs: 10_000) == 0)
        #expect(PlaybackQuartiles.mask(reachedMs: 2_500, durationMs: 10_000) == 1)
        #expect(PlaybackQuartiles.mask(reachedMs: 7_600, durationMs: 10_000) == 7)
        #expect(PlaybackQuartiles.mask(reachedMs: 10_000, durationMs: 10_000) == 15)
    }

    @Test func noFirstFrame_isAnExitBeforeStart_andAnErrorKeepsOnlyItsCode() {
        var qoe = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: nil, mutedAtStart: false)
        qoe.noteError(code: -11_800, domain: "AVFoundationErrorDomain")
        let summary = qoe.finish(atMs: 900, reason: .other)
        #expect(summary.exitBeforeStart)
        #expect(summary.startupMs == nil)
        #expect(summary.errorCode == -11_800)
        #expect(summary.exitReason == .error)
    }

    @Test func bitrate_isAveraged_andRenditionChangesCounted() {
        var qoe = PlaybackQoEAccumulator(mediaId: "m", mediaDurationMs: 1_000, mutedAtStart: false)
        qoe.noteAccessLog(observedBitrateKbps: 1_000, renditionChanged: false)
        qoe.noteAccessLog(observedBitrateKbps: 3_000, renditionChanged: true)
        let summary = qoe.finish(atMs: 10, reason: .closed)
        #expect(summary.avgBitrateKbps == 2_000)
        #expect(summary.renditionChanges == 1)
    }
}

/// #10503, #10505, #10506, #10508 — les règles pures des familles.
@Suite("SocialEventsV2 — règles des familles")
struct SocialEventsV2FamilyRulesTests {

    @Test func quickSkip_at600ms_butNotAt1200ms() {
        #expect(SocialNegative.quickSkip(visibleMs: 600)?.action == .quickSkip)
        #expect(SocialNegative.quickSkip(visibleMs: 600)?.visibleMs == 600)
        #expect(SocialNegative.quickSkip(visibleMs: 1_200) == nil)
        #expect(SocialNegative.quickSkip(visibleMs: 1_000) == nil)
    }

    @Test func share_towardAConversation_carriesItsDestination() {
        #expect(SocialInteraction(action: .share, destination: .conversation).destination == .conversation)
        #expect(SocialInteraction(action: .share).destination == .other)
        #expect(SocialInteraction(action: .save, destination: .conversation).destination == nil)
    }

    @Test func exitBeforeEnd_carriesTheSlideIndex() throws {
        let event = SocialEventV2(target: SocialTarget(kind: .story, id: "s"), payload: .story(SocialStoryEvent(action: .exitBeforeEnd, slideIndex: 2, slideCount: 5, elapsedMs: 800)))
        let data = try #require(try SocialEventsV2Wire.encode(event))
        let body = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(body["action"] as? String == "exit_before_end")
        #expect(body["slideIndex"] as? Int == 2)
        #expect(body["slideCount"] as? Int == 5)
    }

    @Test func screenCapture_keepsTenTargets_andNamesRecordingOrMirroring() {
        let targets = (0..<14).map { SocialVisibleTarget(kind: .post, id: "p\($0)", visibleFraction: 1) }
        let shot = SocialScreenCapture(action: .screenshot, visibleTargets: targets, recordingMs: 99)
        #expect(shot.visibleTargets.count == 10)
        #expect(shot.recordingMs == nil)
        #expect(shot.captureKind == .screenshot)
        let stop = SocialScreenCapture(action: .recordingStopped, visibleTargets: [], recordingMs: 4_200)
        #expect(stop.captureKind == .recordingOrMirroring)
        #expect(stop.recordingMs == 4_200)
    }

    @Test func link_targetIsTheRegistrableDomainOnly() throws {
        func url(_ string: String) throws -> URL { try #require(URL(string: string)) }
        let target = SocialTarget.link(url: try url("https://news.bbc.co.uk/sport/article?id=42&utm=x"))
        #expect(target?.id == "bbc.co.uk")
        let youtube = SocialTarget.link(url: try url("https://www.youtube.com/watch?v=abc"))
        #expect(youtube?.id == "youtube.com")
        let ip = SocialTarget.link(url: try url("http://192.168.1.10/x"))
        #expect(ip == nil)
        let tracked = SocialTarget.link(url: try url("https://x.com"), trackingLinkId: "trk1")
        #expect(tracked?.id == "trk1")
    }

    @Test func hashtag_isNormalized() {
        #expect(SocialTarget.hashtag("  #MeeshyLove ").id == "meeshylove")
    }

    @Test func prism_servedTranslation_andOriginal() {
        #expect(SocialPrism.served(translationLanguage: "fr", originalLanguage: "en") == SocialPrism(displayedLanguage: "fr", originalLanguage: "en", translated: true, translationSource: .server))
        #expect(SocialPrism.served(translationLanguage: nil, originalLanguage: "en")?.translated == false)
        #expect(SocialPrism.served(translationLanguage: nil, originalLanguage: nil) == nil)
    }

    @Test func rankingSource_unknownFallsBackToOther() {
        #expect(SocialRankingSource(served: "for_you") == .forYou)
        #expect(SocialRankingSource(served: "galaxy_brain") == .other)
        #expect(SocialRankingSource(served: nil) == .other)
    }
}
