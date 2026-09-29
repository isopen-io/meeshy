import XCTest
import CoreMedia
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une pastille audio posée sur la scène est un objet de la scène** (#8599).
///
/// `StoryRenderer.collectItems` énumère textes, médias de premier plan,
/// stickers et lieux ; le dessin suit en surcouche. Le son de premier plan —
/// la puce que l'auteur déplace et redimensionne — n'y figure pas : le canvas
/// UIKit n'a pas de couche audio, la puce est une vue SwiftUI posée par-dessus
/// (`AudioForegroundChip`). Le composer et le lecteur la montrent donc, et
/// l'export — qui ne rasterise que l'arbre de couches — la perdait.
@MainActor
final class StoryAudioChipExportTests: XCTestCase {

    private static let canvas = CGSize(width: 180, height: 320)

    func test_audioChipLayers_foregroundSoundInItsWindow_yieldsOneChipAtItsPosition() throws {
        let slide = makeSlide(audios: [StoryAudioPlayerObject(id: "fg", x: 0.25, y: 0.75)])
        let geometry = CanvasGeometry(renderSize: Self.canvas)

        let chips = StoryRenderer.audioChipLayers(for: slide, into: geometry, at: .zero)

        let chip = try XCTUnwrap(chips.first)
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chip.position.x, 45, accuracy: 0.5)
        XCTAssertEqual(chip.position.y, 240, accuracy: 0.5)
        XCTAssertNotNil(chip.contents, "la puce doit être rasterisée, pas une boîte vide")
        XCTAssertGreaterThan(chip.bounds.width, chip.bounds.height, "une puce est une capsule horizontale")
    }

    func test_audioChipLayers_backgroundSound_hasNoChip() {
        var fond = StoryAudioPlayerObject(id: "bg")
        fond.isBackground = true
        let slide = makeSlide(audios: [fond])

        let chips = StoryRenderer.audioChipLayers(for: slide,
                                                  into: CanvasGeometry(renderSize: Self.canvas),
                                                  at: .zero)

        XCTAssertTrue(chips.isEmpty, "le son de fond n'a pas de puce — même règle que le lecteur")
    }

    func test_audioChipLayers_soundOutsideItsWindow_hasNoChip() {
        var tardif = StoryAudioPlayerObject(id: "late")
        tardif.startTime = 3
        tardif.duration = 1
        let slide = makeSlide(audios: [tardif])

        let chips = StoryRenderer.audioChipLayers(for: slide,
                                                  into: CanvasGeometry(renderSize: Self.canvas),
                                                  at: CMTime(seconds: 1, preferredTimescale: 600))

        XCTAssertTrue(chips.isEmpty, "hors de sa fenêtre la puce se cache, comme au lecteur")
    }

    func test_audioChipLayers_largerScale_yieldsLargerChip() throws {
        var grande = StoryAudioPlayerObject(id: "big")
        grande.scale = 2
        let geometry = CanvasGeometry(renderSize: Self.canvas)

        let normale = try XCTUnwrap(StoryRenderer.audioChipLayers(
            for: makeSlide(audios: [StoryAudioPlayerObject(id: "n")]), into: geometry, at: .zero).first)
        let agrandie = try XCTUnwrap(StoryRenderer.audioChipLayers(
            for: makeSlide(audios: [grande]), into: geometry, at: .zero).first)

        XCTAssertGreaterThan(agrandie.bounds.width, normale.bounds.width * 1.5)
    }

    func test_renderFrame_bakesTheForegroundSoundChip() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        var slide = makeSlide(audios: [StoryAudioPlayerObject(id: "fg", x: 0.5, y: 0.5)])
        slide.effects.background = "#0000FF"
        let output = try StoryAVCompositorOrientationTests.makeBuffer(size: Self.canvas)

        try StoryAVCompositor.renderFrame(slide: slide, at: .zero, renderSize: Self.canvas,
                                          into: output, cache: StoryRendererCache(),
                                          backdropCapture: InertBackdropCapture())

        let pixels = RenderedPixels(buffer: output)
        XCTAssertTrue(pixels.isBlue(x: 10, y: 10), "loin de la puce, le fond reste bleu")
        let edge = pixels.rgb(x: 70, y: 160)
        XCTAssertLessThan(edge.b, 200, "la capsule de la puce doit recouvrir le fond, trouvé \(pixels.describe(x: 70, y: 160))")
    }

    private func makeSlide(audios: [StoryAudioPlayerObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.audioPlayerObjects = audios
        return StorySlide(id: "chip-\(UUID().uuidString)", effects: effects, duration: 6, order: 0)
    }
}
