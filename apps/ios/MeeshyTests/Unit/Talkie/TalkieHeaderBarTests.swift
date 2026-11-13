import XCTest
@testable import Meeshy

/// Talkie actif, le bouton prend toute la barre d'en-tête et son onde suit la voix en direct (#17310).
final class TalkieHeaderBarTests: XCTestCase {

    // MARK: - Quelle voix occupe l'en-tête

    func test_voice_resolve_liveOutgoing_isOutgoing() {
        XCTAssertEqual(TalkieHeaderVoice.resolve(look: .live, peerSpeaking: false), .outgoing)
    }

    func test_voice_resolve_peerSpeaking_isIncoming() {
        XCTAssertEqual(TalkieHeaderVoice.resolve(look: .idle, peerSpeaking: true), .incoming)
    }

    func test_voice_resolve_bothAtOnce_outgoingWins() {
        XCTAssertEqual(TalkieHeaderVoice.resolve(look: .live, peerSpeaking: true), .outgoing)
    }

    func test_voice_resolve_pressedBeforeTheVoiceLeaves_staysAtRest() {
        XCTAssertEqual(TalkieHeaderVoice.resolve(look: .pressed, peerSpeaking: false), .none)
        XCTAssertEqual(TalkieHeaderVoice.resolve(look: .idle, peerSpeaking: false), .none)
    }

    // MARK: - Ce que l'en-tête montre

    func test_chrome_atRest_showsEverything() {
        let chrome = ConversationHeaderTalkieChrome.resolve(voice: .none)
        XCTAssertTrue(chrome.showsBackButton)
        XCTAssertTrue(chrome.showsIdentity)
        XCTAssertTrue(chrome.showsActions)
        XCTAssertFalse(chrome.talkieSpansBar)
    }

    func test_chrome_whileAVoiceLeavesOrArrives_talkieSpansTheBar() {
        for voice in [TalkieHeaderVoice.outgoing, .incoming] {
            let chrome = ConversationHeaderTalkieChrome.resolve(voice: voice)
            XCTAssertTrue(chrome.talkieSpansBar, "\(voice)")
            XCTAssertFalse(chrome.showsBackButton, "\(voice)")
            XCTAssertFalse(chrome.showsIdentity, "\(voice)")
            XCTAssertFalse(chrome.showsActions, "\(voice)")
        }
    }

    // MARK: - Niveau mesuré

    func test_rms_ofSilence_isZero_andOfAConstantSignal_isItsAmplitude() {
        XCTAssertEqual([Float]().withUnsafeBufferPointer(TalkieWaveLaw.rms), 0)
        XCTAssertEqual([Float](repeating: 0, count: 8).withUnsafeBufferPointer(TalkieWaveLaw.rms), 0)
        XCTAssertEqual([Float](arrayLiteral: 0.5, -0.5, 0.5, -0.5).withUnsafeBufferPointer(TalkieWaveLaw.rms), 0.5, accuracy: 0.0001)
    }

