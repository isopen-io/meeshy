import XCTest
import CoreImage
@testable import Meeshy

/// **Un seul peintre** (#9347, spec § 4.1) : l'aperçu, la photo et la vidéo
/// passent par le MÊME graphe, sur le même canevas, à la date de la session.
@MainActor
final class ComposerLookPainterTests: XCTestCase {

    private let auteur = CallFramePerson(id: "moi", name: "Ada", handle: "ada", isSelf: true)
    private let date = Date(timeIntervalSince1970: 1_790_000_000)

    func test_designCanvas_isTheNineSixteenReference() {
        XCTAssertEqual(ComposerLookPainter.designCanvas, CGSize(width: 1080, height: 1920))
        XCTAssertEqual(ComposerLookPainter.thumbnailCanvas, CGSize(width: 162, height: 288))
    }

    func test_canvas_isTheLargestNineSixteenCropOfTheSource_neverDownscaled() {
        XCTAssertEqual(ComposerLookPainter.canvas(for: CGSize(width: 3024, height: 4032)), CGSize(width: 2268, height: 4032),
                       "une photo 12 Mpx garde sa définition : 2268×4032, pas 1080×1920")
        XCTAssertEqual(ComposerLookPainter.canvas(for: CGSize(width: 1080, height: 1920)), CGSize(width: 1080, height: 1920))
        XCTAssertEqual(ComposerLookPainter.canvas(for: CGSize(width: 2160, height: 3840)), CGSize(width: 2160, height: 3840))
        let paysage = ComposerLookPainter.canvas(for: CGSize(width: 4032, height: 3024))
        XCTAssertEqual(paysage.width / paysage.height, 9.0 / 16.0, accuracy: 0.0001)
        XCTAssertLessThanOrEqual(paysage.height, 3024)
        XCTAssertEqual(Int(paysage.width) % 2, 0, "dimensions paires : l'encodeur vidéo les exige")
    }

    func test_photo_isRenderedAtTheSourceResolution() throws {
        let photo = try XCTUnwrap(ComposerLookPainter.photo(Self.cgSource(), look: ComposerPhotoLook(filter: .warm),
                                                            framing: .identity, scene: nil, canvas: nil))
        let attendu = ComposerLookPainter.canvas(for: CGSize(width: 300, height: 400))
        XCTAssertEqual(CGSize(width: photo.width, height: photo.height), attendu)
        XCTAssertEqual(attendu, CGSize(width: 216, height: 384))
    }

    func test_scene_classic_isPaintedInLayersAtTheSessionDate() throws {
        let look = ComposerPhotoLook(frame: .montage(.classic(.polaroid)))
        let scene = try XCTUnwrap(ComposerLookPainter.scene(for: look, canvas: CGSize(width: 108, height: 192),
                                                            date: date, person: auteur))
        XCTAssertEqual(scene.inputs.texts.date, ComposerPhotoLookSource.caption(at: date).subtitle)
    }

    func test_paint_withoutLook_isTheSourceFilledIntoTheCanvas() throws {
        let image = ComposerLookPainter.paint(Self.source(), look: ComposerPhotoLook(), framing: .identity,
                                              scene: nil, canvas: CGSize(width: 90, height: 160), declared: nil)
        XCTAssertEqual(image.extent, CGRect(x: 0, y: 0, width: 90, height: 160))
        let pixels = try Self.rgba(image, size: CGSize(width: 90, height: 160))
        XCTAssertGreaterThan(Self.pixel(pixels, x: 2, y: 80, width: 90).red, 200, "la moitié gauche de la source reste à gauche")
        XCTAssertGreaterThan(Self.pixel(pixels, x: 87, y: 80, width: 90).blue, 200, "la moitié droite reste à droite")
    }

