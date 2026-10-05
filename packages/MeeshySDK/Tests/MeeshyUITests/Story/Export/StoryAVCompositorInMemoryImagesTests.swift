import XCTest
import CoreMedia
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le moteur peint ce que l'auteur voit, pas ce que la slide adresse**
/// (#8599).
///
/// Au composer, une image retouchée, un sticker collé ou un fond importé ne
/// vivent qu'en MÉMOIRE (`loadedImages`) : la slide n'a pour eux qu'un id, ou
/// une adresse vers l'original. Le compositor ne lisait que les adresses.
@MainActor
final class StoryAVCompositorInMemoryImagesTests: XCTestCase {

    private static let canvas = CGSize(width: 90, height: 160)

    func test_renderFrame_foregroundImageWithoutAddress_isPaintedFromMemory() throws {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.background = "#0000FF"
        effects.mediaObjects = [StoryMediaObject(id: "img-1", postMediaId: "",
                                                 mediaType: StoryMediaKind.image.rawValue,
                                                 aspectRatio: 1.0)]
        let slide = StorySlide(id: "mem-fg-\(UUID().uuidString)", effects: effects, duration: 1, order: 0)

        let pixels = try render(slide: slide, images: ["img-1": Self.solid(.red)])

        XCTAssertTrue(pixels.isRed(x: 45, y: 80), "le média en mémoire doit être peint au centre, trouvé \(pixels.describe(x: 45, y: 80))")
    }

    func test_renderFrame_backgroundImageInMemory_winsOverItsAddress() throws {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.mediaObjects = [StoryMediaObject(id: "bg-1", postMediaId: "",
                                                 mediaURL: "file:///tmp/absent-\(UUID().uuidString).jpg",
                                                 mediaType: StoryMediaKind.image.rawValue,
                                                 aspectRatio: 0.5625, volume: 0,
                                                 isBackground: true, startTime: 0, duration: 1)]
        let slide = StorySlide(id: "mem-bg-\(UUID().uuidString)", effects: effects, duration: 1, order: 0)

        let pixels = try render(slide: slide, images: ["bg-1": Self.solid(.red)])

        XCTAssertTrue(pixels.isRed(x: 10, y: 10), "le fond en mémoire doit couvrir la scène, trouvé \(pixels.describe(x: 10, y: 10))")
    }

    private func render(slide: StorySlide, images: [String: UIImage]) throws -> RenderedPixels {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        let output = try StoryAVCompositorOrientationTests.makeBuffer(size: Self.canvas)
        try StoryAVCompositor.renderFrame(slide: slide,
                                          at: .zero,
                                          renderSize: Self.canvas,
                                          into: output,
                                          cache: StoryRendererCache(),
                                          backdropCapture: InertBackdropCapture(),
                                          images: images)
        return RenderedPixels(buffer: output)
    }

    private static func solid(_ color: UIColor) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16), format: format).image { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
        }
    }
}