    func test_normalized_mapsDecibels_betweenTheFloorAndFullScale() {
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: 0), 0)
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: 1), 1)
        let halfway = Float(pow(10, Double(TalkieWaveLaw.floorDecibels) / 40))
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: halfway), 0.5, accuracy: 0.001)
    }

    func test_normalized_isBounded_againstNoiseAndGarbage() {
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: 3), 1)
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: -1), 0)
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: .nan), 0)
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: .infinity), 1)
        XCTAssertEqual(TalkieWaveLaw.normalized(rms: 0.000_01), 0)
    }

    // MARK: - Lissage

    func test_smoothed_risesQuickly_andFallsSlowly() {
        let rise = TalkieWaveLaw.smoothed(previous: 0, target: 1)
        let fall = 1 - TalkieWaveLaw.smoothed(previous: 1, target: 0)
        XCTAssertGreaterThan(rise, 0)
        XCTAssertLessThan(rise, 1)
        XCTAssertGreaterThan(rise, fall)
    }

    func test_smoothed_staysBounded_andConverges() {
        XCTAssertEqual(TalkieWaveLaw.smoothed(previous: 0.4, target: 0.4), 0.4, accuracy: 0.0001)
        XCTAssertLessThanOrEqual(TalkieWaveLaw.smoothed(previous: 1, target: 9), 1)
        XCTAssertGreaterThanOrEqual(TalkieWaveLaw.smoothed(previous: 0, target: -9), 0)
        let converged = (0..<120).reduce(Float(0)) { value, _ in TalkieWaveLaw.smoothed(previous: value, target: 0.8) }
        XCTAssertEqual(converged, 0.8, accuracy: 0.01)
    }

    // MARK: - Niveaux → barres

    func test_barCount_fillsTheWidth_andNeverDropsToZero() {
        XCTAssertEqual(TalkieWaveLaw.barCount(width: 300, barWidth: 3, gap: 3), 50)
        XCTAssertEqual(TalkieWaveLaw.barCount(width: 0, barWidth: 3, gap: 3), 1)
        XCTAssertEqual(TalkieWaveLaw.barCount(width: 10_000, barWidth: 3, gap: 3), TalkieWaveTrail.capacity)
    }

    func test_barHeights_areBounded_silenceIsTheFloor_fullScaleIsTheCeiling() {
        let heights = TalkieWaveLaw.barHeights(levels: [0, 0.5, 1, 7, -2], barCount: 5, minHeight: 2, maxHeight: 20)
        XCTAssertEqual(heights.count, 5)
        XCTAssertEqual(heights[0], 2)
        XCTAssertEqual(heights[1], 11, accuracy: 0.001)
        XCTAssertEqual(heights[2], 20)
        XCTAssertEqual(heights[3], 20)
        XCTAssertEqual(heights[4], 2)
    }

    func test_barHeights_showTheLatestLevelsOnTheRight_andPadTheLeftWithTheFloor() {
        XCTAssertEqual(TalkieWaveLaw.barHeights(levels: [1, 0, 1], barCount: 2, minHeight: 2, maxHeight: 20), [2, 20])
        XCTAssertEqual(TalkieWaveLaw.barHeights(levels: [1], barCount: 3, minHeight: 2, maxHeight: 20), [2, 2, 20])
    }

    // MARK: - La traîne de l'onde

    func test_trail_stepsAtItsOwnPace_notAtEveryFrame() {
        var trail = TalkieWaveTrail()
        let start = Date(timeIntervalSinceReferenceDate: 0)
        trail.advance(to: start, level: 1)
        trail.advance(to: start.addingTimeInterval(TalkieWaveTrail.step / 4), level: 1)
        XCTAssertEqual(trail.levels.count, 1)
        trail.advance(to: start.addingTimeInterval(TalkieWaveTrail.step * 1.01), level: 1)
        XCTAssertEqual(trail.levels.count, 2)
    }

    func test_trail_smoothsTheLevel_andStaysBounded() {
        var trail = TalkieWaveTrail()
        let start = Date(timeIntervalSinceReferenceDate: 0)
        trail.advance(to: start, level: 1)
        XCTAssertLessThan(trail.levels[0], 1)
        (1..<(TalkieWaveTrail.capacity * 2)).forEach { index in
            trail.advance(to: start.addingTimeInterval(Double(index) * TalkieWaveTrail.step * 1.01), level: 1)
        }
        XCTAssertEqual(trail.levels.count, TalkieWaveTrail.capacity)
        XCTAssertEqual(trail.levels.last ?? 0, 1, accuracy: 0.01)
    }

    // MARK: - Le compteur de niveau

    func test_meter_publishesTheNormalizedLevel_andResetsToSilence() {
        let meter = TalkieLevelMeter()
        XCTAssertEqual(meter.level, 0)
        meter.push(rms: 1)
        XCTAssertEqual(meter.level, 1)
        meter.reset()
        XCTAssertEqual(meter.level, 0)
    }

    // MARK: - Direct ou enregistré : visible avant la fin (2026-11-09)

    func test_delivery_aLiveTalkie_isRealtime() {
        let delivery = TalkieHeaderDelivery.resolve(voice: .outgoing, phase: .talking(toUserId: "u", talkieId: "t"), waking: false)
        XCTAssertEqual(delivery, .live)
        XCTAssertTrue(delivery.isRealtime)
    }

    func test_delivery_aPeerOffline_isRelayed_notRealtime() {
        let delivery = TalkieHeaderDelivery.resolve(voice: .outgoing, phase: .talking(toUserId: "u", talkieId: "t"), waking: true)
        XCTAssertEqual(delivery, .relayed)
        XCTAssertFalse(delivery.isRealtime)
    }

    func test_delivery_theFallbackVoiceMessage_isRecorded_notRealtime() {
        let delivery = TalkieHeaderDelivery.resolve(voice: .outgoing, phase: .recordingCopy(toUserId: "u"), waking: false)
        XCTAssertEqual(delivery, .recorded)
        XCTAssertFalse(delivery.isRealtime)
    }

    func test_delivery_anIncomingVoice_isAlwaysRealtime() {
        XCTAssertEqual(TalkieHeaderDelivery.resolve(voice: .incoming, phase: .idle, waking: false), .live)
        XCTAssertEqual(TalkieHeaderDelivery.resolve(voice: .incoming, phase: .recordingCopy(toUserId: "u"), waking: true), .live)
    }

    func test_live_carriesItsDelivery_andRestIsRealtime() {
        XCTAssertEqual(TalkieHeaderLive.rest.delivery, .live)
        let live = TalkieHeaderLive(voice: .outgoing, delivery: .relayed, accent: .red, secondary: .blue)
        XCTAssertEqual(live.delivery, .relayed)
    }

    // MARK: - L'onde miroir du direct

    func test_mirrored_ofSilence_isTheFloorEverywhere() {
        let heights = TalkieWaveLaw.mirroredBarHeights(level: 0, barCount: 9, time: 1.3, minHeight: 3, maxHeight: 24)
        XCTAssertEqual(heights.count, 9)
        XCTAssertTrue(heights.allSatisfy { $0 == 3 })
    }

    func test_mirrored_isSymmetric_aroundItsCentre() {
        for time in [0.0, 0.41, 2.7, 13.05] {
            let heights = TalkieWaveLaw.mirroredBarHeights(level: 0.8, barCount: 11, time: time, minHeight: 3, maxHeight: 24)
            XCTAssertEqual(heights, Array(heights.reversed()), "t=\(time)")
        }
    }

    func test_mirrored_isBounded_andTheCentreLeads_atFullVoice() {
        for time in stride(from: 0.0, to: 3.0, by: 0.17) {
            let heights = TalkieWaveLaw.mirroredBarHeights(level: 1, barCount: 15, time: time, minHeight: 3, maxHeight: 24)
            XCTAssertTrue(heights.allSatisfy { $0 >= 3 && $0 <= 24 }, "t=\(time)")
            XCTAssertGreaterThan(heights[7], heights[0], "t=\(time)")
        }
    }

    func test_mirrored_followsTheVoice_louderIsTaller() {
        let quiet = TalkieWaveLaw.mirroredBarHeights(level: 0.2, barCount: 9, time: 0.5, minHeight: 3, maxHeight: 24)
        let loud = TalkieWaveLaw.mirroredBarHeights(level: 0.9, barCount: 9, time: 0.5, minHeight: 3, maxHeight: 24)
        XCTAssertGreaterThan(loud.reduce(0, +), quiet.reduce(0, +))
    }

    func test_mirrored_withoutBars_isEmpty() {
        XCTAssertEqual(TalkieWaveLaw.mirroredBarHeights(level: 1, barCount: 0, time: 0, minHeight: 3, maxHeight: 24), [])
    }

    // MARK: - Le chrono de l'enregistrement

    func test_elapsed_readsMinutesAndSeconds() {
        XCTAssertEqual(TalkieHeaderWording.elapsed(0), "0:00")
        XCTAssertEqual(TalkieHeaderWording.elapsed(7.9), "0:07")
        XCTAssertEqual(TalkieHeaderWording.elapsed(65), "1:05")
        XCTAssertEqual(TalkieHeaderWording.elapsed(-3), "0:00")
    }
}
