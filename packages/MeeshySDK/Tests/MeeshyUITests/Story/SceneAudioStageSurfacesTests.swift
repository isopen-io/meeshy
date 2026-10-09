import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// #9737 — **chaque surface du SDK qui peint une scène lit la MÊME règle**
/// (`SceneAudioStageRule`) : un son de fond n'y produit aucun pixel, un son de
/// premier plan y paraît en pastille — sinusoïde pour un son propre, crédit
/// défilant pour un son emprunté.
@MainActor
final class SceneAudioStageSurfacesTests: XCTestCase {

    private static let canvas = CGSize(width: 180, height: 320)

    private func slide(_ audios: [StoryAudioPlayerObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.audioPlayerObjects = audios
        return StorySlide(id: "stage-\(UUID().uuidString)", effects: effects, duration: 6, order: 0)
    }

    private func background() -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "bg", x: 0.5, y: 0.5,
                               waveformSamples: Array(repeating: 0.6, count: 80),
                               isBackground: true)
    }

    // MARK: - Export et couverture (StoryAVCompositor, StoryStaticSnapshot)

    func test_export_aBackgroundSound_paintsNoChip_inItsWindowOrOutOfIt() {
        let geometry = CanvasGeometry(renderSize: Self.canvas)
        let scene = slide([background()])

        XCTAssertTrue(StoryAudioChipPainter.placements(for: scene, into: geometry, at: .zero).isEmpty)
        XCTAssertTrue(StoryAudioChipPainter.placements(for: scene, into: geometry, at: .zero,
                                                       respectingWindow: false).isEmpty,
                      "la couverture statique ne peint pas le son de fond non plus")
    }

    func test_export_aForegroundSound_isAChipAtItsPlace_besideASilentBackground() throws {
        let posé = StoryAudioPlayerObject(id: "fg", x: 0.25, y: 0.75)

        let chips = StoryAudioChipPainter.placements(for: slide([background(), posé]),
                                                     into: CanvasGeometry(renderSize: Self.canvas),
                                                     at: .zero, respectingWindow: false)

        XCTAssertEqual(chips.map(\.audioId), ["fg"])
        let chip = try XCTUnwrap(chips.first)
        XCTAssertEqual(chip.center.x, 45, accuracy: 0.5)
        XCTAssertEqual(chip.center.y, 240, accuracy: 0.5)
        XCTAssertEqual(chip.display, .waveform, "un son propre garde la sinusoïde")
    }

    func test_export_aBorrowedForegroundSound_isAChipCarryingItsCredit() throws {
        var emprunté = StoryAudioPlayerObject(id: "lib", x: 0.5, y: 0.5)
        emprunté.soundId = "sound-1"
        emprunté.name = "Titre"
        emprunté.soundAuthorUsername = "auteur"

        let chip = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: slide([emprunté]), into: CanvasGeometry(renderSize: Self.canvas), at: .zero).first)

        XCTAssertEqual(chip.display, .marquee(text: "Titre · @auteur"))
    }

    // MARK: - Lecteur (AudioForegroundReaderOverlay)

    func test_reader_aBackgroundSound_hasNoChip_atAnyTimeOfTheSlide() {
        for elapsed in [0.0, 3.0, 6.0] {
            XCTAssertTrue(AudioForegroundReaderOverlay.visibleAudios(in: [background()],
                                                                     elapsed: elapsed,
                                                                     slideDuration: 6).isEmpty)
        }
    }

    // MARK: - Chaque site consulte la règle

    private func source(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/\(relative)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let mark = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<mark.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Les cinq sites du SDK qui posent un son sur une scène : le lecteur,
    /// l'export, la vignette de scène, la vignette de slide, l'atelier.
    func test_everySceneSurface_readsTheStageRule() throws {
        for site in ["Controls/AudioForegroundChip.swift",
                     "Canvas/StoryAudioChipPainter.swift",
                     "SceneThumbnail.swift",
                     "SlideMiniPreview.swift",
                     "StoryComposerView+Canvas.swift"] {
            XCTAssertTrue(try source(site).contains("SceneAudioStageRule."),
                          "\(site) pose un son sur une scène sans lire SceneAudioStageRule : " +
                          "un son de fond pourrait y être peint.")
        }
    }

    /// La vignette de slide peignait une note pour CHAQUE objet audio, fond
    /// compris : le son de fond paraissait sur la scène de la bande.
    func test_theSlideThumbnail_doesNotPaintEveryAudioObject() throws {
        XCTAssertFalse(try source("SlideMiniPreview.swift")
            .contains("let pastilles = effects.audioPlayerObjects ?? []"))
    }
}
