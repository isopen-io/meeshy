import CoreGraphics
import CoreImage
import Foundation
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #11300 — **les cinq primitives de MeeshyLens, peintes** : LUT (bande N² × N du
/// pack → `CIColorCubeWithColorSpace`, mêlée à l'intensité), cadre (peintre de
/// motif remis par l'hôte), sticker ancré et tourné, texte aux polices fermées,
/// particules bornées. Une golden par primitive, lue au pixel.
final class LensPrimitivesTests: XCTestCase {

    // MARK: - LUT

    /// La bande du pack se range dans l'ordre du cube de Core Image : rouge le plus rapide, puis vert, puis bleu.
    func test_lutStrip_identityStrip_becomesTheIdentityCube() throws {
        let cube = try XCTUnwrap(LensLutStrip.cube(rgba: Self.identityStrip(16), width: 256, height: 16))

        XCTAssertEqual(cube.dimension, 16)
        let valeurs = cube.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
        let at = ((7 * 16 + 5) * 16 + 3) * 4
        XCTAssertEqual(valeurs[at], 3.0 / 15.0, accuracy: 0.003)
        XCTAssertEqual(valeurs[at + 1], 5.0 / 15.0, accuracy: 0.003)
        XCTAssertEqual(valeurs[at + 2], 7.0 / 15.0, accuracy: 0.003)
        XCTAssertEqual(valeurs[at + 3], 1)
    }

    func test_lutStrip_refusesAnImageThatIsNotAStrip() {
        XCTAssertNil(LensLutStrip.cube(rgba: [UInt8](repeating: 0, count: 20 * 16 * 4), width: 20, height: 16))
        XCTAssertNil(LensLutStrip.cube(rgba: [UInt8](repeating: 0, count: 100 * 10 * 4), width: 100, height: 10))
        XCTAssertNil(LensLutStrip.cube(rgba: [0, 0, 0], width: 256, height: 16))
    }

