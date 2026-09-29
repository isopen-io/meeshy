import XCTest
import CoreMedia
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une pastille audio posée sur la scène est un objet de la scène** (#8599),
/// **et elle sort du fichier telle que le lecteur la montre** (#8609).
///
/// `StoryRenderer.collectItems` énumère textes, médias de premier plan,
/// stickers et lieux ; le son de premier plan n'y figure pas : à l'écran, sa
/// puce est une vue SwiftUI (`AudioForegroundChip`) posée par-dessus le canvas.
/// L'export la peint donc lui-même — et la première version peignait une
/// capsule OPAQUE, une onde FIGÉE et un crédit TRONQUÉ : trois écarts avec le
/// lecteur, qui montre du verre, une onde qui ondule et un crédit qui défile.
@MainActor
final class StoryAudioChipExportTests: XCTestCase {

    private static let canvas = CGSize(width: 180, height: 320)
    private static let wide = CGSize(width: 390, height: 240)

    // MARK: - Placement (#8599)

    func test_placements_foregroundSoundInItsWindow_yieldsOneChipAtItsPosition() throws {
        let slide = makeSlide(audios: [StoryAudioPlayerObject(id: "fg", x: 0.25, y: 0.75)])

        let chips = StoryAudioChipPainter.placements(for: slide,
                                                     into: CanvasGeometry(renderSize: Self.canvas),
                                                     at: .zero)

        let chip = try XCTUnwrap(chips.first)
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chip.center.x, 45, accuracy: 0.5)
        XCTAssertEqual(chip.center.y, 240, accuracy: 0.5)
        XCTAssertGreaterThan(chip.size.width, chip.size.height, "une puce est une capsule horizontale")
    }

    func test_placements_backgroundSound_hasNoChip() {
        var fond = StoryAudioPlayerObject(id: "bg")
        fond.isBackground = true

        let chips = StoryAudioChipPainter.placements(for: makeSlide(audios: [fond]),
                                                     into: CanvasGeometry(renderSize: Self.canvas),
                                                     at: .zero)

        XCTAssertTrue(chips.isEmpty, "le son de fond n'a pas de puce — même règle que le lecteur")
    }

    func test_placements_soundOutsideItsWindow_hasNoChip() {
        var tardif = StoryAudioPlayerObject(id: "late")
        tardif.startTime = 3
        tardif.duration = 1

        let chips = StoryAudioChipPainter.placements(for: makeSlide(audios: [tardif]),
                                                     into: CanvasGeometry(renderSize: Self.canvas),
                                                     at: CMTime(seconds: 1, preferredTimescale: 600))

        XCTAssertTrue(chips.isEmpty, "hors de sa fenêtre la puce se cache, comme au lecteur")
    }

    func test_placements_elapsedCountsFromTheSoundAppearance() throws {
        var tardif = StoryAudioPlayerObject(id: "late")
        tardif.startTime = 2

        let chip = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: makeSlide(audios: [tardif]),
            into: CanvasGeometry(renderSize: Self.canvas),
            at: CMTime(seconds: 2.5, preferredTimescale: 600)).first)

        XCTAssertEqual(chip.elapsed, 0.5, accuracy: 0.001, "le crédit défile depuis l'apparition de la puce")
    }

    func test_placements_largerScale_yieldsLargerChip() throws {
        var grande = StoryAudioPlayerObject(id: "big")
        grande.scale = 2
        let geometry = CanvasGeometry(renderSize: Self.canvas)

        let normale = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: makeSlide(audios: [StoryAudioPlayerObject(id: "n")]), into: geometry, at: .zero).first)
        let agrandie = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: makeSlide(audios: [grande]), into: geometry, at: .zero).first)

        XCTAssertGreaterThan(agrandie.size.width, normale.size.width * 1.5)
    }

    // MARK: - Ressemblance au lecteur (#8609)

    func test_chip_isGlass_theBackdropColourShowsThrough() {
        let audio = StoryAudioPlayerObject(id: "glass", x: 0.5, y: 0.5)

        let surRouge = ChipCanvas(size: Self.wide, fill: .red).painting(audio, at: 0)
        let surBleu = ChipCanvas(size: Self.wide, fill: .blue).painting(audio, at: 0)

        let probe = surRouge.padding
        let rouge = surRouge.rgb(probe)
        let bleu = surBleu.rgb(probe)
        XCTAssertGreaterThan(rouge.r, rouge.b + 40, "sur fond rouge, la capsule doit rester rougeâtre — trouvé \(rouge)")
        XCTAssertGreaterThan(bleu.b, bleu.r + 40, "sur fond bleu, la capsule doit rester bleutée — trouvé \(bleu)")
        XCTAssertLessThan(rouge.r, 235, "le verre TEINTE ce qu'il laisse passer — trouvé \(rouge)")
    }

    func test_chip_glassSamplesWhatIsDirectlyBehindIt() {
        let audio = StoryAudioPlayerObject(id: "row", x: 0.5, y: 0.2)

        let rendu = ChipCanvas(size: Self.wide, top: .red, bottom: .blue).painting(audio, at: 0)

        let c = rendu.rgb(rendu.padding)
        XCTAssertGreaterThan(c.r, c.b + 40,
                             "la puce est dans la moitié ROUGE : son verre doit lire les pixels sous elle, trouvé \(c)")
    }

    func test_chip_glassBlursWhatIsBehind() {
        let audio = StoryAudioPlayerObject(id: "blur", x: 0.5, y: 0.5)

        let rendu = ChipCanvas(size: Self.wide, stripes: 2).painting(audio, at: 0)

        let spread = rendu.lumaSpread(along: rendu.padding, width: 8)
        XCTAssertLessThan(spread, 60, "des rayures de 2 px doivent sortir floutées sous la capsule, écart \(spread)")
        XCTAssertGreaterThan(rendu.lumaSpread(along: CGPoint(x: 4, y: 4), width: 8), 200,
                             "hors de la capsule les rayures restent nettes")
    }

    func test_chip_waveformMovesWithExportTime() {
        let audio = StoryAudioPlayerObject(id: "wave", x: 0.5, y: 0.5)

        let avant = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0)
        let apres = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0.25)

        XCTAssertGreaterThan(avant.difference(from: apres, in: avant.content), 500,
                             "l'onde doit onduler entre deux instants de l'export")
    }

    func test_chip_mutedWaveform_isFrozen() {
        var audio = StoryAudioPlayerObject(id: "mute", x: 0.5, y: 0.5)
        audio.volume = 0

        let avant = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0)
        let apres = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0.25)

        XCTAssertEqual(avant.difference(from: apres, in: avant.content), 0,
                       "une piste coupée fige son onde, comme au lecteur")
    }

    func test_chip_overflowingCredit_scrolls() {
        let audio = Self.borrowed(title: "Une chanson dont le titre est bien trop long pour la puce")

        let avant = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0)
        let apres = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 1)

        XCTAssertGreaterThan(avant.difference(from: apres, in: avant.content), 500,
                             "un crédit qui déborde défile")
    }

    func test_chip_fittingCredit_standsStill() {
        let audio = Self.borrowed(title: "Ok")

        let avant = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 0)
        let apres = ChipCanvas(size: Self.wide, fill: .darkGray).painting(audio, at: 1)

        XCTAssertEqual(avant.difference(from: apres, in: avant.content), 0,
                       "un crédit qui tient dans la puce reste immobile, comme au lecteur")
    }

    // MARK: - Coût par image (#8611)

    func test_painter_buildsTheStaticPartsOncePerExport() {
        let painter = StoryAudioChipPainter()
        let slide = makeSlide(audios: [Self.borrowed(title: "Un crédit assez long pour défiler dans la puce")])
        let geometry = CanvasGeometry(renderSize: Self.wide)
        let canvas = ChipCanvas(size: Self.wide, fill: .darkGray)

        for frame in 0..<30 {
            painter.paint(slide: slide, into: geometry,
                          at: CMTime(value: CMTimeValue(frame), timescale: 30), in: canvas.context)
        }

        XCTAssertEqual(painter.templateBuildCount, 1,
                       "fond, liseré, icône et crédit se rasterisent UNE fois, pas à chaque image")
    }

    // MARK: - Bout en bout

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

    func test_staticSnapshot_drawsTheForegroundSoundChip() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        var slide = makeSlide(audios: [StoryAudioPlayerObject(id: "fg", x: 0.5, y: 0.5)])
        slide.effects.background = "#0000FF"

        let image = try XCTUnwrap(StoryStaticSnapshot.render(slide: slide, loadedImages: [:], size: Self.canvas))

        let cg = try XCTUnwrap(image.cgImage)
        let scale = CGFloat(cg.width) / Self.canvas.width
        let far = try XCTUnwrap(Self.pixel(of: cg, at: CGPoint(x: 10 * scale, y: 10 * scale)))
        let chip = try XCTUnwrap(Self.pixel(of: cg, at: CGPoint(x: 70 * scale, y: 160 * scale)))
        XCTAssertGreaterThan(far.b, 200, "loin de la puce, la couverture reste bleue")
        XCTAssertLessThan(chip.b, 200, "la couverture dessine la puce du son posé sur la scène, trouvé \(chip)")
    }

    // MARK: - Fabriques

    private func makeSlide(audios: [StoryAudioPlayerObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.audioPlayerObjects = audios
        return StorySlide(id: "chip-\(UUID().uuidString)", effects: effects, duration: 6, order: 0)
    }

    private static func borrowed(title: String) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(id: "lib-\(title.count)", x: 0.5, y: 0.5)
        audio.soundId = "sound-1"
        audio.name = title
        audio.soundAuthorUsername = "auteur"
        return audio
    }

    private static func pixel(of image: CGImage, at point: CGPoint) -> (r: Int, g: Int, b: Int)? {
        var rgba = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &rgba, width: 1, height: 1, bitsPerComponent: 8,
                                      bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(image, in: CGRect(x: -point.x, y: point.y - CGFloat(image.height) + 1,
                                       width: CGFloat(image.width), height: CGFloat(image.height)))
        return (Int(rgba[0]), Int(rgba[1]), Int(rgba[2]))
    }
}

