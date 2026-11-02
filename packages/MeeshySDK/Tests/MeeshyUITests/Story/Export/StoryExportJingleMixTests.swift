import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le jingle s'entend en entier, et jamais sous le son de la story.**
@MainActor
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

    func test_storyRampsOverAuthor_withoutAuthorEnvelope_isTheBareLaw() {
        let bare = StoryExportJingleMix.storyRamps(storyStart: hold, storyEnd: hold + 8,
                                                   introJingleEnd: jingle, outroJingleStart: hold + 8 - overlap,
                                                   outroFade: StoryExportJingleMix.logoOutroDuck)
        let over = StoryExportJingleMix.storyRamps(over: [], storyStart: hold, storyEnd: hold + 8,
                                                   introJingleEnd: jingle, outroJingleStart: hold + 8 - overlap,
                                                   outroFade: StoryExportJingleMix.logoOutroDuck)
        XCTAssertEqual(over, bare)
    }

    func test_storyRampsOverAuthor_risesToTheAuthorLevelAndFallsFromIt() {
        let ramps = StoryExportJingleMix.storyRamps(over: [.init(from: 0.5, to: 0.5, start: 1, end: 1)],
                                                    storyStart: 1, storyEnd: 9, introJingleEnd: 2,
                                                    outroJingleStart: 9, outroFade: 1.5)
        XCTAssertEqual(ramps, [.init(from: 0, to: 0.5, start: 1, end: 2),
                               .init(from: 0.5, to: 0, start: 7.5, end: 9)],
                       "la story monte jusqu'au volume de l'auteur et s'éteint depuis lui, jamais depuis 1")
    }

    func test_storyRampsOverAuthor_keepsTheAuthorRampsOnlyBetweenTheJingles() {
        let author: [StoryExportJingleMix.Ramp] = [.init(from: 0, to: 1, start: 1, end: 3),
                                                   .init(from: 1, to: 0, start: 6, end: 9)]
        let ramps = StoryExportJingleMix.storyRamps(over: author, storyStart: 1, storyEnd: 9,
                                                    introJingleEnd: 2, outroJingleStart: 9, outroFade: 1.5)
        XCTAssertEqual(ramps, [.init(from: 0, to: 0.5, start: 1, end: 2),
                               .init(from: 0.5, to: 1, start: 2, end: 3),
                               .init(from: 1, to: 0.5, start: 6, end: 7.5),
                               .init(from: 0.5, to: 0, start: 7.5, end: 9)])
    }

    func test_storyRampsOverAuthor_neverOverlap_whenTheAuthorRampsDo() {
        let author: [StoryExportJingleMix.Ramp] = [.init(from: 0.8, to: 0.8, start: 0, end: 0),
                                                   .init(from: 0.2, to: 1, start: 1.5, end: 6),
                                                   .init(from: 1, to: 0, start: 4, end: 8.5)]
        let ramps = StoryExportJingleMix.storyRamps(over: author, storyStart: 1, storyEnd: 9,
                                                    introJingleEnd: 2, outroJingleStart: 7.5, outroFade: 0.5)
        XCTAssertEqual(ramps.first?.start, 1)
        XCTAssertEqual(ramps.last?.end, 7.5, "le son de la story est éteint quand le jingle de fermeture entre")
        XCTAssertEqual(ramps.last?.to, 0)
        for (earlier, later) in zip(ramps, ramps.dropFirst()) {
            XCTAssertLessThanOrEqual(earlier.end, later.start, "\(earlier) chevauche \(later)")
        }
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

    func test_everyExportPath_letsTheLawShapeTheStory_neverAForcedFullVolumeFade() throws {
        let canvas = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas")
        for file in ["StoryExportBranding.swift", "StoryExporter.swift",
                     "StoryExportIntro.swift", "StoryExportOutro.swift"] {
            let source = try String(contentsOf: canvas.appendingPathComponent(file), encoding: .utf8)
            XCTAssertFalse(source.contains("setVolumeRamp(fromStartVolume: 1, toEndVolume: 0"),
                           "\(file) éteint un son depuis 1 au lieu de suivre StoryExportJingleMix")
        }
    }
}