    func test_lut_invertingStrip_gradesTheImage() throws {
        let peinte = Self.paint(layers: [Self.lut(intensity: nil)], assets: LensAssets(lut: { _ in Self.invertingCube() }))

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [0, 255, 255])
    }

    func test_lut_intensityZero_leavesTheImage() throws {
        let peinte = Self.paint(layers: [Self.lut(intensity: 0)], assets: LensAssets(lut: { _ in Self.invertingCube() }))

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [255, 0, 0])
    }

    func test_lut_withoutItsCube_leavesTheImage() throws {
        let peinte = Self.paint(layers: [Self.lut(intensity: nil)], assets: LensAssets())

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [255, 0, 0])
    }

    // MARK: - Cadre

    func test_frame_isPaintedByTheHostMotifPainter_atTheLayerOpacity() throws {
        let journal = Journal()
        let assets = LensAssets(frame: { motif, size in
            journal.note("\(motif)@\(Int(size.width))x\(Int(size.height))")
            return Self.solid(red: 0, green: 1, blue: 0, size: size)
        })

        let peinte = Self.paint(layers: [.frame(LensFrameLayer(id: "cadre", motif: "elegant.art-deco", opacity: 1))], source: Self.black, assets: assets)

        XCTAssertEqual(journal.entries, ["elegant.art-deco@100x100"])
        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [0, 255, 0])
    }

    func test_frame_opacityZero_leavesTheImage() throws {
        let assets = LensAssets(frame: { _, size in Self.solid(red: 0, green: 1, blue: 0, size: size) })

        let peinte = Self.paint(layers: [.frame(LensFrameLayer(id: "cadre", motif: "elegant.art-deco", opacity: 0))], source: Self.black, assets: assets)

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [0, 0, 0])
    }

    // MARK: - Sticker

    func test_sticker_isPosedAtItsAnchor_atItsSize() throws {
        let peinte = Self.paint(layers: [Self.sticker(rotation: nil)], source: Self.black,
                                assets: LensAssets(sticker: { _ in Self.solid(red: 1, green: 0, blue: 0, size: CGSize(width: 10, height: 10)) }))

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [255, 0, 0])
        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 65), near: [0, 0, 0])
    }

    /// Une rotation POSITIVE tourne dans le sens des aiguilles d'une montre, comme le canevas du web :
    /// la moitié gauche (rouge) d'un sticker tourné de 90° passe en HAUT.
    func test_sticker_rotatesClockwise_likeTheWebCanvas() throws {
        let peinte = Self.paint(layers: [Self.sticker(rotation: 90)], source: Self.black,
                                assets: LensAssets(sticker: { _ in Self.leftRedRightBlue() }))

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 44), near: [255, 0, 0])
        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 56), near: [0, 0, 255])
    }

    func test_faceAnchoredSticker_followsTheVisionFace() throws {
        let visage = LensFaceFrame(boundingBox: CGRect(x: 0.6, y: 0.1, width: 0.3, height: 0.3), points: [],
                                   leftEye: [], rightEye: [], innerLips: [], yaw: nil, roll: nil, pitch: nil)
        let couche = LensLayer.sticker(LensStickerLayer(id: "nez", asset: "a", anchor: .face(point: .noseTip, dx: nil, dy: nil), size: 0.5, rotation: nil))

        let peinte = Self.paint(layers: [couche], source: Self.black, face: visage,
                                assets: LensAssets(sticker: { _ in Self.solid(red: 1, green: 0, blue: 0, size: CGSize(width: 4, height: 4)) }))

        Self.assertPixel(peinte, at: CGPoint(x: 75, y: 78), near: [255, 0, 0])
        Self.assertPixel(peinte, at: CGPoint(x: 25, y: 28), near: [0, 0, 0])
    }

    /// Un fichier absent n'est pas peint, et le reste de la lens l'est.
    func test_missingSticker_isSkipped_andTheRestIsPainted() throws {
        let assets = LensAssets(frame: { _, size in Self.solid(red: 0, green: 1, blue: 0, size: size) })

        let peinte = Self.paint(layers: [Self.sticker(rotation: nil), .frame(LensFrameLayer(id: "cadre", motif: "elegant.art-deco", opacity: nil))],
                                source: Self.black, assets: assets)

        Self.assertPixel(peinte, at: CGPoint(x: 50, y: 50), near: [0, 255, 0])
    }

    // MARK: - Texte

    func test_text_isWrittenAroundItsAnchor_inItsColor() throws {
        let couche = LensLayer.text(LensTextLayer(id: "legende", text: ["fr": "MMMM"], font: .manrope, color: "#FFFFFF", size: 0.3,
                                                  anchor: .screen(x: 0.5, y: 0.5)))

        let peinte = Self.paint(layers: [couche], source: Self.black, assets: LensAssets())

        let octets = Self.bitmap(of: peinte)
        XCTAssertGreaterThan(Self.brightPixels(octets, in: CGRect(x: 10, y: 30, width: 80, height: 40)), 50)
        XCTAssertEqual(Self.brightPixels(octets, in: CGRect(x: 0, y: 0, width: 100, height: 15)), 0)
    }

    func test_closedFonts_neverFailToResolve() {
        LensFont.allCases.forEach { font in
            XCTAssertEqual(LensTextPainter.font(font, pixelSize: 24).pointSize, 24, font.rawValue)
        }
    }

    // MARK: - Particules

    func test_particles_areDrawnWhereThePlanPutsThem() throws {
        let couche = LensLayer.particles(LensParticlesLayer(id: "neige", preset: .snow, density: .low, anchor: nil))
        let plan = LensPlan.plan(LensPlanInput(lens: Self.lens([couche]), frame: CGSize(width: 100, height: 100), face: nil,
                                               languages: ["fr"], level: .full, milliseconds: 0))
        guard case let .particles(particules) = try XCTUnwrap(plan.first) else { return XCTFail("une nuée attendue") }
        let point = try XCTUnwrap(particules.dots.first { $0.alpha > 0.9 && $0.r >= 1.3 })

        let peinte = Self.paint(layers: [couche], source: Self.black, assets: LensAssets())

        let pixel = Self.pixel(of: peinte, atTopLeft: CGPoint(x: point.x.rounded(.down), y: point.y.rounded(.down)))
        XCTAssertGreaterThan(pixel[0], 120)
    }

    func test_particles_minimalLevel_drawNothing() throws {
        let couche = LensLayer.particles(LensParticlesLayer(id: "neige", preset: .snow, density: .high, anchor: nil))

        let peinte = Self.paint(layers: [couche], source: Self.black, level: .minimal, assets: LensAssets())

        XCTAssertEqual(Self.brightPixels(Self.bitmap(of: peinte), in: CGRect(x: 0, y: 0, width: 100, height: 100)), 0)
    }

    // MARK: - Fabriques

    private final class Journal {
        private(set) var entries: [String] = []
        func note(_ entry: String) { entries.append(entry) }
    }

    private static let size = CGSize(width: 100, height: 100)
    private static let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
    private static var black: CIImage { solid(red: 0, green: 0, blue: 0, size: size) }

    private static func solid(red: CGFloat, green: CGFloat, blue: CGFloat, size: CGSize) -> CIImage {
        CIImage(color: CIColor(red: red, green: green, blue: blue, colorSpace: sRGB) ?? CIColor(red: red, green: green, blue: blue))
            .cropped(to: CGRect(origin: .zero, size: size))
    }

    private static func leftRedRightBlue() -> CIImage {
        solid(red: 1, green: 0, blue: 0, size: CGSize(width: 10, height: 20))
            .composited(over: solid(red: 0, green: 0, blue: 1, size: CGSize(width: 20, height: 20)))
    }

    private static func lens(_ layers: [LensLayer]) -> LensDocument {
        LensDocument(id: "essai", name: "Essai", names: [:], credits: LensCredits(author: "Meeshy", createdAt: "2026-10-23", updatedAt: nil),
                     surfaces: [.capture, .live], cost: .light,
                     window: LensWindow(startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z", countries: nil, communities: nil),
                     layers: layers, triggers: [], fallbacks: nil)
    }

    private static func lut(intensity: Double?) -> LensLayer {
        .lut(LensLutLayer(id: "grade", asset: "aaaaaaaaaaaaaaaa.png", intensity: intensity))
    }

    private static func sticker(rotation: Double?) -> LensLayer {
        .sticker(LensStickerLayer(id: "etoile", asset: "bbbbbbbbbbbbbbbb.png", anchor: .screen(x: 0.5, y: 0.5), size: 0.2, rotation: rotation))
    }

    private static func paint(layers: [LensLayer], source: CIImage? = nil, face: LensFaceFrame? = nil,
                              level: LensLevel = .full, assets: LensAssets) -> CIImage {
        LensDocumentPainter.paint(source ?? solid(red: 1, green: 0, blue: 0, size: size), lens: lens(layers),
                                  input: LensFrameInput(face: face), languages: ["fr"], level: level, assets: assets)
    }

    private static func identityStrip(_ n: Int) -> [UInt8] {
        let level = { (index: Int) -> UInt8 in UInt8((Double(index * 255) / Double(n - 1)).rounded()) }
        return (0..<n).flatMap { (g: Int) -> [UInt8] in
            (0..<(n * n)).flatMap { (x: Int) -> [UInt8] in [level(x % n), level(g), level(x / n), 255] }
        }
    }

    private static func invertingCube() -> LensLutCube? {
        let strip = identityStrip(16).enumerated().map { pair -> UInt8 in pair.offset % 4 == 3 ? pair.element : 255 - pair.element }
        return LensLutStrip.cube(rgba: strip, width: 256, height: 16)
    }

    /// Un pixel lu en coordonnées d'IMAGE (origine en haut), comme le plan.
    private static func pixel(of image: CIImage, atTopLeft point: CGPoint) -> [UInt8] {
        var octets = [UInt8](repeating: 0, count: 4)
        LensPainter.context.render(image, toBitmap: &octets, rowBytes: 4,
                                   bounds: CGRect(x: point.x, y: size.height - point.y - 1, width: 1, height: 1),
                                   format: .RGBA8, colorSpace: sRGB)
        return Array(octets.prefix(3))
    }

    private static func assertPixel(_ image: CIImage, at point: CGPoint, near expected: [UInt8],
                                    file: StaticString = #filePath, line: UInt = #line) {
        let lu = pixel(of: image, atTopLeft: point)
        zip(lu, expected).forEach { XCTAssertEqual(Int($0.0), Int($0.1), accuracy: 6, "\(lu) ≠ \(expected)", file: file, line: line) }
    }

    /// Le bitmap, ligne 0 en HAUT.
    private static func bitmap(of image: CIImage) -> [UInt8] {
        let (w, h) = (Int(size.width), Int(size.height))
        var octets = [UInt8](repeating: 0, count: w * h * 4)
        LensPainter.context.render(image, toBitmap: &octets, rowBytes: w * 4,
                                   bounds: CGRect(origin: .zero, size: size), format: .RGBA8, colorSpace: sRGB)
        return octets
    }

    private static func brightPixels(_ octets: [UInt8], in rect: CGRect) -> Int {
        let w = Int(size.width)
        return (Int(rect.minY)..<Int(rect.maxY)).reduce(0) { (total: Int, y: Int) -> Int in
            total + (Int(rect.minX)..<Int(rect.maxX)).filter { (x: Int) -> Bool in octets[(y * w + x) * 4] > 128 }.count
        }
    }
}
