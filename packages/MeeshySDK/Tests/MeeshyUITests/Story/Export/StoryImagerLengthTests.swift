import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **« Imager » seul choisit sa longueur** (#13871, décision du porteur) :
/// « Enregistrer » et « Partager » rendent TOUT ; « Imager »
/// propose, au-delà d'une minute, 1/4 · 2/4 · 3/4 · 4/4 de la composition,
/// toujours depuis son début. Miroir d'`ImagerLength.kt` (#13872) et de
/// `scene-export-length.ts` (#13873).
final class StoryImagerLengthTests: XCTestCase {

    private func slide(_ seconds: TimeInterval) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: UUID().uuidString, text: "Imager", startTime: 0, duration: seconds)]
        effects.timelineDuration = seconds
        return StorySlide(id: UUID().uuidString, effects: effects, duration: seconds, order: 0)
    }

    private func shape(_ slides: [StorySlide]) -> [String] {
        slides.map { "\($0.id)@\($0.computedTotalDuration())" }
    }

    func test_underAMinute_noChoiceIsOffered() {
        XCTAssertEqual(ImagerLength.choices(total: 59), [])
        XCTAssertEqual(ImagerLength.choices(total: 60), [])
        XCTAssertEqual(ImagerLength.choices(total: 0), [])
    }

    func test_beyondAMinute_theFourQuartersFromTheStart_withTheirDuration() {
        XCTAssertEqual(ImagerLength.choices(total: 240), [
            ImagerLengthChoice(quarter: .one, duration: 60),
            ImagerLengthChoice(quarter: .two, duration: 120),
            ImagerLengthChoice(quarter: .three, duration: 180),
            ImagerLengthChoice(quarter: .four, duration: 240)
        ])
    }

    func test_imagingFourMinutesInTwoQuarters_rendersTwoMinutes() {
        XCTAssertEqual(ImagerLength.renderedDuration(total: 240, quarter: .two), 120)
        XCTAssertEqual(ImagerLength.renderedDuration(total: 240, quarter: .four), 240)
        XCTAssertEqual(ImagerLength.renderedDuration(total: 240, quarter: nil), 240)
        XCTAssertEqual(ImagerLength.renderedDuration(total: 45, quarter: .one), 45)
    }

    func test_saveAndShare_neverOfferAChoice_imagerAloneDoes() {
        XCTAssertEqual(StoryExportMode.save.lengthChoices(total: 240), [])
        XCTAssertEqual(StoryExportMode.share.lengthChoices(total: 240), [])
        XCTAssertEqual(StoryExportMode.imager.lengthChoices(total: 240).count, 4)
        XCTAssertEqual(StoryExportMode.imager.lengthChoices(total: 30), [])
    }

    func test_total_isTheSumOfTheSlides() {
        XCTAssertEqual(ImagerLength.total(of: [slide(100), slide(140)]), 240)
    }

    func test_cut_keepsTheSlidesFromTheStart_andPinsTheOneItEndsIn() {
        let slides = [slide(100), slide(80), slide(60)]
        let cut = ImagerLength.cut(slides, quarter: .two)
        XCTAssertEqual(cut.map(\.id), [slides[0].id, slides[1].id])
        XCTAssertEqual(cut.map { $0.computedTotalDuration() }, [100, 20])
        XCTAssertEqual(ImagerLength.total(of: cut), 120)
    }

    func test_cut_withoutAQuarterOrUnderAMinute_rendersEverything() {
        let slides = [slide(100), slide(140)]
        XCTAssertEqual(shape(ImagerLength.cut(slides, quarter: nil)), shape(slides))
        XCTAssertEqual(shape(ImagerLength.cut(slides, quarter: .four)), shape(slides))
        let short = [slide(20), slide(25)]
        XCTAssertEqual(shape(ImagerLength.cut(short, quarter: .one)), shape(short))
    }

    func test_cut_onASlideBoundary_dropsTheNextSlide() {
        let slides = [slide(120), slide(120)]
        XCTAssertEqual(shape(ImagerLength.cut(slides, quarter: .two)), shape([slides[0]]))
    }

    /// La coupe tient jusqu'au FICHIER : un contenu de 4 min imagé en 1/4 sort
    /// du moteur d'export à 1 min, depuis son début.
    @MainActor
    func test_fourMinutesImagedInOneQuarter_exportsOneMinute() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
                      "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var")
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("imager_quarter_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: output) }
        let cut = try XCTUnwrap(ImagerLength.cut([slide(240)], quarter: .one).first)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(cut, to: output)
        }.value

        let seconds = try await AVURLAsset(url: output).load(.duration).seconds
        XCTAssertEqual(seconds, 60, accuracy: 0.2)
    }
}