    func test_photo_andPreview_paintTheSamePixels() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let look = ComposerPhotoLook(filter: .warm, frame: cadre)
        let toile = CGSize(width: 108, height: 192)
        let scene = ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: auteur)
        XCTAssertNotNil(scene)
        let photo = try XCTUnwrap(ComposerLookPainter.photo(Self.cgSource(), look: look, framing: .identity,
                                                            scene: scene, canvas: toile))
        XCTAssertEqual(photo.width, 108)
        XCTAssertEqual(photo.height, 192)
        let espace = ComposerPhotoLookRule.colorSpace(of: Self.cgSource())
        let apercu = ComposerLookPainter.paint(CIImage(cgImage: Self.cgSource()), look: look, framing: .identity,
                                               scene: scene, canvas: toile, declared: espace)
        let apercuRendu = try XCTUnwrap(ComposerLookGPU.context.createCGImage(
            apercu, from: CGRect(origin: .zero, size: toile), format: .RGBA8, colorSpace: espace),
            "le même contexte que la photo : on compare le GRAPHE, pas deux moteurs de rendu")
        let a = try Self.rgba(CIImage(cgImage: photo), size: toile)
        let b = try Self.rgba(CIImage(cgImage: apercuRendu), size: toile)
        for (x, y) in [(10, 10), (54, 96), (100, 180), (54, 20)] {
            let pa = Self.pixel(a, x: x, y: y, width: 108), pb = Self.pixel(b, x: x, y: y, width: 108)
            XCTAssertEqual(Int(pa.red), Int(pb.red), accuracy: 2, "(\(x),\(y))")
            XCTAssertEqual(Int(pa.green), Int(pb.green), accuracy: 2, "(\(x),\(y))")
            XCTAssertEqual(Int(pa.blue), Int(pb.blue), accuracy: 2, "(\(x),\(y))")
        }
    }

    func test_sceneKey_carriesTheSessionDateText_neverToday() {
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.designCanvas,
                                       date: date, person: auteur)
        XCTAssertTrue((cle.cacheKey as String).contains(CallFrameTextsRule.dateText(date)))
        let autre = ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.designCanvas,
                                         date: date.addingTimeInterval(86_400 * 3), person: auteur)
        XCTAssertNotEqual(cle.cacheKey, autre.cacheKey, "une autre date est une autre scène")
    }

    func test_scene_withoutFrame_isNil() {
        XCTAssertNil(ComposerLookPainter.scene(for: ComposerPhotoLook(filter: .vivid), canvas: ComposerLookPainter.designCanvas,
                                               date: date, person: auteur))
    }

    func test_paint_frontCameraMirroredSource_keepsOverlayPixelsIdentical() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let look = ComposerPhotoLook(frame: cadre)
        let toile = CGSize(width: 108, height: 192)
        let scene = try XCTUnwrap(ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: auteur))
        let droite = ComposerLookPainter.paint(Self.source(), look: look, framing: .identity, scene: scene,
                                               canvas: toile, declared: nil)
        let miroir = ComposerLookPainter.paint(Self.source().oriented(.upMirrored), look: look, framing: .identity,
                                               scene: scene, canvas: toile, declared: nil)
        let a = try Self.rgba(droite, size: toile), b = try Self.rgba(miroir, size: toile)
        let horsCase = try XCTUnwrap(Self.pointHorsDeLaCase(scene))
        let pa = Self.pixel(a, x: horsCase.x, y: horsCase.y, width: 108)
        let pb = Self.pixel(b, x: horsCase.x, y: horsCase.y, width: 108)
        XCTAssertEqual(pa.red, pb.red, "le texte et le décor d'un cadre ne se retournent jamais avec l'objectif")
        XCTAssertEqual(pa.green, pb.green)
        XCTAssertEqual(pa.blue, pb.blue)
    }

    func test_cache_preparesOffMainOnce_thenServesTheScene() {
        let compte = Compteur()
        let cache = ComposerLookSceneCache(countLimit: 4) { cle in
            compte.incremente()
            return ComposerLookPainter.scene(for: cle)
        }
        let cadre = Self.premierCadreDuCatalogue() ?? .none
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(frame: cadre), canvas: CGSize(width: 54, height: 96),
                                       date: date, person: auteur)
        let pret = expectation(description: "scène cuite")
        cache.prepare(cle) { pret.fulfill() }
        cache.prepare(cle) {}
        wait(for: [pret], timeout: 10)
        XCTAssertNotNil(cache.cached(cle))
        XCTAssertEqual(compte.valeur, 1, "deux demandes de la même scène ne la cuisent qu'une fois")
        cache.purge()
        XCTAssertNil(cache.cached(cle), "la fermeture du viseur vide le cache")
    }

    func test_cache_prepare_alwaysCallsReady_evenWhenTheKeyIsBakingOrBaked() {
        let cache = ComposerLookSceneCache(countLimit: 4) { cle in ComposerLookPainter.scene(for: cle) }
        let cadre = Self.premierCadreDuCatalogue() ?? .none
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(frame: cadre), canvas: CGSize(width: 54, height: 96),
                                       date: date, person: auteur)
        let premier = expectation(description: "le premier appelant est prévenu")
        let second = expectation(description: "l'appelant arrivé pendant la cuisson est prévenu aussi")
        cache.prepare(cle) { premier.fulfill() }
        cache.prepare(cle) { second.fulfill() }
        wait(for: [premier, second], timeout: 10)
        let deja = expectation(description: "l'appelant d'une scène déjà cuite est prévenu")
        cache.prepare(cle) { deja.fulfill() }
        wait(for: [deja], timeout: 10)
    }

    // MARK: - Relecture du lot (#9347)

    func test_paint_uniformSourceUpscaled_keepsOpaqueUnchangedCorners() throws {
        let toile = CGSize(width: 90, height: 160)
        let image = ComposerLookPainter.paint(CIImage(cgImage: Self.uniforme(width: 40, height: 64)),
                                              look: ComposerPhotoLook(), framing: .identity,
                                              scene: nil, canvas: toile, declared: nil)
        let octets = try Self.rgba(image, size: toile)
        let centre = Self.pixel(octets, x: 45, y: 80, width: 90)
        for (x, y) in [(0, 0), (89, 0), (0, 159), (89, 159)] {
            let i = (y * 90 + x) * 4
            XCTAssertEqual(octets[i + 3], 255, "coin (\(x),\(y)) : aucun liseré transparent au bord")
            XCTAssertEqual(Int(octets[i]), Int(centre.red), accuracy: 2, "coin (\(x),\(y)) : la couleur ne fonce pas")
            XCTAssertEqual(Int(octets[i + 2]), Int(centre.blue), accuracy: 2, "coin (\(x),\(y))")
        }
    }

    func test_renderPreview_paintsAtTheDesignCanvas_neverAtTheNativeResolution() async throws {
        let grande = Self.uniforme(width: 1440, height: 2560)
        let apercu = await ComposerLookPainter.renderPreview(grande, look: ComposerPhotoLook(filter: .warm),
                                                             framing: .identity, person: auteur, date: date,
                                                             scenes: ComposerLookSceneCache(countLimit: 2))
        let image = try XCTUnwrap(apercu)
        XCTAssertEqual(CGSize(width: image.width, height: image.height), ComposerLookPainter.designCanvas,
                       "l'aperçu de la revue ne se peint jamais à la définition de la prise")
    }

    func test_renderPreview_inACancelledTask_paintsNothing() async {
        let personne = auteur
        let jour = date
        let tache = Task { () -> CGImage? in
            withUnsafeCurrentTask { $0?.cancel() }
            return await ComposerLookPainter.renderPreview(Self.cgSource(), look: ComposerPhotoLook(filter: .warm),
                                                           framing: .identity, person: personne, date: jour,
                                                           scenes: ComposerLookSceneCache(countLimit: 2))
        }
        let rendu = await tache.value
        XCTAssertNil(rendu, "un aperçu remplacé par un autre look s'arrête au lieu de se peindre")
    }

    func test_scene_largerThanTheDesignCanvas_leavesNoLayersInTheCallCache() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let dessin = try XCTUnwrap(ComposerLiveLookRule.design(for: cadre))
        let textes = ComposerPhotoLookSource.texts(at: date)
        let grande = CGSize(width: 1440, height: 2560)
        CallFrameRenderer.purgeLayers()
        XCTAssertNotNil(ComposerLookPainter.scene(for: ComposerPhotoLook(frame: cadre), canvas: grande,
                                                  date: date, person: auteur))
        XCTAssertNil(CallFrameRenderer.cachedLayers(for: CallFrameStage(frame: dessin, people: [auteur],
                                                                         texts: textes, size: grande)),
                     "les couches d'une photo pleine définition n'évincent pas celles de l'aperçu")
        let petite = CGSize(width: 108, height: 192)
        XCTAssertNotNil(ComposerLookPainter.scene(for: ComposerPhotoLook(frame: cadre), canvas: petite,
                                                  date: date, person: auteur))
        XCTAssertNotNil(CallFrameRenderer.cachedLayers(for: CallFrameStage(frame: dessin, people: [auteur],
                                                                            texts: textes, size: petite)),
                        "l'aperçu garde son cache de couches")
    }

    func test_disarm_purgesTheFrameLayers() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let dessin = try XCTUnwrap(ComposerLiveLookRule.design(for: cadre))
        let petite = CGSize(width: 108, height: 192)
        _ = ComposerLookPainter.scene(for: ComposerPhotoLook(frame: cadre), canvas: petite, date: date, person: auteur)
        let stage = CallFrameStage(frame: dessin, people: [auteur], texts: ComposerPhotoLookSource.texts(at: date),
                                   size: petite)
        XCTAssertNotNil(CallFrameRenderer.cachedLayers(for: stage))
        ComposerCaptureSession().disarm()
        XCTAssertNil(CallFrameRenderer.cachedLayers(for: stage), "fermer le viseur relâche les couches des cadres")
    }

    // MARK: - Outils

    private final class Compteur: @unchecked Sendable {
        private let verrou = NSLock()
        private var n = 0
        func incremente() { verrou.lock(); n += 1; verrou.unlock() }
        var valeur: Int { verrou.lock(); defer { verrou.unlock() }; return n }
    }

    /// Un cadre du catalogue À MARGE : ses coins sont du décor, jamais la vidéo —
    /// un cadre à fond perdu rendrait le témoin du miroir vide de sens.
    static func premierCadreDuCatalogue() -> ComposerPhotoFrame? {
        ComposerLiveLookRule.chips().lazy
            .flatMap { ComposerLiveLookRule.frames(for: $0) }
            .first { ComposerLiveLookRule.design(for: $0).map { $0.look.layout.margin > 0 } ?? false }
    }

    static func cgSource() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 150, height: 400))
        contexte.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 0, width: 150, height: 400))
        return contexte.makeImage()!
    }

    static func source() -> CIImage { CIImage(cgImage: cgSource()) }

    static func uniforme(width: Int, height: Int) -> CGImage {
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.8, green: 0.6, blue: 0.4, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return contexte.makeImage()!
    }

    struct Pixel { let red: UInt8; let green: UInt8; let blue: UInt8 }

    static func rgba(_ image: CIImage, size: CGSize) throws -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        let contexte = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
        contexte.render(image, toBitmap: &octets, rowBytes: largeur * 4,
                        bounds: CGRect(origin: .zero, size: size), format: .RGBA8,
                        colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }

    /// `y` en repère ÉCRAN (0 en haut) — `render(toBitmap:)` écrit la ligne du haut en premier.
    static func pixel(_ octets: [UInt8], x: Int, y: Int, width: Int) -> Pixel {
        let i = (y * width + x) * 4
        return Pixel(red: octets[i], green: octets[i + 1], blue: octets[i + 2])
    }

    static func pointHorsDeLaCase(_ scene: CallLiveFrameScene) -> (x: Int, y: Int)? {
        guard let slot = scene.slots.first else { return nil }
        let hauteur = scene.size.height
        let candidats = [(2, 2), (Int(scene.size.width) - 3, 2), (2, Int(hauteur) - 3), (Int(scene.size.width) - 3, Int(hauteur) - 3)]
        return candidats.first { x, y in
            !slot.mask.extent.contains(CGPoint(x: CGFloat(x), y: hauteur - CGFloat(y)))
                || !CallLiveFrameGeometry.flipped(slot.photo, canvasHeight: hauteur).insetBy(dx: -4, dy: -4)
                    .contains(CGPoint(x: CGFloat(x), y: hauteur - CGFloat(y)))
        }
    }
}
