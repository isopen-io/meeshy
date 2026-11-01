import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le jingle s'entend en entier, et jamais sous le son de la story.**
final class StoryExportJingleMixTests: XCTestCase {

    private let hold = StoryExportIntro.holdDuration
    private let jingle = MeeshyBrandJingle.duration
    private let overlap = StoryExportBranding.outroOverlap

    func test_storyRamps_withIntro_storySoundRisesDuringTheJingleTail() {
        let ramps = StoryExportJingleMix.storyRamps(storyStart: hold, storyEnd: hold + 8,
                                                    introJingleEnd: jingle, outroJingleStart: nil,
                                                    outroFade: 0)
        XCTAssertEqual(ramps, [.init(from: 0, to: 1, start: hold, end: jingle)])
    }

    func test_storyRamps_authorCard_storyFadesUnderTheCardAndIsSilentWhenTheJingleEnters() {
        let storyEnd = hold + 8
        let ramps = StoryExportJingleMix.storyRamps(
            storyStart: hold, storyEnd: storyEnd, introJingleEnd: jingle,
            outroJingleStart: storyEnd,
            outroFade: StoryExportJingleMix.outroFade(authorCard: true, overlap: overlap))
        XCTAssertEqual(ramps.last, .init(from: 1, to: 0, start: storyEnd - overlap, end: storyEnd))
    }

    func test_storyRamps_logoCard_storyIsSilentBeforeTheJingleEntersWithTheLogo() {
        let storyEnd = hold + 8
        let outroStart = storyEnd - overlap
        let ramps = StoryExportJingleMix.storyRamps(
            storyStart: hold, storyEnd: storyEnd, introJingleEnd: jingle,
            outroJingleStart: outroStart,
            outroFade: StoryExportJingleMix.outroFade(authorCard: false, overlap: overlap))
        let fadeOut = ramps.last
        XCTAssertEqual(fadeOut?.to, 0)
        XCTAssertEqual(fadeOut?.end, outroStart, "le son de la story est éteint quand le jingle entre")
        XCTAssertEqual(fadeOut?.start, outroStart - StoryExportJingleMix.logoOutroDuck)
    }

    func test_storyRamps_neverOverlap_evenOnAShortStory() {
        let ramps = StoryExportJingleMix.storyRamps(storyStart: hold, storyEnd: hold + 1.5,
                                                    introJingleEnd: jingle, outroJingleStart: hold + 0.5,
                                                    outroFade: overlap)
        XCTAssertEqual(ramps.count, 2)
        XCTAssertLessThanOrEqual(ramps[0].end, ramps[1].start)
        XCTAssertLessThanOrEqual(ramps[1].end, hold + 1.5)
    }

    func test_storyRamps_storyShorterThanTheJingleTail_risesUntilItsEnd() {
        let ramps = StoryExportJingleMix.storyRamps(storyStart: hold, storyEnd: hold + 0.4,
                                                    introJingleEnd: jingle, outroJingleStart: nil,
                                                    outroFade: 0)
        XCTAssertEqual(ramps, [.init(from: 0, to: 1, start: hold, end: hold + 0.4)])
    }

    func test_storyRamps_withoutBranding_leaveTheStoryUntouched() {
        XCTAssertTrue(StoryExportJingleMix.storyRamps(storyStart: 0, storyEnd: 8, introJingleEnd: nil,
                                                      outroJingleStart: nil, outroFade: 0).isEmpty)
    }

    func test_introJingle_outlastsTheInterlude_soTheStoryMakesRoomRatherThanCuttingIt() {
        XCTAssertGreaterThan(jingle, hold + StoryExportIntro.crossfadeDuration,
                             "si le jingle tenait dans le fondu, l'enveloppe ne servirait plus — à revoir ensemble")
    }

    func test_wrap_neverFadesTheIntroJingleAnyMore() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: racine.appendingPathComponent(
            "Sources/MeeshyUI/Story/Canvas/StoryExportBranding.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("jingleParams.setVolumeRamp"))
        XCTAssertTrue(source.contains("applyStoryEnvelope("))
    }
}
