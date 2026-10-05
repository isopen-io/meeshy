import XCTest
import CoreMedia
import ImageIO
import Metal
import UniformTypeIdentifiers
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un sticker GIF s'exporte ANIMÉ** (#8610).
///
/// Sur la scène, un GIF anime par une `CAKeyframeAnimation` posée sur
/// `contents` (#4925). L'export rasterise chaque image par `layer.render(in:)`,
/// qui ne fait tourner AUCUNE animation : il peint la couche MODÈLE, donc la
/// première image du GIF — pour toute la durée de la vidéo. Et le composer ne
/// remettait pas même les octets animés au moteur : `StoryExportInputs` ne
/// portait que des bitmaps.
///
/// L'image du GIF se choisit donc au temps de COMPOSITION, par une fonction
/// pure du temps écoulé depuis l'apparition du sticker.
@MainActor
final class StoryExportAnimatedStickerTests: XCTestCase {

    private static let canvas = CGSize(width: 180, height: 320)

    // MARK: - L'horloge des images

    func test_frameIndex_walksTheCycleAndLoops() {
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0, frameCount: 4, duration: 0.4, loopCount: 0), 0)
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0.15, frameCount: 4, duration: 0.4, loopCount: 0), 1)
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0.39, frameCount: 4, duration: 0.4, loopCount: 0), 3)
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0.41, frameCount: 4, duration: 0.4, loopCount: 0), 0,
                       "loopCount 0 = boucle infinie : le cycle recommence")
    }

    func test_frameIndex_finiteLoopCount_holdsTheLastFrame() {
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0.5, frameCount: 4, duration: 0.4, loopCount: 1), 3,
                       "une boucle finie épuisée tient sa DERNIÈRE image, comme `fillMode = .forwards`")
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 0.5, frameCount: 4, duration: 0.4, loopCount: 2), 1)
    }

    func test_frameIndex_beforeAppearanceOrDegenerate_isFirstFrame() {
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: -1, frameCount: 4, duration: 0.4, loopCount: 0), 0)
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: 3, frameCount: 4, duration: 0, loopCount: 0), 0)
        XCTAssertEqual(AnimatedImageTiming.frameIndex(elapsed: .nan, frameCount: 4, duration: 0.4, loopCount: 0), 0)
    }

    // MARK: - Le fichier exporté

    func test_renderFrame_composerGIF_changesImageWithCompositionTime() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        let gif = try Self.gif(colors: [.red, .green], delays: [0.1, 0.3])
        let slide = Self.slide(sticker: Self.pastedSticker(id: "gif-\(UUID().uuidString)"))

        let debut = try render(slide, at: 0.05, animations: [slide.effects.stickerObjects![0].id: gif])
        let milieu = try render(slide, at: 0.2, animations: [slide.effects.stickerObjects![0].id: gif])
        let fin = try render(slide, at: 0.35, animations: [slide.effects.stickerObjects![0].id: gif])
        let reprise = try render(slide, at: 0.45, animations: [slide.effects.stickerObjects![0].id: gif])

        XCTAssertTrue(debut.isRed, "0,05 s : première image, trouvé \(debut)")
        XCTAssertTrue(milieu.isGreen, "0,2 s : seconde image, trouvé \(milieu)")
        XCTAssertTrue(fin.isGreen, "0,35 s : la seconde image DURE 0,3 s, trouvé \(fin)")
        XCTAssertTrue(reprise.isRed, "0,45 s : le cycle de 0,4 s boucle, trouvé \(reprise)")
    }

    func test_renderFrame_gifAppearingLater_startsItsCycleAtItsAppearance() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        let gif = try Self.gif(colors: [.red, .green], delays: [0.1, 0.1])
        var sticker = Self.pastedSticker(id: "late-\(UUID().uuidString)")
        sticker.startTime = 1.05
        let slide = Self.slide(sticker: sticker)

        let apparition = try render(slide, at: 1.1, animations: [sticker.id: gif])

        XCTAssertTrue(apparition.isRed,
                      "0,05 s après l'apparition : première image (l'horloge absolue dirait la seconde), trouvé \(apparition)")
    }

    func test_renderFrame_publishedGIFFile_animatesToo() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        let gif = try Self.gif(colors: [.red, .green], delays: [0.1, 0.1])
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("export-gif-\(UUID().uuidString).gif")
        try gif.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let postMediaId = "pm-\(UUID().uuidString)"
        let sticker = StorySticker(id: "pub", emoji: StorySticker.imageFallbackEmoji,
                                   postMediaId: postMediaId, scale: StorySticker.posedScale)
        let slide = Self.slide(sticker: sticker)

        let premiere = try render(slide, at: 0.05, stickerImageURLs: [postMediaId: url])
        let seconde = try render(slide, at: 0.15, stickerImageURLs: [postMediaId: url])

        XCTAssertTrue(premiere.isRed, "trouvé \(premiere)")
        XCTAssertTrue(seconde.isGreen, "le fichier d'un sticker publié est un GIF : il anime, trouvé \(seconde)")
    }

    func test_exportInputs_carriesTheAnimatedBytesOfTheSlideStickersOnly() {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.stickerObjects = [StorySticker(id: "stk-gif", emoji: "🖼️")]
        vm.currentEffects = effects
        let octets = Data([0x47, 0x49, 0x46])
        vm.registerLoadedStickerAnimation(octets, for: "stk-gif")
        vm.registerLoadedStickerAnimation(Data([1]), for: "autre-slide")

        let inputs = vm.exportInputs(for: vm.exportableCurrentSlide())

        XCTAssertEqual(inputs.animations["stk-gif"], octets, "les octets du GIF collé doivent partir au moteur")
        XCTAssertNil(inputs.animations["autre-slide"])
    }

    // MARK: - Fabriques

    private struct Sample: CustomStringConvertible {
        let r: Int, g: Int, b: Int
        var isRed: Bool { r > g + 80 && r > b + 80 }
        var isGreen: Bool { g > r + 80 && g > b + 80 }
        var description: String { "rgb(\(r), \(g), \(b))" }
    }

    private func render(_ slide: StorySlide,
                        at seconds: Double,
                        animations: [String: Data] = [:],
                        stickerImageURLs: [String: URL] = [:]) throws -> Sample {
        let output = try StoryAVCompositorOrientationTests.makeBuffer(size: Self.canvas)
        try StoryAVCompositor.renderFrame(slide: slide,
                                          at: CMTime(seconds: seconds, preferredTimescale: 600),
                                          renderSize: Self.canvas,
                                          into: output,
                                          cache: StoryRendererCache(),
                                          backdropCapture: InertBackdropCapture(),
                                          stickerImageURLs: stickerImageURLs,
                                          animations: animations)
        let c = RenderedPixels(buffer: output).rgb(x: Int(Self.canvas.width / 2),
                                                   y: Int(Self.canvas.height / 2))
        return Sample(r: c.r, g: c.g, b: c.b)
    }

    private static func pastedSticker(id: String) -> StorySticker {
        StorySticker(id: id, emoji: StorySticker.imageFallbackEmoji, scale: StorySticker.posedScale)
    }

    private static func slide(sticker: StorySticker) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.background = "#000000"
        effects.stickerObjects = [sticker]
        return StorySlide(id: "gif-\(UUID().uuidString)", effects: effects, duration: 6, order: 0)
    }

    static func gif(colors: [UIColor], delays: [Double]) throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, colors.count, nil))
        // Boucle infinie DÉCLARÉE : sans extension NETSCAPE, un GIF joue une fois.
        CGImageDestinationSetProperties(destination, [
            kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]
        ] as CFDictionary)
        for (color, delay) in zip(colors, delays) {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
                color.setFill()
                context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
            }
            CGImageDestinationAddImage(destination, try XCTUnwrap(image.cgImage), [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: delay]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }
}
