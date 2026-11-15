import CoreGraphics
import CoreImage
import Foundation
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #11298 — **un seul peintre de lens** : l'aperçu caméra, la photo, la vidéo,
/// la retouche et l'appel peignent une lens par la MÊME fonction, dans le MÊME
/// ordre (segmentation → LUT → couches visage → cadre → stickers/texte →
/// particules), sur le contexte Metal partagé.
final class LensPainterTests: XCTestCase {

    // MARK: - L'ordre des étages

    func test_paint_runsTheStagesInLensOrder_whateverOrderTheHostGivesThem() {
        let journal = Journal()
        let couches = [LensStage.particles, .overlays, .face, .lut, .frame, .segmentation]
            .map { stage in LensPass(stage) { image, _ in journal.note(stage); return image } }

        _ = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0), passes: couches, input: LensFrameInput())

        XCTAssertEqual(journal.stages, [.segmentation, .lut, .face, .frame, .overlays, .particles])
    }

    /// Deux stickers se superposent dans l'ordre où l'auteur les a posés.
    func test_paint_keepsTheHostOrderWithinAStage() {
        let journal = Journal()
        let couches = (0..<3).map { rang in
            LensPass(.overlays) { image, _ in journal.noteRank(rang); return image }
        }

        _ = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0), passes: couches, input: LensFrameInput())

        XCTAssertEqual(journal.ranks, [0, 1, 2])
    }

    func test_paint_handsTheFaceToEveryLayer() {
        let visage = LensFaceFrame(boundingBox: CGRect(x: 0.3, y: 0.3, width: 0.4, height: 0.4), points: [],
                                   leftEye: [], rightEye: [], innerLips: [], yaw: 0.1, roll: nil, pitch: nil)
        let journal = Journal()
        let couche = LensPass(.face) { image, input in journal.noteFace(input.face); return image }

        _ = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0), passes: [couche], input: LensFrameInput(face: visage))

        XCTAssertEqual(journal.faces, [visage])
    }

    /// Chaque couche d'un document MeeshyLens v1 a sa place dans l'ordre.
    func test_stage_ofEachDocumentLayer() {
        let ecran = LensAnchor.screen(x: 0.5, y: 0.5)
        let visage = LensAnchor.face(point: .noseTip, dx: nil, dy: nil)
        let sticker = { (anchor: LensAnchor) in
            LensLayer.sticker(LensStickerLayer(id: "s", asset: "a", anchor: anchor, size: 0.2, rotation: nil))
        }
        let texte = { (anchor: LensAnchor) in
            LensLayer.text(LensTextLayer(id: "t", text: ["fr": "Salut"], font: .manrope, color: "#FFFFFF", size: 0.1, anchor: anchor))
        }

        XCTAssertEqual(LensStage(layer: .lut(LensLutLayer(id: "l", asset: "a", intensity: nil))), .lut)
        XCTAssertEqual(LensStage(layer: .frame(LensFrameLayer(id: "f", motif: "m", opacity: nil))), .frame)
        XCTAssertEqual(LensStage(layer: .particles(LensParticlesLayer(id: "p", preset: .sparkles, density: .low, anchor: nil))), .particles)
        XCTAssertEqual(LensStage(layer: sticker(ecran)), .overlays)
        XCTAssertEqual(LensStage(layer: sticker(visage)), .face)
        XCTAssertEqual(LensStage(layer: texte(ecran)), .overlays)
        XCTAssertEqual(LensStage(layer: texte(visage)), .face)
    }

    // MARK: - Les étages fournis

    /// Le fond est remplacé là où le masque ne voit personne ; la personne reste.
    func test_segmentation_replacesTheBackgroundOutsideThePerson() throws {
        let source = Self.solid(red: 1, green: 0, blue: 0)
        let fond = Self.solid(red: 0, green: 0, blue: 1)
        let masque = Self.halfMask(personOnTheLeft: true)

        let peinte = LensPainter.paint(source, passes: [.segmentation(background: fond)],
                                       input: LensFrameInput(personMask: masque))

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 8, y: 32)), [255, 0, 0])
        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 56, y: 32)), [0, 0, 255])
    }

    /// Sans masque, personne n'est effacé : la segmentation s'abstient.
    func test_segmentation_withoutAMask_leavesTheImage() throws {
        let source = Self.solid(red: 1, green: 0, blue: 0)

        let peinte = LensPainter.paint(source, passes: [.segmentation(background: Self.solid(red: 0, green: 0, blue: 1))],
                                       input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 56, y: 32)), [255, 0, 0])
    }

    /// Le fond remplacé est étalonné AVEC la personne : la LUT vient après.
    func test_lut_gradesTheReplacedBackgroundToo() throws {
        let source = Self.solid(red: 1, green: 0, blue: 0)
        let peinte = LensPainter.paint(
            source,
            passes: [.lut(cube: Self.allGreenCube(), dimension: 2, colorSpace: Self.sRGB),
                     .segmentation(background: Self.solid(red: 0, green: 0, blue: 1))],
            input: LensFrameInput(personMask: Self.halfMask(personOnTheLeft: true)))

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 8, y: 32)), [0, 255, 0])
        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 56, y: 32)), [0, 255, 0])
    }

    func test_lut_identityCube_keepsTheColor() throws {
        let peinte = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0),
                                       passes: [.lut(cube: Self.identityCube(), dimension: 2, colorSpace: Self.sRGB)],
                                       input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 32, y: 32)), [255, 0, 0])
    }

    /// Un cube aux octets incohérents n'efface pas l'image : l'étage s'abstient.
    func test_lut_malformedCube_leavesTheImage() throws {
        let peinte = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0),
                                       passes: [.lut(cube: Data([1, 2, 3]), dimension: 2, colorSpace: Self.sRGB)],
                                       input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 32, y: 32)), [255, 0, 0])
    }

    /// Les particules passent au-dessus des stickers, qui passent au-dessus du cadre.
    func test_overlays_stackFrameThenStickersThenParticles() throws {
        let cadre = Self.solid(red: 0, green: 0, blue: 1)
        let sticker = Self.solid(red: 0, green: 1, blue: 0).cropped(to: CGRect(x: 0, y: 0, width: 48, height: 64))
        let particule = Self.solid(red: 1, green: 1, blue: 1).cropped(to: CGRect(x: 0, y: 0, width: 16, height: 64))

        let peinte = LensPainter.paint(
            Self.solid(red: 1, green: 0, blue: 0),
            passes: [.overlay(particule, stage: .particles), .overlay(sticker, stage: .overlays), .overlay(cadre, stage: .frame)],
            input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 8, y: 32)), [255, 255, 255])
        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 32, y: 32)), [0, 255, 0])
        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 56, y: 32)), [0, 0, 255])
    }

    // MARK: - Le verre (#12602)

    /// Rouge à gauche, bleu à droite : la frontière passe en x = 32.
    private static func split() -> CIImage {
        solid(red: 0, green: 0, blue: 1)
            .cropped(to: CGRect(x: 32, y: 0, width: 32, height: side))
            .composited(over: solid(red: 1, green: 0, blue: 0))
    }

    /// Une vitre verticale de x = 24 à x = 40, recadrée sur elle-même.
    private static let vitre = CIImage(color: .white).cropped(to: CGRect(x: 24, y: 0, width: 16, height: side))

    func test_frosted_blursWhatIsUnderTheMask() throws {
        let peinte = LensPainter.paint(Self.split(), passes: [.frosted(under: Self.vitre, sigma: 6, stage: .overlays)],
                                       input: LensFrameInput())

        let frontiere = try Self.pixel(of: peinte, at: CGPoint(x: 31, y: 32))
        XCTAssertGreaterThan(Int(frontiere[2]), 40, "sous la vitre, le bleu voisin se mêle au rouge")
        XCTAssertGreaterThan(Int(frontiere[0]), 40)
    }

    func test_frosted_leavesWhatIsOutsideTheMask() throws {
        let peinte = LensPainter.paint(Self.split(), passes: [.frosted(under: Self.vitre, sigma: 6, stage: .overlays)],
                                       input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 21, y: 32)), [255, 0, 0], "hors de la vitre, l'image reste nette")
        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 43, y: 32)), [0, 0, 255])
    }

    func test_frosted_keepsTheImageExtent() {
        let peinte = LensPainter.paint(Self.split(), passes: [.frosted(under: Self.vitre, sigma: 6, stage: .overlays)],
                                       input: LensFrameInput())

        XCTAssertEqual(peinte.extent, CGRect(x: 0, y: 0, width: Self.side, height: Self.side), "le flou ne déborde jamais de l'image")
    }

    func test_frosted_withoutBlur_leavesTheImage() throws {
        let peinte = LensPainter.paint(Self.split(), passes: [.frosted(under: Self.vitre, sigma: 0, stage: .overlays)],
                                       input: LensFrameInput())

        XCTAssertEqual(try Self.pixel(of: peinte, at: CGPoint(x: 31, y: 32)), [255, 0, 0])
    }

    // MARK: - Un seul contexte, un seul rendu

    func test_painter_rendersOnTheSharedMetalContext() {
        XCTAssertTrue(LensPainter.context === StoryRenderingContext.shared.ciContext)
    }

    /// Le témoin « golden » : deux hôtes qui remettent la même recette et la même
    /// image obtiennent les mêmes pixels, octet pour octet.
    func test_paint_sameRecipeOnTwoHosts_givesTheSamePixels() throws {
        let recette: () -> [LensPass] = {
            [.segmentation(background: Self.solid(red: 0, green: 0, blue: 1)),
             .lut(cube: Self.identityCube(), dimension: 2, colorSpace: Self.sRGB),
             .overlay(Self.solid(red: 0, green: 1, blue: 0).cropped(to: CGRect(x: 0, y: 0, width: 20, height: 20)), stage: .overlays)]
        }
        let entree = LensFrameInput(personMask: Self.halfMask(personOnTheLeft: true))
        let apercu = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0), passes: recette(), input: entree)
        let appel = LensPainter.paint(Self.solid(red: 1, green: 0, blue: 0), passes: recette(), input: entree)

        XCTAssertEqual(try Self.bitmap(of: apercu), try Self.bitmap(of: appel))
    }

    // MARK: - Fabriques

    private final class Journal {
        private(set) var stages: [LensStage] = []
        private(set) var ranks: [Int] = []
        private(set) var faces: [LensFaceFrame?] = []
        func note(_ stage: LensStage) { stages.append(stage) }
        func noteRank(_ rank: Int) { ranks.append(rank) }
        func noteFace(_ face: LensFaceFrame?) { faces.append(face) }
    }

    private static let side = 64
    private static let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

    private static func solid(red: CGFloat, green: CGFloat, blue: CGFloat) -> CIImage {
        CIImage(color: CIColor(red: red, green: green, blue: blue, colorSpace: sRGB) ?? CIColor(red: red, green: green, blue: blue))
            .cropped(to: CGRect(x: 0, y: 0, width: side, height: side))
    }

    /// Un masque de personne en basse définition (comme celui de Vision) : blanc
    /// sur une moitié, noir sur l'autre.
    private static func halfMask(personOnTheLeft: Bool) -> CIImage {
        let personne = CIImage(color: .white).cropped(to: CGRect(x: personOnTheLeft ? 0 : 8, y: 0, width: 8, height: 16))
        let vide = CIImage(color: .black).cropped(to: CGRect(x: 0, y: 0, width: 16, height: 16))
        return personne.composited(over: vide)
    }

    private static func cube(_ color: (Float, Float, Float, Float) -> [Float]) -> Data {
        let d = 2
        let valeurs = (0..<d).flatMap { b in
            (0..<d).flatMap { g in
                (0..<d).flatMap { r in color(Float(r), Float(g), Float(b), 1) }
            }
        }
        return valeurs.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    private static func identityCube() -> Data { cube { r, g, b, a in [r, g, b, a] } }
    private static func allGreenCube() -> Data { cube { _, _, _, a in [0, 1, 0, a] } }

    private static func pixel(of image: CIImage, at point: CGPoint) throws -> [UInt8] {
        var octets = [UInt8](repeating: 0, count: 4)
        LensPainter.context.render(image, toBitmap: &octets, rowBytes: 4,
                                   bounds: CGRect(x: point.x, y: point.y, width: 1, height: 1),
                                   format: .RGBA8, colorSpace: sRGB)
        return Array(octets.prefix(3))
    }

    private static func bitmap(of image: CIImage) throws -> [UInt8] {
        var octets = [UInt8](repeating: 0, count: side * side * 4)
        LensPainter.context.render(image, toBitmap: &octets, rowBytes: side * 4,
                                   bounds: CGRect(x: 0, y: 0, width: side, height: side),
                                   format: .RGBA8, colorSpace: sRGB)
        return octets
    }
}