/// Un contexte bitmap en repère UIKit (rangée 0 = haut), le même que celui du
/// compositor, où l'on peint UNE puce centrée pour en lire les pixels.
@MainActor
final class ChipCanvas {
    let size: CGSize
    let context: CGContext
    private(set) var placement: StoryAudioChipPlacement?

    convenience init(size: CGSize, top: UIColor, bottom: UIColor) {
        self.init(size: size, fill: bottom)
        context.setFillColor(top.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: size.width, height: size.height / 2))
    }

    init(size: CGSize, fill: UIColor = .black, stripes: Int? = nil) {
        self.size = size
        context = CGContext(data: nil, width: Int(size.width), height: Int(size.height),
                            bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageByteOrderInfo.order32Little.rawValue
                                | CGImageAlphaInfo.premultipliedFirst.rawValue)!
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)
        if let stripes {
            for column in stride(from: 0, to: Int(size.width), by: stripes) {
                context.setFillColor((column / stripes).isMultiple(of: 2) ? UIColor.white.cgColor : UIColor.black.cgColor)
                context.fill(CGRect(x: CGFloat(column), y: 0, width: CGFloat(stripes), height: size.height))
            }
        } else {
            context.setFillColor(fill.cgColor)
            context.fill(CGRect(origin: .zero, size: size))
        }
    }

    func painting(_ audio: StoryAudioPlayerObject, at seconds: Double,
                  painter: StoryAudioChipPainter = StoryAudioChipPainter()) -> ChipCanvas {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [audio]
        let slide = StorySlide(id: "c", effects: effects, duration: 6, order: 0)
        let geometry = CanvasGeometry(renderSize: size)
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        placement = StoryAudioChipPainter.placements(for: slide, into: geometry, at: time).first
        painter.paint(slide: slide, into: geometry, at: time, in: context)
        return self
    }

    /// Un point du verre nu : dans la marge droite de la capsule, loin de
    /// l'icône et du contenu.
    var padding: CGPoint {
        guard let placement else { return .zero }
        return CGPoint(x: placement.center.x + placement.size.width / 2 - placement.size.height * 0.45,
                       y: placement.center.y - placement.size.height * 0.25)
    }

    var content: CGRect { placement?.contentFrame ?? .zero }

    func rgb(_ point: CGPoint) -> (r: Int, g: Int, b: Int) {
        let base = context.data!.assumingMemoryBound(to: UInt8.self)
        let offset = Int(point.y) * context.bytesPerRow + Int(point.x) * 4
        return (Int(base[offset + 2]), Int(base[offset + 1]), Int(base[offset]))
    }

    func lumaSpread(along point: CGPoint, width: Int) -> Int {
        let lumas = (0..<width).map { dx -> Int in
            let c = rgb(CGPoint(x: point.x + CGFloat(dx), y: point.y))
            return (c.r + c.g + c.b) / 3
        }
        return (lumas.max() ?? 0) - (lumas.min() ?? 0)
    }

    func difference(from other: ChipCanvas, in rect: CGRect) -> Int {
        let area = rect.integral
        var total = 0
        for y in Int(area.minY)..<Int(area.maxY) {
            for x in Int(area.minX)..<Int(area.maxX) {
                let a = rgb(CGPoint(x: x, y: y))
                let b = other.rgb(CGPoint(x: x, y: y))
                total += abs(a.r - b.r) + abs(a.g - b.g) + abs(a.b - b.b)
            }
        }
        return total
    }
}
